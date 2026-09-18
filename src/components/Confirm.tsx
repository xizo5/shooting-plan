import { useEffect, useState } from 'react'
import type { Brief, Consensus } from '../types'

interface Props {
  brief: Brief
  consensus: Consensus
  /** 保存编辑后的约定 */
  onChange: (next: Consensus) => void
  /** 确认，进入生成 */
  onConfirm: () => void
  /** 回讨论页继续聊 */
  onBackToDiscuss: () => void
}

/** 约定字段 → 中文标签 + 输入提示。顺序即展示顺序 */
const FIELDS: Array<{ key: keyof Consensus; label: string; hint: string; rows: number }> = [
  { key: 'style', label: '风格调性', hint: '如 偏过曝的日系小清新', rows: 2 },
  { key: 'wardrobe', label: '服装', hint: '如 浅色棉麻衬衫 + 米白长裙，避开大面积黑色', rows: 3 },
  { key: 'props', label: '道具', hint: '如 草帽、帆布包；没有就留空', rows: 2 },
  { key: 'mood', label: '动作与情绪', hint: '如 松弛自然、少看镜头，别太夸张', rows: 3 },
  { key: 'notes', label: '其他约束', hint: '必须拍到的东西、要避开的元素', rows: 2 },
]

/**
 * 第 2 步：定约定。
 *
 * 刻意做成一个干净页面——不带聊天记录。讨论阶段翻来覆去的话没必要占屏幕，
 * 这里只留"最终谈定了什么"，且每个字段可直接改（AI 归纳难免有偏差，
 * 让人当场改比回讨论里再聊三轮快得多）。
 */
export default function Confirm({ brief, consensus, onChange, onConfirm, onBackToDiscuss }: Props) {
  // 本地草稿：边打字边同步到上层会触发 App 重渲染，长文本下有卡顿感，失焦再提交
  const [draft, setDraft] = useState<Consensus>(consensus)

  useEffect(() => {
    setDraft(consensus)
  }, [consensus])

  const set = (key: keyof Consensus, value: string) => setDraft({ ...draft, [key]: value })

  const commit = () => {
    if (JSON.stringify(draft) !== JSON.stringify(consensus)) onChange(draft)
  }

  const filled = FIELDS.filter(({ key }) => draft[key].trim()).length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">这份约定，对吗</h2>
        <p className="mt-1 text-sm text-neutral-500">
          照着聊出来的结果整理好了。哪条不准就直接改，改完点下面的按钮出方案。
        </p>
      </div>

      {/* 原始想法回显，方便对照 */}
      {brief.text.trim() && (
        <div className="rounded-xl bg-neutral-100 px-4 py-3 lg:max-w-3xl">
          <p className="text-xs text-neutral-400">你最初说的是</p>
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-neutral-700">{brief.text}</p>
        </div>
      )}

      {/* 5 个字段：PC 上两列排开，省得在一列里滚半天 */}
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
        {FIELDS.map(({ key, label, hint, rows }) => (
          <div key={key} className="rounded-2xl border border-neutral-200 bg-white p-3.5">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label htmlFor={`consensus-${key}`} className="text-sm font-medium text-neutral-900">
                {label}
              </label>
              {!draft[key].trim() && <span className="text-xs text-neutral-300">没聊到，留空也行</span>}
            </div>
            <textarea
              id={`consensus-${key}`}
              value={draft[key]}
              onChange={(e) => set(key, e.target.value)}
              onBlur={commit}
              rows={rows}
              placeholder={hint}
              className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-neutral-900"
            />
          </div>
        ))}
      </div>

      {filled === 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-700 lg:max-w-2xl">
          一条都没聊定，将完全按你最初的描述生成。也可以回上一步多聊两句。
        </p>
      )}

      {/* PC 上按钮不要拉满 1024px，窄一点更像回事 */}
      <div className="space-y-2 pb-2 lg:max-w-sm">
        {/* 生成一开始就跳进第 3 步，所以这里没有"生成中"态，也不需要禁用 */}
        <button
          onClick={() => {
            commit()
            onConfirm()
          }}
          className="w-full rounded-xl bg-neutral-900 py-3.5 font-medium text-white transition-colors hover:bg-neutral-800"
        >
          就按这个生成
        </button>
        <button
          onClick={onBackToDiscuss}
          className="w-full rounded-xl py-2.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          还有没聊到的，回去接着聊
        </button>
      </div>
    </div>
  )
}
