# Resume Agent

AI 简历分析 Agent：输入岗位 JD 和个人简历，输出匹配度分析、能力 gap 识别与具体修改建议。

## 技术栈

- Next.js 14+ (App Router) + TypeScript
- Tailwind CSS + shadcn/ui (base color: zinc)
- 智谱 AI GLM-4.6（通过 OpenAI 兼容接口）
- 部署：Vercel

## 本地启动

```bash
npm install
cp .env.local.example .env.local   # 然后填入你的 ZHIPU_API_KEY
npm run dev
```

访问：

- http://localhost:3000 — 首页
- http://localhost:3000/analyze — 分析页面（占位）
- http://localhost:3000/api/analyze — Agent API（当前返回 mock）

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `ZHIPU_API_KEY` | 智谱开放平台 API Key（在 https://open.bigmodel.cn 申请） | 必填 |
| `ZHIPU_MODEL` | 使用的模型名 | `glm-4.6` |

## 部署到 Vercel

1. 将仓库推送到 GitHub。
2. 在 [vercel.com](https://vercel.com) 点击 **New Project**，导入该仓库。
3. 在 **Environment Variables** 中填入 `ZHIPU_API_KEY` 和 `ZHIPU_MODEL`。
4. 点击 **Deploy**，Vercel 会自动检测到 Next.js 并完成构建部署。
