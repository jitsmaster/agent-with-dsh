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

## 6. Publish / share

The framework is a plain npm package (`pnpm pack`, or set `private: false`
and `pnpm publish`). Profiles and plugins travel with the repo; consumers run
`bin/setup.sh` pointed at their checkout.
