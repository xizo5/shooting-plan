/// <reference types="vite/client" />

/** 构建期环境变量（`.env`）类型声明；均为可选，缺省时退回设置页手填 */
interface ImportMetaEnv {
  /** 主模型：OpenAI 兼容接口地址 */
  readonly VITE_BASE_URL?: string
  /** 主模型：API Key */
  readonly VITE_API_KEY?: string
  /** 主模型：模型名 */
  readonly VITE_MODEL?: string
  /** 生图（可选）：接口地址 */
  readonly VITE_IMAGE_BASE_URL?: string
  /** 生图（可选）：API Key */
  readonly VITE_IMAGE_API_KEY?: string
  /** 生图（可选）：模型名 */
  readonly VITE_IMAGE_MODEL?: string
  /** 生图（可选）：出图尺寸，如 1056x1568 */
  readonly VITE_IMAGE_SIZE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
