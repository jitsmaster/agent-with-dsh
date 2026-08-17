import { describe, expect, it } from 'vitest'
import type {
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai'
import { Type } from '@earendil-works/pi-ai'
import { createAgent, defineTool, echoTool, type AgentRunResult } from '../src/index.ts'
import type { ModelRegistry, ModelRoute } from '../src/model.ts'

/** Build a fake assistant message for stub registries. */
function assistant(
  content: AssistantMessage['content'],
  stopReason: AssistantMessage['stopReason'] = 'stop',
): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'faux',
    model: 'faux',
    usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: Date.now(),
  }
}

/** Stub ModelRegistry: scripted responses, no network. */
function stubRegistry(responses: ((messages: Context) => AssistantMessage)[]): ModelRegistry {
  let i = 0
  return {
    complete: async (_route: ModelRoute, context: Context) => {
      const fn = responses[Math.min(i, responses.length - 1)]!
      i++
      return fn(context)
    },
    stream: (_route: ModelRoute, _context: Context, _options?: SimpleStreamOptions) => {
      throw new Error('stream stub not implemented in this test')
    },
  } as unknown as ModelRegistry
}

describe('Agent', () => {
  it('runs a single-turn answer', async () => {
    const agent = createAgent({
      model: { provider: 'faux', model: 'faux' },
      systemPrompt: 'be terse',
      registry: stubRegistry([() => assistant([{ type: 'text', text: 'hi' }])]),
    })
    const result = await agent.run('hello')
    expect(result.final.content[0]).toMatchObject({ type: 'text', text: 'hi' })
    expect(result.steps).toBe(1)
    expect(result.messages).toHaveLength(2) // user + assistant
  })

  it('executes tool calls and continues the loop', async () => {
    const calls: string[] = []
    const agent = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([
        () =>
          assistant(
            [{ type: 'toolCall', id: 'call_1', name: 'echo', arguments: { text: 'ping' } }],
            'toolUse',
          ),
        (ctx) => {
          const last = ctx.messages[ctx.messages.length - 1]
          return assistant([{ type: 'text', text: `got: ${JSON.stringify(last?.content)}` }])
        },
      ]),
      tools: [echoTool],
    })
    const result: AgentRunResult = await agent.run('go')
    expect(result.toolCalls).toBe(1)
    expect(result.steps).toBe(2)
    const roles = result.messages.map((m) => m.role)
    expect(roles).toEqual(['user', 'assistant', 'toolResult', 'assistant'])
    const toolResult = result.messages[2]
    if (toolResult && toolResult.role === 'toolResult') {
      expect(toolResult.toolName).toBe('echo')
      expect(toolResult.content[0]).toMatchObject({ type: 'text', text: 'ping' })
    }
    calls.push('ran')
    expect(calls).toHaveLength(1)
  })

  it('runs tools defined with TypeBox and typed run args', async () => {
    const addTool = defineTool({
      name: 'add',
      description: 'add two ints',
      parameters: Type.Object({ a: Type.Number(), b: Type.Number() }),
      run: ({ a, b }) => a + b,
    })
    const agent = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([
        () =>
          assistant([{ type: 'toolCall', id: 'c', name: 'add', arguments: { a: 20, b: 22 } }], 'toolUse'),
        (ctx) => {
          const last = ctx.messages[ctx.messages.length - 1]
          const text = (last?.content as { type: 'text'; text: string }[])[0]?.text
          return assistant([{ type: 'text', text: `sum=${text}` }])
        },
      ]),
      tools: [addTool],
    })
    const result = await agent.run('add 20 and 22')
    const toolResult = result.messages[2]
    expect(toolResult && toolResult.role === 'toolResult' && toolResult.content[0]).toMatchObject({
      type: 'text',
      text: '42',
    })
  })
})

describe('Agent streaming', () => {
  it('yields text deltas and a done event', async () => {
    const streamEvents: AssistantMessageEventStream = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'text_delta',
          contentIndex: 0,
          delta: 'Hel',
          partial: assistant([{ type: 'text', text: 'Hel' }]),
        }
        yield {
          type: 'text_delta',
          contentIndex: 0,
          delta: 'lo',
          partial: assistant([{ type: 'text', text: 'Hello' }]),
        }
        yield { type: 'done', reason: 'stop', message: assistant([{ type: 'text', text: 'Hello' }]) }
      },
    } as unknown as AssistantMessageEventStream

    const registry = {
      complete: async () => assistant([{ type: 'text', text: 'Hello' }]),
      stream: () => streamEvents,
    } as unknown as ModelRegistry

    const agent = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry,
    })
    const deltas: string[] = []
    let done = false
    for await (const ev of agent.runStream('hi')) {
      if (ev.type === 'text_delta') deltas.push(ev.delta)
      if (ev.type === 'done') done = true
    }
    expect(deltas.join('')).toBe('Hello')
    expect(done).toBe(true)
  })
})