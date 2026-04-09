import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'

export default function (pi: ExtensionAPI) {
  pi.registerCommand('curlmd_status', {
    description: 'Show curlmd Pi extension status for debugging and smoke tests.',
    async handler(_args, ctx) {
      ctx.ui.notify('curlmd ready: test_echo, test_fail', 'info')
    },
  })

  pi.registerTool({
    name: 'test_echo',
    label: 'Test Echo',
    description: 'Return a deterministic echo payload for plugin testing.',
    promptSnippet: 'Echo a message back in a deterministic structured response.',
    promptGuidelines: ['Use test_echo when you need a deterministic plugin smoke test.'],
    parameters: Type.Object({
      message: Type.String({ description: 'Message to echo back' }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: 'text', text: `test_echo: ${params.message}` }],
        details: {
          message: params.message,
          ok: true,
          tool: 'test_echo',
        },
      }
    },
  })

  pi.registerTool({
    name: 'test_fail',
    label: 'Test Fail',
    description: 'Fail deterministically for plugin testing.',
    promptSnippet: 'Fail with a predictable error message for plugin smoke tests.',
    promptGuidelines: ['Use test_fail when you need to verify deterministic plugin failures.'],
    parameters: Type.Object({
      message: Type.String({ description: 'Failure message to throw' }),
    }),
    async execute(_toolCallId, params) {
      throw new Error(params.message)
    },
  })
}
