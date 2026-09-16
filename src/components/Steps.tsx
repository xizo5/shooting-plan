import type { View } from '../types'

/** 三步：说想法 → 定约定 → 出方案。与 View 的映射写在 stepOf 里，加步骤只改这里 */
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

/**
 * 当前 View 对应第几步；library 不属于流程，返回 null 表示不显示步骤条。
 *
 * 第三格用 `'plan' | 'generating'`（生成中）两个 view —— 生成是第 3 步的动作，
 * 等待动画必须画在第 3 格里。若还挂在第 2 步，长动画会把确认页撑长且看起来没往前走。
 */
export function stepOf(view: View | 'generating'): Step | null {
  if (view === 'brief' || view === 'discuss') return 1
  if (view === 'confirm') return 2
  if (view === 'plan' || view === 'generating') return 3
  return null
}

/**
 * 步骤条：三格严格等宽。
 *
 * 用 grid-cols-3 而不是 flex —— flex 下胶囊的宽度由内容决定，
 * 三格永远差几像素，看着不齐。等宽后连接线也各占一半、天然居中。
 */
export default function Steps({ current, onGo }: Props) {
  return (
    <nav aria-label="流程步骤" className="mb-5 grid grid-cols-3">
      {STEPS.map(({ n, label }, i) => {
        const done = n < current
        const active = n === current
        const clickable = done && !!onGo
        return (
          <div key={n} className="relative flex items-center justify-center">
            {/* 连接线：左半边 + 右半边，各画一半所以接缝正好落在格子边界上 */}
            {i > 0 && (
              <span
                className={`absolute left-0 top-1/2 h-px w-1/2 -translate-y-1/2 ${
                  done || active ? 'bg-neutral-900' : 'bg-neutral-200'
                }`}
                aria-hidden
              />
            )}
            {i < STEPS.length - 1 && (
              <span
                className={`absolute right-0 top-1/2 h-px w-1/2 -translate-y-1/2 ${
                  n < current ? 'bg-neutral-900' : 'bg-neutral-200'
                }`}
                aria-hidden
              />
            )}
            <button
              type="button"
              onClick={clickable ? () => onGo!(n) : undefined}
              disabled={!clickable}
              aria-current={active ? 'step' : undefined}
              className={`relative z-10 flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs transition-colors ${
                active
                  ? 'bg-neutral-900 font-medium text-white'
                  : done
                    ? 'text-neutral-700 hover:bg-neutral-200/70'
                    : 'bg-neutral-50 text-neutral-300'
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
