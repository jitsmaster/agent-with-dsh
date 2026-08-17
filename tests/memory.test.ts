import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createAgent, InMemoryMemory, JsonlFileMemory } from '../src/index.ts'
import { assistant, stubRegistry } from './helpers.ts'

describe('InMemoryMemory', () => {
  it('stores and clears messages', () => {
    const mem = new InMemoryMemory()
    mem.append(assistant([{ type: 'text', text: 'hi' }]))
    expect(mem.load()).toHaveLength(1)
    mem.clear()
    expect(mem.load()).toHaveLength(0)
  })
})

describe('JsonlFileMemory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-dsh-mem-'))
  const path = join(dir, 'session.jsonl')

  it('round-trips messages through the file', () => {
    const mem = new JsonlFileMemory(path)
    mem.append(assistant([{ type: 'text', text: 'one' }]))
    mem.append(assistant([{ type: 'text', text: 'two' }]))

    const reloaded = new JsonlFileMemory(path)
    expect(reloaded.load().map((m) => (m.content as { type: 'text'; text: string }[])[0]?.text)).toEqual(['one', 'two'])
    expect(readFileSync(path, 'utf8').split('\n').filter(Boolean)).toHaveLength(2)
  })

  it('skips corrupt lines and tolerates a missing file', () => {
    const mem = new JsonlFileMemory(join(dir, 'nope.jsonl'))
    expect(mem.load()).toHaveLength(0)
  })

  it('clears the file', () => {
    const mem = new JsonlFileMemory(path)
    mem.clear()
    expect(new JsonlFileMemory(path).load()).toHaveLength(0)
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))
})

describe('Agent with file memory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-dsh-mem2-'))
  const path = join(dir, 'session.jsonl')

  it('keeps the conversation across runs', async () => {
    const memory = new JsonlFileMemory(path)
    const agent = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([() => assistant([{ type: 'text', text: 'first answer' }])]),
      memory,
    })
    const first = await agent.run('hello one')
    expect(first.messages.map((m) => m.role)).toEqual(['user', 'assistant'])

    const agent2 = createAgent({
      model: { provider: 'faux', model: 'faux' },
      registry: stubRegistry([() => assistant([{ type: 'text', text: 'second answer' }])]),
      memory,
    })
    const second = await agent2.run('hello two')
    // memory persisted: 2 old messages + new user + assistant
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))
})