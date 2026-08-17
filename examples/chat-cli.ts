/**
 * examples/chat-cli.ts — an interactive chat REPL with live token streaming.
 *
 * Run:  npx tsx examples/chat-cli.ts
 * Type 'exit' to quit. The conversation stays in the agent's memory for the
 * session; add a JsonlFileMemory to persist across runs (see docs/extending.md).
 */
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createAgent, Type, defineTool } from '../src/index.ts'

const agent = createAgent({
  model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  systemPrompt: 'You are a helpful assistant. Be concise. Use the shout tool when asked.',
  tools: [
    defineTool({
      name: 'shout',
      description: 'Uppercase the input text.',
      parameters: Type.Object({ text: Type.String() }),
      run: ({ text }) => text.toUpperCase(),
    }),
  ],
})

const rl = createInterface({ input, output })
console.log('Chat with your agent. Type "exit" to quit.')

for (;;) {
  const line = await rl.question('you> ')
  if (line.trim().toLowerCase() === 'exit') break
  if (!line.trim()) continue

  process.stdout.write('agent> ')
  let answer = ''
  for await (const ev of agent.runStream(line)) {
    if (ev.type === 'text_delta') {
      process.stdout.write(ev.delta)
      answer += ev.delta
    } else if (ev.type === 'thinking_delta') {
      // uncomment to see reasoning: process.stdout.write(ev.delta)
    } else if (ev.type === 'tool_call') {
      process.stdout.write(`\n[tool] ${ev.call.name}(${JSON.stringify(ev.call.arguments)})\nagent> `)
    }
  }
  console.log('\n')
}
rl.close()
