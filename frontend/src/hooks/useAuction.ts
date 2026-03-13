import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchMapping, fetchBlockHeight, parseAuctionData, parseU128, parseField } from '@/lib/aleo'
import { useAuctionStore } from '@/stores/auctionStore'
import type { AuctionData } from '@/types'

interface AuctionDetails {
  auction: AuctionData | null
  highestBid: bigint
  secondHighest: bigint
  winner: string | null
  blockHeight: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Hook to fetch and track a single auction's on-chain data.
 * Auto-refreshes every 30 seconds.
 */
export function useAuction(auctionId: string | undefined): AuctionDetails {
  const { selectAuction, selectedAuction } = useAuctionStore()
  const [highestBid, setHighestBid] = useState<bigint>(0n)
  const [secondHighest, setSecondHighest] = useState<bigint>(0n)
  const [winner, setWinner] = useState<string | null>(null)
  const [blockHeight, setBlockHeight] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const fetchIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  const fetchAuctionData = useCallback(async () => {
    if (!auctionId) return

    const thisId = auctionId
    fetchIdRef.current = thisId

    setLoading(true)
    setError(null)

    try {
      const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`

      const [auctionRaw, highestRaw, secondRaw, winnerRaw, currentHeight] = await Promise.all([
        fetchMapping('auctions', key),
        fetchMapping('highest_bids', key),
        fetchMapping('second_highest_bids', key),
        fetchMapping('auction_winners', key),
        fetchBlockHeight(),
      ])

      // Discard stale response if auctionId changed during fetch
      if (!mountedRef.current || fetchIdRef.current !== thisId) return

      setBlockHeight(currentHeight)

      if (!auctionRaw) {
        setError('Auction not found on-chain')
        setLoading(false)
        return
      }

      const auction = parseAuctionData(auctionRaw, auctionId)
      selectAuction(auction)

      if (highestRaw) {
        setHighestBid(parseU128(highestRaw))
      }
      if (secondRaw) {
        setSecondHighest(parseU128(secondRaw))
      }
      if (winnerRaw) {
        setWinner(parseField(winnerRaw))
      }

      setLoading(false)
    } catch (err) {
      if (!mountedRef.current || fetchIdRef.current !== thisId) return
      setError(err instanceof Error ? err.message : 'Failed to fetch auction')
      setLoading(false)
    }
  }, [auctionId, selectAuction])

  // Clear stale auction data when navigating to a different auction
  useEffect(() => {
    selectAuction(null)
  }, [auctionId, selectAuction])

  // Initial fetch
  useEffect(() => {
    fetchAuctionData()
  }, [fetchAuctionData])

  // Auto-refresh every 15 seconds (also updates block height since fetchAuctionData calls fetchBlockHeight)
  useEffect(() => {
    if (!auctionId) return
    const interval = setInterval(fetchAuctionData, 15_000)
    return () => clearInterval(interval)
  }, [auctionId, fetchAuctionData])

  return {
    auction: selectedAuction,
    highestBid,
    secondHighest,
    winner,
    blockHeight,
    loading,
    error,
    refresh: fetchAuctionData,
  }
}
