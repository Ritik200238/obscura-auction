import { create } from 'zustand'
import type { AuctionData } from '@/types'

interface AuctionFilters {
  status: number | null
  tokenType: number | null
  mode: number | null
}

interface AuctionState {
  auctions: AuctionData[]
  selectedAuction: AuctionData | null
  loading: boolean
  error: string | null
  filters: AuctionFilters

  setAuctions: (auctions: AuctionData[]) => void
  addAuction: (auction: AuctionData) => void
  selectAuction: (auction: AuctionData | null) => void
  updateAuction: (auctionId: string, data: Partial<AuctionData>) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setFilters: (filters: Partial<AuctionFilters>) => void
  filteredAuctions: () => AuctionData[]
}

export const useAuctionStore = create<AuctionState>((set, get) => ({
  auctions: [],
  selectedAuction: null,
  loading: false,
  error: null,
  filters: { status: null, tokenType: null, mode: null },

  setAuctions: (auctions) => set({ auctions }),

  addAuction: (auction) =>
    set((state) => ({
      auctions: [auction, ...state.auctions],
    })),

  selectAuction: (auction) => set({ selectedAuction: auction }),

  updateAuction: (auctionId, data) =>
    set((state) => ({
      auctions: state.auctions.map((a) =>
        a.auction_id === auctionId ? { ...a, ...data } : a
      ),
      selectedAuction:
        state.selectedAuction?.auction_id === auctionId
          ? { ...state.selectedAuction, ...data }
          : state.selectedAuction,
    })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),

  filteredAuctions: () => {
    const { auctions, filters } = get()
    return auctions.filter((a) => {
      if (filters.status !== null && a.status !== filters.status) return false
      if (filters.tokenType !== null && a.token_type !== filters.tokenType) return false
      if (filters.mode !== null && a.auction_mode !== filters.mode) return false
      return true
    })
  },
}))
