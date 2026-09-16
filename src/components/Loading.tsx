import { useEffect, useState } from 'react'

function useRotatingStep(steps: string[]): string {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % steps.length), 1800)
    return () => clearInterval(t)
  }, [steps])
  return steps[i]
}

/** 生成风格方向时的骨架屏 */
export function CardsLoading() {
  const step = useRotatingStep([
    '正在理解你的主题和参考图…',
    '构思差异明显的风格方向…',
    '为每个方向挑代表画面…',
  ])
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-neutral-900 p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-white/20" />
        <div className="mt-2.5 h-3 w-64 animate-pulse rounded bg-white/10" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="h-5 w-24 animate-pulse rounded bg-neutral-200" />
          <div className="mt-2.5 h-3 w-48 animate-pulse rounded bg-neutral-100" />
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-3 w-full animate-pulse rounded bg-neutral-100" />
            ))}
          </div>
        </div>
      ))}
      <p className="animate-pulse text-center text-sm text-neutral-400">{step}</p>
    </div>
  )
}

/** 展开多套完整策划时的骨架屏 */
export function PlanLoading({ count }: { count: number }) {
  const step = useRotatingStep([
    '按拍摄动线安排场景…',
    '把姿势写到"手放哪、眼睛看哪"…',
    '补上光线要点和备用方案…',
  ])
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-neutral-500">
          正在生成 {count} 套完整方案（文字版，图片之后按需生成）
        </p>
        <div className="mt-2 h-6 w-56 animate-pulse rounded bg-neutral-200" />
      </div>
      {[0, 1, 2].map((s) => (
        <section key={s}>
          <div className="mb-3 h-5 w-36 animate-pulse rounded bg-neutral-200" />
          <div className="space-y-3">
            {[0, 1].map((k) => (
              <div key={k} className="flex gap-3 rounded-2xl border border-neutral-100 bg-white p-3">
                <div className="h-28 w-24 shrink-0 animate-pulse rounded-xl bg-neutral-100" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 w-full animate-pulse rounded bg-neutral-100" />
                  <div className="h-3 w-11/12 animate-pulse rounded bg-neutral-100" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-neutral-100" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="animate-pulse text-center text-sm text-neutral-400">{step}</p>
    </div>
  )
}
