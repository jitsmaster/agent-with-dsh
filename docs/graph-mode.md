# Graph mode & the SPARC preset

## StateGraph — LangGraph-style workflows

A graph is nodes + edges over a typed state object. Nodes receive the current
state and return a **partial update** (merged in). Edges are fixed or
conditional; loops are allowed but bounded by `maxSteps`.

```ts
import { StateGraph, START, END } from './src/index.ts'

const g = new StateGraph<{ task: string; draft?: string; approved?: boolean }>()
  .addNode('draft', async (state) => ({ draft: `draft of: ${state.task}` }))
  .addNode('review', async (state) => ({ approved: (state.draft?.length ?? 0) > 5 }))
  .addEdge(START, 'draft')
  .addEdge('draft', 'review')
  .addConditionalEdges('review', (state) => (state.approved ? END : 'draft'))
  .compile()

const out = await g.invoke({ task: 'ship it' })
```

- `addNode(name, fn)` — fn: `(state, ctx) => Partial<state> | void`
- `addEdge(from, to)` — fixed edge; `to` may be `END`
- `addConditionalEdges(from, router)` — `router(state) => nodeName | END`
- `setEntryPoint(node)` — or `addEdge(START, node)`
- `compile()` — validates, returns `{ invoke, stream }`
- `stream(initial)` — yields `node_start` / `node_end` / `done` events

**Turn an agent into a node** with `agentNode`:

```ts
import { agentNode, createAgent, StateGraph, START, END } from './src/index.ts'

const writer = agentNode(createAgent({
  model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  systemPrompt: 'You are a writer.',
}), { inputKey: 'task', outputKey: 'draft' })
```

## SPARC preset

**SPARC** = **S**pecification → **P**seudocode → **A**rchitecture →
**R**efinement → **C**ompletion — a phased, test-first development
methodology (from the Claude Flow / ruflo ecosystem). The preset runs each
phase as an agent node with its own persona, then a **quality-review** node
that loops back to Refinement until the spec is satisfied (bounded).

```ts
import { runSparc } from './src/index.ts'

const { state, steps } = await runSparc(
  { model: { provider: 'deepseek', model: 'deepseek-v4-flash' } },
  'Write a TypeScript function isPalindrome(s: string): boolean with tests',
)
console.log(state.spec)            // specification
console.log(state.pseudocode)      // plan
console.log(state.architecture)    // design
console.log(state.implementation)  // code
console.log(state.review, state.approved)
```

State keys produced: `spec`, `pseudocode`, `architecture`,
`implementation`, `review`, `approved`.

**Options** (`SparcConfig`):

- `model`, `registry`, `maxSteps` — the phase agents' model
- `tools` — tools for the Refinement phase (e.g. bash, file tools)
- `systemPrompt` — extra global instructions for every phase
- `maxReviews` — review→refine loop cap (default 2)
- `workers` — **multi-agent fan-out**: run N worker agents concurrently on
  the architecture during Refinement and merge their outputs

```ts
const { state } = await runSparc({
  model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  workers: [
    { name: 'core', instructions: 'Implement the core logic + unit tests.' },
    { name: 'cli', instructions: 'Implement the CLI wrapper.' },
  ],
}, 'Build a palindrome checker CLI')
```

Each worker is its own agent (own system prompt; optional `model` / `tools`
overrides) running in `Promise.all` — parallel implementation, SPARC-style.

## Stream events

`graph.stream(initial)` and `agent.runStream(input)` both yield structured
events (`node_start`, `text_delta`, `tool_call`, `tool_result`, `done`,
`error`) — enough to build progress UIs, CLIs, or logs without parsing text.
