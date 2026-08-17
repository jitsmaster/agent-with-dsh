/**
 * graph/graph.ts — a minimal LangGraph-style graph runtime.
 *
 * Compose an agentic workflow as nodes and edges over a typed state object.
 * Nodes receive the current state and return a partial update (merged in).
 * Edges are fixed or conditional (router functions pick the next node at
 * runtime). Loops are allowed but bounded by maxSteps.
 *
 *   const g = new StateGraph()
 *     .addNode('draft', draftNode)
 *     .addNode('review', reviewNode)
 *     .addEdge(START, 'draft')
 *     .addEdge('draft', 'review')
 *     .addConditionalEdges('review', (s) => s.passed ? END : 'draft')
 *     .setEntryPoint(START)
 *   const out = await g.compile().invoke({ task: '...' })
 */
import { Agent, answerText, createAgent, type AgentConfig } from '../agent.ts'

/** Sentinel node names. */
export const START = '__start__'
export const END = '__end__'

/** Workflow state: any JSON-ish object. */
export type GraphState = Record<string, unknown>

/** Context passed to every node invocation. */
export interface GraphContext {
  /** Total step count so far (increments per node visit). */
  step: number
  /** Abort signal from the caller. */
  signal?: AbortSignal
  /** The graph being executed (for self-reference / introspection). */
  graph: string
}

/** A graph node: read state, return a partial state update (or nothing). */
export type GraphNode<S extends GraphState = GraphState> = (
  state: S,
  ctx: GraphContext,
) => Partial<S> | Promise<Partial<S>> | void

/** Router: pick the next node from the current state. */
export type GraphRouter<S extends GraphState = GraphState> = (state: S) => string

export interface GraphOptions {
  /** Hard cap on node visits before the graph aborts. Default 50. */
  maxSteps?: number
}

export interface InvokeOptions {
  signal?: AbortSignal
  /** Per-invocation maxSteps override. */
  maxSteps?: number
}

export type GraphEvent<S extends GraphState = GraphState> =
  | { type: 'node_start'; node: string; step: number }
  | { type: 'node_end'; node: string; step: number; state: S }
  | { type: 'done'; state: S; steps: number }
  | { type: 'error'; error: Error }

export interface CompiledGraph<S extends GraphState = GraphState> {
  /** Execute the graph from START to END with an initial state. */
  invoke(initial: S, options?: InvokeOptions): Promise<S>
  /** Execute, yielding node events. */
  stream(initial: S, options?: InvokeOptions): AsyncGenerator<GraphEvent<S>>
}

export class StateGraph<S extends GraphState = GraphState> {
  private nodes = new Map<string, GraphNode<S>>()
  private edges = new Map<string, string>()
  private routers = new Map<string, GraphRouter<S>>()
  private entry: string = START
  private maxSteps: number

  constructor(options: GraphOptions = {}) {
    this.maxSteps = options.maxSteps ?? 50
  }

  /** Register a node by name. */
  addNode(name: string, node: GraphNode<S>): this {
    if (name === START || name === END) {
      throw new Error(`"${name}" is a reserved graph name`)
    }
    if (this.nodes.has(name)) throw new Error(`node "${name}" already registered`)
    this.nodes.set(name, node)
    return this
  }

  /** Fixed edge: after `from` finishes, go to `to`. */
  addEdge(from: string, to: string): this {
    if (from === END) throw new Error('cannot add an edge FROM END')
    if (this.routers.has(from)) {
      throw new Error(`"${from}" already has conditional edges`)
    }
    this.edges.set(from, to)
    return this
  }

  /** Conditional edges: `router(state)` returns the next node. */
  addConditionalEdges(from: string, router: GraphRouter<S>): this {
    if (from === END) throw new Error('cannot add conditional edges FROM END')
    this.routers.set(from, router)
    this.edges.delete(from)
    return this
  }

  setEntryPoint(node: string): this {
    if (node !== START && !this.nodes.has(node)) {
      throw new Error(`entry point "${node}" is not a registered node`)
    }
    this.entry = node
    return this
  }

