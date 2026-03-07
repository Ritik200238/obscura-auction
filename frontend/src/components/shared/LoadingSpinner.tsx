import { Loader2 } from 'lucide-react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  message?: string
  className?: string
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
}

export default function LoadingSpinner({ size = 'md', message, className = '' }: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <Loader2 className={`${sizeMap[size]} text-accent-400 animate-spin ${message ? 'mb-3' : ''}`} />
      {message && <p className="text-gray-400 text-sm">{message}</p>}
    </div>
  )
}

/** Skeleton card for loading states */
export function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="h-4 w-32 shimmer-bg mb-2" />
          <div className="h-3 w-20 shimmer-bg" />
        </div>
        <div className="h-5 w-16 shimmer-bg rounded-full" />
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-5 w-14 shimmer-bg rounded-lg" />
        <div className="h-5 w-12 shimmer-bg rounded-lg" />
        <div className="h-5 w-16 shimmer-bg rounded-lg" />
      </div>
      <div className="pt-3 border-t border-surface-700/50 flex justify-between">
        <div className="h-3 w-16 shimmer-bg" />
        <div className="h-3 w-20 shimmer-bg" />
      </div>
    </div>
  )
}

/** Skeleton row for list items */
export function SkeletonRow() {
  return (
    <div className="card animate-pulse">
      <div className="flex justify-between items-center">
        <div>
          <div className="h-3 w-20 shimmer-bg mb-2" />
          <div className="h-4 w-32 shimmer-bg" />
        </div>
        <div>
          <div className="h-3 w-16 shimmer-bg mb-2 ml-auto" />
          <div className="h-4 w-24 shimmer-bg" />
        </div>
      </div>
    </div>
  )
}
