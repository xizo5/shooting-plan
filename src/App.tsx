import { useEffect, useRef, useState } from 'react'
import type { Brief, ChatMessage, Consensus, ModelConfig, ShootPlan, StyleDirection, View } from './types'
import type { BatchState } from './components/PlanView'
import { LlmError, chatJson, chatText, chatTextStream, extractJson, generateImage } from './lib/llm'
import {
  cardsSystem,
  cardsUserPrompt,
  consensusPrompt,
  discussOpeningPrompt,
  discussSystem,
  expandSystem,
  expandUserPrompt,
  imagePromptFor,
  mergeParsedBrief,
  normalizeScenes,
} from './lib/prompts'
import { compressDataUrl } from './lib/image'
import { loadConfig, listPlans, savePlan } from './lib/storage'
import BriefForm from './components/BriefForm'
import Discuss from './components/Discuss'
import Confirm from './components/Confirm'
import PlanView from './components/PlanView'
import Library from './components/Library'
import Steps, { stepOf, type Step } from './components/Steps'
import { CardsLoading, PlanLoading } from './components/Loading'

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 共识各字段兜底成字符串，缺省即空串（表示"没聊到"） */
function normalizeConsensus(raw: Partial<Consensus>): Consensus {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  return {
    style: str(raw.style),
    wardrobe: str(raw.wardrobe),
    props: str(raw.props),
    mood: str(raw.mood),
    notes: str(raw.notes),
  }
}

const EMPTY_DRAFT: Brief = { text: '', referenceImages: [] }

/** 一次生成流程的阶段：先出风格方向（快），再并行展开全部方向 */
type Stage = null | 'directions' | 'expand'

