/**
 * 验证 Ctrl/Cmd+Enter 这个"推进"键的判定（`src/lib/keys.ts` 的 isSubmit）。
 *
 * 为什么需要它：同一个键挂在三个页面上（提交想法 / 整理约定 / 生成方案），
 * 判歪的代价不对称 —— 多认一下，换行会变成提交；少认一下，用户以为快捷键是坏的。
 * 纯函数，一条断言就是全部成本。做法与 scripts/test-steps.mjs 一致（esbuild 编译后直接 import）。
 *
 * 用法：npm run test:keys
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const outfile = join(mkdtempSync(join(tmpdir(), 'keys-')), 'keys.mjs')
await build({
  entryPoints: [join(ROOT, 'src/lib/keys.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'error',
})

const { isSubmit } = await import(pathToFileURL(outfile).href)

const ev = (init = {}) => ({ metaKey: false, ctrlKey: false, key: 'Enter', ...init })

/** [键盘事件, 期望：算不算"推进"] */
const cases = [
  [ev({ ctrlKey: true }), true],
  [ev({ metaKey: true }), true],
  [ev(), false], //            单独 Enter —— 换行 / 发消息
  [ev({ shiftKey: true }), false], // Shift+Enter —— 换行
  [ev({ ctrlKey: true, key: 'a' }), false],
  [ev({ ctrlKey: true, key: 'Escape' }), false],
]

let failed = 0
for (const [e, want] of cases) {
  const got = isSubmit(e)
  const ok = got === want
  if (!ok) failed++
  const k = `Ctrl=${e.ctrlKey ? 'Y' : 'n'} Meta=${e.metaKey ? 'Y' : 'n'} ${e.key}`
  console.log(`${ok ? 'PASS' : 'FAIL'}  isSubmit(${k}) => ${got}  (want ${want})`)
}

console.log(`\n${cases.length - failed}/${cases.length} passed`)
process.exit(failed === 0 ? 0 : 1)
