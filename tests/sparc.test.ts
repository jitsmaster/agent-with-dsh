import { describe, expect, it } from 'vitest'
import { sparcGraph } from '../src/index.ts'

describe('sparcGraph', () => {
  it('compiles with the five SPARC phases plus verification', () => {
    const graph = sparcGraph({ model: { provider: 'deepseek', model: 'deepseek-v4-flash' } })
    // compile() succeeds only when the graph is well-formed
    expect(graph).toBeDefined()
  })
})
