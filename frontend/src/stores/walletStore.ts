import { create } from 'zustand'
import { fetchMapping } from '@/lib/aleo'

interface WalletState {
  address: string | null
  connected: boolean
  balance: bigint
  walletType: 'shield' | 'leo' | 'puzzle' | 'fox' | 'soter' | 'unknown'
  isDemoMode: boolean

  setWallet: (address: string, type: string) => void
  disconnect: () => void
  setBalance: (bal: bigint) => void
  setDemoMode: (demo: boolean) => void
  refreshBalance: () => Promise<void>
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  connected: false,
  balance: 0n,
  walletType: 'unknown',
  isDemoMode: false,

  setWallet: (address: string, type: string) =>
    set({
      address,
      connected: true,
      walletType:
        type === 'shield' || type === 'Shield Wallet' ? 'shield' :
        type === 'Leo Wallet' ? 'leo' :
        type === 'Puzzle Wallet' ? 'puzzle' :
        type === 'Fox Wallet' ? 'fox' :
        type === 'Soter Wallet' ? 'soter' :
        'unknown',
    }),

  disconnect: () =>
    set({
      address: null,
      connected: false,
      balance: 0n,
      walletType: 'unknown',
      isDemoMode: false,
    }),

  setBalance: (bal: bigint) => set({ balance: bal }),

  setDemoMode: (demo: boolean) => set({ isDemoMode: demo }),

  refreshBalance: async () => {
    const addr = useWalletStore.getState().address
    if (!addr) return
    try {
      const raw = await fetchMapping('account', addr, 'credits.aleo')
      if (raw) {
        const cleaned = raw.replace(/u64\s*$/, '').replace(/"/g, '').trim()
        set({ balance: BigInt(cleaned) })
      }
    } catch { /* explorer unavailable */ }
  },
}))
