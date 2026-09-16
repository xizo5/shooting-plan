import { useEffect, useState } from 'react'

function useRotatingStep(steps: string[], interval = 2200): string {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % steps.length), interval)
    return () => clearInterval(t)
  }, [steps, interval])
  return steps[i]
}

/**
 * 小相机 + 眨眼睛的等待动画。
 *
 * 用 CSS 动画而不是 SMIL：Tailwind 项目里不必额外引样式，且受 prefers-reduced-motion 控制
 * （用户在 index.css 里统一关掉了动画，避免有人被转晕）。
 */
function CameraBuddy({ size = 96 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="正在生成"
      className="overflow-visible"
    >
      {/* 闪光灯：一闪一闪 */}
      <circle cx="97" cy="30" r="5" fill="#fbbf24" className="animate-[pop_1.6s_ease-in-out_infinite]" />

      {/* 相机身体 */}
      <rect x="14" y="42" width="84" height="54" rx="14" fill="#171717" />
      {/* 顶部取景凸起 */}
      <rect x="40" y="34" width="30" height="12" rx="5" fill="#171717" />
      {/* 镜头外圈 */}
      <circle cx="56" cy="69" r="21" fill="#404040" />
      {/* 镜头内圈 */}
      <circle cx="56" cy="69" r="14" fill="#171717" />
      {/* 镜头高光 */}
      <circle cx="50" cy="63" r="4.5" fill="#a3a3a3" />

      {/* 眨动的眼睛：用 scaleY 压缩表现眨眼 */}
      <g className="origin-center animate-[blink_3.4s_ease-in-out_infinite]" style={{ transformBox: 'fill-box' }}>
        <circle cx="82" cy="58" r="3.6" fill="#fbbf24" />
      </g>

      {/* 腮红 */}
      <ellipse cx="88" cy="70" rx="6" ry="3.6" fill="#fca5a5" opacity="0.75" />

      {/* 快门小脚 */}
      <rect x="30" y="96" width="12" height="7" rx="3.5" fill="#171717" />
      <rect x="70" y="96" width="12" height="7" rx="3.5" fill="#171717" />
    </svg>
  )
}

/** 三个跳动的点（聊天里也复用） */
export function TypingDots({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

/** 生成中的统一外框：动画 + 轮换文案 */
function LoadingShell({ steps, hint }: { steps: string[]; hint?: string }) {
  const step = useRotatingStep(steps)
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-6 py-12 text-center">
      <CameraBuddy />
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-neutral-800">正在为你写方案</p>
        {/* key 变化会重挂载，让文案切换带上淡入 */}
        <p key={step} className="animate-[fadein_0.4s_ease-out] text-sm text-neutral-400">
          {step}
        </p>
      </div>
      {hint && <p className="text-xs text-neutral-300">{hint}</p>}
    </div>
  )
}

/** 生成场景方案时的等待态 */
export function CardsLoading() {
  return (
    <LoadingShell
      steps={[
        '正在理解你的主题和参考图…',
        '构思几个不同的拍摄场景…',
        '为每个场景挑代表画面…',
      ]}
    />
  )
}

/** 展开多套完整策划时的等待态 */
export function PlanLoading({ count }: { count: number }) {
  return (
    <LoadingShell
      steps={[
        '按拍摄动线安排场景…',
        '把姿势写到「手放哪、眼睛看哪」…',
        '补上光线要点和备用方案…',
        '最后检查一遍能不能照着拍…',
      ]}
      hint={`正在生成 ${count} 套完整方案 · 文字版，参考片之后按需生成`}
    />
  )
}
