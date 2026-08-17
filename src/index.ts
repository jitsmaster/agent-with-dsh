/**
 * agent-with-dsh — a LangChain-style TypeScript framework for building your
 * own agent on the DeepSeek Harness (DSH).
 *
 * Core (works standalone in any Node process):
 *   - createAgent / Agent   — model + tools + system prompt conversational loop
 *   - defineTool / ToolRegistry
 *   - ModelRegistry         — DeepSeek, OpenAI, Anthropic, OpenRouter, Ollama
 *   - StateGraph            — LangGraph-style workflows
 *   - sparcGraph / runSparc — the SPARC development methodology as a graph
 *
 * DSH bridge (deploy the same agent inside a DSH profile):
 *   - registerFrameworkTools — expose framework tools to a DSH agent
 *   - renderProvidersPatch   — pi-ai provider routes for a profile
 */
export { Type } from '@earendil-works/pi-ai'
export type { Static, TSchema } from '@earendil-works/pi-ai'
export { Agent, createAgent, toMessages, toolCallsOf, answerText } from './agent.ts'
export type {
  AgentConfig,
  AgentRunResult,
  AgentStreamEvent,
  RunOptions,
} from './agent.ts'
export { ModelRegistry, DEFAULT_MODELS, SUPPORTED_PROVIDERS, defaultOllamaModels } from './model.ts'
export type {
  ModelDef,
  ModelRoute,
  OpenAICompatibleOptions,
  ProviderName,
} from './model.ts'
export { ToolRegistry, defineTool, echoTool } from './tools.ts'
export type { ToolContext, ToolResult, ToolSpec } from './tools.ts'
export {
  END,
  START,
  StateGraph,
  agentNode,
} from './graph/graph.ts'
export type {
  AgentNodeOptions,
  CompiledGraph,
  GraphContext,
  GraphEvent,
  GraphNode,
  GraphOptions,
  GraphRouter,
  GraphState,
  InvokeOptions,
} from './graph/graph.ts'
export { runSparc, sparcGraph } from './graph/sparc.ts'
export type { SparcConfig, SparcState, SparcWorker } from './graph/sparc.ts'
export {
  PROVIDER_ROUTES,
  registerFrameworkTools,
  renderProvidersBlock,
  renderProvidersPatch,
  toDshParameterSpec,
  toDshToolDefinition,
} from './dsh/index.ts'
export type { ToolRegistrant } from './dsh/index.ts'