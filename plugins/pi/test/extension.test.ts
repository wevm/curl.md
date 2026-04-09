import { expect, test, vi } from 'vitest'
import extension from '../extensions/index.ts'

test('registers deterministic pi extension tools and status command', async () => {
  const commands: Array<Record<string, any>> = []
  const tools: Array<Record<string, any>> = []
  const notify = vi.fn()

  extension({
    registerCommand(name: string, options: Record<string, any>) {
      commands.push({ name, ...options })
    },
    registerTool(definition: Record<string, any>) {
      tools.push(definition)
    },
  } as any)

  expect(commands.map((command) => command.name)).toEqual(['curlmd_status'])
  expect(tools.map((tool) => tool.name)).toEqual(['test_echo', 'test_fail'])

  await commands[0]!.handler('', {
    ui: {
      notify,
    },
  })

  expect(notify).toHaveBeenCalledWith('curlmd ready: test_echo, test_fail', 'info')

  await expect(tools[0]!.execute('call_1', { message: 'hello' })).resolves.toEqual({
    content: [{ type: 'text', text: 'test_echo: hello' }],
    details: {
      message: 'hello',
      ok: true,
      tool: 'test_echo',
    },
  })

  await expect(tools[1]!.execute('call_2', { message: 'boom' })).rejects.toThrow('boom')
})
