import type { ModelConfig, ImageGenConfig, ShootPlan } from '../types'
import { imageResponseFormatFor } from './llm'

const CONFIG_KEY = 'sp:config'
const PLANS_KEY = 'sp:plans'

/**
 * 从构建期环境变量读取模型配置（`.env`，见 `.env.example`）。
 * 这是**当前的配置主入口**——设置页入口已隐藏，模型配置以 `.env` 为准。
 */
function configFromEnv(): ModelConfig | null {
  const apiKey = import.meta.env.VITE_API_KEY?.trim()
  const model = import.meta.env.VITE_MODEL?.trim()
  if (!apiKey || !model) return null

  const imgBaseURL = import.meta.env.VITE_IMAGE_BASE_URL?.trim() ?? ''
  const imgModel = import.meta.env.VITE_IMAGE_MODEL?.trim() ?? ''
  const imageGen: ImageGenConfig | null =
    import.meta.env.VITE_IMAGE_API_KEY?.trim() && imgModel
      ? {
          baseURL: imgBaseURL,
          apiKey: import.meta.env.VITE_IMAGE_API_KEY.trim(),
          model: imgModel,
          size: import.meta.env.VITE_IMAGE_SIZE?.trim() || undefined,
          // 豆包要 base64：不然后端回远程 URL，画不进 canvas，长图里就没有参考片
          responseFormat: imageResponseFormatFor(imgBaseURL, imgModel),
        }
      : null

  return {
    presetId: 'custom',
    baseURL: import.meta.env.VITE_BASE_URL?.trim() ?? '',
    apiKey,
    model,
    imageGen,
  }
}

/**
 * 读取模型配置。**优先级：`.env` > localStorage**。
 *
 * 设置页入口已隐藏，`.env` 是唯一可维护的配置来源，因此它说了算。
 * localStorage 里的 `sp:config` 只作为兜底：`.env` 没配全时（例如只想换文字模型、
 * 生图仍沿用旧配置）才读它，避免升级后配置凭空消失。
 */
export function loadConfig(): ModelConfig | null {
  const envConfig = configFromEnv()
  if (envConfig) {
    // .env 配了生图就用 .env 的；没配则沿用本地遗留的生图配置，避免功能凭空消失
    if (!envConfig.imageGen) {
      const legacy = readLocalConfig()
      if (legacy?.imageGen) return { ...envConfig, imageGen: legacy.imageGen }
    }
    return envConfig
  }
  return readLocalConfig()
}

/** 读 localStorage 里的旧配置（含历史模型名迁移） */
function readLocalConfig(): ModelConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    const config = raw ? (JSON.parse(raw) as ModelConfig) : null
    if (!config) return null
    // 旧默认 cogview-3-flash 迁移到 glm-image
    if (config.imageGen && config.imageGen.model === 'cogview-3-flash') {
      config.imageGen = { ...config.imageGen, model: 'glm-image', size: '1056x1568' }
    }
    // deepseek-chat 旧模型名已停用（2026-07-24），指向 deepseek-v4-flash（支持看图）
    if (config.presetId === 'deepseek' && config.model === 'deepseek-chat') {
      config.model = 'deepseek-v4-flash'
    }
    return config
  } catch {
    return null
  }
}

/**
 * 写回 localStorage。
 * 设置页入口隐藏后暂无人调用，保留是为了恢复图形化设置页时能直接用；
 * 注意 `.env` 优先级更高，这里的写入不会覆盖 `.env` 的配置。
 */
export function saveConfig(config: ModelConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function listPlans(): ShootPlan[] {
  try {
    const raw = localStorage.getItem(PLANS_KEY)
    return raw ? (JSON.parse(raw) as ShootPlan[]) : []
  } catch {
    return []
  }
}

/** 保存策划；参考片会让体积变大，超限时逐步丢弃最旧的策划 */
export function savePlan(plan: ShootPlan) {
  const plans = listPlans().filter((p) => p.id !== plan.id)
  plans.unshift(plan)
  for (const count of [30, 20, 10, 5, 2]) {
    try {
      localStorage.setItem(PLANS_KEY, JSON.stringify(plans.slice(0, count)))
      return
    } catch {
      // 继续缩小数量
    }
  }
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify([plan]))
  } catch {
    // 彻底放不下（单条过大），保不住就只能放弃
  }
}

export function deletePlan(id: string) {
  localStorage.setItem(PLANS_KEY, JSON.stringify(listPlans().filter((p) => p.id !== id)))
}
