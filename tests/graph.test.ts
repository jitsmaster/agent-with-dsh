import { describe, expect, it } from 'vitest'
import { END, START, StateGraph, type GraphState } from '../src/index.ts'

describe('StateGraph', () => {
  it('runs a linear graph and merges state', async () => {
    const g = new StateGraph<GraphState>()
      .addNode('a', () => ({ a: 1 }))
      .addNode('b', (state) => ({ b: (state.a as number) + 1 }))
      .addEdge(START, 'a')
      .addEdge('a', 'b')
      .addEdge('b', END)
      .compile()
    const out = await g.invoke({})
    expect(out).toEqual({ a: 1, b: 2 })
  })

  it('supports conditional edges and loops', async () => {
    let count = 0
    const g = new StateGraph<GraphState>()
      .addNode('work', () => {
        count++
        return { count }
      })
      .addEdge(START, 'work')
      .addConditionalEdges('work', (state) => ((state.count as number) < 3 ? 'work' : END))
      .compile()
    const out = await g.invoke({ count: 0 })
    expect(out.count).toBe(3)
    expect(count).toBe(3)
  })

  it('honors setEntryPoint', async () => {
    const g = new StateGraph<GraphState>()
      .addNode('only', () => ({ ran: true }))
      .setEntryPoint('only')
      .addEdge('only', END)
      .compile()
    expect(await g.invoke({})).toEqual({ ran: true })
  })

  it('throws when there is no entry', () => {
    const g = new StateGraph<GraphState>().addNode('only', () => ({}))
    expect(() => g.compile()).toThrow(/no entry/)
  })

  it('guards against runaway loops', async () => {
    const g = new StateGraph<GraphState>({ maxSteps: 5 })
      .addNode('loop', () => ({}))
      .addEdge(START, 'loop')
      .addConditionalEdges('loop', () => 'loop')
      .compile()
    await expect(g.invoke({})).rejects.toThrow(/maxSteps/)
  })

  it('streams node events', async () => {
    const g = new StateGraph<GraphState>()
      .addNode('a', () => ({ a: 1 }))
      .addEdge(START, 'a')
      .addEdge('a', END)
      .compile()
    const events = []
    for await (const ev of g.stream({})) events.push(ev)
    expect(events.map((e) => e.type)).toEqual(['node_start', 'node_end', 'done'])
  })
})
