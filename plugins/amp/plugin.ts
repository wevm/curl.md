// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
import type { PluginAPI } from '@ampcode/plugin'

export default function (amp: PluginAPI) {
  amp.registerTool({
    name: 'test_echo',
    description: 'Return a deterministic echo payload for plugin testing.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to echo back' },
      },
      required: ['message'],
    },
    async execute(input) {
      amp.logger.log('test_echo execute', { message: input.message })

      return {
        message: input.message,
        ok: true,
        tool: 'test_echo',
      }
    },
  })

  amp.registerTool({
    name: 'test_fail',
    description: 'Fail deterministically for plugin testing.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Failure message to throw' },
      },
      required: ['message'],
    },
    async execute(input) {
      amp.logger.log('test_fail execute', { message: input.message })
      throw new Error(input.message as string)
    },
  })
}
