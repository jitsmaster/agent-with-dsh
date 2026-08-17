/**
 * graph/sparc.ts — the SPARC development methodology as a graph preset.
 *
 * SPARC = Specification → Pseudocode → Architecture → Refinement → Completion
 * (from the Claude Flow / ruflo ecosystem). Each phase is an agent node with
 * its own system prompt; state flows phase to phase, and a verification loop
 * sends the work back to Refinement until it passes (bounded by maxReviews).
 *
 * Multi-agent fan-out: supply `workers` and the Refinement phase runs every
 * worker agent CONCURRENTLY over the architecture, merging their outputs —
 * parallel implementation, the way SPARC intends.
 *
 *   const { state } = await runSparc(
 *     { model: { provider: 'deepseek', model: 'deepseek-v4-flash' } },
 *     'Build a CLI that summarizes a git repo',
 *   )
 *   console.log(state.implementation)
 */
import { answerText, createAgent, type Agent } from '../agent.ts'
import type { ModelRegistry, ModelRoute } from '../model.ts'
import type { ToolSpec } from '../tools.ts'
import {
  agentNode,
  END,
  START,
  StateGraph,
  type CompiledGraph,
  type GraphState,
  type InvokeOptions,
} from './graph.ts'

/** State produced by a SPARC run. */
export interface SparcState extends GraphState {
  task: string
  spec?: string
  pseudocode?: string
  architecture?: string
  implementation?: string
  review?: string
  approved?: boolean
}

/** A concurrent implementation worker for the Refinement phase. */
export interface SparcWorker {
  /** Worker name (shown in the merged implementation). */
  name: string
  /** Extra instructions for this worker. */
  instructions?: string
  /** Override the model for this worker. */
  model?: ModelRoute
  /** Override tools for this worker. */
  tools?: ToolSpec[]
}

export interface SparcConfig {
  /** Model route for the phase agents (and workers by default). */
  model: ModelRoute
  /** Model registry; defaults to the shared one. */
  registry?: ModelRegistry
  /** Tools for the Refinement phase (e.g. bash, file tools). */
  tools?: ToolSpec[]
  /** Extra instructions appended to every phase prompt. */
  systemPrompt?: string
  /** Per-agent maxSteps. */
  maxSteps?: number
  /** Max review→refine loops. Default 2. */
  maxReviews?: number
  /** Concurrent implementation workers for Refinement (multi-agent fan-out). */
  workers?: SparcWorker[]
}

/** Build a compiled SPARC graph. */
export function sparcGraph(config: SparcConfig): CompiledGraph<SparcState> {
  const maxReviews = config.maxReviews ?? 2

  const specify = phaseAgent(config, 'Specification', SPECIFY_PROMPT, [])
  const pseudocode = phaseAgent(config, 'Pseudocode', PSEUDOCODE_PROMPT, [])
  const architect = phaseAgent(config, 'Architecture', ARCHITECT_PROMPT, [])
  const refine = refineAgent(config)
  const complete = phaseAgent(config, 'Completion', COMPLETE_PROMPT, [])
  const verify = verifyAgent(config)

  const graph = new StateGraph<SparcState>({ maxSteps: 8 + maxReviews * 4 })

  return graph
    .addNode('specify', specify)
    .addNode('pseudocode', pseudocode)
    .addNode('architect', architect)
    .addNode('refine', refine)
    .addNode('complete', complete)
    .addNode('verify', verify)
    .addEdge(START, 'specify')
    .addEdge('specify', 'pseudocode')
    .addEdge('pseudocode', 'architect')
    .addEdge('architect', 'refine')
    .addEdge('refine', 'complete')
    .addEdge('complete', 'verify')
    .addConditionalEdges('verify', (state) => (state.approved === true ? END : 'refine'))
    .compile()
}

/** Run a SPARC workflow end to end and return the final state. */
export async function runSparc(
  config: SparcConfig,
  task: string,
  options: InvokeOptions = {},
): Promise<{ state: SparcState; steps: number }> {
  const graph = sparcGraph(config)
  const events = []
  let finalState: SparcState = { task }
  for await (const ev of graph.stream({ task } as SparcState, options)) {
    events.push(ev)
    if (ev.type === 'done') finalState = ev.state
  }
  // stream() rethrows node errors, so reaching here means success.
  return { state: finalState, steps: events.filter((e) => e.type === 'node_end').length }
}

