/**
 * 插画库：预先绘制的简笔画姿势，按标签组织。
 * 标签体系与 Prompt 中的词汇表保持一致（POSE_TAGS），LLM 只能从中选择。
 */

export interface Pose {
  id: string
  label: string
  tags: string[]
  svg: string
}

const S = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240" viewBox="0 0 200 240" fill="none" stroke="#1a1a1a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${inner}<ellipse cx="100" cy="224" rx="42" ry="4" stroke="#d4d4d4" stroke-width="3"/></svg>`

const head = (x: number, y: number, r = 17) => `<circle cx="${x}" cy="${y}" r="${r}"/>`

export const POSES: Pose[] = [
  {
    id: 'single-stand',
    label: '站立',
    tags: ['单人-站'],
    svg: S(
      head(100, 46) +
        '<path d="M100 63 V146 M100 76 L74 112 M100 76 L126 112 M100 146 L82 214 M100 146 L118 214"/>',
    ),
  },
  {
    id: 'single-walk',
    label: '走路',
    tags: ['单人-走'],
    svg: S(
      head(100, 46) +
        '<path d="M100 63 V146 M100 76 L72 104 M100 76 L126 98 M100 146 L70 212 M100 146 L128 204"/><path d="M46 120 L58 122 M44 140 L56 140" stroke="#bbb"/>',
    ),
  },
  {
    id: 'single-sit',
    label: '坐',
    tags: ['单人-坐'],
    svg: S(
      head(114, 58) +
        '<path d="M112 75 L98 150 M98 150 L142 162 L146 214 M104 92 L134 128"/>',
    ),
  },
  {
    id: 'single-jump',
    label: '跳跃',
    tags: ['单人-跳'],
    svg: S(
      head(100, 38) +
        '<path d="M100 55 V126 M100 68 L76 30 M100 68 L124 30 M100 126 L78 166 L90 194 M100 126 L122 164 L110 194"/><path d="M62 206 L74 208 M126 206 L138 208" stroke="#bbb"/>',
    ),
  },
  {
    id: 'single-back',
    label: '背影',
    tags: ['单人-背影'],
    svg: S(
      head(100, 46) +
        '<path d="M113 36 L122 68 M100 63 V146 M100 76 L80 118 M100 76 L120 118 M100 146 L82 214 M100 146 L118 214"/>',
    ),
  },
  {
    id: 'single-lookback',
    label: '回眸',
    tags: ['单人-回眸'],
    svg: S(
      head(100, 46) +
        '<path d="M100 63 V146 M100 76 L118 54 M100 80 L70 110 M100 146 L82 214 M100 146 L118 214"/><path d="M78 40 Q88 32 98 38" stroke-width="4"/>',
    ),
  },
  {
    id: 'single-crouch',
    label: '蹲/坐矮台',
    tags: ['单人-蹲'],
    svg: S(
      head(100, 66) +
        '<path d="M100 83 V150 M100 96 L82 158 M100 96 L120 150 M100 150 L76 182 L76 214 M100 150 L124 182 L124 214"/>',
    ),
  },
  {
    id: 'dual-hold-hands-walk',
    label: '牵手走',
    tags: ['双人-牵手走'],
    svg: S(
      head(64, 52, 15) +
        head(136, 52, 15) +
        '<path d="M64 69 V140 M64 82 L100 110 M64 82 L44 112 M64 140 L48 208 M64 140 L84 202"/>' +
        '<path d="M136 69 V140 M136 82 L100 110 M136 82 L156 104 M136 140 L118 208 M136 140 L156 202"/>',
    ),
  },
  {
    id: 'dual-face',
    label: '对视',
    tags: ['双人-对视'],
    svg: S(
      head(62, 56, 15) +
        head(138, 56, 15) +
        '<path d="M62 73 V144 M62 86 L48 116 M62 86 L78 112 M62 144 L50 210 M62 144 L76 208"/>' +
        '<path d="M138 73 V144 M138 86 L152 116 M138 86 L122 112 M138 144 L124 210 M138 144 L152 208"/>',
    ),
  },
  {
    id: 'dual-back-to-back',
    label: '背靠背',
    tags: ['双人-背靠背'],
    svg: S(
      head(70, 50, 15) +
        head(130, 50, 15) +
        '<path d="M70 67 L88 148 M130 67 L112 148 M76 84 L106 120 M124 84 L94 120 M88 148 L74 212 M88 148 L104 206 M112 148 L98 206 M112 148 L126 212"/>',
    ),
  },
  {
    id: 'dual-sit-together',
    label: '并肩坐',
    tags: ['双人-并肩坐'],
    svg: S(
      head(64, 60, 15) +
        head(114, 60, 15) +
        '<path d="M66 78 L70 150 M70 150 L104 158 L108 212 M68 92 L110 122"/>' +
        '<path d="M116 78 L120 150 M120 150 L154 158 L158 212 M118 92 L138 130"/>',
    ),
  },
  {
    id: 'dual-hug',
    label: '拥抱',
    tags: ['双人-拥抱'],
    svg: S(
      head(84, 50, 15) +
        head(116, 50, 15) +
        '<path d="M84 67 L96 142 M116 67 L104 142 M86 84 L122 112 M114 84 L78 112 M96 142 L84 210 M96 142 L108 208 M104 142 L92 208 M104 142 L116 210"/>',
    ),
  },
  {
    id: 'dual-high-five',
    label: '击掌',
    tags: ['双人-击掌'],
    svg: S(
      head(70, 54, 15) +
        head(130, 54, 15) +
        '<path d="M70 71 V144 M70 84 L98 46 M70 84 L52 116 M70 144 L56 210 M70 144 L84 206"/>' +
        '<path d="M130 71 V144 M130 84 L102 46 M130 84 L148 116 M130 144 L116 210 M130 144 L144 206"/>' +
        '<path d="M100 26 L100 34 M86 32 L91 38 M114 32 L109 38" stroke="#bbb"/>',
    ),
  },
  {
    id: 'dual-look-afar',
    label: '同看远方',
    tags: ['双人-同看远方'],
    svg: S(
      head(70, 54, 15) +
        head(120, 54, 15) +
        '<path d="M70 71 V144 M70 84 L118 68 M70 84 L54 114 M70 144 L56 210 M70 144 L86 206"/>' +
        '<path d="M120 71 V144 M120 84 L106 112 M120 84 L134 112 M120 144 L106 210 M120 144 L134 206"/>',
    ),
  },
  {
    id: 'dual-playful',
    label: '嬉闹追逐',
    tags: ['双人-嬉闹'],
    svg: S(
      head(60, 60, 15) +
        head(140, 48, 15) +
        '<path d="M60 77 L78 146 M66 90 L112 68 M60 90 L42 116 M78 146 L66 210 M78 146 L94 204"/>' +
        '<path d="M140 65 L136 138 M136 138 L118 200 M136 138 L158 194 M138 80 L118 100 M138 80 L158 102"/><path d="M164 120 L174 122 M166 138 L176 138" stroke="#bbb"/>',
    ),
  },
]

/** LLM 可选的姿势标签词汇表（与 POSES 的 tags 一致） */
export const POSE_TAGS: string[] = POSES.flatMap((p) => p.tags)

/** 按画面标签匹配插画：精确匹配标签，否则按单人/双人兜底 */
export function pickPose(poseTags: string[], dual: boolean): Pose {
  for (const tag of poseTags) {
    const hit = POSES.find((p) => p.tags.includes(tag))
    if (hit) return hit
  }
  const fallbackPool = dual ? POSES.filter((p) => p.tags[0].startsWith('双人')) : POSES
  return fallbackPool[0]
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}
