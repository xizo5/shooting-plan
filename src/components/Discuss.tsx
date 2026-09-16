import { useEffect, useRef, useState } from 'react'
import type { Brief, ChatMessage, Consensus } from '../types'

interface Props {
  /** 初始需求（来自前置条件页） */
  brief: Brief
  messages: ChatMessage[]
  consensus: Consensus | null
  /** 正在等模型回复 */
  busy: boolean
  /** 正在归纳共识 */
  summarizing: boolean
  /** 用户发送一条消息 */
  onSend: (text: string) => void
  /** 让 AI 归纳出共识 */
  onSummarize: () => void
  /** 确认共识，开始生成 */
  onConfirm: () => void
  /** 重新归纳（对共识不满意） */
  onRedoConsensus: () => void
  onBack: () => void
}

/** 共识字段 → 中文标签 */
const FIELDS: Array<{ key: keyof Consensus; label: string }> = [
  { key: 'style', label: '风格调性' },
  { key: 'wardrobe', label: '服装' },
  { key: 'props', label: '道具' },
  { key: 'mood', label: '动作与情绪' },
  { key: 'notes', label: '其他' },
]

export default function Discuss({
  brief,
  messages,
  consensus,
  busy,
  summarizing,
  onSend,
  onSummarize,
  onConfirm,
  onRedoConsensus,
  onBack,
}: Props) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // 新消息进来时滚到底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, busy, consensus])

  const submit = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    onSend(text)
  }

  const hasContent = Object.values(consensus ?? {}).some((v) => v?.trim())

  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col space-y-4">
      <div>
        <button onClick={onBack} className="text-sm text-neutral-500">
          ← 改拍摄想法
        </button>
        <h2 className="mt-2 text-xl font-bold">先聊聊怎么拍</h2>
        <p className="mt-1 text-sm text-neutral-500">
          不用急着定。说说你想要的调性和场景，AI 帮你补上服装、道具和动作，聊顺了再出完整策划。
        </p>
      </div>

      {/* 初始需求回显 */}
      {brief.referenceImages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {brief.referenceImages.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`参考图 ${i + 1}`}
              className="h-16 w-16 rounded-xl border border-neutral-200 object-cover"
            />
          ))}
        </div>
      )}

      {/* 对话区 */}
      <div className="space-y-3">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-neutral-900 px-4 py-2.5 text-sm leading-relaxed text-white">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <p className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm leading-relaxed text-neutral-800 shadow-sm">
                {m.content}
              </p>
            </div>
          ),
        )}

        {busy && (
          <div className="flex justify-start">
            <p className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
              <span className="inline-flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 讨论没结束：继续聊 */}
      {!consensus && (
        <div className="space-y-3">
          {!busy && messages.some((m) => m.role === 'assistant') && (
            <button
              onClick={onSummarize}
              disabled={summarizing}
              className="w-full rounded-xl border border-neutral-900 py-3 text-sm font-medium text-neutral-900 disabled:opacity-40"
            >
              {summarizing ? '正在整理…' : '聊得差不多了，整理成拍摄约定'}
            </button>
          )}

          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={2}
              placeholder="接着说，比如「我有点怕镜头，动作别太夸张」"
              className="min-w-0 flex-1 resize-none rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
            />
            <button
              onClick={submit}
              disabled={!draft.trim() || busy}
              className="shrink-0 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-30"
            >
              发送
            </button>
          </div>
        </div>
      )}

      {/* 共识确认卡 */}
      {consensus && (
        <div className="space-y-3 rounded-2xl border border-neutral-900 bg-white p-4">
          <div>
            <h3 className="font-semibold">拍摄约定</h3>
            <p className="mt-0.5 text-xs text-neutral-500">确认后按这个生成 3 套场景方案</p>
          </div>

          {hasContent ? (
            <dl className="space-y-2">
              {FIELDS.map(({ key, label }) => {
                const value = consensus[key]?.trim()
                if (!value) return null
                return (
                  <div key={key} className="flex gap-2 text-sm">
                    <dt className="w-20 shrink-0 text-neutral-400">{label}</dt>
                    <dd className="min-w-0 flex-1 leading-relaxed text-neutral-800">{value}</dd>
                  </div>
                )
              })}
            </dl>
          ) : (
            <p className="text-sm text-neutral-500">没聊出具体约定，将按原始描述生成。</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={onRedoConsensus}
              disabled={summarizing}
              className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm text-neutral-600 disabled:opacity-40"
            >
              {summarizing ? '整理中…' : '继续聊'}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white"
            >
              就按这个生成
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
