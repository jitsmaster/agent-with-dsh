import type { AssistantMessage, Context } from '@earendil-works/pi-ai'
import type { ModelRegistry } from '../src/model.ts'

/** Build a fake assistant message for stub registries. */
export function assistant(
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
export function stubRegistry(responses: ((messages: Context) => AssistantMessage)[]): ModelRegistry {
  let i = 0
  return {
    complete: async (_route: unknown, context: Context) => {
      const fn = responses[Math.min(i, responses.length - 1)]!
      i++
      return fn(context)
    },
    stream: () => {
      throw new Error('stream stub not implemented')
    },
  } as unknown as ModelRegistry
}