export default function App() {
  const [view, setView] = useState<View>('brief')
  /** 模型配置来自 .env（或 localStorage 里的旧配置），运行时不再修改 */
  const [config] = useState<ModelConfig | null>(() => loadConfig())
  const [plans, setPlans] = useState<ShootPlan[]>([])
  const [draft, setDraft] = useState<Brief>(EMPTY_DRAFT)
  const [stage, setStage] = useState<Stage>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 本次生成的多套策划（场景方案切换用）；从库打开历史时为单套 */
  const [batchPlans, setBatchPlans] = useState<ShootPlan[]>([])
  const [planIndex, setPlanIndex] = useState(0)
  const [shotBusy, setShotBusy] = useState<string | null>(null)
  const [batch, setBatch] = useState<BatchState | null>(null)
  const batchStop = useRef(false)

  // ── 讨论环节状态 ──
  /** 讨论中的消息历史（首条是 AI 的开场回应） */
  const [messages, setMessages] = useState<ChatMessage[]>([])
  /** 等待模型回复 */
  const [discussing, setDiscussing] = useState(false)
  /** 正在归纳共识 */
  const [summarizing, setSummarizing] = useState(false)
  /** 归纳出的共识，非空即代表讨论收敛完毕、等待用户确认 */
  const [consensus, setConsensus] = useState<Consensus | null>(null)
  /** 讨论对应的前置条件快照（用户回退再改输入时用） */
  const [discussBrief, setDiscussBrief] = useState<Brief>(EMPTY_DRAFT)
  /** 生成完成后的成功提示（区别于 error/notice，带关闭按钮） */
  const [toast, setToast] = useState<string | null>(null)
  /**
   * 生成锁。state 更新是异步的，狂点按钮时下一次点击可能在重渲染前就进来了 ——
   * ref 是同步的，用它兜住，state 只负责 UI 禁用态。
   */
  const generating = useRef(false)

  const plan = batchPlans[planIndex] ?? null

  useEffect(() => {
    if (view === 'library') setPlans(listPlans())
  }, [view])

  const nav = (v: View) => {
    setError(null)
    setNotice(null)
    setView(v)
  }

  // ─────────────────────────────────────────────
  // 讨论环节
  // ─────────────────────────────────────────────

  /**
   * 流式请求一轮讨论回复，并把它作为最后一条 assistant 消息实时写进列表。
   *
   * 抽成函数是因为「开场」和「每轮追问」共用同一套逻辑：都带图试一次，
   * 失败且确有参考图时摘掉图重试一次。
   */
  const streamReply = async (
    system: string,
    userText: string,
    history: ChatMessage[],
    images: string[],
    onImageDrop: () => void,
  ): Promise<string> => {
    const cfg = config!
    // 占位的空 assistant 气泡：内容随 onDelta 增长，用户立刻看到字在往外冒
    const placeholder: ChatMessage = { role: 'assistant', content: '', streaming: true }
    let live = [...history, placeholder]
    setMessages(live)
    const onDelta = (piece: string) => {
      live = live.map((m, i) =>
        i === live.length - 1 ? { ...m, content: m.content + piece } : m,
      )
      setMessages(live)
    }

    let reply: string
    try {
      reply = await chatTextStream(cfg, system, userText, onDelta, { history, images })
    } catch (err) {
      if (images.length === 0) throw err
      onImageDrop()
      // 去掉图重试：清空刚才可能已经吐出的一半内容，重新流
      live = [...history, placeholder]
      setMessages(live)
      const onDeltaRetry = (piece: string) => {
        live = live.map((m, i) =>
          i === live.length - 1 ? { ...m, content: m.content + piece } : m,
        )
        setMessages(live)
      }
      reply = await chatTextStream(cfg, system, userText, onDeltaRetry, { history })
    }
    setMessages([...history, { role: 'assistant', content: reply }])
    return reply
  }

  /** 进入讨论：先让 AI 给出开场建议 + 追问 */
  const startDiscuss = async (b: Brief) => {
    if (!config) {
      setError('模型还没配置：请复制 .env.example 为 .env，填入 VITE_API_KEY 与 VITE_MODEL 后重新构建')
      return
    }
    setError(null)
    setNotice(null)
    setToast(null)
    setConsensus(null)
    setDiscussBrief(b)
    setMessages([])
    setDiscussing(true)
    setView('discuss')
    try {
      await streamReply(
        discussSystem(),
        discussOpeningPrompt(b.text, b.referenceImages.length > 0),
        [],
        b.referenceImages,
        () => setNotice('当前模型看不了图，已忽略参考图继续讨论。想贴着参考图聊，请换支持看图的模型（如智谱 glm-4v-flash）'),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '讨论开场失败，请重试')
      setMessages([])
      setView('brief')
    } finally {
      setDiscussing(false)
    }
  }

  /** 用户在讨论中发一条消息 */
  const sendDiscussMessage = async (text: string) => {
    if (!config || discussing) return
    // 注意：history 传的是「这条之前的对话」，text 作为本条 user 消息由流式函数追加，
    // 别再往 history 里塞一遍，否则同一条会发两遍
    const prior = messages
    setDiscussing(true)
    setError(null)
    try {
      await streamReply(
        discussSystem(),
        text,
        [...prior, { role: 'user', content: text }],
        discussBrief.referenceImages,
        () => setNotice('当前模型看不了图，已忽略参考图继续讨论。想贴着参考图聊，请换支持看图的模型（如智谱 glm-4v-flash）'),
      )
    } catch (err) {
      // 回复失败时把用户那条也撤掉，避免历史里留下没有回应的孤句
      setMessages(prior)
      setError(err instanceof Error ? err.message : '发送失败，请重试')
    } finally {
      setDiscussing(false)
    }
  }

  /** 让 AI 把讨论归纳成拍摄约定，成功后进入第 2 步确认 */
  const summarizeDiscuss = async () => {
    if (!config || messages.length === 0) return
    setSummarizing(true)
    setError(null)
    try {
      // 走 chatText 而非 chatJson：归纳需要带上完整讨论历史作为上下文
      const raw = await chatText(config, discussSystem(), consensusPrompt(), { history: messages })
      const parsed = extractJson<Partial<Consensus>>(raw)
      setConsensus(normalizeConsensus(parsed))
      // 归纳完直接进第 2 步：那是个干净页面，不再夹着聊天记录
      setView('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : '整理失败，请重试')
    } finally {
      setSummarizing(false)
    }
  }

  /** 第 2 步里改过的约定：写回并同步进这套讨论快照 */
  const updateConsensus = (next: Consensus) => setConsensus(next)

  /**
   * 从第 2 步回讨论页接着聊。
   * 必须清掉 consensus —— 否则 Discuss 会认为"约定已出"而把输入区冻住，
   * 用户回去了却没法说话。
   */
  const backToDiscuss = () => {
    setConsensus(null)
    nav('discuss')
  }

  /** 展开单个场景方案为完整策划 */
  const expandDirection = async (
    cfg: ModelConfig,
    brief: Brief,
    direction: StyleDirection,
    consensus: Consensus | null,
    dropImagesNote: () => void,
  ): Promise<ShootPlan> => {
    let data: { title: string; scenes: unknown }
    try {
      data = await chatJson(cfg, expandSystem(), expandUserPrompt(brief, direction, consensus), {
        images: brief.referenceImages,
      })
    } catch (err) {
      if (brief.referenceImages.length === 0) throw err
      dropImagesNote()
      data = await chatJson(
        cfg,
        expandSystem(),
        expandUserPrompt({ ...brief, referenceImages: [] }, direction, consensus),
      )
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

  /** 主流程：解析前置条件 + 场景方案 → 并行展开全部方案 → 直接展示多套文字策划 */
  const generateAll = async (b: Brief, consensus: Consensus | null) => {
    if (!config) {
      setError('模型还没配置：请复制 .env.example 为 .env，填入 VITE_API_KEY 与 VITE_MODEL 后重新构建')
      return
    }
    // 防抖：真实耗时几十秒，用户等急了会连点。ref 是同步的，挡得住同一批点击
    if (generating.current) return
    generating.current = true
    setError(null)
    setNotice(null)
    setToast(null)
    setStage('directions')
    const hasImages = b.referenceImages.length > 0
    let notices: string[] = []
    try {
      let data: {
        brief?: Partial<Pick<Brief, 'theme' | 'location' | 'time' | 'people'>>
        directions: StyleDirection[]
      }
      try {
        data = await chatJson(config, cardsSystem(), cardsUserPrompt(b.text, hasImages, consensus), {
          images: b.referenceImages,
        })
      } catch (err) {
        if (!hasImages) throw err
        notices.push('当前模型看不了图，已忽略参考图生成。想让方案贴着参考图出，请换支持看图的模型（如智谱 glm-4v-flash）')
        data = await chatJson(config, cardsSystem(), cardsUserPrompt(b.text, false, consensus))
      }
      const dirs = (data.directions ?? []).filter((d) => d.name && d.tagline)
      if (dirs.length === 0) throw new LlmError('模型没有给出有效的场景方案，请重试')
      const parsedBrief = mergeParsedBrief(b, data.brief)

      setStage('expand')
      const results = await Promise.allSettled(
        dirs.map((d) =>
          expandDirection(config, parsedBrief, d, consensus, () => {
            if (!notices.some((n) => n.includes('看不了图'))) {
              notices.push('部分方案生成时模型看不了图，已忽略参考图')
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
        notices.push(`${results.length - ok.length} 个场景方案生成失败，已展示成功的部分`)
      }
      if (notices.length > 0) setNotice(notices.join('；'))
      setBatchPlans(ok)
      setPlanIndex(0)
      setView('plan')
      // 完成反馈：页面直接跳走了，不给一句话用户会怀疑到底成没成
      setToast(
        ok.length > 1
          ? `已生成 ${ok.length} 套场景方案，顶部可切换对比 · 已存到「我的策划」`
          : '已生成 1 套场景方案 · 已存到「我的策划」',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试')
    } finally {
      generating.current = false
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
    if (!cfg) throw new LlmError('生图未启用：在 .env 里填 VITE_IMAGE_API_KEY 与 VITE_IMAGE_MODEL 后重新构建')
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

  /** 当前处在第几步；library 不属于流程，为 null（不显示步骤条） */
  const step = stepOf(view)

  /**
   * 讨论页要"头尾固定、中间独立滚动"，所以整页得锁成 dvh 高度、禁止外层滚动；
   * 其他页面内容可能很长，仍按整页滚动处理。
   */
  const locked = view === 'discuss'

  return (
    <div
      className={`mx-auto flex max-w-md flex-col bg-neutral-50 px-4 ${
        locked ? 'h-dvh overflow-hidden pb-0 pt-4' : 'min-h-dvh pb-10 pt-4'
      }`}
    >
      {/* 顶部区域：header + 提示 + 步骤条。讨论页里它是固定的，不参与滚动 */}
      <div className="shrink-0">
        <header className="mb-5 flex items-center justify-between">
          <span className="text-sm font-bold tracking-wide">出片助手</span>
          <nav className="flex gap-1">
            <button
              onClick={() => nav('library')}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200/60"
            >
              我的策划
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
        {toast && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-800">
            <span className="shrink-0">✓</span>
            <span className="flex-1">{toast}</span>
            <button
              onClick={() => setToast(null)}
              className="shrink-0 text-emerald-600/70 hover:text-emerald-800"
              aria-label="关闭提示"
            >
              ×
            </button>
          </div>
        )}

        {/* 步骤条：brief / discuss 是第 1 步，confirm 是第 2 步，plan 是第 3 步。
            library 不属于流程，不显示。 */}
        {step !== null && (
          <Steps
            current={step}
            onGo={(s: Step) => {
              if (s === 1) nav('brief')
              else if (s === 2 && consensus) nav('confirm')
            }}
          />
        )}
      </div>


      {view === 'brief' &&
        (stage === 'directions' ? (
          <CardsLoading />
        ) : stage === 'expand' ? (
          <PlanLoading count={3} />
        ) : (
          <BriefForm value={draft} onChange={setDraft} onSubmit={startDiscuss} busy={discussing} />
        ))}

      {view === 'discuss' && (
        // min-h-0 是必须的：flex 子项默认 min-height:auto，不加就撑破父级、滚动条跑到整页上去
        <div className="flex min-h-0 flex-1 flex-col">
          <Discuss
            brief={discussBrief}
            messages={messages}
            consensus={consensus}
            busy={discussing}
            summarizing={summarizing}
            onSend={sendDiscussMessage}
            onSummarize={summarizeDiscuss}
          />
        </div>
      )}

      {/* 第 2 步：纯净的约定确认页（不带聊天记录），字段可直接改 */}
      {view === 'confirm' &&
        (consensus ? (
          <Confirm
            brief={discussBrief}
            consensus={consensus}
            generating={stage !== null}
            onChange={updateConsensus}
            onConfirm={() => {
              // 双保险：按钮本身会置灰，这里再挡一次连点
              if (stage === null) generateAll(discussBrief, consensus)
            }}
            onBackToDiscuss={backToDiscuss}
          />
        ) : (
          // 直接刷新 / 回退到这一步但没有约定（约定不落库），退回讨论
          <div className="space-y-3">
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-700">
              拍摄约定还没整理出来。回到上一步接着聊，聊完点「整理成拍摄约定」。
            </p>
            <button
              onClick={() => nav('discuss')}
              className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white"
            >
              回去接着聊
            </button>
          </div>
        ))}

      {/* 生成中：第 2 步原地切到等待动画，用户知道点到了、正在干活 */}
      {view === 'confirm' && stage !== null && (
        <div className="mt-5">
          {stage === 'directions' ? <CardsLoading /> : <PlanLoading count={3} />}
        </div>
      )}

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

      {/*
        设置页入口已隐藏：模型配置改为由 .env 提供（见 AGENTS.md「配置的两层」）。
        Settings 组件与 saveConfig 仍保留，便于从 localStorage 读旧配置；
        将来若要恢复图形化设置，把上面的「设置」按钮和这里的渲染一起放开即可。
      */}
    </div>
  )
}
