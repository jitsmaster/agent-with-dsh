/**
 * subagent.ts — framework-native subagents (no harness needed).
 *
 * A subagent is a child Agent (same process, own model/tools/prompt) that the
 * parent can call through a `subagent` tool. The parent decides when to
 * delegate; the child runs to completion and its answer is returned as the
 * tool result. This is the primitive behind `AgentTeam`'s `delegate` tool.
 */
import { contentText, Type } from '@earendil-works/pi-ai'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import type { Agent } from './agent.ts'
import { defineTool, type ToolSpec } from './tools.ts'

/** A child agent available to a parent. */
export interface SubagentSpec {
  name: string
  description: string
  agent: Agent
}

/** Build the model-facing `subagent` tool for a set of subagents. */
export function subagentTool(specs: readonly SubagentSpec[]): ToolSpec {
  return defineTool({
    name: 'subagent',
    description:
      'Run a subagent on a self-contained task and return its final answer. ' +
      'Subagents:\n' +
      specs.map((s) => `- ${s.name}: ${s.description}`).join('\n'),
    parameters: Type.Object({
      subagent: Type.String({ description: 'The subagent name to run.' }),
      task: Type.String({ description: 'The self-contained task for the subagent.' }),
    }),
    run: async ({ subagent, task }) => {
      const target = specs.find((s) => s.name === subagent)
      if (!target) {
        throw new Error(`unknown subagent "${subagent}" (available: ${specs.map((s) => s.name).join(', ')})`)
      }
      const result = await target.agent.run(task)
      return contentText(result.final.content)
    },
  })
}

/** Small helper so callers don't need pi-ai imports. */
export function subagentAnswer(message: AssistantMessage): string {
  return contentText(message.content)
}