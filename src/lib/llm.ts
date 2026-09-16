import type { ChatMessage, ImageGenConfig, ModelConfig } from '../types'
import { urlToDataUrl } from './image'

export interface ProviderPreset {
  id: string
  name: string
  baseURL: string
  model: string
  keyURL: string
  note?: string
}

/** 厂商预设，均为 OpenAI 兼容接口 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    keyURL: 'https://platform.deepseek.com/api_keys',
    note: '便宜、中文好，推荐',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    keyURL: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: '有免费额度',
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    keyURL: 'https://bailian.console.aliyun.com/?apiKey=1',
  },
  {
    id: 'moonshot',
    name: 'Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyURL: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容',
    baseURL: '',
    model: '',
    keyURL: '',
    note: '中转 / one-api / 本地代理，可解决 CORS 问题',
  },
]

/** 生图厂商预设（OpenAI 兼容 images/generations） */
export const IMAGE_GEN_PRESETS: ProviderPreset[] = [
  {
    id: 'doubao-seedream',
    name: '豆包 Seedream',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seedream-4-0-250828',
    keyURL: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    note: '默认生图引擎，只需填 Key；支持参考图图生图',
  },
  {
    id: 'zhipu-glm-image',
    name: '智谱 GLM-Image',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-image',
    keyURL: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: '备选，竖版出图',
  },
  {
    id: 'custom-image',
    name: '自定义 OpenAI 兼容',
    baseURL: '',
    model: '',
    keyURL: '',
    note: '任意 /images/generations 接口（中转/one-api）',
  },
]

/** 智谱 GLM-Image 的出图尺寸（竖版人像参考片）；豆包不传 size 由模型自适应 */
export const ZHIPU_IMAGE_SIZE = '1056x1568'

/** 豆包模型列表拉取失败时的内置回退清单 */
export const DOUBAO_FALLBACK_MODELS = [
  'doubao-seedream-4-0-250828',
  'doubao-seedream-3-0-t2i-250415',
]

/**
 * 用 Key 拉取豆包（火山方舟）的生图模型列表。
 * Ark 的 /models 不完全兼容 OpenAI 格式，这里兼容解析多种返回结构；失败返回 null。
 */
export async function listImageModels(baseURL: string, apiKey: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${baseURL.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    const items: unknown[] = data?.data ?? data?.models ?? data?.items ?? []
    const ids = items
      .map((m) => {
        if (typeof m === 'string') return m
        const obj = m as Record<string, unknown>
        const v = obj?.id ?? obj?.model ?? obj?.model_id ?? obj?.name
        return typeof v === 'string' ? v : null
      })
      .filter((x): x is string => typeof x === 'string' && x.length > 0)
    const imageIds = ids.filter((id) => /seedream|seededit|cogview|image|t2i/i.test(id))
    return imageIds.length > 0 ? [...new Set(imageIds)] : ids.length > 0 ? ids : null
  } catch {
    return null
  }
}

export class LlmError extends Error {}

/** 发给接口的一条消息；content 为字符串或（附图时的）多模态数组 */
type WireMessage = { role: 'system' | 'user' | 'assistant'; content: unknown }

/** 一张参考图转成 OpenAI 兼容的多模态片段 */
type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

/** 把文本 + 可选参考图拼成 user 消息内容；无图时退化为纯字符串 */
function userContent(text: string, images: string[]): string | ContentPart[] {
  if (images.length === 0) return text
  return [{ type: 'text', text }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))]
}

