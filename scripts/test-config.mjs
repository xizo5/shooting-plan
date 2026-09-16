/**
 * 验证 `.env` → ModelConfig 的映射（`src/lib/storage.ts` 的 configFromEnv）。
 *
 * 为什么需要它：设置页隐藏后 `.env` 是唯一配置入口，而这条路径**漏字段是静默的** ——
 * 2026-09-16 就漏了 `responseFormat`：设置页当年会为豆包设 `b64_json`，`.env` 路径没有，
 * 于是豆包返回远程 URL，远程图又画不进 canvas（污染画布会让 toBlob 抛 SecurityError），
 * 结果「页面上明明有参考片，存出来的长图里只有简笔画」。
 * 类型检查查不出来（字段本来就是可选的），所以用断言钉住。
 *
 * 用法：npm run test:config
 *
 * 实现要点：把 `import.meta.env` 用 esbuild `define` 指向 `globalThis.__ENV__`，
 * 这样编译一次就能改环境跑多个用例（每次重新 build 太慢）。
 */
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src/lib/storage.ts')

// llm.ts / image.ts 都依赖 DOM，这里只关心配置映射，全部换成空实现
const outfile = join(mkdtempSync(join(tmpdir(), 'cfg-out-')), 'storage.mjs')
await build({
  entryPoints: [SRC],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'error',
  // 关键：不用固定对象，而是指向一个可变全局，便于逐用例改环境
  define: { 'import.meta.env': 'globalThis.__ENV__' },
  plugins: [
    {
      name: 'stub-dom',
      setup(b) {
        b.onResolve({ filter: /(^|\/)\.?\/?\.\.?\/lib\/image$|(^|\/)\.?\/?image$/ }, () => ({
          path: 'stub:image',
          namespace: 'stub',
        }))
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents:
            'export const urlToDataUrl = async () => null\n' +
            'export const compressDataUrl = async (x) => x\n' +
            'export const fileToDataUrl = async () => ""\n',
          loader: 'js',
        }))
      },
    },
  ],
})

/** 每个用例一份 .env，键名与 .env.example 对齐 */
const BASE_ENV = {
  VITE_BASE_URL: 'https://api.deepseek.com',
  VITE_API_KEY: 'sk-fake',
  VITE_MODEL: 'deepseek-v4-flash',
  VITE_IMAGE_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3',
  VITE_IMAGE_API_KEY: 'ark-fake',
  VITE_IMAGE_MODEL: 'doubao-seedream-4-0-250828',
}

globalThis.__ENV__ = { ...BASE_ENV }
const { loadConfig } = await import(pathToFileURL(outfile).href)

const cases = [
  {
    name: '豆包（.env 默认配置）必须索要 b64_json',
    env: {},
    check: (c) => c?.imageGen?.responseFormat === 'b64_json',
    want: "responseFormat === 'b64_json'",
  },
  {
    name: '豆包只认 baseURL 也成立（用户改成别的 doubao 模型名）',
    env: { VITE_IMAGE_MODEL: 'doubao-seedream-3-0-t2i-250415' },
    check: (c) => c?.imageGen?.responseFormat === 'b64_json',
    want: "responseFormat === 'b64_json'",
  },
  {
    name: 'baseURL 是中转但模型名是 doubao- 开头，仍要 b64_json',
    env: { VITE_IMAGE_BASE_URL: 'https://my-relay.example.com/v1' },
    check: (c) => c?.imageGen?.responseFormat === 'b64_json',
    want: "responseFormat === 'b64_json'",
  },
  {
    name: '智谱 GLM-Image 不该被塞 b64_json（它默认回 URL，塞了会报错）',
    env: {
      VITE_IMAGE_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4',
      VITE_IMAGE_MODEL: 'glm-image',
    },
    check: (c) => c?.imageGen?.responseFormat === undefined,
    want: 'responseFormat === undefined',
  },
  {
    name: 'size 原样透传',
    env: { VITE_IMAGE_SIZE: '1056x1568' },
    check: (c) => c?.imageGen?.size === '1056x1568',
    want: "size === '1056x1568'",
  },
  {
    name: '没配生图 Key 时 imageGen 为 null',
    env: { VITE_IMAGE_API_KEY: '' },
    check: (c) => c?.imageGen === null,
    want: 'imageGen === null',
  },
  {
    name: '缺主模型时整份配置为 null',
    env: { VITE_API_KEY: '' },
    check: (c) => c === null,
    want: 'loadConfig() === null',
  },
]

let failed = 0
for (const c of cases) {
  globalThis.__ENV__ = { ...BASE_ENV, ...c.env }
  let got
  try {
    got = loadConfig()
  } catch (err) {
    console.log(`FAIL  ${c.name}\n      抛出异常：${err.message}`)
    failed++
    continue
  }
  let ok = false
  try {
    ok = c.check(got)
  } catch {
    ok = false
  }
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`)
  if (!ok) {
    console.log(`      期望 ${c.want}`)
    console.log(`      实际 imageGen = ${JSON.stringify(got?.imageGen ?? null)}`)
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed`)
process.exit(failed === 0 ? 0 : 1)
