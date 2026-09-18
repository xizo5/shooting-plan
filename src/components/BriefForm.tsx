import { useEffect, useRef, useState } from 'react'
import type { Brief } from '../types'
import { compressDataUrl, fileToDataUrl } from '../lib/image'
import { MOD, isSubmit } from '../lib/keys'

const MAX_IMAGES = 4

interface Props {
  value: Brief
  onChange: (brief: Brief) => void
  onSubmit: (brief: Brief) => void
  /** 正在开场（提交后按钮置灰，防连点） */
  busy?: boolean
}

export default function BriefForm({ value, onChange, onSubmit, busy }: Props) {
  const [uploading, setUploading] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  // 这一页打开就是想写字，光标别让用户自己去点（手机上无感：不弹软键盘）
  useEffect(() => {
    textRef.current?.focus()
  }, [])

  const ready = value.text.trim() || value.referenceImages.length > 0

  /** 提交的唯一出口：按钮和 Ctrl/Cmd+Enter 共用，免得两条路径的守卫写歪 */
  const submit = () => {
    if (!ready || busy) return
    onSubmit(value)
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const room = MAX_IMAGES - value.referenceImages.length
      const picked = [...files].slice(0, Math.max(0, room))
      const compressed: string[] = []
      for (const file of picked) {
        const raw = await fileToDataUrl(file)
        compressed.push(await compressDataUrl(raw, 768, 0.8))
      }
      onChange({ ...value, referenceImages: [...value.referenceImages, ...compressed] })
    } finally {
      setUploading(false)
    }
  }

  const removeImage = (i: number) => {
    onChange({
      ...value,
      referenceImages: value.referenceImages.filter((_, x) => x !== i),
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">告诉我你想怎么拍</h2>
        <p className="mt-1 text-sm text-neutral-500">
          一句话描述你的拍摄想法，AI 会先和你把服装、道具、动作聊清楚，确认后再出完整策划。
        </p>
      </div>

      {/*
        PC 两栏：左边写字、右边传图，横向空间用起来。
        用显式 row/col 定位而不是直接两列 —— 窄屏的元素顺序必须还是
        「想法 → 参考图 → 按钮」，靠 col-start/row-start 才能在 lg 下重排而不动 DOM 顺序。
      */}
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8 lg:space-y-0">
        <div className="lg:col-start-1 lg:row-start-1">
          <label className="mb-1 block text-sm font-medium">拍摄想法</label>
          <textarea
            ref={textRef}
            value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            onKeyDown={(e) => {
              // 单独 Enter 仍是换行：想法常常要分几行写
              if (isSubmit(e)) {
                e.preventDefault()
                submit()
              }
            }}
            rows={4}
            placeholder={'想怎么拍都可以，比如：\n"周日下午想和女朋友在西湖拍一组偏过曝的日系小清新"\n也可以只发图，AI 会看图和你聊'}
            className="w-full resize-none rounded-xl border border-neutral-200 px-3 py-2.5 outline-none focus:border-neutral-900 lg:min-h-[200px]"
          />
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <label className="mb-2 block text-sm font-medium">
            参考图（可选，最多 {MAX_IMAGES} 张）
          </label>
          <input
            id="ref-upload"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap gap-2">
            {value.referenceImages.map((src, i) => (
              <div key={i} className="relative">
                <img
                  src={src}
                  alt={`参考图 ${i + 1}`}
                  className="h-20 w-20 rounded-xl border border-neutral-200 object-cover lg:h-24 lg:w-24"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs text-white hover:bg-neutral-700"
                  aria-label={`删除参考图 ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
            {value.referenceImages.length < MAX_IMAGES && (
              <label
                htmlFor="ref-upload"
                className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border border-dashed border-neutral-300 text-xs text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-500 lg:h-24 lg:w-24"
              >
                {uploading ? '处理中…' : '＋ 上传'}
              </label>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
            传模特图：机位和动作会贴合这个人的气质；传场景图：机位落在真实环境里。发图需要模型本身支持看图（如
            deepseek-v4-flash），不支持看图的模型会忽略图片只按文字出方案
          </p>
        </div>

        <button
          onClick={submit}
          disabled={!ready || busy}
          className="w-full rounded-xl bg-neutral-900 py-3.5 font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-30 lg:col-start-1 lg:row-start-2 lg:max-w-xs"
        >
          {busy ? '正在准备讨论…' : '开始聊拍摄思路'}
          <kbd className="ml-2 hidden rounded border border-white/25 px-1.5 py-0.5 text-xs font-normal text-white/60 lg:inline">
            {MOD} ↵
          </kbd>
        </button>
      </div>
    </div>
  )
}
