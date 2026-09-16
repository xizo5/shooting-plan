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
  onBack: () => void
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
  onBack,
  canGen,
  shotBusy,
  batch,
  onGenerateShot,
  onBatch,
  onStopBatch,
}: Props) {
  const dual = /双|情|2|两/.test(plan.brief.people ?? plan.brief.text)
  const busy = batch?.running || shotBusy !== null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button onClick={onBack} className="text-sm text-neutral-500">
            ← 我的策划
          </button>
          <h2 className="mt-2 text-xl font-bold">{plan.title}</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {[plan.brief.theme, plan.brief.location, plan.brief.time, plan.directionName]
              .filter(Boolean)
              .join(' · ') || plan.brief.text}
          </p>
        </div>
        <button
          onClick={() => exportPlanImage(plan)}
          className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
        >
          存长图
        </button>
      </div>

      {canGen ? (
        <div className="space-y-2">
          <button
            onClick={batch?.running ? onStopBatch : onBatch}
            disabled={shotBusy !== null && !batch?.running}
            className="w-full rounded-xl border border-neutral-900 py-2.5 text-sm font-medium text-neutral-900 disabled:opacity-40"
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
        <p className="rounded-xl bg-neutral-100 px-4 py-2.5 text-xs text-neutral-500">
          未启用参考片生成。在 .env 里填 VITE_IMAGE_API_KEY 与 VITE_IMAGE_MODEL 后重新构建，即可为每个画面生成 AI 写实参考片
        </p>
      )}

      {plan.scenes.map((scene, si) => (
        <section key={si}>
          <div className="mb-3 flex items-baseline gap-2">
            <h3 className="font-semibold">{scene.title}</h3>
            {scene.backup && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                备用方案
              </span>
            )}
            <span className="text-xs text-neutral-400">{scene.light}</span>
          </div>
          <div className="space-y-3">
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
                          className="mt-2 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 disabled:opacity-40"
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

      <p className="pb-4 text-center text-xs text-neutral-300">出片助手 · AI 拍摄策划</p>
    </div>
  )
}
