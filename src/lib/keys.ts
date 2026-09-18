/**
 * 键盘流：Ctrl/Cmd+Enter 是三步里统一的"推进"键。
 *
 * 为什么不每页配一个键：用户在每一步做的其实是同一件事 ——「这步我说完了，往下走」。
 * 记一个键比记三个键省脑子。单独的 Enter 留给换行（想法页）和发消息（讨论页）。
 *
 * 纯函数、不碰 React，方便 scripts/test-keys.mjs 直接编译后断言。
 */
export const isSubmit = (e: { metaKey: boolean; ctrlKey: boolean; key: string }) =>
  (e.metaKey || e.ctrlKey) && e.key === 'Enter'

/** 快捷键徽标用：Mac 显示 ⌘、其余显示 Ctrl。取不到 navigator（node 里跑测试）就退回 Ctrl */
export const MOD = /Mac|iPhone|iPad/.test(globalThis.navigator?.userAgent ?? '') ? '⌘' : 'Ctrl'
