import { useEffect, useRef, useState } from 'react'
import type { ShootPlan } from '../types'
import { pickPose } from '../lib/poses'
import { exportPlanImage } from '../lib/share'

export interface BatchState {
  running: boolean
  done: number
  total: number
}

interface Props {
  plan: ShootPlan
  /** 是否配置了生图模型 */
  canGen: boolean
  /** 正在生成参考片的画面 key（`${sceneIdx}-${shotIdx}`） */
  shotBusy: string | null
  batch: BatchState | null
  onGenerateShot: (sceneIdx: number, shotIdx: number) => void
  onBatch: () => void
  onStopBatch: () => void
}

export default function PlanView({
  plan,
  canGen,
  shotBusy,
  batch,
  onGenerateShot,
  onBatch,
  onStopBatch,
}: Props) {
  const dual = /双|情|2|两/.test(plan.brief.people ?? plan.brief.text)
  const busy = batch?.running || shotBusy !== null

  /** 导出长图：要逐张加载参考片，图多时不是瞬间完成，得给个进行态 */
  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  // 和生成一样，state 挡不住同批连点，用 ref 互斥
  const savingRef = useRef(false)

  const saveLongImage = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveNote(null)
    try {
      const { photos, skipped } = await exportPlanImage(plan)
      if (skipped > 0) {
        setSaveNote({
          kind: 'warn',
          text: `长图已保存，含 ${photos} 张参考片；有 ${skipped} 张因跨域限制没能放进去，已用姿势插画代替`,
        })
      } else if (photos > 0) {
        setSaveNote({ kind: 'ok', text: `长图已保存，含 ${photos} 张参考片` })
      } else {
        setSaveNote({ kind: 'ok', text: '长图已保存（本次没有参考片，用的是姿势插画）' })
      }
    } catch (err) {
      setSaveNote({
        kind: 'err',
        text: err instanceof Error ? err.message : '长图导出失败，请重试',
      })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // ── 宽屏场景目录 ──
  const sectionRefs = useRef<Array<HTMLElement | null>>([])
  const [active, setActive] = useState(0)
  /** 只有一个场景就没目录可言，两个以上才值得在左边常驻一列 */
  const showNav = plan.scenes.length > 1

  const jumpTo = (i: number) => {
    sectionRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /**
   * 滚动时高亮当前场景：取"顶边已越过基准线、且最靠下"的那个。
   * 不用 IntersectionObserver —— 同时可见多个时它分不清谁主谁次，要反复调 rootMargin 才听话；
   * 场景数就几个，一次线性扫描直白得多。同值 setActive 会被 React 跳过，不必节流。
   */
  useEffect(() => {
    if (!showNav) return
    const LINE = 120 // 顶部留白 + 一点余量，让"当前"的判定不那么贴边
    const onScroll = () => {
      let cur = 0
      sectionRefs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= LINE) cur = i
      })
      setActive(cur)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [plan.id, showNav])

  return (
    /*
      PC 两栏：左边常驻场景目录、右边正文。目录靠 sticky 跟着滚，长方案不用一路往下翻。
      这层不能带 space-y —— 窄屏下目录那个子元素虽然 hidden，仍会触发 `> * + *`，
      把正文白白推下 24px。间距一律由里层正文自己管。
    */
    <div className={showNav ? 'lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-8' : ''}>
      {showNav && (
        <nav
          aria-label="场景目录"
          className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
        >
          <p className="mb-2 text-xs font-medium text-neutral-400">场景</p>
          <ul className="space-y-0.5">
            {plan.scenes.map((s, si) => (
              <li key={si}>
                <button
                  onClick={() => jumpTo(si)}
                  className={`flex w-full items-baseline gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs leading-snug transition-colors ${
                    active === si
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-800'
                  }`}
                >
                  <span className={active === si ? 'text-white/50' : 'text-neutral-300'}>
                    {String(si + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{plan.title}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {[plan.brief.theme, plan.brief.location, plan.brief.time, plan.directionName]
                .filter(Boolean)
                .join(' · ') || plan.brief.text}
            </p>
          </div>
          <button
            onClick={saveLongImage}
            disabled={saving}
            className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? '导出中…' : '存长图'}
          </button>
        </div>

        {saveNote && (
          <p
            className={`rounded-xl px-4 py-3 text-sm leading-relaxed lg:max-w-2xl ${
              saveNote.kind === 'ok'
                ? 'bg-emerald-50 text-emerald-800'
                : saveNote.kind === 'warn'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {saveNote.text}
          </p>
        )}

        {canGen ? (
          /* PC 上按钮不占满整行，跟进度条同宽对齐 */
          <div className="space-y-2 lg:max-w-xs">
            <button
              onClick={batch?.running ? onStopBatch : onBatch}
              disabled={shotBusy !== null && !batch?.running}
              className="w-full rounded-xl border border-neutral-900 py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-900/5 disabled:opacity-40"
            >
              {batch?.running ? `停止（${batch.done}/${batch.total}）` : '生成全套参考片'}
            </button>
            {batch?.running && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-neutral-900 transition-all"
                  style={{ width: `${Math.round((batch.done / batch.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-neutral-100 px-4 py-2.5 text-xs text-neutral-500 lg:max-w-2xl">
            未启用参考片生成。在 .env 里填 VITE_IMAGE_API_KEY 与 VITE_IMAGE_MODEL 后重新构建，即可为每个画面生成 AI 写实参考片
          </p>
        )}

        {plan.scenes.map((scene, si) => (
          // scroll-mt 让 smooth 定位后标题不贴着视口顶边，跟目录的基准线也对得上
          <section
            key={si}
            ref={(el) => {
              sectionRefs.current[si] = el
            }}
            className="scroll-mt-6"
          >
            <div className="mb-3 flex items-baseline gap-2">
              <h3 className="font-semibold">{scene.title}</h3>
              {scene.backup && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                  备用方案
                </span>
              )}
              <span className="text-xs text-neutral-400">{scene.light}</span>
            </div>
            {/* PC 上同一场景的画面两列并排，方便横向对比机位 */}
            <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
              {scene.shots.map((shot, i) => {
                const key = `${si}-${i}`
                return (
                  <div key={key} className="rounded-2xl border border-neutral-100 bg-white p-3 shadow-sm">
                    {shot.image ? (
                      <img
                        src={shot.image}
                        alt="参考片"
                        className="mb-2.5 w-full rounded-xl bg-neutral-50"
                      />
                    ) : null}
                    <div className="flex gap-3">
                      {!shot.image && (
                        <div
                          className="h-28 w-24 shrink-0 rounded-xl bg-neutral-50 p-1 [&>svg]:h-full [&>svg]:w-full"
                          title={pickPose(shot.poseTags, dual).label}
                          dangerouslySetInnerHTML={{ __html: pickPose(shot.poseTags, dual).svg }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-relaxed text-neutral-800">{shot.description}</p>
                        {shot.tip && <p className="mt-1.5 text-xs text-neutral-400">提示：{shot.tip}</p>}
                        {canGen && !shot.image && (
                          <button
                            onClick={() => onGenerateShot(si, i)}
                            disabled={busy}
                            className="mt-2 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-800 disabled:opacity-40"
                          >
                            {shotBusy === key ? '生成中…' : '＋ 生成参考片'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        {/* 步骤条已占掉顶部，这里只留一句落款，出口统一在顶部的「我的策划」 */}
        <div className="flex flex-col items-center pb-4">
          <p className="text-center text-xs text-neutral-300">出片助手 · AI 拍摄策划</p>
        </div>
      </div>
    </div>
  )
}
