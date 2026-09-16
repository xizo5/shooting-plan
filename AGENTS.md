# AGENTS.md

拍摄策划 H5「出片助手」：被拍的人用一个自由输入框描述拍摄想法（可附模特图/场景图，「图生图」——机位和动作贴着图生成），AI 一次并行生成 3 套不同风格的完整文字策划供切换对比，参考片由用户看完文字后按需点击生成，可导出长图。与用户全程用中文交流。

**目标用户是开发者，不是普通消费者**：使用者自行 clone 仓库、配 `.env`、本地跑起来。因此可以要求 Node 环境与构建步骤，但**仍无后端**。不要按「降低小白使用门槛」的思路做设计决策（如内置试用额度、托管 Key）。

## 文档地图

- `CONTEXT.md` — 领域术语表，**定义产品概念的权威来源**。命名新概念、发现术语冲突时，先改这里再写代码。
- `docs/adr/0001-pure-frontend-user-supplied-keys.md` — 为什么零后端、key 在前端。做付费化、登录、限额之前必读：那意味着推翻此 ADR，需先和用户确认并新立 ADR。
- `README.md` — 面向人的产品说明，改完对外行为后同步更新。
- `.env.example` — 环境变量模板，与设置页是**两层配置**（见下）。

## 核心流程

一次生成分两阶段，第二阶段并行：

```
Brief（text + ≤4 张参考图）
  │
  ├─ 阶段 1  chatJson(cardsSystem, cardsUserPrompt)          【快】
  │    ├→ brief.{theme,location,time,people}   由 AI 从文本+图片解析回填
  │    └→ directions: StyleDirection[]         3 个差异明显的风格方向
  │
  ├─ 阶段 2  Promise.allSettled 并行展开每个方向                【慢，总耗时≈单套】
  │    └→ ShootPlan（含 scenes[] 完整策划）
  │         · 单个方向失败不影响其他方向，成功几套展示几套
  │         · 全部失败才报错
  │
  ├─ savePlan() 落 localStorage → 展示，顶部胶囊切换 3 套
  │
  └─ 参考片按需生成：单张（produceImage）或批量（runBatch，可中断）
```

**降级路径（贯穿全流程）**：附图请求失败且确有参考图时，**去掉图片重试一次**，并给用户一条 notice 说明「当前模型看不了图」。上层不应把这类失败当致命错误抛出。

## 数据模型

`src/types.ts` 是唯一类型来源，字段语义见 `CONTEXT.md`。

| 类型 | 角色 | 关键点 |
|---|---|---|
| `Brief` | 输入 | `text` 与 `referenceImages` 由用户给；`theme/location/time/people` 由阶段 1 的 AI 解析回填，展开前可能为空 |
| `StyleDirection` | 中间产物 | `id` + `name`（≤4字）+ `tagline`（≤15字），本身不落库 |
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
2. UI 改动用浏览器冒烟：`npm run preview` 起服务，走一遍受影响的页面。**没有真实 key 无法测生成链路**，在 devtools console 注入假策划数据验证展示层：

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
3. 交付前对照 `CONTEXT.md` 的术语检查 UI 文案——界面用词和术语表一致。
4. 提交前 `git status` 必须干净且**不含 `.env` / `dist/`**。若为验证环境变量注入临时建过 `.env`，验证完立刻删除。

## 架构规则

- **零后端（BYOK）**：一切跑在浏览器里，用户的各家 API key 存 localStorage（或由 `.env` 提供默认值）、直连厂商的 OpenAI 兼容接口。新增功能先问「纯前端能不能做」，答不了再谈后端。
- **CORS 立场**：某厂商浏览器直连被挡时，产品内不解决——引导用户在设置页走「自定义」中转。不为单个厂商加代理或变通代码。
- **唯一测试接缝**：`src/lib/llm.ts` 的 `chatJson` / `generateImage`。所有依赖模型的行为都经这两个函数；未来写测试只 mock 这条缝，UI 与纯函数直接测。
- **标签词汇表耦合**：`src/lib/poses.ts` 的 `POSE_TAGS` 是 prompt（`src/lib/prompts.ts`）里声明给模型的可选集合。改一边必须同步另一边，否则画面对不上插画。当前 15 个标签：单人 7（站/走/坐/跳/背影/回眸/蹲）、双人 8。
- **localStorage 防御**：参考片等图片进存储前先压缩（现例：768px 参考图、480px 参考片）；`savePlan` 已有超容量逐级丢弃逻辑（30→20→10→5→2→1），新增大体积数据沿用该模式。
- **生图默认豆包**：参考片默认走火山方舟豆包 Seedream（用户只填 Key），参考图 base64 直传做图生图、响应要 b64_json。生图预设改动集中在 `IMAGE_GEN_PRESETS`（`src/lib/llm.ts`）。
- **key 卫生**：仓库与文档**只出现假值**（如 `.env.example` 里的 `sk-在这里填你的Key`）；真实 key 只活在本地 `.env`（已被 `.gitignore` 忽略）与用户浏览器里。测试注入一律假值，测完立即删除 `.env` 并清掉 `dist/`。
