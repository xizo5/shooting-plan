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

/**
 * 判断某个生图厂商该不该索要 `b64_json`。
 *
 * 为什么要这样判断：默认（不传 `response_format`）厂商返回的是**远程 URL**。
 * 远程 URL 在浏览器里显示没问题，但**画进 canvas 会污染画布**，
 * 长图导出会直接抛 SecurityError；而且拉取还常被 CORS 拦。
 * 豆包支持 `response_format: 'b64_json'`，直接要 base64 就绕开了整条链路。
 *
 * 认厂商而不是写死一个开关：`.env` 只有 baseURL/model，没有厂商 id。
 */
export function imageResponseFormatFor(
  baseURL: string,
  model: string,
): 'b64_json' | undefined {
  if (/volces\.com/.test(baseURL) || /^doubao-/i.test(model)) return 'b64_json'
  return undefined
}

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

/** 发请求并做统一的错误翻译（超时 / 401 / CORS 都变成了人话） */
async function requestChat(
  config: ModelConfig,
  messages: WireMessage[],
  opts: { jsonMode?: boolean; stream?: boolean },
): Promise<Response> {
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
        ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        ...(opts.stream ? { stream: true } : {}),
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
    return res
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

/** 底层请求：发一组消息拿回复文本。所有非流式模型调用最终都汇聚到这里 */
async function postChat(
  config: ModelConfig,
  messages: WireMessage[],
  jsonMode: boolean,
): Promise<string> {
  const res = await requestChat(config, messages, { jsonMode })
  const data = await res.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new LlmError('模型返回了空内容，请重试')
  return content
}

/**
 * 流式解析 OpenAI 兼容的 SSE 响应，每收到一段增量就调一次 onDelta。
 *
 * 容错要点（不同厂商实现有差异）：
 * - 事件以 `data: ` 开头，空行分隔；`data: [DONE]` 表示结束
 * - 中文是多字节的，一个 chunk 可能把字切两半 —— 因此**只按换行切**，
 *   残缺的行留在 buffer 里等下一块，绝不按字节硬切
 * - 少数厂商（或中转）忽略 stream 参数直接返回完整 JSON，这里做兜底直读
 */
async function readStream(res: Response, onDelta: (text: string) => void): Promise<string> {
  const ctype = res.headers.get('content-type') ?? ''
  if (!res.body || (!ctype.includes('event-stream') && !ctype.includes('stream'))) {
    // 厂商不支持流式：退化成一次性读取，至少不会白等
    const data = await res.json().catch(() => null)
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new LlmError('模型返回了空内容，请重试')
    onDelta(content)
    return content
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let out = ''
  let done = false

  while (!done) {
    const { value, done: finished } = await reader.read()
    if (finished) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 的分隔符可能是 \n\n 或 \r\n\r\n，统一按 \n 切再 trim
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') {
        if (payload === '[DONE]') done = true
        continue
      }
      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta
        // 部分厂商把增量放在 message.content（非标准但常见），一并兼容
        const piece = delta?.content ?? delta?.reasoning_content ?? json?.choices?.[0]?.message?.content
        if (typeof piece === 'string' && piece) {
          out += piece
          onDelta(piece)
        }
      } catch {
        // 单个事件解析失败不能拖垮整段输出，跳过
      }
    }
    if (done) break
  }

  // 收尾：处理最后一行没有换行符的情况
  buffer += decoder.decode()
  for (const rawLine of buffer.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const json = JSON.parse(payload)
      const piece = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content
      if (typeof piece === 'string' && piece) {
        out += piece
        onDelta(piece)
      }
    } catch {
      // 同上
    }
  }

  if (!out.trim()) throw new LlmError('模型返回了空内容，请重试')
  return out
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
  return postChat(config, buildTextMessages(system, user, opts), false)
}

/** 组装多轮文本消息（history 为「本条之前的对话」，user 是本条新消息） */
function buildTextMessages(system: string, user: string, opts: ChatTextOpts): WireMessage[] {
  const messages: WireMessage[] = [{ role: 'system', content: system }]
  for (const m of opts.history ?? []) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: userContent(user, opts.images ?? []) })
  return messages
}

/**
 * 流式版多轮对话：每收到一段增量就回调 onDelta，返回完整文本。
 *
 * 供讨论环节使用（逐字显示更像在和人聊天）。若厂商不支持 SSE，
 * readStream 会退化成一次性返回 —— 上层无需关心。
 */
export async function chatTextStream(
  config: ModelConfig,
  system: string,
  user: string,
  onDelta: (text: string) => void,
  opts: ChatTextOpts = {},
): Promise<string> {
  const res = await requestChat(config, buildTextMessages(system, user, opts), { stream: true })
  return readStream(res, onDelta)
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

/**
 * 测试接缝：SSE 解析是这个文件里唯一"看着简单、写错很难发现"的逻辑
 * （中文被 UTF-8 边界切断会直接变成乱码），所以把它暴露出来单独验证。
 *
 * 跑 `npm run test:sse`，脚本会 esbuild 编译本文件（含这个导出）再喂各种
 * 分块方式：逐字节、CRLF、坏 JSON、[DONE]、非标准字段、不支持流式的降级。
 * 别改成用正则剥 TS 类型，会崩。
 */
export const __test = { readStream }
