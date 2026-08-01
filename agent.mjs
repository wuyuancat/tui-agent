#!/usr/bin/env node
/**
 * tui-agent.mjs — 单文件命令行编程 agent（Vercel AI SDK v7，最小实现）
 *
 * 用法:
 *   export OPENAI_API_KEY=sk-...            # 必填
 *   export OPENAI_BASE_URL=...              # 可选: 兼容 OpenAI 的端点(DeepSeek/OpenRouter/Ollama)
 *   export OPENAI_MODEL=gpt-4o-mini         # 可选: 默认 gpt-4o-mini
 *
 *   node agent.mjs                          # 交互模式 (TUI)
 *   node agent.mjs "给当前目录写个 README"   # 一次性任务模式
 *   node agent.mjs --selftest               # 无 key 自测工具函数
 */
import { generateText, tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import * as rl from 'node:readline/promises'

const run = promisify(exec)
const C = { bld: '\x1b[1m', dim: '\x1b[2m', grn: '\x1b[32m', cyn: '\x1b[36m', red: '\x1b[31m', rst: '\x1b[0m' }
const paint = (k, s) => `${C[k]}${s}${C.rst}`
const clip = (s, n = 6000) => (s || '').slice(0, n) || '(无输出)'
const sum = o => { const s = JSON.stringify(o); return s.length > 70 ? s.slice(0, 67) + '…' : s }

// ── 三个最小工具：让模型能"看、改、跑" ────────────────────────────
const tools = {
  bash: tool({
    description: '在当前目录执行 shell 命令(cd/ls/cat/git/npm 等)，用于探索环境、运行程序与测试',
    parameters: z.object({ command: z.string().describe('要执行的 shell 命令') }),
    execute: async ({ command }) => {
      try {
        const { stdout, stderr } = await run(command, { timeout: 30000, maxBuffer: 10 << 20 })
        return clip([stdout, stderr && `[stderr]\n${stderr}`].filter(Boolean).join('\n'))
      } catch (e) {
        return clip(`exit ${e.code ?? '?'}: ${e.message}\n${e.stdout ?? ''}${e.stderr ?? ''}`)
      }
    },
  }),
  read_file: tool({
    description: '读取一个文本文件的内容',
    parameters: z.object({ path: z.string().describe('文件路径') }),
    execute: async ({ path }) => {
      try { return clip(await readFile(path, 'utf8'), 12000) }
      catch (e) { return `错误: ${e.message}` }
    },
  }),
  write_file: tool({
    description: '写入或覆盖一个文本文件（自动创建父目录）',
    parameters: z.object({ path: z.string(), content: z.string() }),
    execute: async ({ path, content }) => {
      try { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content); return `已写入 ${path} (${content.length} 字符)` }
      catch (e) { return `错误: ${e.message}` }
    },
  }),
}

const SYSTEM = `你是运行在用户终端里的编程 agent，用中文、简短回复。工作方式：
1. 先探索再动手：用 bash/read_file 了解项目结构与现状
2. 改代码/建文件用 write_file
3. 完成后用 bash 验证（运行测试、语法检查）
4. 直接回答与工具调用都允许；不要编造文件内容，写前先读`

// ── 一次生成（SDK 自动循环调用工具直到给出最终答案） ──────────────
async function ask(messages) {
  const model = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  }).chat(process.env.OPENAI_MODEL || 'gpt-4o-mini') // .chat() = chat/completions，兼容 DeepSeek/OpenRouter/Ollama 等端点
  const res = await generateText({
    model, system: SYSTEM, messages, tools,
    stopWhen: ({ steps }) => steps.length >= 12, // 工具循环上限；模型不再调用工具时自动结束
    onStepFinish: ({ content }) => content
      .filter(p => p.type === 'tool-call')
      .forEach(t => console.log(paint('dim', `  ⚙ ${t.toolName}(${sum(t.input)})`))),
  })
  return res.text
}

// ── 无 key 自测：直接调用工具函数 ────────────────────────────────
if (process.argv.includes('--selftest')) {
  const t = '/tmp/tui-agent-selftest.txt'
  console.log(await tools.write_file.execute({ path: t, content: 'hello\n' }))
  console.log('read_file →', await tools.read_file.execute({ path: t }))
  console.log('bash →', (await tools.bash.execute({ command: 'echo ok && wc -c ' + t })).trim())
  process.exit(0)
}

// ── 主循环 ──────────────────────────────────────────────────────
if (!process.env.OPENAI_API_KEY) {
  console.error(paint('red', '缺少 OPENAI_API_KEY。可用 --selftest 无 key 自测。'))
  process.exit(1)
}
const history = [] // 仅存对话文本，工具细节每次重新执行
const first = process.argv.slice(2).join(' ')

console.log(paint('bld', 'tui-agent') + paint('dim', ' — 输入 exit 退出\n'))

if (first) { // 一次性任务
  history.push({ role: 'user', content: first })
  try { console.log(paint('cyn', '\n' + (await ask(history)))) }
  catch (e) { console.error(paint('red', '\n' + e.message)) }
} else {     // 交互 TUI
  const rli = rl.createInterface({ input: process.stdin, output: process.stdout })
  while (!rli.closed) {
    const q = (await rli.question(paint('grn', '\n❯ '))).trim()
    if (!q) continue
    if (['exit', 'quit', 'q'].includes(q)) break
    history.push({ role: 'user', content: q })
    try { console.log(paint('cyn', '\n' + (await ask(history)))) }
    catch (e) { console.error(paint('red', '\n' + e.message)) }
  }
  rli.close()
}
