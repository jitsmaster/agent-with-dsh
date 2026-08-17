/**
 * agent.ts — the LangChain-style Agent.
 *
 * An Agent bundles a model route, a system prompt, and a tool registry into a
 * conversational loop: call the model, execute any tool calls it makes, feed
 * the results back, repeat, until it answers without tools.
 *
 *   const agent = createAgent({
 *     model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
 *     systemPrompt: 'You are a helpful assistant.',
 *     tools: [myTool],
 *   })
 *   const { final } = await agent.run('Summarize this repo')
 *
 * `run` returns the finished conversation; `runStream` yields token/tool
 * events as they happen (for CLIs, UIs, and progress bars).
 */
import {
  contentText,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type Message,
  type ToolCall,
  type ToolResultMessage,
  type UserMessage,
} from '@earendil-works/pi-ai'
import { InMemoryMemory, type ConversationMemory } from './memory.ts'
import { ModelRegistry, type ModelRoute } from './model.ts'
import { SkillRegistry, type Skill } from './skill.ts'
import { subagentTool, type SubagentSpec } from './subagent.ts'
import { ToolRegistry, type ToolSpec } from './tools.ts'

export interface AgentConfig {
  /** Which model + provider to talk to. */
  model: ModelRoute
  /** System prompt / persona. */
  systemPrompt?: string
  /** Tools the agent can call. */
  tools?: ToolSpec[]
  /** Model registry to use; defaults to a shared process-wide registry. */
  registry?: ModelRegistry
  /** Maximum model→tools→model iterations per run. Default 10. */
  maxSteps?: number
  /** Per-request output token cap. */
  maxTokens?: number
  /** Conversation memory; defaults to in-memory per Agent. */
  memory?: ConversationMemory
  /** Skills the agent can load on demand (adds a use_skill tool + catalog). */
  skills?: Skill[]
  /** Subagents the agent can delegate to (adds a subagent tool). */
  subagents?: SubagentSpec[]
}

export interface RunOptions {
  signal?: AbortSignal
  /** Override the agent's default maxSteps. */
  maxSteps?: number
}

/** The finished state of a run. */
export interface AgentRunResult {
  /** The final assistant message (the answer, or the last message if steps ran out). */
  final: AssistantMessage
  /** The whole conversation, including tool results. */
  messages: Message[]
  steps: number
  toolCalls: number
}

/** One event from `runStream`. */
export type AgentStreamEvent =
  | { type: 'model'; message: AssistantMessage }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; result: ToolResultMessage }
  | { type: 'step'; step: number }
  | { type: 'done'; result: AgentRunResult }
  | { type: 'error'; error: Error }

/** Shared model registry: five providers registered, ready to use. */
const sharedRegistry = new ModelRegistry()
sharedRegistry.registerOllama()

export class Agent {
  readonly model: ModelRoute
  readonly systemPrompt?: string
  readonly tools: ToolRegistry
  readonly registry: ModelRegistry
  readonly maxSteps: number
  readonly maxTokens?: number
  readonly memory: ConversationMemory
  readonly skills: SkillRegistry
  readonly subagents: readonly SubagentSpec[]

  constructor(config: AgentConfig) {
    this.model = config.model
    this.systemPrompt = config.systemPrompt
    this.tools = new ToolRegistry(config.tools ?? [])
    this.registry = config.registry ?? sharedRegistry
    this.maxSteps = config.maxSteps ?? 10
    this.maxTokens = config.maxTokens
    this.memory = config.memory ?? new InMemoryMemory()
    this.skills = new SkillRegistry(config.skills ?? [])
    if (this.skills.list().length > 0) {
      this.tools.register(this.skills.toUseSkillTool())
    }
    this.subagents = config.subagents ?? []
    if (this.subagents.length > 0) {
      this.tools.register(subagentTool(this.subagents))
    }
  }

  /** The conversation so far (from memory). */
  get messages(): Message[] {
    return this.memory.load()
  }

  /** Add a tool after construction (fluent). */
  withTool(spec: ToolSpec): this {
    this.tools.register(spec)
    return this
  }

  /** Add several tools after construction (fluent). */
  withTools(specs: ToolSpec[]): this {
    this.tools.registerMany(specs)
    return this
  }

