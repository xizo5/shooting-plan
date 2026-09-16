# AGENTS.md

拍摄策划 H5「出片助手」：被拍的人用一个自由输入框描述拍摄想法（可附模特图/场景图，「图生图」——机位和动作贴着图生成），先和 AI 聊清风格、服装、道具、动作并归纳成「拍摄约定」，确认后 AI 并行生成 3 套同一调性、不同场景的完整文字策划供切换对比，参考片由用户看完文字后按需点击生成，可导出长图。与用户全程用中文交流。

**目标用户是开发者，不是普通消费者**：使用者自行 clone 仓库、配 `.env`、本地跑起来。因此可以要求 Node 环境与构建步骤，但**仍无后端**。不要按「降低小白使用门槛」的思路做设计决策（如内置试用额度、托管 Key）。

## 文档地图

- `CONTEXT.md` — 领域术语表，**定义产品概念的权威来源**。命名新概念、发现术语冲突时，先改这里再写代码。
- `docs/adr/0001-pure-frontend-user-supplied-keys.md` — 为什么零后端、key 在前端。做付费化、登录、限额之前必读：那意味着推翻此 ADR，需先和用户确认并新立 ADR。
- `README.md` — 面向人的产品说明，改完对外行为后同步更新。
- `.env.example` — 环境变量模板，**当前唯一的配置来源**（设置页已隐藏，见下）。

## 核心流程

**三步走 + 讨论先于生成**：填完 Brief 不直接生成，先开一轮对话把风格谈拢，谈拢后进一个**干净的确认页**复核，复核完才烧钱生成。

```
step 1  说想法（view: brief → discuss）
  │   Brief（text + ≤4 张参考图）
  │
  ├─ 阶段 0  讨论环节 **流式**（chatTextStream）              【多轮，逐字显示】
  │    ├→ 开场：discussOpeningPrompt(text, hasImages) 抛出 2-3 个关键问题
  │    ├→ 多轮：每轮 history = 本轮之前的全部对话，新消息作为 user 追加
  │    └→ 用户点「整理成拍摄约定」→ chatText(consensusPrompt) + extractJson
  │
step 2  定约定（view: confirm）—— Discuss 与 Confirm 的分界线
  │    ├→ 独立页面，**不带聊天记录**：只放约定本身，加字段可编辑
  │    ├→ 字段失焦才 setConsensus（边打字边同步会触发 App 重渲染，长文本卡）
  │    └→ 用户点「就按这个生成」
  │
step 3  出方案（view: plan）
  │
  ├─ 阶段 1  chatJson(cardsSystem, cardsUserPrompt(text, hasImages, consensus))   【快】
  │    ├→ brief.{theme,location,time,people}   由 AI 从文本+图片解析回填
  │    └→ directions: StyleDirection[]         **同一调性下的 3 个场景变体**（不是 3 个风格）
  │
  ├─ 阶段 2  Promise.allSettled 并行展开每个变体                  【慢，总耗时≈单套】
  │    └→ ShootPlan（含 scenes[] 完整策划）
  │         · 单个变体失败不影响其他，成功几套展示几套
  │         · 全部失败才报错
  │
  ├─ savePlan() 落 localStorage → 展示，顶部胶囊切换 3 套
  │
  └─ 参考片按需生成：单张（produceImage）或批量（runBatch，可中断）
```

**步骤条与 View 的映射**写在 `Steps.tsx` 的 `stepOf()` 里，加/改步骤只改那一处。`library` 不属于流程，`stepOf` 返回 `null`（不显示步骤条）。

**讨论页与确认页的分工**（这是本设计最容易改错的地方）：`Discuss` 只管聊，**不含任何确认 UI**；一旦 `consensus` 非空，它的输入区就冻结并提示"去下一步确认"。`Confirm` 只管复核与改，不含聊天记录。所以：**从 Confirm 点「继续聊」回 Discuss 时必须把 `consensus` 清成 null**，否则 Discuss 还认为约定已出、输入区冻着，用户回去了却打不了字（踩过）。

**共识必须钉进 prompt**：`consensus` 经 `formatConsensus()`（`prompts.ts`）注入阶段 1 与阶段 2 两处。少注入一处，风格就会在展开时跑偏——这是本环节唯一容易漏的地方。风格锁定后，「3 套」的差异只能来自场景，prompt 里已明确禁止换风格。

**多轮对话的传参约定**：`chatText` / `chatTextStream(config, system, user, [onDelta,] { history, images })` 中 `history` 是**本条之前的对话**，`user` 是**本条新消息**，函数会把 user 追加到 history 之后。**别把新消息也塞进 history**，否则同一条发两遍（踩过）。`images` 只挂在最后一条 user 上——多个厂商拒绝多消息带图，同时也省 token。

**流式输出（讨论环节专用）**：`chatTextStream` 走 SSE，边收边回调 `onDelta`。三条硬约束：

