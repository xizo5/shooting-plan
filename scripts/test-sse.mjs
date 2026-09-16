/**
 * 验证 src/lib/llm.ts 里的 SSE 解析（readStream）。
 *
 * 为什么需要它：流式解析看着简单，但「中文被 UTF-8 边界切断」这类问题
 * 在类型检查里查不出来、在浏览器里也只会偶发乱码，很难复现。
 * 这个脚本用假 fetch 喂各种刁钻的分块方式，把边界情况钉死。
 *
 * 用法：npm run test:sse
 *
 * 实现要点：用 esbuild 把 llm.ts 编译成 ESM 跑（项目没装测试框架，
 * 也不想为此引一套）。**不要改成用正则去剥 TS 类型** —— 试过，会崩。
 */
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src/lib/llm.ts')

// llm.ts 末尾已经导出了 `__test`（它就是为这个脚本留的口子），直接用，
// 不要再往源码里拼 export —— 同名 re-export 会让 esbuild 直接报重复声明。
const code = readFileSync(SRC, 'utf8')
if (!/export const __test/.test(code)) {
  throw new Error('llm.ts 里找不到 `export const __test`，测试接缝是不是被删了？')
}
const patched = join(mkdtempSync(join(tmpdir(), 'sse-src-')), 'llm.ts')
writeFileSync(patched, code, 'utf8')

const outfile = join(mkdtempSync(join(tmpdir(), 'sse-out-')), 'llm.mjs')
await build({
  entryPoints: [patched],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'error',
  define: { 'import.meta.env': '{}' },
  plugins: [
    {
      // 图片工具依赖 DOM，这里用不到，换成空实现
      name: 'stub-image',
      setup(b) {
        b.onResolve({ filter: /(^|\/)\.?\/?image$/ }, () => ({ path: 'stub:image', namespace: 'stub' }))
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

const { __test } = await import(pathToFileURL(outfile).href)
const readStream = __test.readStream

const enc = new TextEncoder()

/** 用给定分块构造一个假的 Response（Body 是流式的，才能测出切分问题） */
function makeRes(chunks, contentType = 'text/event-stream') {
  const stream = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(typeof ch === 'string' ? enc.encode(ch) : ch)
      c.close()
    },
  })
  return {
    body: stream,
    headers: new Headers({ 'content-type': contentType }),
    json: async () => null,
  }
}

/** 一个标准的 OpenAI 兼容流式事件 */
function sse(piece) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`
}

let pass = 0
let fail = 0

async function check(name, chunks, expected, contentType) {
  let streamed = ''
  try {
    const out = await readStream(makeRes(chunks, contentType), (d) => (streamed += d))
    if (out === expected && streamed === expected) {
      console.log(`  ok   ${name}`)
      pass++
    } else {
      console.log(`  FAIL ${name}\n       返回=${JSON.stringify(out)}\n       流式=${JSON.stringify(streamed)}`)
      fail++
    }
  } catch (e) {
    console.log(`  FAIL ${name} 抛错：${e.message}`)
    fail++
  }
}

console.log('SSE 解析验证（src/lib/llm.ts readStream）\n')

await check('单事件一块', [sse('你好')], '你好')
await check('多事件一块', [sse('日系') + sse('小清新')], '日系小清新')
await check('CRLF 行尾', [sse('一').replace(/\n/g, '\r\n') + sse('二').replace(/\n/g, '\r\n')], '一二')
await check('含 [DONE] 收尾', [sse('完') + 'data: [DONE]\n\n'], '完')
await check('坏 JSON 只跳过该条', ['data: {坏的\n\n' + sse('好的')], '好的')
await check('末尾行没有换行', [sse('尾').trimEnd()], '尾')
await check('一个事件被拆成两块', [sse('前半'), 'data: {"choices":[{"delta":{"content":"后半"}}]}\n\n'], '前半后半')
await check(
  '逐字节喂（中文 UTF-8 边界被切断）',
  [...enc.encode(sse('偏过曝的日系小清新'))].map((b) => Uint8Array.of(b)),
  '偏过曝的日系小清新',
)
await check(
  '增量放在 message.content（非标准，部分中转站）',
  [`data: ${JSON.stringify({ choices: [{ message: { content: '兜底' } }] })}\n\n`],
  '兜底',
)

// 厂商忽略 stream 参数、直接返回完整 JSON —— 应退化而不是报错
{
  const res = {
    body: new ReadableStream({ start(c) { c.close() } }),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ choices: [{ message: { content: '不支持流式' } }] }),
  }
  let streamed = ''
  const out = await readStream(res, (d) => (streamed += d))
  if (out === '不支持流式' && streamed === '不支持流式') {
    console.log('  ok   不支持流式时降级为一次性读取')
    pass++
  } else {
    console.log(`  FAIL 不支持流式时降级 返回=${JSON.stringify(out)}`)
    fail++
  }
}

console.log(`\n通过 ${pass} / 失败 ${fail}`)
process.exit(fail > 0 ? 1 : 0)
