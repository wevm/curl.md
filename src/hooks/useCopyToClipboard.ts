import * as React from 'react'

export function useCopyToClipboard(props: { content?: string; timeout?: number } = {}) {
  const { content, timeout = 2_000 } = props
  const [copied, setCopied] = React.useState(false)

  const copy = React.useCallback(
    async (text?: string) => {
      const value = text ?? content
      if (value === undefined) return
      const didCopy = await writeToClipboard(value)
      if (!didCopy) return
      setCopied(true)
      setTimeout(() => setCopied(false), timeout)
    },
    [content, timeout],
  )

  return { copied, copy }
}

async function writeToClipboard(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {}
  }

  if (typeof document === 'undefined' || !document.body) return false

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