/** 底层请求：发一组消息拿回复文本。所有模型调用最终都汇聚到这里 */
async function postChat(
  config: ModelConfig,
  messages: WireMessage[],
  jsonMode: boolean,
): Promise<string> {
  if (!config.apiKey) throw new LlmError('还没配置模型：请在 .env 里填 VITE_API_KEY')
  if (!config.baseURL || !config.model) throw new LlmError('模型配置不完整：请在 .env 里检查 VITE_BASE_URL 与 VITE_MODEL')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  try {
    const res = await fetch(`${config.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.8,
        // 附图 + JSON 模式不兼容，见 chatOnce 的说明
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 401) throw new LlmError('API Key 无效或已过期，请检查 .env 里的 VITE_API_KEY')
      if (res.status === 402 || res.status === 429)
        throw new LlmError('余额不足或请求太频繁，请到厂商控制台查看')
      throw new LlmError(`模型请求失败（${res.status}）${text.slice(0, 120)}`)
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new LlmError('模型返回了空内容，请重试')
    return content
  } catch (err) {
    if (err instanceof LlmError) throw err
    if (err instanceof DOMException && err.name === 'AbortError')
      throw new LlmError('请求超时了，请检查网络或换一个模型再试')
    throw new LlmError(
      '网络请求失败，可能是该厂商不允许浏览器直连（CORS）。可在 .env 里把 VITE_BASE_URL 改成中转地址后重新构建',
    )
  } finally {
    clearTimeout(timer)
  }
}

async function chatOnce(
  config: ModelConfig,
  system: string,
  user: string,
  jsonMode: boolean,
  images: string[] = [],
): Promise<string> {
  // 附图时不用 response_format：部分厂商（如智谱）与多模态同时用会报错
  return postChat(
    config,
    [
      { role: 'system', content: system },
      { role: 'user', content: userContent(user, images) },
    ],
    jsonMode && images.length === 0,
  )
}

/** 从模型输出中提取 JSON（容忍 markdown 代码围栏等杂质） */
export function extractJson<T>(raw: string): T {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.search(/[[{]/)
  if (start > 0) text = text.slice(start)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new LlmError('模型输出的格式不对，请重试或换个模型')
  }
}

export interface ChatOpts {
  /** 可选：随消息附上的参考图 dataURL 列表（模特图/场景图，需模型支持看图） */
  images?: string[]
}

/** 生成并解析 JSON；失败自动重试一次 */
export async function chatJson<T>(
  config: ModelConfig,
  system: string,
  user: string,
  opts: ChatOpts = {},
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chatOnce(config, system, user, true, opts.images)
      return extractJson<T>(raw)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

export interface ChatTextOpts {
  /** 多轮历史（不含 system 与最后一条 user） */
  history?: ChatMessage[]
  /** 可选：随消息附上的参考图 dataURL 列表，需模型支持看图 */
  images?: string[]
}

/**
 * 多轮对话，返回纯文本回复（讨论环节用）。
 *
 * 参考图附在**最后一条 user 消息**上而不是整个历史里：多数厂商不允许多条消息
 * 同时带图，且每轮重复传图会显著拉高 token 消耗。
 */
export async function chatText(
  config: ModelConfig,
  system: string,
  user: string,
  opts: ChatTextOpts = {},
): Promise<string> {
  const messages: WireMessage[] = [{ role: 'system', content: system }]
  for (const m of opts.history ?? []) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: userContent(user, opts.images ?? []) })
  return postChat(config, messages, false)
}

/** 生成一张参考片；附参考图时走图生图（base64 直传），返回 dataURL 或远程 URL */
export async function generateImage(
  cfg: ImageGenConfig,
  prompt: string,
  referenceImages: string[] = [],
): Promise<string> {
  if (!cfg.baseURL || !cfg.model) throw new LlmError('生图配置不完整：请在 .env 里检查 VITE_IMAGE_BASE_URL 与 VITE_IMAGE_MODEL')
  if (!cfg.apiKey) throw new LlmError('缺少生图 API Key：请在 .env 里填 VITE_IMAGE_API_KEY')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  try {
    const res = await fetch(`${cfg.baseURL.replace(/\/$/, '')}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        prompt,
        // 图生图：参考图以 base64 dataURL 直传（豆包 Seedream 支持单图或多图数组）
        ...(referenceImages.length > 0 ? { image: referenceImages } : {}),
        ...(cfg.size ? { size: cfg.size } : {}),
        ...(cfg.responseFormat ? { response_format: cfg.responseFormat } : {}),
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 401) throw new LlmError('生图 API Key 无效，请检查 .env 里的 VITE_IMAGE_API_KEY')
      if (res.status === 402 || res.status === 429)
        throw new LlmError('生图余额不足或请求太频繁，请到厂商控制台查看')
      throw new LlmError(`生图失败（${res.status}）${text.slice(0, 120)}`)
    }
    const data = await res.json()
    const item = data?.data?.[0]
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`
    const url = item?.url
    if (typeof url === 'string' && url) {
      const dataUrl = await urlToDataUrl(url)
      return dataUrl ?? url
    }
    throw new LlmError('生图接口没有返回图片，请重试')
  } catch (err) {
    if (err instanceof LlmError) throw err
    if (err instanceof DOMException && err.name === 'AbortError')
      throw new LlmError('生图超时了，请重试')
    throw new LlmError('生图请求失败（可能是 CORS 或网络问题）')
  } finally {
    clearTimeout(timer)
  }
}
