import type { View } from '../types'

/** 三步：说想法 → 定约定 → 出方案。与 View 的映射写在 STEPS 里，加步骤只改这里 */
export type Step = 1 | 2 | 3

interface Props {
  current: Step
  /** 点已完成的步骤可回退；不传则该步不可点 */
  onGo?: (step: Step) => void
}

const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: '说想法' },
  { n: 2, label: '定约定' },
  { n: 3, label: '出方案' },
]

/** 当前 View 对应第几步；library 不属于流程，返回 null 表示不显示步骤条 */
export function stepOf(view: View): Step | null {
  if (view === 'brief' || view === 'discuss') return 1
  if (view === 'confirm') return 2
  if (view === 'plan') return 3
  return null
}

export default function Steps({ current, onGo }: Props) {
  return (
    <nav aria-label="流程步骤" className="mb-5 flex items-center gap-1 overflow-hidden">
      {STEPS.map(({ n, label }, i) => {
        const done = n < current
        const active = n === current
        const clickable = done && !!onGo
        return (
          <div key={n} className="flex min-w-0 items-center gap-1" style={{ flex: n === current ? 1.6 : 1 }}>
            {i > 0 && (
              <span
                className={`h-px min-w-2 flex-1 ${done || active ? 'bg-neutral-900' : 'bg-neutral-200'}`}
                aria-hidden
              />
            )}
            <button
              type="button"
              onClick={clickable ? () => onGo!(n) : undefined}
              disabled={!clickable}
              aria-current={active ? 'step' : undefined}
              className={`flex min-w-0 shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-xs transition-colors ${
                active
                  ? 'bg-neutral-900 font-medium text-white'
                  : done
                    ? 'text-neutral-700 hover:bg-neutral-200/70'
                    : 'text-neutral-300'
              } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] leading-none ${
                  active
                    ? 'bg-white/20 text-white'
                    : done
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-200 text-neutral-400'
                }`}
              >
                {done ? '✓' : n}
              </span>
              <span className="truncate">{label}</span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}
