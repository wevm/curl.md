import { Dialog as BaseDialog } from '@base-ui/react/dialog'

function Backdrop(props: React.ComponentProps<typeof BaseDialog.Backdrop>) {
  return <BaseDialog.Backdrop {...props} className="fixed inset-0 z-50 bg-black/80" />
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
  return <BaseDialog.Description {...props} className="text-gray9 text-sm" />
}

function Popup(props: React.ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Popup
      {...props}
      className="bg-bg1 border-gray-a3 fixed start-1/2 top-[40%] z-50 flex w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 border p-6"
    />
  )
}

function Title(props: React.ComponentProps<typeof BaseDialog.Title>) {
  return <BaseDialog.Title {...props} className="text-base font-bold" />
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
