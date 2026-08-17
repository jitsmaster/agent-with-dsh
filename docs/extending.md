# Extending the framework

## 1. Add a tool (standalone)

```ts
import { createAgent, defineTool, Type } from './src/index.ts'

const weather = defineTool({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  parameters: Type.Object({ city: Type.String() }),
  run: async ({ city }) => {
    const res = await fetch(`https://api.example/weather?city=${city}`)
    return (await res.json()) as object
  },
})

const agent = createAgent({
  model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  tools: [weather],
})
```

The loop feeds the TypeBox schema to the model, validates the model's
arguments, executes `run`, and appends the result. `run` may return a string
or any JSON value.

## 2. Add a tool to the DSH profiles

Edit `examples/dsh-tools-plugin.ts` — it is inserted into both profiles by
absolute path. Re-run `bash bin/setup.sh` only if you changed the plugin
path; code edits are picked up on the next profile boot.

```ts
// examples/dsh-tools-plugin.ts (abridged)
import { defineTool, registerFrameworkTools } from '../src/index.ts'
import type { ToolRegistrant, ToolSpec } from '../src/index.ts'

export const myTools: ToolSpec[] = [
  defineTool({ name: 'current_time', /* ... */ }),
  // add yours here
]

export const inject = ['tools']   // Cordis: provide ctx.tools before apply
export function apply(ctx: ToolRegistrant): void {
  registerFrameworkTools(ctx, myTools)
}
```

## 3. Add a hook / inject context (agent/pre-step)

DSH plugins can observe and modify what the model sees on every step. A
context-injection plugin (the `time-context` pattern) appends a user message
with fresh information before each model request:

```ts
// examples/context-plugin.ts
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'

export const inject = ['agents']

export function apply(ctx: any): void {
  ctx.on('agent/pre-step', async ({ agent, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text: `Current time: ${new Date().toISOString()}` }],
          source: { kind: 'plugin', plugin: 'context-plugin', form: 'snapshot', sections: [{ name: 'context-plugin', text: 'time' }] },
        }),
      ],
    }
  }, { prepend: true })
}
```

Register it in the profile patch:

```yaml
- insert:
  - id: context-plugin
    name: '__REPO__/examples/context-plugin.ts'
```

(Then re-run `bin/setup.sh` so `__REPO__` is substituted.) See the DSH docs
`docs/user/develop/basic/index.md` and the installed
`handoff-on-compaction` plugin for more event patterns.

## 4. Build a workflow

See [graph-mode.md](graph-mode.md) for `StateGraph` and the SPARC preset.

## 5. New profile / deployment

- Copy `profiles/my-agent-headless` to `profiles/<name>`, adjust bundles
  and patch, re-run `bin/setup.sh`.
- Validate: `pnpm dsh --profile <name> --dump-config` (no boot, read-only).
- Boot: `pnpm dsh --profile <name> ...`.

## 6. Persist conversations (memory)

`createAgent` accepts a `memory`. The default is in-memory per instance;
`JsonlFileMemory` persists every message to a JSONL file so conversations
survive restarts (and can be inspected/replayed):

```ts
import { createAgent, JsonlFileMemory } from './src/index.ts'

const agent = createAgent({
  model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  memory: new JsonlFileMemory('./sessions/chat.jsonl'),
})

await agent.run('remember my name is Ada')   // run 1
await agent.run('what is my name?')          // run 2 — still knows
```

Each run appends the user message, assistant messages, and tool results to
memory, so multi-turn context is preserved automatically. Implement
`ConversationMemory` to plug in your own store (SQLite, Redis, ...).

## 7. Multi-agent teams

`AgentTeam` gives you a supervisor agent with a `delegate` tool; workers are
specialist agents the supervisor calls when it decides to:

```ts
import { AgentTeam, createAgent } from './src/index.ts'

const team = new AgentTeam({
  model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  systemPrompt: 'You are a project lead. Delegate focused subtasks to workers, then synthesize.',
  workers: [
    { name: 'writer', description: 'writes drafts', agent: createAgent({ model, systemPrompt: 'You are a writer.' }) },
    { name: 'critic', description: 'critiques drafts', agent: createAgent({ model, systemPrompt: 'You are a strict critic.' }) },
  ],
})
const { final } = await team.run('Draft a README for a CLI tool, then critique it.')
```

For fire-and-forget fan-out: `parallelAgents([a, b, c], task)` runs them
concurrently; `parallelNodes([n1, n2])` merges concurrent graph-node updates
inside a `StateGraph` workflow.

## 8. Subagents (lower-level)

`subagents` on an `Agent` is the primitive behind `AgentTeam`: the parent
gets a `subagent` tool and delegates to child agents (own model/tools/prompt):

```ts
const parent = createAgent({
  model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  subagents: [
    { name: 'researcher', description: 'researches topics', agent: researcher },
  ],
})
```

## 9. Skills (on-demand instructions)

Pass `skills` to an `Agent`: the catalog is listed in the system prompt and a
`use_skill` tool loads the instructions when the model asks — the same idea as
DSH's skill system, with no harness:

```ts
const agent = createAgent({
  model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  skills: [
    defineSkill({
      name: 'code-review',
      description: 'review a diff for correctness and style',
      instructions: '# Code review\nRun the tests, then check...',
    }),
  ],
})
```

## 10. Tools pipeline (middleware)

Guard every tool call with around-middleware — timeout, allowlist, logging, or
your own policy. Middleware runs in registration order and can wrap or
short-circuit:

```ts
agent.tools.use(timeoutMiddleware(30_000))        // kill slow calls
agent.tools.use(allowlistMiddleware(['read', 'write', 'search']))
agent.tools.use(logMiddleware('my-agent'))
agent.tools.use(async (call, next) => {
  const result = await next(call.args, call.ctx)
  return { ...result, content: result.content.slice(0, 2000) } // cap model-visible size
})
```

## 11. Publish / share

The framework is a plain npm package (`pnpm pack`, or set `private: false`
and `pnpm publish`). Profiles and plugins travel with the repo; consumers run
`bin/setup.sh` pointed at their checkout.