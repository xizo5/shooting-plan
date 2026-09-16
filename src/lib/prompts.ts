import { POSE_TAGS } from './poses'
import type { Brief, Scene, Shot, StyleDirection } from '../types'

const LIGHT_KNOWLEDGE = `
时段→光线知识（写画面时必须遵守）：
- 清晨：低角度暖光，光线柔和，人少景净，适合逆光剪影和长影子
- 白天：顶光硬，正午避免阳光直射脸；找树荫、建筑阴影、漫射区域；适合明快通透的风格
- 黄昏：出片黄金期，日落前一小时开始最佳；侧逆光发丝光、暖色调、天空色彩层次丰富
- 夜晚：依赖环境光源——路灯、霓虹、橱窗光、蜡烛；适合情绪感和城市氛围；提醒被拍者注意安全
- 阴天/雨天：天然柔光箱，色彩饱和；雨天可拍倒影、雨伞、玻璃水珠，是备用场景的主力`

const SYSTEM = `你是一位顶级拍摄策划师，专门为"被拍的人"（不是摄影师）设计拍摄策划。
你的用户站在镜头前会紧张、不知道手往哪放、不知道看哪里。你的策划要让他们拿着手机就能照着做。

写作原则：
- 每个画面（Shot）的描述必须具体到"身体怎么摆、手放哪、眼睛看哪、表情怎样"，拒绝"自然一点""放松一些"这类废话
- 描述要让不懂摄影的人也能秒懂，不堆砌摄影术语；构图意图可以用大白话带过（如"人放在画面右下角，左边留出大片天空"）
- 画面之间要有节奏变化：远景/近景交替、动态/静态交替、看镜头/不看镜头交替
- 场景（Scene）是同一地点/时段拍摄的一组画面，给出该场景的光线要点

只输出 JSON，不要输出任何其他文字。`

export function cardsSystem(): string {
  return SYSTEM
}

/** 风格方向生成：同时把自由文本 + 参考图解析成结构化前置条件 */
export function cardsUserPrompt(text: string, hasImages: boolean): string {
  return `下面是被拍者的拍摄需求描述${hasImages ? '，以及随消息附上的参考图' : ''}。请先解析前置条件，再生成 3 个差异明显的风格方向（方向名 + 一句话卖点），后续会各自展开成完整策划。

需求描述：
${text || '（用户没有写字，只上传了参考图，请完全从图片推断）'}
${
  hasImages
    ? `
参考图说明（可能是一张或多张）：
- 模特图：记住人物的外形、气质、着装，风格方向和后续动作必须适合这个人
- 场景图：记住环境、光线、可站位，机位和动作必须落在这个真实场景里、现场可执行
- 解析前置条件时优先从图片取信息，描述里没写的以图为准`
    : ''
}
${LIGHT_KNOWLEDGE}

输出 JSON 格式：
{"brief":{"theme":"主题（从描述和图片提炼，如日系情侣写真）","location":"地点","time":"清晨/白天/黄昏/夜晚之一","people":"人物构成（如情侣两人）"},"directions":[{"id":"d1","name":"风格名（4字以内）","tagline":"一句话卖点（15字以内，说清这个方向拍出来是什么感觉）"}]}`
}

export function expandSystem(): string {
  return SYSTEM
}

export function expandUserPrompt(brief: Brief, direction: StyleDirection): string {
  const hasImages = brief.referenceImages.length > 0
  return `被拍者选中了"${direction.name}"这个风格方向（${direction.tagline}）。请展开为一份完整策划。${
    hasImages
      ? `

随消息附上了参考图（模特图/场景图），这是本次策划的"图生图"依据：
- 模特图：机位高度、景别、动作幅度都要贴合图中人物的体型气质；动作要这个人做得到、做得好看
- 场景图：每个机位写成"站在场景图的某个真实位置、朝某个方向"（如"背对图中那排树，坐在台阶上"），不写这个场景里不存在的布景`
      : ''
  }

可选姿势标签（画面的 poseTags 只能从这里选，按画面人物数量选单人/双人前缀的标签）：
${POSE_TAGS.join('、')}

前置条件：
- 主题：${brief.theme ?? '（未解析）'}
- 地点：${brief.location ?? '（未解析）'}
- 时间：${brief.time ?? '（未解析）'}
- 人物：${brief.people ?? '（未解析）'}

要求：
- 3-4 个场景，按拍摄动线排序（哪个先拍、哪个后拍，考虑光线变化）
- 每个场景 3-5 个画面，总共 12-15 个画面
- 最后 1 个场景必须是备用场景（backup 为 true）：内容针对天气突变、人多、或光线不理想的情况
- description 60-90 字：姿势动作（具体到手的位置）+ 构图大白话 + 表情/情绪引导
- tip 是给被拍者的一句话提醒（比如"拍之前擦掉眼镜反光""这组动作拍 3 张就够"），没有就留空

输出 JSON 格式：
{"title":"策划标题","scenes":[{"title":"场景名","light":"该场景光线要点（20字内）","backup":false,"shots":[{"description":"画面描述","poseTags":["双人-对视"],"tip":"一句话提醒"}]}]}`
}

/** 单个画面的参考片生图 prompt */
export function imagePromptFor(brief: Brief, directionName: string, shot: Shot): string {
  const who = brief.people ? `人物：${brief.people}。` : ''
  const where = brief.location ? `场景：${brief.location}。` : ''
  const when = brief.time ? `时间：${brief.time}。` : ''
  const grounding =
    brief.referenceImages.length > 0
      ? '已附参考图：人物的长相、体型、发型必须与模特图保持一致（同一个人），场景环境必须与场景图一致，在此基础上摆出下述动作。'
      : ''
  return `真实人像摄影参考图。风格：${directionName}，主题：${brief.theme ?? brief.text}。${who}${where}${when}${grounding}画面内容：${shot.description} 要求：写实照片质感，自然光影，人物姿态自然，构图与画面内容一致；不要插画、卡通、过度美颜、文字和水印。`
}

/** 展开结果 → 策划数据（做最低限度的防御性整理） */
export function normalizeScenes(raw: unknown): Scene[] {
  const scenes = Array.isArray(raw) ? raw : []
  return scenes.map((s) => {
    const scene = s as Partial<Scene>
    return {
      title: String(scene.title ?? '场景'),
      light: String(scene.light ?? ''),
      backup: Boolean(scene.backup),
      shots: (Array.isArray(scene.shots) ? scene.shots : []).map((shot) => {
        const sh = shot as Partial<Shot>
        return {
          description: String(sh.description ?? ''),
          poseTags: Array.isArray(sh.poseTags) ? sh.poseTags.map(String) : [],
          tip: sh.tip ? String(sh.tip) : undefined,
        }
      }),
    }
  })
}

/** 风格方向响应里 AI 解析出的前置条件 → 合并进 Brief */
export function mergeParsedBrief(
  brief: Brief,
  parsed: Partial<Pick<Brief, 'theme' | 'location' | 'time' | 'people'>> | undefined,
): Brief {
  if (!parsed) return brief
  return {
    ...brief,
    theme: parsed.theme ? String(parsed.theme) : brief.theme,
    location: parsed.location ? String(parsed.location) : brief.location,
    time: parsed.time ? String(parsed.time) : brief.time,
    people: parsed.people ? String(parsed.people) : brief.people,
  }
}
