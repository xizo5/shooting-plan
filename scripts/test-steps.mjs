/**
 * 验证三步流程的 View → Step 映射（`src/components/Steps.tsx` 的 stepOf）。
 *
 * 为什么需要它：步骤条是"当前该看到什么"的唯一真源，改错一格用户就走到岔路上。
 * 而 `'generating'`（生成中）这个状态尤其容易漏 —— 它必须算第 3 步；
 * 早先它挂在第 2 步底下，长等待动画把确认页撑得很长，看起来还像没往前走。
 *
 * 用法：npm run test:steps
 *
 * 实现要点：Steps.tsx 是纯映射、不碰 hooks，所以用 esbuild 编译后直接 import，
 * 不需要起 DOM 也不需要 React 运行时。做法与 scripts/test-sse.mjs 一致。
 */
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src/components/Steps.tsx')

// Steps.tsx 用 JSX 渲染胶囊，但 stepOf 本身与 JSX 无关。
// esbuild 仍要能解析 JSX，所以显式给 automatic runtime —— 靠默认值在打包时报错很费时间。
const patched = join(mkdtempSync(join(tmpdir(), 'steps-src-')), 'Steps.tsx')
writeFileSync(patched, readFileSync(SRC, 'utf8'), 'utf8')

const outfile = join(mkdtempSync(join(tmpdir(), 'steps-out-')), 'Steps.mjs')
await build({
  entryPoints: [patched],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  jsx: 'automatic',
  logLevel: 'error',
  // React 只为渲染组件，映射测试用不到；换成空实现免得去解析 react 包
  external: ['react', 'react/jsx-runtime'],
  plugins: [
    {
      name: 'stub-react',
      setup(b) {
        b.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, (a) => ({
          path: a.path,
          namespace: 'stub-react',
        }))
        b.onLoad({ filter: /.*/, namespace: 'stub-react' }, () => ({
          contents: 'export default {}; export const jsx = () => null; export const jsxs = () => null; export const Fragment = {}',
          loader: 'js',
        }))
      },
    },
  ],
})

const { stepOf } = await import(pathToFileURL(outfile).href)

/** [view, 期望的步骤；null 表示不显示步骤条] */
const cases = [
  ['brief', 1],
  ['discuss', 1],
  ['confirm', 2],
  ['generating', 3], // ← 本轮修复的核心：生成中的等待动画必须画在第 3 格
  ['plan', 3],
  ['library', null],
]

let failed = 0
for (const [view, want] of cases) {
  const got = stepOf(view)
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  stepOf(${view}) => ${got}  (want ${want})`)
}

console.log(`\n${cases.length - failed}/${cases.length} passed`)
process.exit(failed === 0 ? 0 : 1)
