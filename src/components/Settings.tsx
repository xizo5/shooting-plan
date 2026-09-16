/**
 * 模型设置页 —— **入口已隐藏，当前不在任何导航里可达**。
 *
 * 模型配置已改为由 `.env` 提供（见 AGENTS.md「配置的两层」），
 * 本组件保留是为了将来恢复图形化设置时能一键启用：
 * 在 `App.tsx` 里放开 header 的「设置」按钮 + `view === 'settings'` 的渲染即可。
 *
 * 注意：`loadConfig()` 现在 `.env` 优先，所以本页保存的值会被 `.env` 覆盖；
 * 恢复本页时需同步调整 `storage.ts` 里的优先级。
 */
import { useEffect, useRef, useState } from 'react'
import type { ModelConfig } from '../types'
import { DOUBAO_FALLBACK_MODELS, IMAGE_GEN_PRESETS, listImageModels, PROVIDER_PRESETS, ZHIPU_IMAGE_SIZE } from '../lib/llm'

interface Props {
  config: ModelConfig | null
  onSave: (config: ModelConfig) => void
  onBack: () => void
}

export default function Settings({ config, onSave, onBack }: Props) {
  const [presetId, setPresetId] = useState(config?.presetId ?? 'deepseek')
  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId)!
  const [baseURL, setBaseURL] = useState(config?.baseURL ?? preset.baseURL)
  const [model, setModel] = useState(config?.model ?? preset.model)
  const [apiKey, setApiKey] = useState(config?.apiKey ?? '')

  const savedImg = config?.imageGen
  const [imgEnabled, setImgEnabled] = useState(Boolean(savedImg))
  const [imgPresetId, setImgPresetId] = useState(
    savedImg
      ? (IMAGE_GEN_PRESETS.find((p) => p.model === savedImg.model || p.baseURL === savedImg.baseURL)?.id ?? 'custom-image')
      : 'doubao-seedream',
  )
  const imgPreset = IMAGE_GEN_PRESETS.find((p) => p.id === imgPresetId)!
  const [imgBaseURL, setImgBaseURL] = useState(savedImg?.baseURL ?? imgPreset.baseURL)
  const [imgModel, setImgModel] = useState(savedImg?.model ?? imgPreset.model)
  const [imgKey, setImgKey] = useState(savedImg?.apiKey ?? '')

  // 豆包：用 Key 拉取生图模型列表做下拉框；拉取失败回退内置清单
  const [doubaoModels, setDoubaoModels] = useState<string[] | null>(null)
  const [doubaoFetchErr, setDoubaoFetchErr] = useState(false)
  const fetchedKey = useRef('')
  const fetchDoubaoModels = async (key: string) => {
    const list = await listImageModels('https://ark.cn-beijing.volces.com/api/v3', key)
    if (list && list.length > 0) {
      setDoubaoModels(list)
      setDoubaoFetchErr(false)
      setImgModel((cur) => (list.includes(cur) ? cur : list[0]))
    } else {
      setDoubaoModels(DOUBAO_FALLBACK_MODELS)
      setDoubaoFetchErr(true)
      setImgModel((cur) => (DOUBAO_FALLBACK_MODELS.includes(cur) ? cur : DOUBAO_FALLBACK_MODELS[0]))
    }
  }
  useEffect(() => {
    if (imgEnabled && imgPresetId === 'doubao-seedream' && imgKey.trim() && fetchedKey.current !== imgKey) {
      fetchedKey.current = imgKey
      void fetchDoubaoModels(imgKey)
    }
  }, [imgEnabled, imgPresetId, imgKey])

  const switchPreset = (id: string) => {
    setPresetId(id)
    const p = PROVIDER_PRESETS.find((x) => x.id === id)!
    setBaseURL(p.baseURL)
    setModel(p.model)
  }

  const switchImgPreset = (id: string) => {
    setImgPresetId(id)
    const p = IMAGE_GEN_PRESETS.find((x) => x.id === id)!
    setImgBaseURL(p.baseURL)
    setImgModel(p.model)
  }

  const save = () => {
    onSave({
      presetId,
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      imageGen:
        imgEnabled && imgBaseURL.trim() && imgModel.trim()
          ? {
              baseURL: imgBaseURL.trim(),
              apiKey: imgKey.trim(),
              model: imgModel.trim(),
              size: imgPresetId === 'zhipu-glm-image' ? ZHIPU_IMAGE_SIZE : undefined,
              responseFormat: imgPresetId === 'doubao-seedream' ? ('b64_json' as const) : undefined,
            }
          : null,
    })
    onBack()
  }

  const canSave = baseURL.trim() && apiKey.trim() && model.trim()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">模型设置</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Key 只保存在你手机/电脑的浏览器里，不会上传到任何服务器。
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">厂商</label>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDER_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => switchPreset(p.id)}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${
                presetId === p.id
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-700'
              }`}
            >
              {p.name}
              {p.note && <span className="mt-0.5 block text-xs opacity-60">{p.note}</span>}
            </button>
          ))}
        </div>
        {preset.keyURL && (
          <a
            href={preset.keyURL}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm text-blue-600 underline"
          >
            去获取 {preset.name} 的 API Key ↗
          </a>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">API 地址（OpenAI 兼容）</label>
        <input
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
        />
        <p className="mt-1 text-xs text-neutral-400">
          如果该厂商不允许浏览器直连（请求报 CORS 错误），填一个中转地址即可
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">API Key</label>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          placeholder="sk-..."
          className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">模型名</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="deepseek-v4-flash"
          className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
        />
      </div>

      <div className="rounded-2xl border border-neutral-200 p-4">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium">参考片生成（AI 生图）</span>
          <input
            type="checkbox"
            checked={imgEnabled}
            onChange={(e) => setImgEnabled(e.target.checked)}
            className="h-5 w-5 accent-neutral-900"
          />
        </label>
        <p className="mt-1 text-xs text-neutral-400">
          默认豆包 Seedream，只需填 Key（支持图生图：上传的参考图会以 base64 直传，参考片里就是同一个人同一个场景）；不开启则用内置姿势插画
        </p>

        {imgEnabled && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">生图厂商</label>
              <div className="grid grid-cols-2 gap-2">
                {IMAGE_GEN_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => switchImgPreset(p.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm ${
                      imgPresetId === p.id
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700'
                    }`}
                  >
                    {p.name}
                    {p.note && <span className="mt-0.5 block text-xs opacity-60">{p.note}</span>}
                  </button>
                ))}
              </div>
              {imgPreset.keyURL && (
                <a
                  href={imgPreset.keyURL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm text-blue-600 underline"
                >
                  去获取 {imgPreset.name} 的 API Key ↗
                </a>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">生图 API Key</label>
              <input
                value={imgKey}
                onChange={(e) => setImgKey(e.target.value)}
                type="password"
                placeholder="留空则使用上方的 Key"
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
              />
            </div>
            {imgPresetId === 'custom-image' && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">API 地址</label>
                  <input
                    value={imgBaseURL}
                    onChange={(e) => setImgBaseURL(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">模型名</label>
                  <input
                    value={imgModel}
                    onChange={(e) => setImgModel(e.target.value)}
                    placeholder="模型名"
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
                  />
                </div>
              </>
            )}
            {imgPresetId === 'doubao-seedream' && (
              <div>
                <label className="mb-1 block text-sm font-medium">生图模型</label>
                <div className="flex gap-2">
                  <select
                    value={imgModel}
                    onChange={(e) => setImgModel(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-900"
                  >
                    {(doubaoModels ?? [imgModel]).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      fetchedKey.current = ''
                      if (imgKey.trim()) void fetchDoubaoModels(imgKey)
                    }}
                    disabled={!imgKey.trim()}
                    className="shrink-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-600 disabled:opacity-40"
                  >
                    刷新
                  </button>
                </div>
                {doubaoFetchErr && (
                  <p className="mt-1 text-xs text-amber-600">
                    模型列表自动获取失败，已显示内置清单（可点刷新重试）
                  </p>
                )}
                {!imgKey.trim() && (
                  <p className="mt-1 text-xs text-neutral-400">填入 Key 后自动获取可用生图模型</p>
                )}
              </div>
            )}
            {imgPresetId === 'zhipu-glm-image' && (
              <p className="text-xs text-neutral-400">模型：{imgModel}（内置，无需修改）</p>
            )}
          </div>
        )}
      </div>

      <button
        onClick={save}
        disabled={!canSave}
        className="w-full rounded-xl bg-neutral-900 py-3 font-medium text-white disabled:opacity-30"
      >
        保存
      </button>
    </div>
  )
}
