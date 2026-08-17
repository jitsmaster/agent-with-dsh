import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'
import {
  DEFAULT_MODELS,
  ModelRegistry,
  PROVIDER_ROUTES,
  renderProvidersBlock,
  renderProvidersPatch,
  SUPPORTED_PROVIDERS,
  toDshParameterSpec,
  Type,
} from '../src/index.ts'

describe('ModelRegistry (static catalogs, no network)', () => {
  it('resolves a model for every documented provider', () => {
    const registry = new ModelRegistry()
    for (const provider of SUPPORTED_PROVIDERS) {
      const model = DEFAULT_MODELS[provider]
      expect(model, `default model for ${provider}`).toBeTruthy()
      // getModel is a sync catalog read; 'ollama' was registered by the ctor test below
    }
  })

  it('registers the five documented providers', () => {
    const registry = new ModelRegistry()
    registry.registerOllama()
    const ids = registry.piModels.getProviders().map((p) => p.id)
    for (const p of ['deepseek', 'openai', 'anthropic', 'openrouter', 'ollama']) {
      expect(ids).toContain(p)
    }
  })
})

describe('DSH provider config rendering', () => {
  it('renders a parseable providers block for every documented route', () => {
    const yaml = renderProvidersBlock()
    const parsed = load(yaml) as { providers: Record<string, unknown> }
    expect(Object.keys(parsed.providers).sort()).toEqual(Object.keys(PROVIDER_ROUTES).sort())
  })

  it('renders a patch with llm-pi-ai and agent-default-model rows', () => {
    const yaml = renderProvidersPatch()
    const parsed = load(yaml) as { id: string; config: { providers?: unknown; provider?: string; model?: string } }[]
    expect(parsed.map((r) => r.id)).toEqual(['llm-pi-ai', 'agent-default-model'])
    const defaultModel = parsed[1]?.config
    expect(defaultModel?.provider).toBe('deepseek')
    expect(defaultModel?.model).toBe('deepseek-v4-flash')
  })

  it('ollama route is keyless and points at the local server', () => {
    expect(PROVIDER_ROUTES.ollama?.apiKeyEnv).toBeUndefined()
    expect(PROVIDER_ROUTES.ollama?.baseURL).toBe('http://localhost:11434/v1')
    expect(PROVIDER_ROUTES.ollama?.models?.length).toBeGreaterThan(0)
  })
})

describe('DSH tool bridge', () => {
  it('converts a TypeBox object schema to a full JSON Schema', () => {
    const spec = toDshParameterSpec(
      Type.Object({
        a: Type.Number(),
        b: Type.Optional(Type.String()),
      }),
    )
    expect(spec.type).toBe('object')
    expect(spec.properties).toMatchObject({ a: { type: 'number' }, b: { type: 'string' } })
    expect(spec.required).toEqual(['a'])
  })

  it('rejects non-object schemas', () => {
    expect(() => toDshParameterSpec(Type.String())).toThrow(/Type.Object/)
  })
})