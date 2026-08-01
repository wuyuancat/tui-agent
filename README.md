# tui-agent

单文件命令行编程 agent（Vercel AI SDK）。一个 `agent.mjs` 实现工具调用循环 + TUI，可用 `@vercel/ncc` 打包为自包含单文件（内置全部依赖，免 `npm install` 直接运行）。

## 功能

- **三种模式**：交互式 TUI（`❯` 提示符）/ 一次性任务 / `--selftest` 无 key 自测
- **三个内置工具**：`bash` / `read_file` / `write_file`（zod schema 驱动，模型自动学会参数格式）
- **自动工具循环**：`generateText` + `stopWhen` 最多 12 轮，模型可连续调用工具直到完成任务
- **零外部运行时依赖**：打包后仅需 Node.js 18+，ANSI 彩色输出不依赖任何 npm 包

## 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `OPENAI_API_KEY` | API key（必填） | — |
| `OPENAI_BASE_URL` | 兼容端点（DeepSeek / OpenRouter / Ollama 等） | OpenAI 官方 |
| `OPENAI_MODEL` | 模型名 | `gpt-4o-mini` |

> 使用 `createOpenAI(...).chat(modelId)` 走 `/chat/completions`，因此任何 OpenAI 兼容服务均可接入。

## 使用

```bash
# 源码方式
npm install
node agent.mjs                      # 交互 TUI
node agent.mjs "给当前目录写个 README"  # 一次性任务
node agent.mjs --selftest           # 无 key 自测

# 打包为自包含单文件（无需 node_modules）
npm run build                       # ncc 打包 → dist/index.mjs
node dist/index.mjs "帮我跑个测试"
```

## 打包说明

```bash
npm i -D @vercel/ncc
npm run build
```

产物 `dist/index.mjs`（约 1.6MB）内置 AI SDK、provider、zod 与全部工具逻辑，复制到任何装有 Node 18+ 的机器即可直接运行。

## 已知的 AI SDK v7 坑（开发时踩过）

1. `maxSteps` 已移除 → 工具循环用 `stopWhen: ({steps}) => steps.length >= 12`
2. 默认 `provider(model)` 走 Responses API → 必须 `.chat(model)` 才走 chat/completions，兼容第三方端点
3. `generateText` 的 `.text` 是不可枚举属性，解构会得到 `undefined`
4. zod 必须用 v3（v4 的 schema 序列化为空 `properties: {}`）
5. readline 遇 EOF 自动关闭，循环条件用 `!rli.closed`

## License

MIT
