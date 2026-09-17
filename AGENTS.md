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
  │    └→ 用户点「就按这个生成」→ 立刻离开本页
  │
step 3  出方案（view: generating → plan）
  │
  │    ┌ 等待态 view: generating —— 动画独占一屏，不在确认页里就地展开
  │    │   （挂在 confirm 底下会把页面撑长，且看着像没往前走）
  │    │   上下固定、中间独立滚，底部留「不想等了」出口
  │    │
  ├─ 阶段 1  chatJson(cardsSystem, cardsUserPrompt(text, hasImages, consensus))   【快】
  │    └→ stage: 'directions' → 渲染 CardsLoading
  │
  ├─ 阶段 2  Promise.allSettled 并行展开每个变体                  【慢，总耗时≈单套】
  │    ├→ stage: 'expand' → 渲染 PlanLoading
  │    ├→ brief.{theme,location,time,people}   由 AI 从文本+图片解析回填
  │    └→ directions: StyleDirection[]         **同一调性下的 3 个场景变体**（不是 3 个风格）
  │         · ShootPlan（含 scenes[] 完整策划）
  │         · 单个变体失败不影响其他，成功几套展示几套
  │         · 全部失败才报错
  │
  ├─ savePlan() 落 localStorage → view: plan，顶部胶囊切换 3 套
  │
  └─ 参考片按需生成：单张（produceImage）或批量（runBatch，可中断）
