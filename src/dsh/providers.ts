/**
 * dsh/providers.ts — the DSH profile side of the provider story.
 *
 * The standalone framework talks to models through pi-ai directly (see
 * model.ts). A DSH profile talks to models through the harness's
 * `@deepseek-ai/dsh-llm-pi-ai` adapter, which is configured with the SAME
 * provider routes, expressed as YAML. This module is the single source of
 * truth for that YAML: it renders the `providers:` block for the five
 * documented providers so the shipped profiles and the tests stay in sync.
 *
 * Edit PROVIDER_ROUTES here, regenerate the profile patches (bin/setup.sh
 * does this automatically), and re-run the consistency test.
 */
import { dump } from 'js-yaml'

export interface ProviderRoute {
  /** Env var holding the API key. Omit for keyless local servers. */
  apiKeyEnv?: string
  /** Display name. */
  displayName?: string
  /** Wire protocol for hand-declared routes. Default: pi-ai catalog route. */
  api?: string
  /** Endpoint for hand-declared routes. */
  baseURL?: string
  /** Model catalog for hand-declared routes. */
  models?: { id: string; name?: string; contextWindow?: number }[]
}

/** The five documented provider routes. */
export const PROVIDER_ROUTES: Record<string, ProviderRoute> = {
  deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY', displayName: 'DeepSeek' },
  openai: { apiKeyEnv: 'OPENAI_API_KEY', displayName: 'OpenAI' },
  anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY', displayName: 'Anthropic (Claude)' },
  openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY', displayName: 'OpenRouter' },
  ollama: {
    displayName: 'Ollama (local)',
    api: 'openai-completions',
    baseURL: 'http://localhost:11434/v1',
    models: [
      { id: 'llama3.2', name: 'Llama 3.2', contextWindow: 128000 },
      { id: 'qwen2.5', name: 'Qwen 2.5', contextWindow: 32768 },
      { id: 'deepseek-r1', name: 'DeepSeek R1 (distill)', contextWindow: 65536 },
    ],
  },
}

/** Render the `providers:` block for the dsh-llm-pi-ai adapter config. */
export function renderProvidersBlock(routes: Record<string, ProviderRoute> = PROVIDER_ROUTES): string {
  const config: Record<string, unknown> = {}
  for (const [key, route] of Object.entries(routes)) {
    const entry: Record<string, unknown> = {}
    if (route.displayName) entry.displayName = route.displayName
    if (route.apiKeyEnv) entry.apiKeyEnv = route.apiKeyEnv
    if (route.api) entry.api = route.api
    if (route.baseURL) entry.baseURL = route.baseURL
    if (route.models) entry.models = route.models
    config[key] = entry
  }
  return dump({ providers: config }, { indent: 2, noRefs: true })
}

/** Render the patch rows for a profile cordis.patch.yml (providers + default model). */
export function renderProvidersPatch(
  routes: Record<string, ProviderRoute> = PROVIDER_ROUTES,
  defaultModel: { provider: string; model: string } = { provider: 'deepseek', model: 'deepseek-v4-flash' },
): string {
  const patch = [
    { id: 'llm-pi-ai', config: { providers: toConfigMap(routes) } },
    { id: 'agent-default-model', config: defaultModel },
  ]
  return dump(patch, { indent: 2, noRefs: true })
}

function toConfigMap(routes: Record<string, ProviderRoute>): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  for (const [key, route] of Object.entries(routes)) {
    const entry: Record<string, unknown> = {}
    if (route.displayName) entry.displayName = route.displayName
    if (route.apiKeyEnv) entry.apiKeyEnv = route.apiKeyEnv
    if (route.api) entry.api = route.api
    if (route.baseURL) entry.baseURL = route.baseURL
    if (route.models) entry.models = route.models
    config[key] = entry
  }
  return config
}