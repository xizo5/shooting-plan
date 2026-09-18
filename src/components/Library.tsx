import type { ShootPlan } from '../types'
import { deletePlan } from '../lib/storage'

interface Props {
  plans: ShootPlan[]
  onOpen: (plan: ShootPlan) => void
  onRefresh: () => void
  onBack: () => void
}

export default function Library({ plans, onOpen, onRefresh, onBack }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <button onClick={onBack} className="text-sm text-neutral-500">
          ← 回首页
        </button>
        <h2 className="mt-2 text-lg font-semibold">我的策划</h2>
        <p className="text-sm text-neutral-500">保存在这台设备的浏览器里</p>
      </div>

      {plans.length === 0 && (
        <p className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
          还没有保存过策划
        </p>
      )}

      {/* PC 上两列铺开，一屏能看全 */}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-neutral-300"
          >
            <button className="min-w-0 text-left" onClick={() => onOpen(plan)}>
              <h3 className="truncate font-semibold">{plan.title}</h3>
              <p className="mt-0.5 text-xs text-neutral-500">
                {plan.directionName} · {new Date(plan.createdAt).toLocaleDateString('zh-CN')} ·{' '}
                {plan.scenes.reduce((n, s) => n + s.shots.length, 0)} 个画面
              </p>
            </button>
            <button
              onClick={() => {
                deletePlan(plan.id)
                onRefresh()
              }}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
