# Providers

The framework talks to models through **pi-ai** — the same engine the DSH
adapter uses — so the five documented providers are configuration, not code.

## Standalone (TypeScript API)

Keys are read from the process environment. Copy `.env.example` to `.env`
and fill in the keys you use (the framework reads `.env` if you load it; a
plain shell export works too):

| Provider | Env var | Default model | Notes |
|---|---|---|---|
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-v4-flash` | Official API |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` | |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` | Claude models |
| OpenRouter | `OPENROUTER_API_KEY` | `deepseek/deepseek-chat` | One key, many models |
| Ollama | none (keyless) | `llama3.2` | Local server at `http://localhost:11434/v1` |

```ts
import { ModelRegistry } from './src/index.ts'

const registry = new ModelRegistry()          // registers all catalog providers
registry.registerOllama()                     // adds the keyless local server

const answer = await registry.complete(
  { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  { systemPrompt: 'You are terse.', messages: [{ role: 'user', content: 'hi', timestamp: Date.now() }] },
)
```

The shared registry used by `createAgent` already includes Ollama, so agents
can use any of the five out of the box.

## DSH profiles

The same routes are configured in the profile patch on the `llm-pi-ai` row
(pi-ai adapter). Keys resolve through the harness credential store
(`~/.dsh/.credentials.yaml`) or the process environment — never inline them
in the patch. To change the default model, edit:

`~/.dsh/profiles/my-agent-headless/cordis.patch.yml` (headless) or
`~/.dsh/profiles/my-agent-web/cordis.patch.yml` (web):

```yaml
- id: agent-default-model
  config:
    provider: deepseek      # deepseek | openai | anthropic | openrouter | ollama
    model: deepseek-v4-flash
```

The web GUI can also switch models per session; the Models page writes
`~/.dsh/settings.yaml` (`llm-pi-ai:` section), which overrides the patch at
runtime.

## Custom OpenAI-compatible endpoints

Any endpoint that speaks the OpenAI chat-completions protocol is
configuration, not code — vLLM, LM Studio, a corporate proxy, a gateway:

```ts
registry.registerOpenAICompatible('acme', {
  baseUrl: 'https://gateway.acme.example/v1',
  apiKeyEnv: 'ACME_API_KEY',          // omit for keyless local servers
  models: [{ id: 'acme-large', contextWindow: 65536 }],
})
// then: { provider: 'acme', model: 'acme-large' }
```

In a profile, add the route under `llm-pi-ai.config.providers`:

```yaml
acme:
  displayName: Acme Gateway
  apiKeyEnv: ACME_API_KEY
  api: openai-completions
  baseURL: https://gateway.acme.example/v1
  models:
    - id: acme-large
      contextWindow: 65536
```

## Reasoning / thinking

Pass per-request pi-ai options on the route or to `run`/`complete`:

```ts
agent.run(task, { signal })                    // cancellation
registry.complete(route, context, { maxTokens: 4096 })
```

Model-specific thinking levels are supported by pi-ai's unified interface
(`thinking` options per provider); see the pi-ai README for the full surface.