```

失败与中断：生成出错时**退回 `confirm`**（不是留在 generating），约定还在，改两笔就能重试；用户点「不想等了」同样回 `confirm`。成功走 `plan`，不会退回。

**步骤条与 View 的映射**写在 `Steps.tsx` 的 `stepOf()` 里，加/改步骤只改那一处。`library` 不属于流程，`stepOf` 返回 `null`（不显示步骤条）。

**讨论页与确认页的分工**（这是本设计最容易改错的地方）：`Discuss` 只管聊，**不含任何确认 UI**；一旦 `consensus` 非空，它的输入区就冻结并提示"去下一步确认"。`Confirm` 只管复核与改，不含聊天记录。所以：**从 Confirm 点「继续聊」回 Discuss 时必须把 `consensus` 清成 null**，否则 Discuss 还认为约定已出、输入区冻着，用户回去了却打不了字（踩过）。

**共识必须钉进 prompt**：`consensus` 经 `formatConsensus()`（`prompts.ts`）注入阶段 1 与阶段 2 两处。少注入一处，风格就会在展开时跑偏——这是本环节唯一容易漏的地方。风格锁定后，「3 套」的差异只能来自场景，prompt 里已明确禁止换风格。

**多轮对话的传参约定**：`chatText` / `chatTextStream(config, system, user, [onDelta,] { history, images })` 中 `history` 是**本条之前的对话**，`user` 是**本条新消息**，函数会把 user 追加到 history 之后。**别把新消息也塞进 history**，否则同一条发两遍（踩过）。`images` 只挂在最后一条 user 上——多个厂商拒绝多消息带图，同时也省 token。

**流式输出（讨论环节专用）**：`chatTextStream` 走 SSE，边收边回调 `onDelta`。三条硬约束：

1. **只按换行切分，绝不按字节切**。一个 chunk 可能把中文字劈成两半，残缺的行必须留在 buffer 里等下一块。`readStream` 用 `TextDecoder(..., {stream:true})` + `split('\n')` + `pop()` 兜住，改这里前先看那段注释。
2. **单个事件解析失败只跳过**，不能让一个坏 JSON 拖垮整段回复。
3. **厂商不支持流式时要退化**：content-type 不是 event-stream，或直接返回了完整 JSON，就一次性读完并调一次 onDelta。判断依据是 content-type 而不是试错。

**生成防抖**：`generateAll` 用 `generating`（**ref，不是 state**）做互斥锁。state 更新是异步的，狂点按钮时下一次点击可能在重渲染前就进来了，只有 ref 挡得住。**生成中跳走后就没人管 state 了，所以互斥判断必须用 ref 而不能指望 `stage` / `view`** —— `Confirm` 的 `onConfirm` 就是这么挡的。生成成功后在策划页顶部给一条绿色 toast（几套成功 + 已存到哪），因为页面直接跳走了，没反馈用户会以为没点上。

**测试接缝**：三处。

1. `src/lib/llm.ts` 末尾导出 `__test = { readStream }`。`npm run test:sse`（`scripts/test-sse.mjs`）用 esbuild 编译该文件后喂各种分块方式验证 SSE 解析：逐字节、CRLF、坏 JSON、`[DONE]`、非标准 `message.content`、不支持流式的降级。改 `readStream` 后跑一遍。**别改成用正则剥 TS 类型**——试过，会崩。
2. `src/components/Steps.tsx` 的 `stepOf()` 是纯映射（不碰 hooks），`npm run test:steps`（`scripts/test-steps.mjs`）同样用 esbuild 编译后直接 import 断言六种 view 的落点。加页面、改步骤归属后跑。**`'generating'` 必须落到第 3 步** —— 这是回归风险最高的一条。
3. `src/lib/storage.ts` 的 `configFromEnv()` 用 `npm run test:config`（`scripts/test-config.mjs`）验证 `.env` → `ModelConfig` 的映射。做法是把 `import.meta.env` 用 esbuild `define` 指向 `globalThis.__ENV__`，**编译一次就能改环境跑多个用例**（每次重 build 太慢）。重点盯 `responseFormat`（漏过，见架构规则）。

`npm test` 一次跑全三份。

**降级路径（贯穿全流程）**：附图请求失败且确有参考图时，**去掉图片重试一次**，并给用户一条 notice 说明「当前模型看不了图」。上层不应把这类失败当致命错误抛出。讨论环节同样适用（开场与每轮回复都要兜，见 `streamReply`）。

## 数据模型

`src/types.ts` 是唯一类型来源，字段语义见 `CONTEXT.md`。

| 类型 | 角色 | 关键点 |
|---|---|---|
| `Brief` | 输入 | `text` 与 `referenceImages` 由用户给；`theme/location/time/people` 由阶段 1 的 AI 解析回填，展开前可能为空 |
| `ChatMessage` | 中间产物 | `role: 'user' \| 'assistant'` + `content`，讨论环节的一轮，**不落库**（刷新即丢，可接受） |
| `View` | 导航 | 六个值：`brief` / `discuss` / `confirm` / **`generating`** / `plan` / `library`。`generating` 不是真页面，是"第 3 步正在生成"的状态，只为把等待动画渲染在第 3 格里 |
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
2. 跑了测试才敢交：`npm test`（含 `test:sse` / `test:steps` / `test:config`）必须全绿。动了 `src/lib/llm.ts` 的流式解析必跑 `test:sse`；动了步骤条或 `View` 映射必跑 `test:steps`；动了 `.env` → 配置的映射必跑 `test:config`。
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

   注：测长图导出时参考片用 `data:` URL（`image: 'data:image/png;base64,...'`）。远程 URL 现在也会尽力收录（加 `crossOrigin` 试读），但读不到就退回插画——见架构规则的「canvas 的跨域纪律」。
4. 交付前对照 `CONTEXT.md` 的术语检查 UI 文案——界面用词和术语表一致。
5. 提交前 `git status` 必须干净且**不含 `.env` / `dist/`**。若为验证环境变量注入临时建过 `.env`，验证完立刻删除。

## 官网截图怎么来的

`site/shots/` 里那几张界面图**不是画的，是让应用真跑一遍截下来的**。工具就在仓库里：

| 文件 | 作用 |
| --- | --- |
| `shot.html` | 截图专用入口（在**项目根目录**，原因见下方坑 1） |
| `public/shot-driver.js` | 驱动脚本：拦 `window.fetch` 按请求特征喂假响应，再模拟点击把流程走完 |
| `public/shot-refs.js` | 演示参考片（base64，已 gitignore）。**没有它，方案页就只有简笔画** |

用 `?shot=N` 选剧本：`1` 填想法 · `2` 讨论 · `3` 约定 · `4` 生成中 · `5` 方案。

跑法（**dev server 必须和截图在同一条命令里启停**，否则服务会被杀掉）：

```bash
node ./node_modules/vite/bin/vite.js --port 4190 --strictPort --host 127.0.0.1 &
sleep 5
chrome --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --virtual-time-budget=45000 --window-size=520,940 \
  --screenshot=tmp/raw/step1-brief.png "http://127.0.0.1:4190/shot.html?shot=1"
