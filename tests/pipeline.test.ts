import { describe, expect, it, vi } from 'vitest'
import { Type } from '@earendil-works/pi-ai'
import {
  allowlistMiddleware,
  defineTool,
  logMiddleware,
  timeoutMiddleware,
  ToolRegistry,
} from '../src/index.ts'

const slowTool = defineTool({
  name: 'slow',
  description: 'takes a while',
  parameters: Type.Object({}),
  run: async () => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return 'done'
  },
})

const fastTool = defineTool({
  name: 'fast',
  description: 'instant',
  parameters: Type.Object({}),
  run: () => 'fast result',
})

describe('ToolPipeline', () => {
  it('runs around-middleware around the tool', async () => {
    const order: string[] = []
    const reg = new ToolRegistry([fastTool])
    reg.use(async (call, next) => {
      order.push('before:' + call.name)
      const result = await next(call.args, call.ctx)
      order.push('after')
      return { ...result, content: result.content + ' (wrapped)' }
    })
    const out = await reg.execute('fast', {})
    expect(out.content).toBe('fast result (wrapped)')
    expect(order).toEqual(['before:fast', 'after'])
  })

  it('can short-circuit without running the tool', async () => {
    const reg = new ToolRegistry([fastTool])
    reg.use(async () => ({ ok: false, content: 'blocked by policy', error: 'policy' }))
    const out = await reg.execute('fast', {})
    expect(out.content).toBe('blocked by policy')
  })

  it('times out slow tools', async () => {
    const reg = new ToolRegistry([slowTool])
    reg.use(timeoutMiddleware(50))
    const out = await reg.execute('slow', {})
    expect(out.ok).toBe(false)
    expect(out.error).toContain('timed out')
  })

  it('enforces an allowlist', async () => {
    const reg = new ToolRegistry([fastTool, slowTool])
    reg.use(allowlistMiddleware(['fast']))
    expect((await reg.execute('fast', {})).ok).toBe(true)
    const blocked = await reg.execute('slow', {})
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toContain('not allowed')
  })

  it('composes multiple middlewares in order', async () => {
    const seen: string[] = []
    const reg = new ToolRegistry([fastTool])
    reg.use(async (call, next) => {
      seen.push('m1')
      return next(call.args, call.ctx)
    })
    reg.use(async (call, next) => {
      seen.push('m2')
      return next(call.args, call.ctx)
    })
    await reg.execute('fast', {})
    expect(seen).toEqual(['m1', 'm2'])
  })

  it('logMiddleware does not change the result', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const reg = new ToolRegistry([fastTool])
    reg.use(logMiddleware('t'))
    const out = await reg.execute('fast', {})
    expect(out.content).toBe('fast result')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
