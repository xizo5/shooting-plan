# 出片助手（shooting-plan）

一个纯前端的 AI 拍摄策划 H5：一句话描述你的拍摄想法（可附模特图/场景图），AI 一次生成 3 套不同风格的完整文字策划（可切换对比），机位和动作贴着你上传的图生成（图生图）。每个画面可按需点击生成 AI 写实参考片，最后导出长图带去现场照着拍。

面向**被拍的人**（情侣、个人、家庭），不是摄影师工具。

> 本项目面向**开发者自行部署**：clone 下来配好 `.env`，跑起来就是自己的。不提供在线托管版本。

## 快速开始

需要 Node 18+。

```bash
git clone <仓库地址> shooting-plan
cd shooting-plan
npm install

cp .env.example .env     # 然后编辑 .env，填入自己的 API Key
npm run dev              # 本地开发，浏览器打开提示的地址
npm run build            # 构建纯静态产物到 dist/
npm run preview          # 预览构建产物
```

`.env` 里至少填 `VITE_API_KEY` 和 `VITE_MODEL`，可参考 `.env.example` 里列的常见厂商接口地址：

| 变量 | 说明 |
|---|---|
| `VITE_BASE_URL` | 主模型接口地址（OpenAI 兼容） |
| `VITE_API_KEY` | 主模型 API Key |
| `VITE_MODEL` | 模型名，需支持看图才能用参考图（智谱 glm-4v 系列、通义 qwen-vl 系列） |
| `VITE_IMAGE_BASE_URL` 等 | 参考片生图配置，**可选**，留空则不启用 |

`.env` 已被 `.gitignore` 忽略，不会进仓库。

## 配置的两层关系

**`.env` 只是首次打开的默认值，设置页优先级更高。**

- 没有本地配置 → 用 `.env` 的值初始化
- 在设置页点过「保存」→ 以浏览器里存的为准，忽略 `.env`

这样遇到 CORS 要换中转地址、或临时换厂商时，**直接在设置页改就行，不用改文件重新构建**。想回到 `.env` 的默认值，清空浏览器 localStorage 即可。

> ⚠️ 注意：Vite 会把 `VITE_*` 变量**明文编译进 JS 产物**，`dist/` 里能直接搜到 Key。这对「自己 clone 自己跑」的场景不是问题（填的是自己的 Key，跑在自己机器上）；但**不要把带 Key 的 `dist/` 部署到公开地址**，那等于公开自己的 Key。真要对外提供在线服务，应改为后端代管 Key（见 [ADR-0001](docs/adr/0001-pure-frontend-user-supplied-keys.md)）。

## 架构决策

- **零后端**：Key 存在浏览器 localStorage（或由 `.env` 提供默认值），浏览器直连厂商接口。详见 [docs/adr/0001](docs/adr/0001-pure-frontend-user-supplied-keys.md)
- **CORS**：个别厂商可能不允许浏览器直连。产品不解决此问题——在设置页用「自定义 OpenAI 兼容」模式填中转地址（one-api / 本地代理）即可
- **一次三套、文字先行**：AI 先解析需求并产出 3 个风格方向，随后并行展开成 3 套完整文字策划（总耗时≈单套），页面顶部切换对比；每套必含 1 个备用场景。参考片不自动生成——看完文字方案后按需点击，省钱且可控
- **图生图**：参考图（模特图/场景图）随请求直接发给所用模型；展开策划时机位写成场景图里的真实站位、动作贴合模特图的气质。模型不支持看图时自动去图重试并提示
- **姿势插画 + 参考片混合**：内置简笔画姿势库（`src/lib/poses.ts`）永远兜底、零成本；AI 写实参考片是可选增强——默认豆包 Seedream，参考图以 base64 直传做图生图，生成结果请求 b64_json 返回，存 localStorage 前压缩到 480px

## 领域术语

见 [CONTEXT.md](CONTEXT.md)：前置条件（Brief）、参考图、风格方向、策划（Shoot Plan）、场景（Scene）、画面（Shot）、参考片、插画库。

## 后续路线

- 付费化：需引入后端（登录、限额），届时 ADR-0001 将被取代
- 插画库扩充：往 `src/lib/poses.ts` 加条目即可，标签体系已可扩展
