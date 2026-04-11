import { fromHtml } from '../fromHtml.ts'
import { defineRule } from '../mod.ts'

export const tailwind = defineRule({
  key: 'tailwind',
  patterns: [new URLPattern({ hostname: 'tailwindcss.com' })],
  checks: [
    {
      url: 'https://tailwindcss.com/docs/installation/using-vite',
      title: 'Installing Tailwind CSS with Vite',
      contains: ['Create your project'],
      minLength: 500,
    },
    {
      url: 'https://tailwindcss.com/docs/padding',
      title: 'padding',
      contains: ['padding'],
      minLength: 500,
    },
  ],
  async extract(response) {
    let html = await response.text()

    // Unhide overflow rows in ApiTable (hidden="" or hidden="until-found" tbody)
    html = html.replace(/(<tbody\b[^>]*?)\s+hidden(?:="[^"]*")?/g, '$1')

    // Strip "Show more" / "Show less" toggle buttons in ApiTable
    html = html.replace(/<button\b[^>]*>(?:Show more|Show less)<\/button>/g, '')

    return fromHtml(html, { baseUrl: response.url })
  },
})
