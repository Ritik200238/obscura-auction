import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { fetchBlockHeight } from '@/lib/aleo'

interface BlockHeightContextValue {
  blockHeight: number
  refresh: () => Promise<void>
}

const BlockHeightContext = createContext<BlockHeightContextValue>({
  blockHeight: 0,
  refresh: async () => {},
})

export function useBlockHeight() {
  return useContext(BlockHeightContext)
}

const POLL_INTERVAL = 15_000 // 15 seconds

export function BlockHeightProvider({ children }: { children: ReactNode }) {
  const [blockHeight, setBlockHeight] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const h = await fetchBlockHeight()
      if (h > 0) setBlockHeight(h)
    } catch { /* explorer unavailable */ }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [refresh])

  return (
    <BlockHeightContext.Provider value={{ blockHeight, refresh }}>
      {children}
    </BlockHeightContext.Provider>
  )
}
