# agent-with-dsh

A **LangChain-style TypeScript framework** for building **your own agent** on the
**DeepSeek Harness (DSH)** — configurable LLM providers, tools, graph
workflows, a ready-made **SPARC** development methodology, and a guide for
extending everything.

Your agent is a small stack:

- **Agent core** — LangChain-style loop (model + system prompt + tools),
  `run` and `runStream`
- **ToolRegistry / defineTool** — typed tools with TypeBox schemas
- **ModelRegistry** — DeepSeek, OpenAI, Anthropic, OpenRouter, Ollama + any
  OpenAI-compatible endpoint
- **StateGraph / SPARC** — LangGraph-style workflows; the 5-phase SPARC
  development methodology as a graph with multi-agent fan-out
- **DSH bridge + profiles** — deploy the same tools and providers inside a
  DeepSeek Harness profile: one-shot CLI or interactive web GUI

Everything runs on **pi-ai** (`@earendil-works/pi-ai`) — the same multi-provider
engine the DeepSeek Harness uses — so model behavior is identical whether you
drive your agent from a Node script or from a DSH profile.

---

## Quickstart

```bash
# 1. Install dependencies
pnpm install

# 2. Install the DSH profiles (my-agent-headless, my-agent-web) into ~/.dsh
bash bin/setup.sh

# 3. Set at least one provider key (see docs/providers.md)
cp .env.example .env   # then fill in DEEPSEEK_API_KEY=sk-...

# 4. Use your agent
pnpm dsh --profile my-agent-headless "summarize this repo"   # one-shot CLI
pnpm dsh --profile my-agent-web                             # interactive web GUI
```

Or drive the framework from TypeScript directly:

```ts
// examples/simple-agent.ts
import { createAgent, defineTool, Type } from './src/index.ts'

const agent = createAgent({
  model: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  systemPrompt: 'You are a terse assistant.',
  tools: [
    defineTool({
      name: 'shout',
      description: 'Uppercase the input.',
      parameters: Type.Object({ text: Type.String() }),
      run: ({ text }) => text.toUpperCase(),
    }),
  ],
})

const { final } = await agent.run('Say hello and shout it.')
```

Run it: `npx tsx examples/simple-agent.ts`

---

## What you get

| Layer | Files | Purpose |
|---|---|---|
| Agent core | `src/agent.ts` | LangChain-style loop, `run` / `runStream` |
| Tools | `src/tools.ts` | `defineTool` (TypeBox schemas), `ToolRegistry` |
| Models | `src/model.ts` | `ModelRegistry` — 5 providers + any OpenAI-compatible endpoint |
| Graph | `src/graph/graph.ts` | LangGraph-style `StateGraph` (nodes, edges, conditional routing, loops) |
| Memory | `src/memory.ts` | Conversation memory: in-memory or JSONL-file persistence across restarts |
| Teams | `src/orchestrate.ts` | Multi-agent: supervisor/worker `AgentTeam`, `parallelAgents`, `parallelNodes` |
| SPARC | `src/graph/sparc.ts` | 5-phase SPARC methodology as a graph, multi-agent fan-out |
| DSH bridge | `src/dsh/` | Mount framework tools inside DSH profiles; provider config |
| Profiles | `profiles/` | Ready-made `my-agent-headless` + `my-agent-web` |
| Setup | `bin/setup.sh` | Install profiles into `~/.dsh`, validate composition |
| Guide | `docs/` | How everything works and how to extend it |

---

## The three ways to use it

1. **Standalone TypeScript API** — `createAgent`, `StateGraph`, `runSparc`
   in any Node process. Ideal for scripts, tests, and embedding.
   -> [docs/architecture.md](docs/architecture.md)

2. **DSH profiles** — deploy the same tools and providers into a DeepSeek
   Harness profile: one-shot CLI (`my-agent-headless`) or the interactive web
   GUI (`my-agent-web`). -> [docs/dsh-integration.md](docs/dsh-integration.md)

3. **Graph mode / SPARC** — orchestrate multi-phase, multi-agent workflows as
   graphs; the built-in SPARC preset runs Specification -> Pseudocode ->
   Architecture -> Refinement -> Completion with a quality-review loop.
   -> [docs/graph-mode.md](docs/graph-mode.md)

4. **Memory & multi-agent teams** — persist conversations with `JsonlFileMemory`,
   and compose agents with the supervisor/worker `AgentTeam` or `parallelAgents`.
   -> [docs/extending.md](docs/extending.md)

---

## Providers (configurable, no code changes)

| Provider | Env var | Default model |
|---|---|---|
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-v4-flash` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` |
| OpenRouter | `OPENROUTER_API_KEY` | `deepseek/deepseek-chat` |
| Ollama (local, keyless) | — | `llama3.2` |

Switch models by changing one line — standalone:
`model: { provider, model }`; profiles:
`~/.dsh/profiles/my-agent-*/cordis.patch.yml` (or live via
`~/.dsh/settings.yaml`). Any OpenAI-compatible endpoint (vLLM, LM Studio, a
proxy, a gateway) is configuration, not code. -> [docs/providers.md](docs/providers.md)

---

## Extending

- **Persist conversations**: pass `JsonlFileMemory` to `createAgent` (durable
  across restarts).
- **Compose agents**: `AgentTeam` (supervisor delegates to workers) or
  `parallelAgents` / `parallelNodes` for fan-out.
- **Add a tool**: `defineTool` in your agent's `tools` array, or in
  `examples/dsh-tools-plugin.ts` to expose it to the DSH profiles.
- **Add a hook / context injection**: listen on DSH events (`agent/pre-step`,
  `session/event`) from a plugin — see [docs/extending.md](docs/extending.md).
- **Build a workflow**: `StateGraph` nodes/edges — see
  [docs/graph-mode.md](docs/graph-mode.md).
- **New profile / endpoint**: edit `profiles/*`, re-run `bin/setup.sh`,
  validate with `pnpm dsh --profile <name> --dump-config`.

---

## Development

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest (tools, agent loop, graph, SPARC, providers, bridge)
pnpm dev         # tsx REPL for poking at the API
```

## Layout

```
agent-with-dsh/
+-- src/               framework source (TS)
|   +-- agent.ts       Agent loop + streaming
|   +-- tools.ts       defineTool + ToolRegistry
|   +-- model.ts       ModelRegistry (5 providers)
|   +-- graph/         StateGraph runtime + SPARC preset
|   +-- dsh/           bridge into DSH profiles (tools + provider config)
+-- profiles/          profile templates (headless, web)
+-- examples/          runnable examples (simple agent, SPARC, DSH plugin)
+-- tests/             vitest suite
+-- docs/              the guide
+-- bin/setup.sh       installs profiles into ~/.dsh
+-- .env.example       provider key template
```

---

## How it relates to the DeepSeek Harness

DSH is a Cordis plugin framework: a running agent is a **profile** (bundle list
+ patch layers) that composes plugins. This framework adds three things on top:
a **LangChain-like TS API** for authoring agent behavior, a **configurable
provider layer** (via pi-ai, the same engine DSH's own adapter uses), and
**ready-made profiles** wired to your framework tools. The framework's tools
run standalone *or* are bridged into a DSH profile with one function call
(`registerFrameworkTools`). See [docs/architecture.md](docs/architecture.md).