  /** Run the loop to completion. Returns the full conversation. */
  async run(input: string | Message[], options: RunOptions = {}): Promise<AgentRunResult> {
    const initial = toMessages(input)
    const messages = [...this.memory.load(), ...initial]
    for (const msg of initial) this.memory.append(msg)
    const maxSteps = options.maxSteps ?? this.maxSteps
    let steps = 0
    let toolCalls = 0

    for (;;) {
      if (steps >= maxSteps) break
      steps++

      const response = await this.registry.complete(this.model, this.buildContext(messages), {
        signal: options.signal,
        maxTokens: this.maxTokens,
      })
      messages.push(response)
      this.memory.append(response)

      const calls = toolCallsOf(response)
      if (calls.length === 0) {
        return { final: response, messages, steps, toolCalls }
      }
      toolCalls += calls.length

      for (const call of calls) {
        const result = await this.executeTool(call, options.signal)
        messages.push(result)
        this.memory.append(result)
      }
    }

    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') {
      throw new Error(`agent reached maxSteps=${maxSteps} without an assistant message`)
    }
    return { final: last, messages, steps, toolCalls }
  }

  /** Run the loop, yielding model/tool events as they happen. */
  async *runStream(input: string | Message[], options: RunOptions = {}): AsyncGenerator<AgentStreamEvent> {
    const initial = toMessages(input)
    const messages = [...this.memory.load(), ...initial]
    for (const msg of initial) this.memory.append(msg)
    const maxSteps = options.maxSteps ?? this.maxSteps
    let steps = 0
    let toolCalls = 0

    try {
      for (;;) {
        if (steps >= maxSteps) break
        steps++
        yield { type: 'step', step: steps }

        const stream = this.registry.stream(this.model, this.buildContext(messages), {
          signal: options.signal,
          maxTokens: this.maxTokens,
        })
        let response: AssistantMessage | undefined
        for await (const ev of stream as AsyncIterable<AssistantMessageEvent>) {
          if (ev.type === 'text_delta') yield { type: 'text_delta', delta: ev.delta }
          else if (ev.type === 'thinking_delta') yield { type: 'thinking_delta', delta: ev.delta }
          else if (ev.type === 'toolcall_end') yield { type: 'tool_call', call: ev.toolCall }
          else if (ev.type === 'done') response = ev.message
          else if (ev.type === 'error') throw new Error(ev.error.errorMessage ?? 'model stream error')
        }
        if (!response) throw new Error('model stream ended without a message')
        messages.push(response)
        this.memory.append(response)
        yield { type: 'model', message: response }

        const calls = toolCallsOf(response)
        if (calls.length === 0) {
          yield { type: 'done', result: { final: response, messages, steps, toolCalls } }
          return
        }
        toolCalls += calls.length

        for (const call of calls) {
          const result = await this.executeTool(call, options.signal)
          messages.push(result)
          this.memory.append(result)
          yield { type: 'tool_result', result }
        }
      }

      const last = messages[messages.length - 1]
      if (!last || last.role !== 'assistant') {
        throw new Error(`agent reached maxSteps=${maxSteps} without an assistant message`)
      }
      yield { type: 'done', result: { final: last, messages, steps, toolCalls } }
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err : new Error(String(err)) }
    }
  }

  private buildContext(messages: Message[]): Context {
    const catalog = this.skills.list()
    const systemPrompt =
      catalog.length === 0
        ? this.systemPrompt
        : (this.systemPrompt ?? '') +
          '\n\nAvailable skills (call use_skill to load one):\n' +
          this.skills.toCatalogText()
    return {
      systemPrompt,
      messages,
      tools: this.tools.toPiTools(),
    }
  }

  private async executeTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResultMessage> {
    const result = await this.tools.execute(call.name, call.arguments, { signal })
    return {
      role: 'toolResult',
      toolCallId: call.id,
      toolName: call.name,
      content: [{ type: 'text', text: result.content }],
      details: result.details,
      isError: !result.ok,
      timestamp: Date.now(),
    }
  }
}

/** One-liner agent factory. */
export function createAgent(config: AgentConfig): Agent {
  return new Agent(config)
}

/** Normalize string or message input into a fresh conversation. */
export function toMessages(input: string | Message[]): Message[] {
  if (typeof input === 'string') {
    const user: UserMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    }
    return [user]
  }
  return [...input]
}

/** Extract tool calls from an assistant message. */
export function toolCallsOf(message: AssistantMessage): ToolCall[] {
  return message.content.filter((c): c is ToolCall => c.type === 'toolCall')
}

/** Extract the visible text of an assistant message. */
export function answerText(message: AssistantMessage): string {
  return contentText(message.content)
}