1. **只按换行切分，绝不按字节切**。一个 chunk 可能把中文字劈成两半，残缺的行必须留在 buffer 里等下一块。`readStream` 用 `TextDecoder(..., {stream:true})` + `split('\n')` + `pop()` 兜住，改这里前先看那段注释。
2. **单个事件解析失败只跳过**，不能让一个坏 JSON 拖垮整段回复。
3. **厂商不支持流式时要退化**：content-type 不是 event-stream，或直接返回了完整 JSON，就一次性读完并调一次 onDelta。判断依据是 content-type 而不是试错。

**生成防抖**：`generateAll` 用 `generating`（**ref，不是 state**）做互斥锁。state 更新是异步的，狂点按钮时下一次点击可能在重渲染前就进来了，只有 ref 挡得住；state 那份只负责 UI 禁用态。生成成功后在策划页顶部给一条绿色 toast（几套成功 + 已存到哪），因为页面直接跳走了，没反馈用户会以为没点上。

**测试接缝**：`src/lib/llm.ts` 末尾导出 `__test = { readStream }`。`npm run test:sse`（`scripts/test-sse.mjs`）用 esbuild 编译该文件后喂各种分块方式验证 SSE 解析：逐字节、CRLF、坏 JSON、`[DONE]`、非标准 `message.content`、不支持流式的降级。改 `readStream` 后跑一遍。**别改成用正则剥 TS 类型**——试过，会崩。

**降级路径（贯穿全流程）**：附图请求失败且确有参考图时，**去掉图片重试一次**，并给用户一条 notice 说明「当前模型看不了图」。上层不应把这类失败当致命错误抛出。讨论环节同样适用（开场与每轮回复都要兜，见 `streamReply`）。

## 数据模型

`src/types.ts` 是唯一类型来源，字段语义见 `CONTEXT.md`。

| 类型 | 角色 | 关键点 |
|---|---|---|
| `Brief` | 输入 | `text` 与 `referenceImages` 由用户给；`theme/location/time/people` 由阶段 1 的 AI 解析回填，展开前可能为空 |
| `ChatMessage` | 中间产物 | `role: 'user' \| 'assistant'` + `content`，讨论环节的一轮，**不落库**（刷新即丢，可接受） |
| `Consensus` | 中间产物 | 讨论归纳出的 5 个字段（风格调性/服装/道具/动作与情绪/其他），全字符串、允许为空。`null` 表示还没谈拢 |
| `StyleDirection` | 中间产物 | `id` + `name`（≤4字）+ `tagline`（≤15字），本身不落库。**语义已收敛**：约定锁定风格后，3 个 direction 是同一调性下的场景变体 |
| `ShootPlan` | 最终交付物 | `brief` + `directionName` + `title` + `scenes[]`，是 localStorage 里的存储单位 |
| `Scene` | 画面分组 | `backup: true` 表示备用场景（雨天/人多/光线不理想）——**每套策划必须有且仅有 1 个** |
| `Shot` | 最小单位 | `poseTags` 受 `POSE_TAGS` 约束；`image` 存参考片（dataURL 或远程 URL） |
| `ModelConfig` | 设置 | `imageGen` 为 `null` 表示未开启参考片生成 |

**localStorage 键**（`src/lib/storage.ts`）：

- `sp:config` — 单个 `ModelConfig`
- `sp:plans` — `ShootPlan[]`，最新的在前

## 配置来源：`.env` 是唯一入口

**应用内没有设置页**（入口已隐藏）。模型配置全部来自 `.env`，读取顺序：

1. `configFromEnv()` 从 `import.meta.env` 构造配置 —— **这是主路径**。
2. `.env` 没配全时才读 localStorage 的 `sp:config` 兜底。
3. 特例：`.env` 配了主模型但没配生图（`VITE_IMAGE_API_KEY` 缺失）时，**沿用 localStorage 里遗留的 `imageGen`**，避免升级后参考片功能凭空消失。

⚠️ 改了 `.env` **必须重启 dev server 或重新构建**才生效——Vite 是构建期注入。

配套约束：

- `src/components/Settings.tsx` 保留但**不在任何导航里可达**。要恢复图形化设置，放开 `App.tsx` 里注释掉的「设置」按钮与 `view === 'settings'` 渲染即可；**同时要把上面这个优先级改回 localStorage 优先**，否则保存了也不生效。
- 所有指向设置页的错误文案已改为指向 `.env`（`src/lib/llm.ts`、`App.tsx`、`PlanView.tsx`）。新增提示不要再说「去设置页」。
- 类型声明在 `src/vite-env.d.ts`，新增环境变量必须同步补上，否则 tsc 不认。

⚠️ **`VITE_*` 会被明文编译进 `dist/` 产物**——这是 Vite 的既定行为，不是 bug。对自己 clone 自己跑的场景可接受（填的是自己的 key），但**带 key 的 `dist/` 不得部署到公开地址**。若将来要提供在线服务，必须改为后端代管 key（即取代 ADR-0001），不能靠 `.env` 硬撑。

