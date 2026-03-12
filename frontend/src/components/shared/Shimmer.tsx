/**
 * Shimmer skeleton loading components.
 * Animated gradient sweep over placeholder shapes.
 * Use these instead of spinners for content that has a known layout.
 */

function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-surface-800/60 ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  )
}

/** Skeleton for an AuctionCard in the browse grid */
export function ShimmerCard() {
  return (
    <div className="card relative overflow-hidden">
      {/* Top accent line */}
      <ShimmerBlock className="absolute top-0 left-0 right-0 !rounded-none h-[2px]" />

      {/* Header row */}
      <div className="flex items-start justify-between mb-4 pt-1">
        <div className="flex-1">
          <ShimmerBlock className="h-4 w-36 mb-2.5" />
          <ShimmerBlock className="h-3 w-24" />
        </div>
        <ShimmerBlock className="h-5 w-16 rounded-full" />
      </div>

      {/* Badge row */}
      <div className="flex gap-2 mb-4">
        <ShimmerBlock className="h-5 w-16 rounded-lg" />
        <ShimmerBlock className="h-5 w-14 rounded-lg" />
        <ShimmerBlock className="h-5 w-18 rounded-lg" />
      </div>

      {/* Stats row */}
      <div className="pt-3 border-t border-surface-700/50 flex justify-between">
        <ShimmerBlock className="h-3.5 w-20" />
        <ShimmerBlock className="h-3.5 w-24" />
      </div>
    </div>
  )
}

/** Skeleton for the AuctionDetail page header */
export function ShimmerDetail() {
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <ShimmerBlock className="h-4 w-40" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header card */}
          <div className="card relative overflow-hidden">
            <ShimmerBlock className="absolute top-0 left-0 right-0 !rounded-none h-0.5" />
            <div className="flex items-center gap-2 mb-3">
              <ShimmerBlock className="h-5 w-16 rounded-full" />
              <ShimmerBlock className="h-5 w-20 rounded-full" />
            </div>
            <ShimmerBlock className="h-7 w-64 mb-3" />
            <ShimmerBlock className="h-4 w-full mb-2" />
            <ShimmerBlock className="h-4 w-3/4 mb-6" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-surface-800/80 rounded-xl p-3">
                  <ShimmerBlock className="h-3 w-12 mb-2" />
                  <ShimmerBlock className="h-5 w-20" />
                </div>
              ))}
            </div>
          </div>

          {/* Action panel placeholder */}
          <div className="card">
            <ShimmerBlock className="h-5 w-40 mb-4" />
            <ShimmerBlock className="h-12 w-full mb-3" />
            <ShimmerBlock className="h-10 w-full rounded-xl" />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card">
            <ShimmerBlock className="h-4 w-24 mb-3" />
            <ShimmerBlock className="h-10 w-full mb-2" />
            <ShimmerBlock className="h-3 w-32" />
          </div>
          <div className="card">
            <ShimmerBlock className="h-4 w-28 mb-4" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between mb-3 last:mb-0">
                <ShimmerBlock className="h-3 w-20" />
                <ShimmerBlock className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Skeleton row for list items (MyActivity, record lists) */
export function ShimmerRow() {
  return (
    <div className="card">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <ShimmerBlock className="w-10 h-10 rounded-xl" />
          <div>
            <ShimmerBlock className="h-4 w-24 mb-2" />
            <ShimmerBlock className="h-3 w-32" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <ShimmerBlock className="h-4 w-20 mb-2 ml-auto" />
            <ShimmerBlock className="h-3 w-14 ml-auto" />
          </div>
          <ShimmerBlock className="w-4 h-4 rounded" />
        </div>
      </div>
    </div>
  )
}
