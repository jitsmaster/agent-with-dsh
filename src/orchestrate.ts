/**
 * orchestrate.ts — multi-agent patterns.
 *
 * - `AgentTeam`: a supervisor agent that delegates subtasks to specialist
 *   worker agents through a `delegate` tool (LangChain supervisor pattern).
 * - `parallelAgents`: run several agents concurrently on one task.
 * - `parallelNodes`: run several graph nodes concurrently on the same state
 *   and merge their partial updates (for StateGraph workflows).
 */
import { Type } from '@earendil-works/pi-ai'
import { answerText, createAgent, type Agent, type AgentConfig, type RunOptions } from './agent.ts'
import type { ModelRegistry, ModelRoute } from './model.ts'
import { defineTool } from './tools.ts'
import type { GraphNode, GraphState } from './graph/graph.ts'

/** A specialist agent available to a team's supervisor. */
export interface TeamWorker {
  name: string
  description: string
  agent: Agent
}

export interface AgentTeamConfig {
  model: ModelRoute
  systemPrompt?: string
  registry?: ModelRegistry
  workers: TeamWorker[]
  maxSteps?: number
}

/**
 * A supervisor/worker team. The supervisor is an Agent with a `delegate`
 * tool; when it calls `delegate`, the named worker runs to completion and
 * its answer is returned as the tool result. The supervisor decides who does
 * what, then synthesizes the final answer.
 */
export class AgentTeam {
  readonly supervisor: Agent
  readonly workers: readonly TeamWorker[]

  constructor(config: AgentTeamConfig) {
    this.workers = config.workers
    const delegate = defineTool({
      name: 'delegate',
      description:
        'Delegate a subtask to a specialist agent and return its result. ' +
        'Workers: ' +
        config.workers.map((w) => `${w.name}: ${w.description}`).join('; '),
      parameters: Type.Object({
        worker: Type.String({ description: 'The worker name to delegate to.' }),
        task: Type.String({ description: 'The subtask for the worker, self-contained.' }),
      }),
      run: async ({ worker, task }) => {
        const target = config.workers.find((w) => w.name === worker)
        if (!target) {
          throw new Error(`unknown worker "${worker}" (known: ${config.workers.map((w) => w.name).join(', ')})`)
        }
        const result = await target.agent.run(task)
        return answerText(result.final)
      },
    })
    this.supervisor = createAgent({
      model: config.model,
      systemPrompt: config.systemPrompt,
      registry: config.registry,
      tools: [delegate],
      maxSteps: config.maxSteps,
    })
  }

  run(task: string, options?: RunOptions) {
    return this.supervisor.run(task, options)
  }

  runStream(task: string, options?: RunOptions) {
    return this.supervisor.runStream(task, options)
  }
}

/** A one-line team factory. */
export function createAgentTeam(config: AgentTeamConfig): AgentTeam {
  return new AgentTeam(config)
}

/**
 * Run several agents concurrently on the same task; returns their answers in
 * input order.
 */
export async function parallelAgents(
  agents: Agent[],
  task: string,
  options?: RunOptions,
): Promise<string[]> {
  const results = await Promise.all(agents.map((a) => a.run(task, options)))
  return results.map((r) => answerText(r.final))
}

/**
 * Run several graph nodes concurrently on the same state and merge their
 * partial updates (last write wins per key). Use inside workflows that want
 * parallel branches that rejoin before the next node.
 */
export function parallelNodes<S extends GraphState = GraphState>(nodes: GraphNode<S>[]): GraphNode<S> {
  return async (state, ctx) => {
    const parts = await Promise.all(nodes.map((node) => node(state, ctx)))
    const merged = {} as Partial<S>
    for (const part of parts) {
      if (part === undefined || part === null) continue
      Object.assign(merged, part)
    }
    return merged
  }
}

export type { AgentConfig }