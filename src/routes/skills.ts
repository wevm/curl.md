import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/skills')({
  server: {
    handlers: {
      GET: async (options) => {
        return Response.redirect(
          new URL('/skills/index.json', options.request.url).href,
          301,
        )
      },
    },
  },
})
