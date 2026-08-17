import { describe, expect, it } from 'vitest'
import { createAgent, defineSkill, SkillRegistry } from '../src/index.ts'
import { assistant, stubRegistry } from './helpers.ts'

describe('SkillRegistry', () => {
  it('registers, lists, and looks up skills', () => {
    const reg = new SkillRegistry([
      defineSkill({ name: 'review', description: 'reviews code', instructions: '# Review\nCheck tests.' }),
    ])
    expect(reg.get('review')?.instructions).toContain('Review')
    expect(reg.toCatalogText()).toContain('- review: reviews code')
  })

  it('rejects duplicate names', () => {
    const reg = new SkillRegistry()
    reg.register(defineSkill({ name: 'x', description: '', instructions: '' }))
    expect(() =>
      reg.register(defineSkill({ name: 'x', description: '', instructions: '' })),
    ).toThrow(/already registered/)
  })
})

describe('Agent skills', () => {
  it('loads a skill through the use_skill tool', async () => {
    const agent = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([() => assistant([{ type: 'text', text: 'ok' }])]),
      skills: [
        defineSkill({
          name: 'review',
          description: 'reviews code',
          instructions: 'You must run the tests first.',
        }),
      ],
    })
    // the agent auto-registers use_skill
    expect(agent.tools.has('use_skill')).toBe(true)
    const result = await agent.tools.execute('use_skill', { name: 'review' })
    expect(result.ok).toBe(true)
    expect(result.content).toContain('run the tests first')
  })

  it('reports unknown skills', async () => {
    const agent = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([() => assistant([{ type: 'text', text: 'ok' }])]),
      skills: [defineSkill({ name: 'a', description: '', instructions: 'x' })],
    })
    const result = await agent.tools.execute('use_skill', { name: 'nope' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('unknown skill')
  })
})
