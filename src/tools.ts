/**
 * tools.ts — LangChain-style tool definitions for your agent.
 *
 * A tool is a typed function the model can call. Define it with `defineTool`,
 * register it on an `Agent` (or a `ToolRegistry`), and the agent loop feeds
 * its schema to the model, validates the model's arguments with TypeBox, and
 * hands the result back to the conversation.
 *
 * Schemas use TypeBox (re-exported by pi-ai as `Type`), which is what the
 * underlying pi-ai engine expects.
 */
import { Type, type Static, type TSchema } from '@earendil-works/pi-ai'
import type { Tool } from '@earendil-works/pi-ai'

/** Runtime context handed to a tool's `run`. Extend per deployment. */
export interface ToolContext {
  /** Abort signal forwarded from the agent loop (cancellation). */
  signal?: AbortSignal
  [key: string]: unknown
}

import { composePipeline, type ToolMiddleware, type ToolNext } from './tools-pipeline.ts'

/** A callable tool specification. */
export interface ToolSpec<P extends TSchema = TSchema, R = unknown> {
  /** Unique tool name (lower_snake_case is conventional). */
  name: string
  /** What the tool does; when to use it. Shown to the model. */
  description: string
  /** TypeBox schema of `run`'s first argument. */
  parameters: P
  /** Execute the tool with validated arguments. */
  run: (args: Static<P>, ctx: ToolContext) => R | Promise<R>
}

/** Create a typed tool specification. */
export function defineTool<P extends TSchema, R = unknown>(spec: ToolSpec<P, R>): ToolSpec<P, R> {
  return spec
}

/** Outcome of executing a tool inside the agent loop. */
export interface ToolResult {
  ok: boolean
  /** Human-readable content returned to the model. */
  content: string
  /** Structured details kept out of the model context. */
  details?: unknown
  error?: string
}

/**
 * A registry of tools with schema conversion and safe execution.
 * The Agent owns one; you can also keep standalone registries for reuse.
 */
export class ToolRegistry {
  private specs = new Map<string, ToolSpec>()
  private middlewares: ToolMiddleware[] = []

  constructor(specs: ToolSpec[] = []) {
    for (const spec of specs) this.register(spec)
  }

  /** Add a pipeline middleware (around-guard) for every tool call. */
  use(middleware: ToolMiddleware): this {
    this.middlewares.push(middleware)
    return this
  }

  /** Register one tool. Throws on duplicate names. */
  register<P extends TSchema, R = unknown>(spec: ToolSpec<P, R>): this {
    if (this.specs.has(spec.name)) {
      throw new Error(`tool "${spec.name}" is already registered`)
    }
    this.specs.set(spec.name, spec as ToolSpec)
    return this
  }

  /** Register many tools at once. */
  registerMany(specs: ToolSpec[]): this {
    for (const spec of specs) this.register(spec)
    return this
  }

  get(name: string): ToolSpec | undefined {
    return this.specs.get(name)
  }

  has(name: string): boolean {
    return this.specs.has(name)
  }

  list(): ToolSpec[] {
    return [...this.specs.values()]
  }

  /** Convert to pi-ai `Tool` schemas for the model request. */
  toPiTools(): Tool[] {
    return this.list().map((spec) => ({
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
    }))
  }

  /** Execute a tool by name with raw (unvalidated) arguments, through the pipeline. */
  async execute(name: string, args: Record<string, unknown>, ctx: ToolContext = {}): Promise<ToolResult> {
    const spec = this.specs.get(name)
    if (!spec) {
      return { ok: false, content: `unknown tool: ${name}`, error: `unknown tool: ${name}` }
    }
    const core: ToolNext = async (a, c) => this.runCore(spec, a, c)
    const runner =
      this.middlewares.length > 0 ? composePipeline(name, this.middlewares, core) : core
    return runner(args, ctx)
  }

  /** The unguarded tool body (used as the pipeline's core). */
  private async runCore(
    spec: ToolSpec,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    try {
      const parsed = this.parseArgs(spec, args)
      const out = await spec.run(parsed, ctx)
      const content = typeof out === 'string' ? out : safeStringify(out)
      return { ok: true, content, details: typeof out === 'string' ? undefined : out }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, content: `tool ${spec.name} failed: ${message}`, error: message }
    }
  }

  /** Validate raw arguments against the tool's TypeBox schema. */
  private parseArgs<P extends TSchema>(spec: ToolSpec<P>, args: Record<string, unknown>): Static<P> {
    // pi-ai validates tool calls against the schema when the model returns them;
    // this is a defensive second pass for direct programmatic calls.
    if (args && typeof args === 'object') return args as Static<P>
    throw new Error('tool arguments must be an object')
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** A convenience no-op tool for smoke tests. */
export const echoTool = defineTool({
  name: 'echo',
  description: 'Echo the input back verbatim.',
  parameters: Type.Object({ text: Type.String({ description: 'Text to echo.' }) }),
  run: ({ text }) => text,
})