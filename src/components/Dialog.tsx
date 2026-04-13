import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import * as React from 'react'

function Backdrop() {
  return null
}

function Close(props: React.ComponentProps<typeof BaseDialog.Close>) {
  return <BaseDialog.Close {...props} />
}

function CloseX(
  props: Omit<React.ComponentProps<typeof BaseDialog.Close>, 'aria-label' | 'children'>,
) {
  return (
    <BaseDialog.Close
      aria-label="Close"
      {...props}
      className="text-gray7 hover:bg-gray-a2 hover:text-gray12 absolute end-4 top-4 p-1"
    >
      <IconOcticonX16 aria-hidden="true" className="size-4" />
    </BaseDialog.Close>
  )
}

function Description(props: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      {...props}
      className={['text-gray9 text-sm', props.className].filter(Boolean).join(' ')}
    />
  )
}

function Popup(props: React.ComponentProps<typeof BaseDialog.Popup>) {
  const { children, className, ...rest } = props
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const hasCustomMaxWidth = typeof className === 'string' ? /(^|\s)!?max-w-/.test(className) : false
  const baseClassName = [
    'bg-bg1 border-gray-a3 pointer-events-auto relative my-[15dvh] flex w-full flex-col gap-4 border p-6',
    hasCustomMaxWidth ? undefined : 'max-w-md',
  ]
    .filter(Boolean)
    .join(' ')
  const mergedClassName =
    typeof className === 'function'
      ? (state: Parameters<typeof className>[0]) =>
          [baseClassName, className(state)].filter(Boolean).join(' ')
      : [baseClassName, className].filter(Boolean).join(' ')

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[color-mix(in_srgb,var(--color-bg1)_80%,transparent)] [scrollbar-width:thin] dark:bg-black/80"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current?.click()
      }}
    >
      <BaseDialog.Close ref={closeRef} className="hidden" tabIndex={-1} />
      <div
        className="flex min-h-full items-start justify-center"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) closeRef.current?.click()
        }}
      >
        <BaseDialog.Popup data-dialog-ui {...rest} className={mergedClassName}>
          {children}
        </BaseDialog.Popup>
      </div>
    </div>
  )
}

function Title(props: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      {...props}
      className={['text-base font-bold', props.className].filter(Boolean).join(' ')}
    />
  )
}

export const Dialog = {
  Backdrop,
  Close,
  CloseX,
  Description,
  Portal: BaseDialog.Portal,
  Popup,
  Root: BaseDialog.Root,
  Title,
}