kill %1
```

窗口宽给 **520**：应用是 `max-w-md`(448) 居中，两侧各 36px 留白，截完裁掉即可。
高度按内容给 —— `discuss` / `generating` 是 `h-dvh` 锁定的整屏，其余页看内容长度。

**四个坑（都真踩过）：**

1. **截图入口不能放 `public/`**。`public/` 下的 HTML 不走 vite 的 `transformIndexHtml`，`@vitejs/plugin-react` 的 React Refresh preamble 注入不进去，应用直接白屏（早期版本用 headless 截图时被这条卡了一轮）。
2. **`fetch` 拦截里别拿「拍摄约定」当特征词**。`cardsUserPrompt` 和 `expandUserPrompt` 都会嵌入共识，那段文字里带着「拍摄约定」——用它判断会把「出 3 个场景方向」的请求误判成「归纳约定」，于是 `directions` 为空、页面报「模型没有给出有效的场景方案」。要用各自提示词独有的句子区分。
3. **`--virtual-time-budget` 下别用定时器轮询**。虚拟时钟会把 `setTimeout` 快进，轮询几百次是一瞬间的事，而图片解码、canvas 压缩这些真实异步操作根本还没做完。改用 `MutationObserver` 等 DOM 变化。
4. **等待动画那屏要给矮窗口**（520×720）。它是 `h-dvh` 撑满 + 动画居中，窗口给太高的话缩略图里几乎是一片白。

**演示参考片**是外部生成的素材（西湖情侣日系人像），压到 480px 宽后 base64 注入 `shot-refs.js`，右下角原本带出图工具水印，已用高斯模糊糊掉。

## 架构规则

- **零后端（BYOK）**：一切跑在浏览器里，用户的各家 API key 存 localStorage（或由 `.env` 提供默认值）、直连厂商的 OpenAI 兼容接口。新增功能先问「纯前端能不能做」，答不了再谈后端。
- **CORS 立场**：某厂商浏览器直连被挡时，产品内不解决——引导用户改用「自定义」中转（写进 `.env` 的 `VITE_*_BASE_URL`）。不为单个厂商加代理或变通代码。
- **唯一测试接缝**：`src/lib/llm.ts` 的 `chatJson` / `chatText` / `chatTextStream` / `generateImage`。所有依赖模型的行为都经这几个函数；写测试的 mock 点只在这里，UI 与纯函数直接测。
- **动效出口**：所有 `@keyframes` 写在 `src/index.css`，组件里只用 `animate-[名字_时长_缓动_次数]` 引用。别在组件内塞 `<style>`——将来要统一尊重 `prefers-reduced-motion` 时只有一个地方要改（已经加了那条 media query）。
- **滚动归属：一屏只有一个滚动条**。`App` 的根容器按 view 分两种模式——`discuss` 与 `generating` 时 `h-dvh + overflow-hidden`（整页锁死），其余 view 用 `min-h-dvh`（整页滚动）。这两个 view 内部靠 `flex-col` 三段分：顶部区与底部区 `shrink-0` 固定，只有中间区 `min-h-0 flex-1 overflow-y-auto`。

  三个必须记住的坑：
  1. **flex 子项要滚动就得加 `min-h-0`**。flex 项默认 `min-height: auto`，不加它子项会被内容撑高、撑破父级，滚动条跑到整页上去。
  2. **`overflow-y-auto` 的元素本身也得是 `min-h-0` 的 flex 子项**。只给滚动容器加 `overflow-y-auto` 而忘了它是 flex 项，一样撑破——`generating` 那屏的滚动容器就同时挂了 `min-h-0` 和 `flex-1`。
  3. **自动滚底用容器的 `scrollTop = scrollHeight`，别用 `scrollIntoView`**。后者会连带滚动所有可滚动祖先，在这套嵌套布局里会把整个页面顶起来。参见 `Discuss.tsx` 的 `scrollRef`。
- **步骤条的宽度**：三格用 `grid-cols-3` 严格等分，**不要给当前步加 `flex` 权重**（试过 `flex: 1.6`，胶囊被撑宽、三格看着不齐）。连接线是左右各画一半的绝对定位线段，接缝自然落在格子边界上。
- **等待动画挂在哪一步**：第 3 步的等待态必须有自己的 view（`'generating'`），**不要挂在 `confirm` 里**。动画块又高又长，挂在确认页底下既把页面撑长，又让用户觉得"还停在第 2 步"。同理，`LoadingShell` 有 `fill` 参数——独占一屏时传 `fill` 让它纵向居中并自适应高度；内联兜底时（如 `view === 'brief'`）用默认的固定 `py-12`。
- **标签词汇表耦合**：`src/lib/poses.ts` 的 `POSE_TAGS` 是 prompt（`src/lib/prompts.ts`）里声明给模型的可选集合。改一边必须同步另一边，否则画面对不上插画。当前 15 个标签：单人 7（站/走/坐/跳/背影/回眸/蹲）、双人 8。
- **localStorage 防御**：参考片等图片进存储前先压缩（现例：768px 参考图、480px 参考片）；`savePlan` 已有超容量逐级丢弃逻辑（30→20→10→5→2→1），新增大体积数据沿用该模式。
- **生图默认豆包**：参考片默认走火山方舟豆包 Seedream（用户只填 Key），参考图 base64 直传做图生图、响应要 b64_json。生图预设改动集中在 `IMAGE_GEN_PRESETS`（`src/lib/llm.ts`）。
- **参考片必须以 base64 回到前端**（`responseFormat: 'b64_json'`）。理由：厂商默认回**远程 URL**，而远程图会**污染 canvas** —— 页面上显示正常，一导出长图 `toBlob` 就抛 SecurityError，或者拉取被 CORS 拦住。统一由 `imageResponseFormatFor(baseURL, model)`（`src/lib/llm.ts`）按厂商判定，`.env` 路径（`configFromEnv`）必须调它。**这里是漏过一次的地方**：设置页当年为豆包写死了 `b64_json`，`.env` 路径没写 → 长长的图里只有简笔画，而类型检查查不出来（字段本来可选）。`npm run test:config` 钉住这条。
- **canvas 的跨域纪律**：任何要画进 canvas 的图，非 `data:` 的一律先 `img.crossOrigin = 'anonymous'`（**必须在赋 `src` 之前设**），加载失败就**放弃这张图**、退回姿势插画，绝不能硬画。`exportPlanImage` 里 `loadDrawable()` 就是这个守门人；它返回的 `ExportResult`（photos / skipped）要透给用户，别静默少图。
- **key 卫生**：仓库与文档**只出现假值**（如 `.env.example` 里的 `sk-在这里填你的Key`）；真实 key 只活在本地 `.env`（已被 `.gitignore` 忽略）与用户浏览器里。测试注入一律假值，测完立即删除 `.env` 并清掉 `dist/`。
