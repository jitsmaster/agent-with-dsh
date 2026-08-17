import { describe, expect, it } from 'vitest'
import {
  AgentTeam,
  createAgent,
  createAgentTeam,
  parallelAgents,
  parallelNodes,
  StateGraph,
  START,
  END,
} from '../src/index.ts'
import { assistant, stubRegistry } from './helpers.ts'

describe('parallelAgents', () => {
  it('runs agents concurrently and returns answers in order', async () => {
    const a = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([() => assistant([{ type: 'text', text: 'A' }])]),
    })
    const b = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([() => assistant([{ type: 'text', text: 'B' }])]),
    })
    const answers = await parallelAgents([a, b], 'go')
    expect(answers).toEqual(['A', 'B'])
  })
})

describe('parallelNodes', () => {
  it('merges partial updates from concurrent nodes', async () => {
    const node = parallelNodes<{ a?: number; b?: number }>([
      async () => ({ a: 1 }),
      async () => ({ b: 2 }),
    ])
    const merged = await node({}, { step: 1, graph: 't' })
    expect(merged).toEqual({ a: 1, b: 2 })
  })

  it('works inside a StateGraph', async () => {
    const g = new StateGraph<{ left?: string; right?: string }>()
      .addNode('both', parallelNodes<{ left?: string; right?: string }>([
        async () => ({ left: 'L' }),
        async () => ({ right: 'R' }),
      ]))
      .addEdge(START, 'both')
      .addEdge('both', END)
      .compile()
    const out = await g.invoke({})
    expect(out).toEqual({ left: 'L', right: 'R' })
  })
})

describe('AgentTeam', () => {
  it('delegates to workers and returns the supervisor answer', async () => {
    const workerTasks: string[] = []
    const writer = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([
        (ctx) => {
          const user = ctx.messages[0]
          workerTasks.push(String((user?.content as string) ?? ''))
          return assistant([{ type: 'text', text: 'worker output' }])
        },
      ]),
    })

    const team = createAgentTeam({
      model: { provider: 'faux', model: 'faux' },
      workers: [{ name: 'writer', description: 'writes drafts', agent: writer }],
      registry: stubRegistry([
        () =>
          assistant(
            [{ type: 'toolCall', id: 'd1', name: 'delegate', arguments: { worker: 'writer', task: 'draft a paragraph' } }],
            'toolUse',
          ),
        () => assistant([{ type: 'text', text: 'final synthesis' }]),
      ]),
    })

    const result = await team.run('write something')
    expect(result.final.content[0]).toMatchObject({ type: 'text', text: 'final synthesis' })
    expect(workerTasks).toEqual(['draft a paragraph'])
    // the delegate tool result flowed back to the supervisor
    const toolResult = result.messages.find((m) => m.role === 'toolResult')
    expect(toolResult).toBeDefined()
    expect((toolResult as { content: { text: string }[] }).content[0]!.text).toBe('worker output')
  })

  it('rejects unknown workers', async () => {
    const team = new AgentTeam({
      model: { provider: 'faux', model: 'faux' },
      workers: [],
      registry: stubRegistry([
        () =>
          assistant([{ type: 'toolCall', id: 'd1', name: 'delegate', arguments: { worker: 'ghost', task: 'x' } }], 'toolUse'),
        () => assistant([{ type: 'text', text: 'done' }]),
      ]),
    })
    const result = await team.run('go')
    const toolResult = result.messages.find((m) => m.role === 'toolResult')
    expect(toolResult && toolResult.role === 'toolResult' && toolResult.isError).toBe(true)
  })
})