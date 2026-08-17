/**
 * examples/dsh-tools-plugin.ts — YOUR DSH profile plugin.
 *
 * This file is inserted into the my-agent profiles by absolute path (see
 * bin/setup.sh). It registers the framework tools defined below on the DSH
 * tool registry, so a profile agent (headless CLI or web GUI) can call them.
 *
 * Add your own tools here (or import them from other files). For hooks and
 * context injection, see docs/extending.md.
 */
import { Type } from '@earendil-works/pi-ai'
import { defineTool, registerFrameworkTools } from '../src/index.ts'
import type { ToolRegistrant, ToolSpec } from '../src/index.ts'

/** Tools your agent can call. Extend freely. */
export const myTools: ToolSpec[] = [
  defineTool({
    name: 'current_time',
    description: 'Return the current date and time (ISO 8601, local timezone).',
    parameters: Type.Object({}),
    run: () => new Date().toISOString(),
  }),
  defineTool({
    name: 'add_numbers',
    description: 'Add two numbers together and return the sum.',
    parameters: Type.Object({
      a: Type.Number({ description: 'First addend.' }),
      b: Type.Number({ description: 'Second addend.' }),
    }),
    run: ({ a, b }) => String(a + b),
  }),
]

/** Cordis plugin entry: the profile loader calls apply(ctx) at boot. */

/** Declare the tool-registry service dependency so ctx.tools exists in apply. */
export const inject = ['tools']

export function apply(ctx: ToolRegistrant): void {
  registerFrameworkTools(ctx, myTools)
}