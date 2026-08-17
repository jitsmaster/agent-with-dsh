/**
 * dsh/bridge.ts — mount framework tools into a DeepSeek Harness profile.
 *
 * DSH tools are Cordis plugins that call `ctx.tools.register(defineTool(...))`.
 * This bridge converts framework `defineTool` specs (TypeBox schemas) into
 * DSH tool definitions, so the SAME tool implementation powers both the
 * standalone framework Agent and a DSH profile agent (headless CLI or web
 * GUI).
 *
 * Usage (see examples/dsh-tools-plugin.ts):
 *
 *   import type { Context } from '@deepseek-ai/cordis'
 *   import { registerFrameworkTools } from '<repo>/src/dsh/bridge.ts'
 *   import { myTools } from './my-tools.ts'
 *
 *   export function apply(ctx: Context) {
 *     registerFrameworkTools(ctx, myTools)
 *   }
 *
 * The plugin file is inserted into the profile by absolute path
 * (see bin/setup.sh and the profile patch templates).
 */
import type { ToolSpec } from '../tools.ts'

/**
 * Minimal structural view of the parts of a Cordis registrant we use, so this
 * module typechecks without a hard dependency on the harness packages.
 */
export interface ToolRegistrant {
  tools: {
    register(definition: unknown): unknown
  }
}

/**
 * Register framework tools on `ctx.tools` as DSH tools.
 * The canonical output of every bridged tool is its result stringified, and
 * the model sees exactly that text.
 */
export function registerFrameworkTools(ctx: ToolRegistrant, specs: ToolSpec[]): void {
  for (const spec of specs) {
    ctx.tools.register(toDshToolDefinition(spec))
  }
}

/** Convert one framework tool into the DSH ToolDefinition shape. */
export function toDshToolDefinition(spec: ToolSpec): unknown {
  return {
    name: spec.name,
    description: spec.description,
    parameters: toDshParameterSpec(spec.parameters),
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    async execute(args: unknown) {
      const result = await spec.run(args as never, {})
      return typeof result === 'string' ? result : JSON.stringify(result)
    },
  }
}

/**
 * Convert a TypeBox object schema into a full JSON Schema for
 * `ctx.tools.register` (TypeBox emits JSON-Schema-compatible objects; we
 * only strip TypeBox's non-schema keywords). The parameters must be an
 * object schema — tools receive object arguments.
 */
export function toDshParameterSpec(schema: unknown): Record<string, unknown> {
  const json = stripTypeboxKeywords(schema ?? {}) as Record<string, unknown>
  if (json.type !== 'object') {
    throw new Error('bridge: tool parameters must be a TypeBox Type.Object(...)')
  }
  return json
}

/** Remove TypeBox-only keywords that are not valid JSON Schema. */
function stripTypeboxKeywords(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripTypeboxKeywords)
  if (node === null || typeof node !== 'object') return node
  const record = node as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'kind' || key === 'modules') continue
    out[key] = stripTypeboxKeywords(value)
  }
  return out
}