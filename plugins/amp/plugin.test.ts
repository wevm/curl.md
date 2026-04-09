import { expect, test } from 'vitest'
import plugin from './plugin.ts'

test('registers deterministic amp plugin tools', async () => {
  const tools: Array<Record<string, any>> = []

  plugin({
    logger: { log() {} },
    registerTool(definition: Record<string, any>) {
      tools.push(definition)
      return { unsubscribe() {} }
    },
  } as any)

  expect(tools.map((tool) => tool.name)).toEqual(['test_echo', 'test_fail'])

  await expect(tools[0]!.execute({ message: 'hello' })).resolves.toEqual({
    message: 'hello',
    ok: true,
    tool: 'test_echo',
  })

  await expect(tools[1]!.execute({ message: 'boom' })).rejects.toThrow('boom')
})
