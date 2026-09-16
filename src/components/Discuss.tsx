import { useEffect, useRef, useState } from 'react'
import type { Brief, ChatMessage, Consensus } from '../types'
import { TypingDots } from './Loading'

interface Props {
  /** 初始需求（来自前置条件页） */
  brief: Brief
  messages: ChatMessage[]
  /** 已归纳出约定（此时会被送去第 2 步确认，本页不再显示输入区） */
  consensus: Consensus | null
  /** 正在等模型回复（流式接收中） */
  busy: boolean
  /** 正在归纳共识 */
  summarizing: boolean
  /** 用户发送一条消息 */
  onSend: (text: string) => void
  /** 让 AI 归纳出共识 */
  onSummarize: () => void
}

export default function Discuss({
  brief,
  messages,
  consensus,
  busy,
  summarizing,
  onSend,
  onSummarize,
}: Props) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // 新消息进来时滚到底。流式期间内容长度在变，所以用最后一条的长度也做依赖
  const tailLen = messages[messages.length - 1]?.content.length ?? 0
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, tailLen, busy, consensus])

  const submit = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    onSend(text)
  }

  /** 约定出来了就让位给第 2 步，本页只留聊天记录供回看 */
  const frozen = consensus !== null

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col space-y-4">
      <div>
        <h2 className="text-xl font-bold">先聊聊怎么拍</h2>
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
                {/* 流式中：字后跟一根闪烁光标，还没吐字时显示三个跳动的点 */}
                {m.streaming &&
                  (m.content ? (
                    <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-[caret_1s_steps(1)_infinite] bg-neutral-800 align-middle" />
                  ) : (
                    <TypingDots />
                  ))}
              </p>
            </div>
          ),
        )}
        <div ref={bottomRef} />
      </div>

      {/* 约定已出：本页收尾，把决定权交给第 2 步 */}
      {frozen && (
        <p className="rounded-xl bg-neutral-100 px-4 py-3 text-center text-sm text-neutral-500">
          已经整理好了，去下一步确认
        </p>
      )}

      {/* 还在聊：输入区 */}
      {!frozen && (
        <div className="space-y-3">
          {!busy && messages.some((m) => m.role === 'assistant' && m.content.trim()) && (
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
              {busy ? '回复中…' : '发送'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

