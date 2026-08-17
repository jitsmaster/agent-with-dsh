import { describe, expect, it } from 'vitest'
import { createAgent } from '../src/index.ts'
import type { SubagentSpec } from '../src/subagent.ts'
import { assistant, stubRegistry } from './helpers.ts'

describe('Agent subagents', () => {
  it('delegates to a child agent through the subagent tool', async () => {
    const childTasks: string[] = []
    const child = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([
        (ctx) => {
          childTasks.push(String((ctx.messages[0]?.content as string) ?? ''))
          return assistant([{ type: 'text', text: 'child answer' }])
        },
      ]),
    })
    const parent = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([() => assistant([{ type: 'text', text: 'parent answer' }])]),
      subagents: [{ name: 'researcher', description: 'researches topics', agent: child }],
    })

    expect(parent.tools.has('subagent')).toBe(true)
    const result = await parent.tools.execute('subagent', {
      subagent: 'researcher',
      task: 'find the answer',
    })
    expect(result.ok).toBe(true)
    expect(result.content).toBe('child answer')
    expect(childTasks).toEqual(['find the answer'])
  })

  it('rejects unknown subagents', async () => {
    const parent = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([() => assistant([{ type: 'text', text: 'ok' }])]),
      subagents: [
        { name: 'researcher', description: 'researches', agent: createAgent({ model: { provider: 'faux', model: 'faux' }, registry: stubRegistry([() => assistant([{ type: 'text', text: 'x' }])]) }) },
      ],
    })
    const result = await parent.tools.execute('subagent', { subagent: 'ghost', task: 'x' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('unknown subagent')
  })
})