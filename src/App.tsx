import { useEffect, useRef, useState } from 'react'
import type { Brief, ModelConfig, ShootPlan, StyleDirection, View } from './types'
import type { BatchState } from './components/PlanView'
import { LlmError, chatJson, generateImage } from './lib/llm'
import {
  cardsSystem,
  cardsUserPrompt,
  expandSystem,
  expandUserPrompt,
  imagePromptFor,
  mergeParsedBrief,
  normalizeScenes,
} from './lib/prompts'
import { compressDataUrl } from './lib/image'
import { loadConfig, listPlans, saveConfig, savePlan } from './lib/storage'
import BriefForm from './components/BriefForm'
import PlanView from './components/PlanView'
import Library from './components/Library'
import Settings from './components/Settings'
import { CardsLoading, PlanLoading } from './components/Loading'

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const EMPTY_DRAFT: Brief = { text: '', referenceImages: [] }

/** 一次生成流程的阶段：先出风格方向（快），再并行展开全部方向 */
type Stage = null | 'directions' | 'expand'

export default function App() {
  const [view, setView] = useState<View>('brief')
  const [config, setConfig] = useState<ModelConfig | null>(() => loadConfig())
  const [plans, setPlans] = useState<ShootPlan[]>([])
  const [draft, setDraft] = useState<Brief>(EMPTY_DRAFT)
  const [stage, setStage] = useState<Stage>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 本次生成的多套策划（方向切换用）；从库打开历史时为单套 */
  const [batchPlans, setBatchPlans] = useState<ShootPlan[]>([])
  const [planIndex, setPlanIndex] = useState(0)
  const [shotBusy, setShotBusy] = useState<string | null>(null)
  const [batch, setBatch] = useState<BatchState | null>(null)
  const batchStop = useRef(false)

  const plan = batchPlans[planIndex] ?? null

  useEffect(() => {
    if (view === 'library') setPlans(listPlans())
  }, [view])

  const nav = (v: View) => {
    setError(null)
    setNotice(null)
    setView(v)
  }

  /** 展开单个方向为完整策划 */
  const expandDirection = async (
    cfg: ModelConfig,
    brief: Brief,
    direction: StyleDirection,
    dropImagesNote: () => void,
  ): Promise<ShootPlan> => {
    let data: { title: string; scenes: unknown }
    try {
      data = await chatJson(cfg, expandSystem(), expandUserPrompt(brief, direction), {
        images: brief.referenceImages,
      })
    } catch (err) {
      if (brief.referenceImages.length === 0) throw err
      dropImagesNote()
      data = await chatJson(cfg, expandSystem(), expandUserPrompt({ ...brief, referenceImages: [] }, direction))
    }
    const scenes = normalizeScenes(data.scenes).filter((s) => s.shots.length > 0)
    if (scenes.length === 0) throw new LlmError(`「${direction.name}」没有生成有效内容，请重试`)
    return {
      id: uid(),
      createdAt: Date.now(),
      brief,
      directionName: direction.name,
      title: String(data.title ?? brief.theme ?? '拍摄策划'),
      scenes,
    }
  }

  /** 主流程：解析前置条件 + 风格方向 → 并行展开全部方向 → 直接展示多套文字策划 */
  const generateAll = async (b: Brief) => {
    if (!config) {
      setError('先配置一下模型，再回来生成策划')
      setView('settings')
      return
    }
    setError(null)
    setNotice(null)
    setStage('directions')
    let notices: string[] = []
    try {
      let data: {
        brief?: Partial<Pick<Brief, 'theme' | 'location' | 'time' | 'people'>>
        directions: StyleDirection[]
      }
      try {
        data = await chatJson(config, cardsSystem(), cardsUserPrompt(b.text, b.referenceImages.length > 0), {
          images: b.referenceImages,
        })
      } catch (err) {
        if (b.referenceImages.length === 0) throw err
        notices.push('当前模型看不了图，已忽略参考图生成。想让方案贴着参考图出，请换支持看图的模型（如智谱 glm-4v-flash）')
        data = await chatJson(config, cardsSystem(), cardsUserPrompt(b.text, false))
      }
      const dirs = (data.directions ?? []).filter((d) => d.name && d.tagline)
      if (dirs.length === 0) throw new LlmError('模型没有给出有效的风格方向，请重试')
      const parsedBrief = mergeParsedBrief(b, data.brief)

      setStage('expand')
      const results = await Promise.allSettled(
        dirs.map((d) =>
          expandDirection(config, parsedBrief, d, () => {
            if (!notices.some((n) => n.includes('看不了图'))) {
              notices.push('部分方向生成时模型看不了图，已忽略参考图')
            }
          }),
        ),
      )
      const ok = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<ShootPlan>).value)
      ok.forEach((p) => savePlan(p))
      if (ok.length === 0) {
        const firstErr = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
        throw firstErr?.reason instanceof Error ? firstErr.reason : new LlmError('生成失败，请重试')
      }
      if (results.length - ok.length > 0) {
        notices.push(`${results.length - ok.length} 个风格方向生成失败，已展示成功的部分`)
      }
      if (notices.length > 0) setNotice(notices.join('；'))
      setBatchPlans(ok)
      setPlanIndex(0)
      setView('plan')
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试')
    } finally {
      setStage(null)
    }
  }

  const imageGenConfig = () => {
    if (!config?.imageGen) return null
    return { ...config.imageGen, apiKey: config.imageGen.apiKey || config.apiKey }
  }

  /** 生成单个画面的参考片（附用户参考图做图生图）并落库 */
  const produceImage = async (current: ShootPlan, si: number, i: number): Promise<ShootPlan> => {
    const cfg = imageGenConfig()
    if (!cfg) throw new LlmError('先到设置里开启参考片生成')
    const shot = current.scenes[si].shots[i]
    let out = await generateImage(
      cfg,
      imagePromptFor(current.brief, current.directionName, shot),
      current.brief.referenceImages,
    )
    if (out.startsWith('data:')) out = await compressDataUrl(out, 480, 0.7)
    const next: ShootPlan = {
      ...current,
      scenes: current.scenes.map((s, x) =>
        x === si
          ? { ...s, shots: s.shots.map((sh, y) => (y === i ? { ...sh, image: out } : sh)) }
          : s,
      ),
    }
    savePlan(next)
    setBatchPlans((prev) => prev.map((p) => (p.id === next.id ? next : p)))
    return next
  }

  const generateShotImage = async (si: number, i: number) => {
    if (!plan) return
    const key = `${si}-${i}`
    setShotBusy(key)
    setError(null)
    try {
      await produceImage(plan, si, i)
    } catch (err) {
      setError(err instanceof Error ? err.message : '参考片生成失败，请重试')
    } finally {
      setShotBusy(null)
    }
  }

  const runBatch = async () => {
    if (!plan) return
    const targets: Array<[number, number]> = []
    plan.scenes.forEach((s, si) => s.shots.forEach((sh, i) => !sh.image && targets.push([si, i])))
    if (targets.length === 0) {
      setNotice('所有画面都已经有参考片了')
      return
    }
    batchStop.current = false
    setBatch({ running: true, done: 0, total: targets.length })
    setError(null)
    let current = plan
    let done = 0
    let failed = 0
    for (const [si, i] of targets) {
      if (batchStop.current) break
      try {
        current = await produceImage(current, si, i)
      } catch {
        failed++
      }
      done++
      setBatch({ running: true, done, total: targets.length })
    }
    setBatch(null)
    if (failed > 0) setNotice(`${failed} 张参考片生成失败，可单独重试或检查生图配置`)
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-neutral-50 px-4 pb-10 pt-4">
      <header className="mb-5 flex items-center justify-between">
        <span className="text-sm font-bold tracking-wide">出片助手</span>
        <nav className="flex gap-1">
          <button
            onClick={() => nav('library')}
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200/60"
          >
            我的策划
          </button>
          <button
            onClick={() => nav('settings')}
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200/60"
          >
            设置
          </button>
        </nav>
      </header>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-700">
          {notice}
        </div>
      )}

      {view === 'brief' &&
        (stage === 'directions' ? (
          <CardsLoading />
        ) : stage === 'expand' ? (
          <PlanLoading count={3} />
        ) : (
          <BriefForm value={draft} onChange={setDraft} onSubmit={generateAll} />
        ))}

      {view === 'plan' && plan && (
        <>
          {batchPlans.length > 1 && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {batchPlans.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setPlanIndex(i)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                    i === planIndex
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-200/70 text-neutral-600'
                  }`}
                >
                  {p.directionName}
                </button>
              ))}
            </div>
          )}
          <PlanView
            plan={plan}
            onBack={() => nav('library')}
            canGen={!!config?.imageGen}
            shotBusy={shotBusy}
            batch={batch}
            onGenerateShot={generateShotImage}
            onBatch={runBatch}
            onStopBatch={() => {
              batchStop.current = true
            }}
          />
        </>
      )}

      {view === 'library' && (
        <Library
          plans={plans}
          onOpen={(p) => {
            setError(null)
            setNotice(null)
            setBatchPlans([p])
            setPlanIndex(0)
            setView('plan')
          }}
          onRefresh={() => setPlans(listPlans())}
          onBack={() => nav('brief')}
        />
      )}

      {view === 'settings' && (
        <Settings
          config={config}
          onSave={(c) => {
            setConfig(c)
            saveConfig(c)
          }}
          onBack={() => nav('brief')}
        />
      )}
    </div>
  )
}