/** Build one phase agent node with its dedicated persona. */
function phaseAgent(
  config: SparcConfig,
  phase: string,
  instructions: string,
  tools: ToolSpec[],
  model?: ModelRoute,
) {
  const global = config.systemPrompt ? `\n\nGlobal instructions: ${config.systemPrompt}` : ''
  const agent = createAgent({
    model: model ?? config.model,
    registry: config.registry,
    maxSteps: config.maxSteps,
    systemPrompt: `You are the ${phase} phase of the SPARC development methodology.` +
      ` Work strictly within this phase; produce the deliverable described below. Be concrete and complete.` +
      `\n\n${instructions}${global}`,
    tools,
  })
  return agentNode<SparcState>(agent, { inputKey: 'task', outputKey: phase })
}

/** Refinement node: TDD implementation, optionally fanning out to workers. */
function refineAgent(config: SparcConfig) {
  const workers = config.workers
  if (!workers || workers.length === 0) {
    return phaseAgent(config, 'Refinement', REFINE_PROMPT, config.tools ?? [])
  }

  // Multi-agent fan-out: run every worker concurrently, merge outputs.
  return async (state: SparcState): Promise<Partial<SparcState>> => {
    const architecture = String(state.architecture ?? '')
    const spec = String(state.spec ?? '')
    const global = config.systemPrompt ? `\n\nGlobal instructions: ${config.systemPrompt}` : ''
    const workerAgents: Agent[] = workers.map((w) =>
      createAgent({
        model: w.model ?? config.model,
        registry: config.registry,
        maxSteps: config.maxSteps,
        systemPrompt:
          `You are a Refinement worker ("${w.name}") in the SPARC methodology.` +
          ` Implement YOUR assigned slice of the architecture below, test-first.` +
          (w.instructions ? `\n\nYour slice: ${w.instructions}` : '') +
          `\n\nReturn complete, runnable code for your slice.${global}`,
        tools: w.tools ?? config.tools ?? [],
      }),
    )

    const results = await Promise.all(
      workerAgents.map((a) =>
        a.run(
          `SPECIFICATION\n${spec}\n\nARCHITECTURE\n${architecture}\n\nImplement your slice now.`,
        ),
      ),
    )
    const merged = results
      .map((r, i) => `## ${workers[i]!.name}\n${answerText(r.final)}`)
      .join('\n\n---\n\n')
    return { implementation: merged }
  }
}

/** Verification node: review the implementation against the spec. */
function verifyAgent(config: SparcConfig) {
  const agent = createAgent({
    model: config.model,
    registry: config.registry,
    maxSteps: config.maxSteps,
    systemPrompt:
      `You are the Quality Review step of the SPARC methodology.` +
      ` Review the implementation against the specification and architecture.` +
      ` Decide: does it satisfy the spec? Reply with EXACTLY two lines:\n` +
      `APPROVED: yes|no\nREVIEW: <one paragraph of concrete findings>` +
      (config.systemPrompt ? `\n\nGlobal instructions: ${config.systemPrompt}` : ''),
  })
  return async (state: SparcState): Promise<Partial<SparcState>> => {
    const result = await agent.run(
      `SPECIFICATION\n${state.spec ?? ''}\n\nARCHITECTURE\n${state.architecture ?? ''}\n\nIMPLEMENTATION\n${state.implementation ?? ''}`,
    )
    const text = answerText(result.final)
    const approved = /APPROVED:\s*(yes|true)/i.test(text)
    return { review: text, approved }
  }
}

const SPECIFY_PROMPT = `Produce a precise specification for the task:
- Goals and non-goals
- Requirements (functional and non-functional) and constraints
- User stories / acceptance criteria
- Success metrics
- Open questions (state assumptions)
Be concise but complete: the next phases depend on this document.`

const PSEUDOCODE_PROMPT = `From the specification, produce high-level pseudocode / a step-by-step plan:
- Key algorithms and data flow
- Module boundaries
- Test plan (what tests must exist and what they verify)
Keep it language-agnostic; detailed decisions belong to the Architecture phase.`

const ARCHITECT_PROMPT = `From the specification and pseudocode, produce a concrete architecture:
- Components and their responsibilities
- Public interfaces / API contracts
- Data model / schema
- Infrastructure and integration points
- Risks and mitigations
Be concrete enough that a developer can implement without making design decisions.`

const REFINE_PROMPT = `Implement the architecture TEST-FIRST:
1. Write failing tests for the agreed acceptance criteria
2. Implement the minimum code to make them pass
3. Refactor for quality
4. Return the complete implementation: file list, the code, and the test results
Assume a normal Unix development environment. Be complete — no placeholders.`

const COMPLETE_PROMPT = `Finalize the deliverable from the implementation:
- Summarize what was built
- Verify it against the acceptance criteria
- Document usage (how to run / test)
- List known limitations and remaining work
Return the final handoff document.`