  /** Validate and return a runnable graph. */
  compile(): CompiledGraph<S> {
    const entry = this.entry
    if (entry === START) {
      // No explicit START edge: require a single node with no incoming edge,
      // or an explicit START -> node edge. Simplest contract: START must have
      // an edge to a node, or entryPoint must be set.
      const startEdge = this.edges.get(START)
      if (startEdge === undefined || !this.nodes.has(startEdge)) {
        throw new Error(
          'graph has no entry: call setEntryPoint(node) or addEdge(START, node)',
        )
      }
    }
    for (const [from, to] of this.edges) {
      if (to !== END && !this.nodes.has(to)) {
        throw new Error(`edge "${from} -> ${to}" targets an unknown node`)
      }
    }
    return new CompiledGraphImpl(this.nodes, this.edges, this.routers, entry, this.maxSteps)
  }
}

class CompiledGraphImpl<S extends GraphState> implements CompiledGraph<S> {
  constructor(
    private readonly nodes: Map<string, GraphNode<S>>,
    private readonly edges: Map<string, string>,
    private readonly routers: Map<string, GraphRouter<S>>,
    private readonly entry: string,
    private readonly maxSteps: number,
  ) {}

  async invoke(initial: S, options: InvokeOptions = {}): Promise<S> {
    const out = await this.collect(initial, options)
    return out.state
  }

  async *stream(initial: S, options: InvokeOptions = {}): AsyncGenerator<GraphEvent<S>> {
    const out = await this.collect(initial, options, true)
    for (const ev of out.events) yield ev
  }

  private async collect(
    initial: S,
    options: InvokeOptions,
    wantEvents = false,
  ): Promise<{ state: S; events: GraphEvent<S>[] }> {
    const events: GraphEvent<S>[] = []
    let state: S = { ...initial }
    let current = this.entry
    if (current === START) {
      // START is a sentinel, not a node: follow the START edge to the first node.
      current = this.edges.get(START) ?? END
    }
    let step = 0
    const maxSteps = options.maxSteps ?? this.maxSteps

    try {
      while (current !== END) {
        if (step >= maxSteps) {
          throw new Error(`graph exceeded maxSteps=${maxSteps} (possible infinite loop)`)
        }
        step++

        const node = this.nodes.get(current)
        if (!node) {
          throw new Error(`graph reached unknown node "${current}"`)
        }
        if (wantEvents) events.push({ type: 'node_start', node: current, step })
        const partial = await node(state, { step, signal: options.signal, graph: current })
        if (partial !== undefined && partial !== null) {
          state = { ...state, ...partial }
        }
        if (wantEvents) events.push({ type: 'node_end', node: current, step, state })

        const router = this.routers.get(current)
        if (router) {
          const next = router(state)
          if (next !== END && !this.nodes.has(next)) {
            throw new Error(`router returned unknown node "${next}"`)
          }
          current = next
        } else {
          current = this.edges.get(current) ?? END
        }
      }
      if (wantEvents) events.push({ type: 'done', state, steps: step })
      return { state, events }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (wantEvents) events.push({ type: 'error', error })
      throw error
    }
  }
}

/** Options for turning an Agent into a graph node. */
export interface AgentNodeOptions {
  /** State key to read the task from. Default 'input'. */
  inputKey?: string
  /** State key to write the answer to. Default 'output'. */
  outputKey?: string
  /** Extra state keys to inject into the prompt (JSON). */
  contextKeys?: string[]
  /** Per-invocation maxSteps. */
  maxSteps?: number
}

/**
 * Wrap an Agent as a graph node: reads `state[inputKey]` (plus context keys)
 * as the prompt, runs the agent to completion, and writes the answer text to
 * `state[outputKey]`. Used by the SPARC preset and custom workflows.
 */
export function agentNode<S extends GraphState = GraphState>(
  agent: Agent | AgentConfig,
  options: AgentNodeOptions = {},
): GraphNode<S> {
  const resolved = agent instanceof Agent ? agent : createAgent(agent)
  const inputKey = options.inputKey ?? 'input'
  const outputKey = options.outputKey ?? 'output'
  const contextKeys = options.contextKeys ?? []

  return async (state, ctx): Promise<Partial<S>> => {
    const task = String(state[inputKey] ?? '')
    const extras = contextKeys
      .filter((k) => k in state)
      .map((k) => `${k}: ${JSON.stringify(state[k])}`)
      .join('\n')
    const prompt = extras ? `${extras}\n\nTask:\n${task}` : task
    const result = await resolved.run(prompt, { signal: ctx.signal, maxSteps: options.maxSteps })
    return { [outputKey]: answerText(result.final) } as Partial<S>
  }
}