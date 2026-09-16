import type { ShootPlan } from '../types'
import { pickPose, svgToDataUrl } from './poses'

const W = 750
const PAD = 40
const IMG_W = 150
const TEXT_X = PAD + IMG_W + 20
const TEXT_W = W - PAD - TEXT_X
const TEXT = '#1a1a1a'
const SUB = '#737373'

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line)
      line = ch
    } else {
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // crossOrigin 必须在 src 之前设，设晚了不生效
    if (cors) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * 载入一张能安全画进 canvas 的图；不行就返回 null。
 *
 * 为什么不能直接用 `shot.image`：`generateImage` 在厂商不给 base64 时会回一个**远程 URL**
 * （见 `llm.ts` 的 `generateImage`）。远程图分两种：
 *  - 服务端带 CORS 头 → 加 `crossOrigin` 能读像素，可以安全入画；
 *  - 不带 → 画上去会**污染画布**，页面上看着好好的，一导出 `toBlob` 就抛 SecurityError，
 *    整张长图都出不来。所以宁可不画它、退回姿势插画。
 *
 * 这是「页面上有图、存长图却只有简笔画」的原因。
 */
async function loadDrawable(src: string): Promise<HTMLImageElement | null> {
  if (src.startsWith('data:')) {
    try {
      return await loadImage(src)
    } catch {
      return null
    }
  }
  try {
    return await loadImage(src, true)
  } catch {
    return null
  }
}

/** 导出结果：供上层给用户一句实话，而不是静默少了几张图 */
export interface ExportResult {
  /** 真正放进长图的参考片数量 */
  photos: number
  /** 明明是参考片、但因跨域读不到而退回插画的张数 */
  skipped: number
}

/** 把策划渲染成竖版长图并触发下载 */
export async function exportPlanImage(plan: ShootPlan): Promise<ExportResult> {
  const measure = document.createElement('canvas').getContext('2d')!
  const dual = /双|情|2|两/.test(plan.brief.people ?? plan.brief.text)

  type Block =
    | { kind: 'text'; lines: string[]; font: string; color: string; gap: number; lineHeight: number }
    | { kind: 'rule' }
    | { kind: 'spacer'; h: number }
    | { kind: 'shot'; img: HTMLImageElement; imgH: number; lines: string[]; tip: string | undefined }

  const imgCache = new Map<string, HTMLImageElement | null>()
  const getImg = async (src: string) => {
    if (!imgCache.has(src)) imgCache.set(src, await loadDrawable(src))
    return imgCache.get(src) ?? null
  }

  let photos = 0
  let skipped = 0

  const blocks: Block[] = []
  const text = (
    s: string,
    font: string,
    color: string,
    maxWidth: number,
    lineHeight: number,
    gap: number,
  ) => {
    measure.font = font
    blocks.push({ kind: 'text', lines: wrapLines(measure, s, maxWidth), font, color, lineHeight, gap })
  }

  text(plan.title, 'bold 40px system-ui, sans-serif', TEXT, W - PAD * 2, 54, 8)
  const meta =
    [plan.brief.theme, plan.brief.location, plan.brief.time, plan.brief.people]
      .filter(Boolean)
      .join(' · ') + ` · 风格：${plan.directionName}`
  text(
    meta.trim() === `风格：${plan.directionName}` ? plan.brief.text : meta,
    '24px system-ui, sans-serif',
    SUB,
    W - PAD * 2,
    34,
    28,
  )

  for (const scene of plan.scenes) {
    blocks.push({ kind: 'spacer', h: 8 })
    blocks.push({ kind: 'rule' })
    text(
      `${scene.title}${scene.backup ? '（备用方案）' : ''}　${scene.light}`,
      'bold 30px system-ui, sans-serif',
      scene.backup ? SUB : TEXT,
      W - PAD * 2,
      42,
      20,
    )
    for (const [i, shot] of scene.shots.entries()) {
      // 参考片优先，且必须确认它真能画进 canvas；画不了才退回姿势插画
      const photo = shot.image ? await getImg(shot.image) : null
      if (shot.image) {
        if (photo) photos++
        else skipped++
      }
      const img = photo ?? (await getImg(svgToDataUrl(pickPose(shot.poseTags, dual).svg)))
      // 连内置插画都加载不了（极罕见）就跳过这个画面，不连累整张长图
      if (!img) continue
      measure.font = '26px system-ui, sans-serif'
      const lines = wrapLines(measure, `${i + 1}. ${shot.description}`, TEXT_W)
      const imgH = Math.min(240, Math.max(120, Math.round(IMG_W * (img.height / img.width))))
      blocks.push({ kind: 'shot', img, imgH, lines, tip: shot.tip })
    }
  }

  const height =
    blocks.reduce((h, b) => {
      if (b.kind === 'spacer') return h + b.h
      if (b.kind === 'rule') return h + 46
      if (b.kind === 'text') return h + b.lines.length * b.lineHeight + b.gap
      return h + Math.max(b.imgH + 20, b.lines.length * 38 + (b.tip ? 36 : 0) + 16)
    }, PAD * 2 + 50) + 40

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, height)

  let y = PAD
  for (const b of blocks) {
    if (b.kind === 'spacer') {
      y += b.h
    } else if (b.kind === 'rule') {
      y += 22
      ctx.strokeStyle = '#e5e5e5'
      ctx.beginPath()
      ctx.moveTo(PAD, y)
      ctx.lineTo(W - PAD, y)
      ctx.stroke()
      y += 24
    } else if (b.kind === 'text') {
      ctx.font = b.font
      ctx.fillStyle = b.color
      for (const line of b.lines) {
        y += b.lineHeight
        ctx.fillText(line, PAD, y - 10)
      }
      y += b.gap
    } else {
      ctx.drawImage(b.img, PAD, y, IMG_W, b.imgH)
      let ty = y + 30
      ctx.font = '26px system-ui, sans-serif'
      ctx.fillStyle = TEXT
      for (const line of b.lines) {
        ctx.fillText(line, TEXT_X, ty)
        ty += 38
      }
      if (b.tip) {
        ctx.fillStyle = SUB
        ctx.font = '23px system-ui, sans-serif'
        ctx.fillText(`提示：${b.tip}`, TEXT_X, ty + 4)
      }
      y += Math.max(b.imgH + 20, b.lines.length * 38 + (b.tip ? 36 : 0) + 16)
    }
  }

  ctx.fillStyle = SUB
  ctx.font = '22px system-ui, sans-serif'
  ctx.fillText('出片助手 · AI 拍摄策划', PAD, height - 24)

  const blob = await new Promise<Blob | null>((resolve, reject) => {
    // 万一还是有图污染了画布，这里会抛 SecurityError。捕获它，
    // 给一句人能看懂的话——静默 `return` 会让人以为按钮没点到
    try {
      canvas.toBlob(resolve, 'image/png')
    } catch {
      reject(new Error('长图导出失败：有图片不允许跨域读取，请重试'))
    }
  })
  if (!blob) throw new Error('长图导出失败，请重试')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${plan.title}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return { photos, skipped }
}