## 包管理器：只用 npm

**本项目统一用 npm**，锁文件是 `package-lock.json`。**不要引入 pnpm / yarn**。

2026-09-16 踩过的坑：某工具把项目自动改造成 pnpm 项目，生成了 `pnpm-lock.yaml` 与 `pnpm-workspace.yaml`，随后 IDE 的依赖状态检查报 `ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: esbuild@0.21.5` → 项目起不来。

- 直接原因：`pnpm-workspace.yaml` 里 `allowBuilds: esbuild` 的值是模板占位文字 `set this to true or false`，pnpm 解析不了就退出。pnpm 自 v10 起默认不执行依赖的 postinstall（防供应链投毒），esbuild 靠 postinstall 装原生二进制，被拦下时 vite 就跑不起来。
- 根本原因：**两套包管理器的锁文件并存，依赖树不一致**。这类问题极难排查。
- 处理：删掉 pnpm 的两个文件，回到 npm；三个非 npm 锁文件已加进 `.gitignore` 防复现。
- 若将来真要在 pnpm 下工作：`allowBuilds` 必须显式写 `true`/`false`，不能留占位文字。

## 开发循环

1. 改代码 → `npm run build`（tsc 严格检查 + vite 构建）必须零错误。
2. 动了 `src/lib/llm.ts` 的流式解析 → `npm run test:sse` 必须全绿。
3. UI 改动用浏览器冒烟：`npm run preview` 起服务，走一遍受影响的页面。**没有真实 key 无法测生成链路**，在 devtools console 注入假策划数据验证展示层：

   ```js
   // 注入一套最简策划，然后进「我的策划」点开看展示效果
   localStorage.setItem('sp:plans', JSON.stringify([{
     id: 'dev-1', createdAt: Date.now(),
     brief: { text: '测试', referenceImages: [], theme: '日系', location: '西湖', time: '黄昏', people: '情侣两人' },
     directionName: '日系', title: '测试策划',
     scenes: [
       { title: '湖畔', light: '侧逆光', backup: false,
         shots: [{ description: '两人并肩站在湖边，女生头靠男生肩膀', poseTags: ['双人-并肩坐'], tip: '拍 3 张就够' }] },
       { title: '雨天备选', light: '柔光', backup: true,
         shots: [{ description: '撑伞回眸', poseTags: ['单人-回眸'] }] },
     ],
   }])))
   ```

   注：长图导出只收录 `data:` 开头的参考片，远程 URL 会污染 canvas 被跳过——测导出时也要用 dataURL。
4. 交付前对照 `CONTEXT.md` 的术语检查 UI 文案——界面用词和术语表一致。
5. 提交前 `git status` 必须干净且**不含 `.env` / `dist/`**。若为验证环境变量注入临时建过 `.env`，验证完立刻删除。

## 架构规则

- **零后端（BYOK）**：一切跑在浏览器里，用户的各家 API key 存 localStorage（或由 `.env` 提供默认值）、直连厂商的 OpenAI 兼容接口。新增功能先问「纯前端能不能做」，答不了再谈后端。
- **CORS 立场**：某厂商浏览器直连被挡时，产品内不解决——引导用户改用「自定义」中转（写进 `.env` 的 `VITE_*_BASE_URL`）。不为单个厂商加代理或变通代码。
- **唯一测试接缝**：`src/lib/llm.ts` 的 `chatJson` / `chatText` / `chatTextStream` / `generateImage`。所有依赖模型的行为都经这几个函数；写测试的 mock 点只在这里，UI 与纯函数直接测。
- **动效出口**：所有 `@keyframes` 写在 `src/index.css`，组件里只用 `animate-[名字_时长_缓动_次数]` 引用。别在组件内塞 `<style>`——将来要统一尊重 `prefers-reduced-motion` 时只有一个地方要改（已经加了那条 media query）。
- **标签词汇表耦合**：`src/lib/poses.ts` 的 `POSE_TAGS` 是 prompt（`src/lib/prompts.ts`）里声明给模型的可选集合。改一边必须同步另一边，否则画面对不上插画。当前 15 个标签：单人 7（站/走/坐/跳/背影/回眸/蹲）、双人 8。
- **localStorage 防御**：参考片等图片进存储前先压缩（现例：768px 参考图、480px 参考片）；`savePlan` 已有超容量逐级丢弃逻辑（30→20→10→5→2→1），新增大体积数据沿用该模式。
- **生图默认豆包**：参考片默认走火山方舟豆包 Seedream（用户只填 Key），参考图 base64 直传做图生图、响应要 b64_json。生图预设改动集中在 `IMAGE_GEN_PRESETS`（`src/lib/llm.ts`）。
- **key 卫生**：仓库与文档**只出现假值**（如 `.env.example` 里的 `sk-在这里填你的Key`）；真实 key 只活在本地 `.env`（已被 `.gitignore` 忽略）与用户浏览器里。测试注入一律假值，测完立即删除 `.env` 并清掉 `dist/`。
