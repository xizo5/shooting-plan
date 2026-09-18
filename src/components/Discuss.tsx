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
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * 新消息进来时滚到底。
   *
   * 用容器的 scrollTop 而不是 scrollIntoView —— 后者会连带滚动所有可滚动的祖先，
   * 在这套"外层锁死、只有中间滚"的布局里会把整个页面顶起来。
   * 流式期间内容长度在变，所以依赖里带上最后一条的长度。
   */
  const tailLen = messages[messages.length - 1]?.content.length ?? 0
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
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
    // h-full 依赖父级给出确定高度（App 在讨论页把容器锁成 dvh），
    // 三段布局：标题区/输入区固定不动，中间对话区自己滚。
    // PC 上加一列侧栏：聊天不该拉满 1024px（行长太长读起来累），
    // 多出来的宽度给「你要拍什么」，讨论时能随时回看自己说过什么。
    <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_288px] lg:items-stretch lg:gap-8">
      <div className="flex min-h-0 flex-col">
        <div className="shrink-0 space-y-3 pb-3">
          <div>
            <h2 className="text-xl font-bold">先聊聊怎么拍</h2>
            <p className="mt-1 text-sm text-neutral-500">
              不用急着定。说说你想要的调性和场景，AI 帮你补上服装、道具和动作，聊顺了再出完整策划。
            </p>
          </div>

          {/* 初始需求回显。PC 上侧栏里另有放大版，这里就省掉 */}
          {brief.referenceImages.length > 0 && (
            <div className="flex flex-wrap gap-2 lg:hidden">
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
        </div>

        {/* 对话区：唯一可滚动的部分 */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-3">
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
        </div>

        {/* 底部固定区：约定提示 / 输入区，都不参与滚动 */}
        <div className="shrink-0 space-y-3 border-t border-neutral-200/70 pt-3 pb-4">
          {frozen && (
            <p className="rounded-xl bg-neutral-100 px-4 py-3 text-center text-sm text-neutral-500">
              已经整理好了，去下一步确认
            </p>
          )}

          {!frozen && (
            <>
              {!busy && messages.some((m) => m.role === 'assistant' && m.content.trim()) && (
                <button
                  onClick={onSummarize}
                  disabled={summarizing}
                  className="w-full rounded-xl border border-neutral-900 py-3 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-900/5 disabled:opacity-40"
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
                  className="shrink-0 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-30"
                >
                  {busy ? '回复中…' : '发送'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* PC 专属侧栏：始终把「你要拍什么」摆在一旁，长对话下不用往上翻 */}
      <aside className="hidden lg:flex lg:min-h-0 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-neutral-200 lg:bg-white lg:p-4">
        <div>
          <p className="text-xs font-medium text-neutral-400">你要拍什么</p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-700">
            {brief.text.trim() || '（只给了参考图，让 AI 照着图聊）'}
          </p>
        </div>

        {brief.referenceImages.length > 0 && (
          <div>
            <p className="text-xs font-medium text-neutral-400">参考图</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {brief.referenceImages.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`参考图 ${i + 1}`}
                  className="aspect-square w-full rounded-lg border border-neutral-200 object-cover"
                />
              ))}
            </div>
          </div>
        )}

        <p className="mt-auto pt-2 text-xs leading-relaxed text-neutral-400">
          聊顺了点「整理成拍摄约定」，下一步复核完才会出方案。
        </p>
      </aside>
    </div>
  )
}

