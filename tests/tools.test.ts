import { describe, expect, it } from 'vitest'
import { Type } from '@earendil-works/pi-ai'
import { defineTool, echoTool, ToolRegistry } from '../src/index.ts'

describe('ToolRegistry', () => {
  it('registers and lists tools', () => {
    const reg = new ToolRegistry([echoTool])
    expect(reg.has('echo')).toBe(true)
    expect(reg.list().map((t) => t.name)).toEqual(['echo'])
  })

  it('rejects duplicate names', () => {
    const reg = new ToolRegistry()
    reg.register(echoTool)
    expect(() => reg.register(echoTool)).toThrow(/already registered/)
  })

  it('executes a tool and returns content', async () => {
    const reg = new ToolRegistry([
      defineTool({
        name: 'add',
        description: 'Add two numbers.',
        parameters: Type.Object({ a: Type.Number(), b: Type.Number() }),
        run: ({ a, b }) => a + b,
      }),
    ])
    const result = await reg.execute('add', { a: 2, b: 3 })
    expect(result.ok).toBe(true)
    expect(result.content).toBe('5')
  })

  it('reports unknown tools and thrown errors as failures', async () => {
    const reg = new ToolRegistry([
      defineTool({
        name: 'boom',
        description: 'Throws.',
        parameters: Type.Object({}),
        run: () => {
          throw new Error('kaboom')
        },
      }),
    ])
    const unknown = await reg.execute('nope', {})
    expect(unknown.ok).toBe(false)
    const failed = await reg.execute('boom', {})
    expect(failed.ok).toBe(false)
    expect(failed.error).toContain('kaboom')
  })

  it('converts specs to pi-ai tool schemas', () => {
    const reg = new ToolRegistry([echoTool])
    const tools = reg.toPiTools()
    expect(tools[0]).toMatchObject({ name: 'echo', description: expect.any(String) })
  })
})
