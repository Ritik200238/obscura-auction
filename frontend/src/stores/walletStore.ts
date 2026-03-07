import { create } from 'zustand'

interface WalletState {
  address: string | null
  connected: boolean
  balance: bigint
  walletType: 'shield' | 'unknown'
  isDemoMode: boolean

  setWallet: (address: string, type: string) => void
  disconnect: () => void
  setBalance: (bal: bigint) => void
  setDemoMode: (demo: boolean) => void
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
      walletType: type === 'shield' || type === 'ShieldWalletAdapter' ? 'shield' : 'unknown',
    }),

  disconnect: () =>
    set({
      address: null,
      connected: false,
      balance: 0n,
      walletType: 'unknown',
    }),

  setBalance: (bal: bigint) => set({ balance: bal }),

  setDemoMode: (demo: boolean) => set({ isDemoMode: demo }),
}))
