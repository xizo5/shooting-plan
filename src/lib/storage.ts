import type { ModelConfig, ImageGenConfig, ShootPlan } from '../types'

const CONFIG_KEY = 'sp:config'
const PLANS_KEY = 'sp:plans'

/**
 * 从构建期环境变量读取模型配置（`.env`，见 `.env.example`）。
 * 仅作为**首次使用的默认值**：用户在设置页保存过的配置优先级更高，
 * 这样 CORS 时改中转地址、临时换厂商都不用重新构建。
 */
function configFromEnv(): ModelConfig | null {
  const apiKey = import.meta.env.VITE_API_KEY?.trim()
  const model = import.meta.env.VITE_MODEL?.trim()
  if (!apiKey || !model) return null

  const imageGen: ImageGenConfig | null =
    import.meta.env.VITE_IMAGE_API_KEY?.trim() && import.meta.env.VITE_IMAGE_MODEL?.trim()
      ? {
          baseURL: import.meta.env.VITE_IMAGE_BASE_URL?.trim() ?? '',
          apiKey: import.meta.env.VITE_IMAGE_API_KEY.trim(),
          model: import.meta.env.VITE_IMAGE_MODEL.trim(),
          size: import.meta.env.VITE_IMAGE_SIZE?.trim() || undefined,
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

export function loadConfig(): ModelConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    const config = raw ? (JSON.parse(raw) as ModelConfig) : null
    // 旧默认 cogview-3-flash 迁移到 glm-image
    if (config?.imageGen && config.imageGen.model === 'cogview-3-flash') {
      config.imageGen = { ...config.imageGen, model: 'glm-image', size: '1056x1568' }
    }
    // deepseek-chat 旧模型名已停用（2026-07-24），指向 deepseek-v4-flash
    if (config && config.presetId === 'deepseek' && config.model === 'deepseek-chat') {
      config.model = 'deepseek-v4-flash'
    }
    // 本地存过配置就用本地的（用户在设置页调过的以用户为准）
    if (config) return config
    return configFromEnv()
  } catch {
    return null
  }
}

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
