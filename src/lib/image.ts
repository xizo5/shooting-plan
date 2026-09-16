/** 图片工具：上传压缩、远程图转 dataURL */

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

/** 等比缩放并压成 jpeg dataURL，控制 localStorage 体积 */
export async function compressDataUrl(
  dataUrl: string,
  maxWidth: number,
  quality: number,
): Promise<string> {
  const img = await loadImg(dataUrl)
  const w = Math.min(img.width, maxWidth)
  const h = Math.round((img.height / img.width) * w)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

/** 远程图转 dataURL；CORS 不放行时返回 null */
export async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
