/** 前置条件：一个自由文本输入 + 可选参考图（模特图/场景图），结构化维度由 AI 解析 */
export interface Brief {
  /** 用户的自由描述 */
  text: string
  /** 可选参考图（压缩后的 dataURL）：模特图和/或场景图，供支持看图的模型读取 */
  referenceImages: string[]
  /** 以下由 AI 从文本与图片解析，风格方向生成前可能尚未填充 */
  theme?: string
  location?: string
  time?: string
  people?: string
}

/** 风格方向：一次生成的差异化选项，AI 内部中间产物，用于并行展开成多套完整策划 */
export interface StyleDirection {
  id: string
  name: string
  tagline: string
}

/** 讨论环节的一条消息 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** 该条是否还在流式接收中（仅 UI 用，不落库、不参与请求） */
  streaming?: boolean
}

/**
 * 共识：讨论环节敲定的拍摄约定，确认后作为生成依据。
 * 由 AI 在讨论收尾时归纳，用户可要求修改；字段都可缺省，缺省表示"没聊到、由 AI 自行发挥"。
 */
export interface Consensus {
  /** 风格调性，如"偏过曝的日系小清新" */
  style: string
  /** 服装建议 */
  wardrobe: string
  /** 道具清单 */
  props: string
  /** 动作/情绪基调 */
  mood: string
  /** 其他约束（避开的元素、必须拍到的东西等） */
  notes: string
}

/** 一次讨论会话：消息历史 + 收敛出的共识 */
export interface Discussion {
  messages: ChatMessage[]
  /** 尚未确认前为 null */
  consensus: Consensus | null
}

/** 画面：策划的最小单位，对应成片中的一张照片 */
export interface Shot {
  /** 姿势、构图、光线、表情引导的完整描述 */
  description: string
  /** 从插画库标签体系中选择的姿势标签 */
  poseTags: string[]
  /** 给被拍者的一句话提示 */
  tip?: string
  /** AI 生成的参考片（压缩后的 dataURL，或厂商返回的远程 URL） */
  image?: string
}

/** 场景：一组在同一地点/时段拍摄的画面的分组 */
export interface Scene {
  title: string
  /** 该场景的光线要点 */
  light: string
  /** 是否为备用场景（雨天/备选方案） */
  backup: boolean
  shots: Shot[]
}

/** 策划：一次生成的完整交付物 */
export interface ShootPlan {
  id: string
  createdAt: number
  brief: Brief
  directionName: string
  title: string
  scenes: Scene[]
}

/** 生图模型配置（OpenAI 兼容 images/generations） */
export interface ImageGenConfig {
  baseURL: string
  apiKey: string
  model: string
  /** 可选，如 "1056x1568"；不传由厂商决定 */
  size?: string
  /** 可选：要求接口直接返回 base64（豆包支持，免去拉取远程 URL 的 CORS 问题） */
  responseFormat?: 'b64_json'
}

/** 用户自配的模型信息（OpenAI 兼容） */
export interface ModelConfig {
  /** 厂商预设 id 或 'custom' */
  presetId: string
  baseURL: string
  apiKey: string
  model: string
  /** 生图配置，null/undefined 表示未启用 */
  imageGen?: ImageGenConfig | null
}

export type View = 'brief' | 'discuss' | 'confirm' | 'plan' | 'library'
