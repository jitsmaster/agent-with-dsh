/**
 * dsh/ — bridge the framework into the DeepSeek Harness.
 */
export { registerFrameworkTools, toDshToolDefinition, toDshParameterSpec } from './bridge.ts'
export type { ToolRegistrant } from './bridge.ts'
export { PROVIDER_ROUTES, renderProvidersBlock, renderProvidersPatch } from './providers.ts'
export type { ProviderRoute } from './providers.ts'
