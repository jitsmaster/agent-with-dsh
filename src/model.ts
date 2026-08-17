/**
 * model.ts — configurable multi-provider model layer.
 *
 * Wraps pi-ai (@earendil-works/pi-ai) — the same engine the DeepSeek Harness
 * uses — behind a small, LangChain-like surface. Out of the box it registers
 * five providers, all configurable with environment variables (or a
 * credential store):
 *
 *   - deepseek   → DEEPSEEK_API_KEY        (api.deepseek.com)
 *   - openai     → OPENAI_API_KEY          (api.openai.com)
 *   - anthropic  → ANTHROPIC_API_KEY       (api.anthropic.com)   — Claude
 *   - openrouter → OPENROUTER_API_KEY      (openrouter.ai/api/v1)
 *   - ollama     → keyless local server    (http://localhost:11434/v1)
 *
 * Any other OpenAI-compatible endpoint (vLLM, LM Studio, a proxy, a gateway)
 * can be added with `registerOpenAICompatible`.
 */
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type MutableModels,
  type Provider,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai'
import { builtinModels } from '@earendil-works/pi-ai/providers/all'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'

/** Provider identifiers the framework knows about. */
export type ProviderName =
  | 'deepseek'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'ollama'
  | (string & {})

/** Which model + provider a request (or an Agent) uses. */
export interface ModelRoute {
  provider: ProviderName
  model: string
  /** Per-request pi-ai options (thinking level, maxTokens, ...). */
  options?: SimpleStreamOptions
}

/** A model definition for a custom OpenAI-compatible endpoint. */
export interface ModelDef {
  id: string
  name?: string
  /** Context window in tokens. Defaults to 128000. */
  contextWindow?: number
  /** Max output tokens. Defaults to 32768. */
  maxTokens?: number
  /** Whether the endpoint supports reasoning/thinking. Defaults to false. */
  reasoning?: boolean
}

/** Options for registering an OpenAI-compatible endpoint (Ollama, vLLM, ...). */
export interface OpenAICompatibleOptions {
  /** Endpoint base URL, e.g. `http://localhost:11434/v1`. */
  baseUrl: string
  /** Env var holding the key; omit for keyless local servers. */
  apiKeyEnv?: string
  models: ModelDef[]
}

/**
 * A named, swappable model collection. Instances are cheap; create one per
 * process (or per agent) and reuse it.
 */
export class ModelRegistry {
  private readonly models: MutableModels

  constructor() {
    // builtinModels() registers every pi-ai catalog provider; the five we
    // document are the ones users care about here, but nothing stops you from
    // using the rest (mistral, groq, xai, ...) by name.
    this.models = builtinModels()
  }

  /** The underlying pi-ai collection (advanced use). */
  get piModels(): MutableModels {
    return this.models
  }

  /** Register a raw pi-ai provider (advanced use). */
  registerProvider(provider: Provider): this {
    this.models.setProvider(provider)
    return this
  }

  /**
   * Register an OpenAI-compatible endpoint. Used by `ollama()` and for any
   * custom gateway (vLLM, LM Studio, corporate proxies, OpenRouter-style
   * gateways that pi-ai does not ship).
   */
  registerOpenAICompatible(id: string, opts: OpenAICompatibleOptions): this {
    const models: Model<'openai-completions'>[] = opts.models.map((def) => ({
      id: def.id,
      name: def.name ?? def.id,
      api: 'openai-completions',
      provider: id,
      baseUrl: opts.baseUrl,
      reasoning: def.reasoning ?? false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: def.contextWindow ?? 128000,
      maxTokens: def.maxTokens ?? 32768,
    }))
    const provider = createProvider({
      id,
      name: id,
      baseUrl: opts.baseUrl,
      auth: {
        apiKey:
          opts.apiKeyEnv === undefined
            ? { name: id, resolve: async () => ({ auth: {} }) } // keyless local server
            : envApiKeyAuth(id, [opts.apiKeyEnv]),
      },
      models,
      api: openAICompletionsApi(),
    })
    this.models.setProvider(provider)
    return this
  }

  /** Register the keyless local Ollama server. */
  registerOllama(baseUrl = 'http://localhost:11434/v1', models: ModelDef[] = defaultOllamaModels): this {
    return this.registerOpenAICompatible('ollama', { baseUrl, models })
  }

  /** Resolve a route to a pi-ai model; throws a helpful error when unknown. */
  resolve(route: ModelRoute) {
    const model = this.models.getModel(route.provider, route.model)
    if (!model) {
      const known = this.models.getModels(route.provider).map((m) => m.id).slice(0, 12)
      throw new Error(
        `model "${route.model}" not found for provider "${route.provider}"` +
          (known.length ? ` (known: ${known.join(', ')}...)` : ' (provider not registered?)'),
      )
    }
    return model
  }

  /** Complete a conversation (non-streaming). */
  async complete(route: ModelRoute, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage> {
    const model = this.resolve(route)
    return this.models.complete(model, context, { ...route.options, ...options })
  }

  /** Stream a conversation. Consume the returned event stream. */
  stream(route: ModelRoute, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
    const model = this.resolve(route)
    return this.models.streamSimple(model, context, { ...route.options, ...options })
  }
}

/** Sensible default Ollama model list (edit freely; also discoverable via `ollama list`). */
export const defaultOllamaModels: ModelDef[] = [
  { id: 'llama3.2', name: 'Llama 3.2', contextWindow: 128000 },
  { id: 'qwen2.5', name: 'Qwen 2.5', contextWindow: 32768 },
  { id: 'deepseek-r1', name: 'DeepSeek R1 (distill)', contextWindow: 65536 },
  { id: 'mistral', name: 'Mistral', contextWindow: 32768 },
]

/** Default model per provider, for one-liner agents. */
export const DEFAULT_MODELS: Record<string, string> = {
  deepseek: 'deepseek-v4-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5',
  openrouter: 'deepseek/deepseek-chat',
  ollama: 'llama3.2',
}

/** All provider names the framework documents out of the box. */
export const SUPPORTED_PROVIDERS: ProviderName[] = [
  'deepseek',
  'openai',
  'anthropic',
  'openrouter',
  'ollama',
]