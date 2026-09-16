import { useState } from 'react'
import type { Brief } from '../types'
import { compressDataUrl, fileToDataUrl } from '../lib/image'

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

  const ready = value.text.trim() || value.referenceImages.length > 0

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
      <div className="rounded-2xl bg-neutral-900 p-5 text-white">
        <h1 className="text-xl font-bold">告诉我你想怎么拍</h1>
        <p className="mt-1 text-sm text-neutral-400">
          一句话描述你的拍摄想法，AI 会先和你把服装、道具、动作聊清楚，确认后再出完整策划。
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">拍摄想法</label>
        <textarea
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          rows={4}
          placeholder={'想怎么拍都可以，比如：\n"周日下午想和女朋友在西湖拍一组偏过曝的日系小清新"\n也可以只发图，AI 会看图和你聊'}
          className="w-full resize-none rounded-xl border border-neutral-200 px-3 py-2.5 outline-none focus:border-neutral-900"
        />
      </div>

      <div>
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
                className="h-20 w-20 rounded-xl border border-neutral-200 object-cover"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs text-white"
                aria-label={`删除参考图 ${i + 1}`}
              >
                ×
              </button>
            </div>
          ))}
          {value.referenceImages.length < MAX_IMAGES && (
            <label
              htmlFor="ref-upload"
              className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border border-dashed border-neutral-300 text-xs text-neutral-400"
            >
              {uploading ? '处理中…' : '＋ 上传'}
            </label>
          )}
        </div>
        <p className="mt-1.5 text-xs text-neutral-400">
          传模特图：机位和动作会贴合这个人的气质；传场景图：机位落在真实环境里。发图需要模型支持看图（如智谱
          glm-4v-flash），不支持看图的模型会忽略图片只按文字出方案
        </p>
      </div>

      <button
        onClick={() => onSubmit(value)}
        disabled={!ready || busy}
        className="w-full rounded-xl bg-neutral-900 py-3.5 font-medium text-white disabled:opacity-30"
      >
        {busy ? '正在准备讨论…' : '开始聊拍摄思路'}
      </button>
    </div>
  )
}
