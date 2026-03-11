import { fromHtml } from '../fromHtml.ts'
import { defineRule } from '../mod.ts'

export const tailwind = defineRule({
  key: 'tailwind',
  patterns: ['tailwindcss.com'],
  async extract(response) {
    let html = await response.text()

    // Unhide overflow rows in ApiTable (hidden="" or hidden="until-found" tbody)
    html = html.replace(/(<tbody\b[^>]*?)\s+hidden(?:="[^"]*")?/g, '$1')

    // Strip "Show more" / "Show less" toggle buttons in ApiTable
    html = html.replace(/<button\b[^>]*>(?:Show more|Show less)<\/button>/g, '')

    return fromHtml(html, { baseUrl: response.url })
  },
})
