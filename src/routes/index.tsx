import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionLogin } from '#server/session.ts'
import { Home, head } from './-home.tsx'

export const Route = createFileRoute('/')({
  async beforeLoad() {
    const login = await getSessionLogin()
    if (login) throw redirect({ to: '/$login', params: { login } })
  },
  head,
  component: () => <Home />,
})
