import * as React from 'react'

export const useBrowserLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect
