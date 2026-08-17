/**
 * examples/simple-agent.ts — the smallest agent.
 *
 * Run:  npx tsx examples/simple-agent.ts
 * Needs a provider key (default: DEEPSEEK_API_KEY).
 */
import { createAgent, defineTool, echoTool, Type } from '../src/index.ts'

const agent = createAgent({
  model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  systemPrompt: 'You are a terse assistant. Use the echo tool when asked.',
  tools: [
    echoTool,
    defineTool({
      name: 'shout',
      description: 'Uppercase the input.',
      parameters: Type.Object({ text: Type.String() }),
      run: ({ text }) => text.toUpperCase(),
    }),
  ],
})

const result = await agent.run('Say "hello" and echo it, then shout it.')
console.log('answer:', result.final.content.map((c) => 'text' in c ? c.text : '').join(''))
console.log('steps:', result.steps, 'toolCalls:', result.toolCalls)
