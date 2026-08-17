/**
 * tools-pipeline.ts — a DSH-style pipeline for tool execution (no harness).
 *
 * Middleware wraps tool execution like DSH's tools/* guards: observe, filter,
 * transform, time out, or short-circuit. Registered on a `ToolRegistry` (or
 * a whole `Agent`), every middleware sees each call before the tool runs and
 * the result after.
 */
import type { ToolContext, ToolResult } from './tools.ts'

/** The execution of one tool call with its validated arguments. */
export interface ToolCallEnvelope {
  name: string
  args: Record<string, unknown>
  ctx: ToolContext
}

/** Continue to the next middleware / the tool itself. */
export type ToolNext = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>

/**
 * Around-middleware: receives the call envelope and a `next` that runs the
 * rest of the chain. Return a result to short-circuit; call `next` to
 * continue (possibly wrapping the result it returns).
 */
export type ToolMiddleware = (
  call: ToolCallEnvelope,
  next: ToolNext,
) => Promise<ToolResult>

/**
 * Compose middlewares around a core executor. Middlewares run in registration
 * order; each can short-circuit or wrap.
 */
export function composePipeline(
  name: string,
  middlewares: ToolMiddleware[],
  core: ToolNext,
): ToolNext {
  return middlewares.reduceRight<ToolNext>(
    (next, middleware) => (args, ctx) => middleware({ name, args, ctx }, next),
    core,
  )
}

/** Built-in: reject calls that take longer than `ms` (cooperative timeout). */
export function timeoutMiddleware(ms: number): ToolMiddleware {
  return async (call, next) => {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<ToolResult>((resolve) => {
      timer = setTimeout(() => {
        resolve({
          ok: false,
          content: `tool "${call.name}" timed out after ${ms}ms`,
          error: `timed out after ${ms}ms`,
        })
      }, ms)
    })
    try {
      return await Promise.race([next(call.args, call.ctx), timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

/** Built-in: only allow listed tool names; block everything else. */
export function allowlistMiddleware(names: string[]): ToolMiddleware {
  const allowed = new Set(names)
  return async (call, next) => {
    if (!allowed.has(call.name)) {
      return {
        ok: false,
        content: `tool "${call.name}" is not allowed`,
        error: `not allowed: ${call.name}`,
      }
    }
    return next(call.args, call.ctx)
  }
}

/** Built-in: log every call + outcome (to console). */
export function logMiddleware(label = 'tool'): ToolMiddleware {
  return async (call, next) => {
    const started = Date.now()
    const result = await next(call.args, call.ctx)
    console.log(`[${label}] ${call.name} ${result.ok ? 'ok' : 'error'} in ${Date.now() - started}ms`)
    return result
  }
}