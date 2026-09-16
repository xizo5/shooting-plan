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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** 把策划渲染成竖版长图并触发下载；参考片仅收录 dataURL（远程图会污染 canvas） */
export async function exportPlanImage(plan: ShootPlan) {
  const measure = document.createElement('canvas').getContext('2d')!
  const dual = /双|情|2|两/.test(plan.brief.people ?? plan.brief.text)

  type Block =
    | { kind: 'text'; lines: string[]; font: string; color: string; gap: number; lineHeight: number }
    | { kind: 'rule' }
    | { kind: 'spacer'; h: number }
    | { kind: 'shot'; img: HTMLImageElement; imgH: number; lines: string[]; tip: string | undefined }

  const imgCache = new Map<string, HTMLImageElement>()
  const getImg = async (src: string) => {
    if (!imgCache.has(src)) imgCache.set(src, await loadImage(src))
    return imgCache.get(src)!
  }

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
      const src = shot.image?.startsWith('data:')
        ? shot.image
        : svgToDataUrl(pickPose(shot.poseTags, dual).svg)
      const img = await getImg(src)
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

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${plan.title}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
