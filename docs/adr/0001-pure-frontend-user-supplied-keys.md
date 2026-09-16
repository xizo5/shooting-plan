# 纯前端架构，用户自带模型 Key

## 状态

accepted（2026-09-15）

## 决策

本项目为**零后端**的纯前端单页应用（Vite + React + Tailwind，静态产物）。LLM 调用由浏览器直连各厂商的 OpenAI 兼容接口，API key 由用户在设置页自行填写，存储于 localStorage。厂商预设（DeepSeek / 智谱 / 通义 / Kimi 等）之外提供自定义 base URL + key + 模型名的配置项。

## 背景

初期方案是 Cloudflare Pages + Functions 薄后端托管 key。为换取零运维、零服务器成本、部署地点完全自由（本地打开 / 任意静态托管），改为把 key 的保管责任转移给用户。

## 被否决的替代方案

- **Serverless 薄后端（Cloudflare Workers）代管 key**：更安全，但引入部署、运维和成本，且小范围验证阶段没有必要。
- **绑死单一厂商（DeepSeek）**：key 既然由用户自配，就没有理由限制厂商；所有主流厂商均兼容 OpenAI 格式。

## 后果

- **CORS 是已知约束**：个别厂商可能不允许浏览器直连。产品不解决此问题，仅靠自定义 base URL 让用户自行接中转（one-api / 本地代理），文档写清楚即可。
- **key 存于客户端 localStorage**：自用/小范围场景可接受；**未来若做付费化，必须引入后端**，届时本 ADR 需被取代。
- 插画库、分享长图、localStorage 策划存储均随静态资源走，无需任何服务端配合。
