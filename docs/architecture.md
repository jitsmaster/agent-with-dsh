# Architecture

## Layers

```
┌───────────────────────────────────────────────────────────────┐
│ Your agent (src/, examples/)                                   │
│  Agent  ·  ToolRegistry  ·  StateGraph  ·  SPARC preset        │
├───────────────────────────────────────────────────────────────┤
│ ModelRegistry (src/model.ts)                                   │
│  wraps @earendil-works/pi-ai — provider factories + routes     │
├───────────────────────────────────────────────────────────────┤
│ pi-ai engine (same library the DSH adapter dsh-llm-pi-ai uses) │
├───────────────────────────────────────────────────────────────┤
│ DSH bridge (src/dsh/) + profiles/                             │
│  registerFrameworkTools · renderProvidersPatch · setup.sh      │
└───────────────────────────────────────────────────────────────┘
```

Two independent execution paths share one set of sources:

**Path A — standalone.** Your Node script imports the framework directly,
creates a `ModelRegistry` (pi-ai), an `Agent`, and runs it. Sessions and
conversations live in your process. Great for scripts, tests, CI, embedding.

**Path B — DSH profile.** `bin/setup.sh` installs `my-agent-headless` and
`my-agent-web` into `~/.dsh/profiles/`. DSH boots the profile, loads your
plugin (`examples/dsh-tools-plugin.ts`), and the harness's own agent loop
drives the model — with DSH sessions, subagents, goals, sandboxing, and the web
GUI for free. Your tools and providers are shared with Path A.

## How DSH composes a profile

A DSH profile is a directory under `$DSH_HOME/profiles/<name>` containing:

1. `package.json` with `dsh.profile.bundles` — the ordered bundle list.
   The framework profiles use `@deepseek-ai/dsh-base` plus the mode bundle
   (`@deepseek-ai/dsh-headless` or `@deepseek-ai/dsh-web-app`).
2. `cordis.patch.yml` — the user patch layer, applied after every bundle.
   This is where the framework wires providers, the default model, the
   persona, and inserts your plugin.
3. `pnpm-workspace.yaml` — pnpm settings for out-of-tree plugins.

Boot order: bundle patches (base, then headless/web), then the profile patch,
then `$DSH_HOME/cordis.patch.yml`, then any `--patch` overlays. Later layers
override earlier rows by id; `- insert:` lists add new rows.

The framework's profile patch does four things (see
`profiles/my-agent-headless/cordis.patch.yml`):

```yaml
- id: llm-pi-ai            # 1. activate the multi-provider adapter with routes
  config:
    providers: { deepseek: {...}, openai: {...}, anthropic: {...},
                 openrouter: {...}, ollama: {...} }
- id: agent-default-model  # 2. default model route
  config: { provider: deepseek, model: deepseek-v4-flash }
- id: system-prompt        # 3. persona
  config: { persona: '...' }
- insert:                  # 4. your plugin (absolute path, from setup.sh)
  - id: my-agent-tools
    name: '__REPO__/examples/dsh-tools-plugin.ts'
```

## Why pi-ai?

pi-ai is a unified LLM API with per-provider catalogs (endpoints, models,
auth), tool calling, streaming, thinking/reasoning, token/cost accounting, and
a `createProvider` escape hatch for any OpenAI-compatible endpoint. The DSH
adapter `@deepseek-ai/dsh-llm-pi-ai` is a thin Cordis wrapper over the same
library — so the standalone framework and the profiles behave identically.

## The tool bridge

Framework `defineTool` specs use TypeBox schemas; DSH tools expect JSON
Schema. `toDshParameterSpec` strips TypeBox-only keywords and passes the
schema through; `toDshToolDefinition` wraps the `run` function in a DSH
`ToolDefinition` (canonical output: the result stringified). The plugin
declares `export const inject = ['tools']` so Cordis provides `ctx.tools`
before `apply` runs. See [dsh-integration.md](dsh-integration.md).
