import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Gavel, ShoppingBag, Landmark, FileText } from 'lucide-react'

const tabs = [
  { id: 'auctions', label: 'Auctions', icon: Gavel, path: '/browse' },
  { id: 'buy-now', label: 'Buy Now', icon: ShoppingBag, path: '/fixed-sales' },
  { id: 'token-sales', label: 'Token Sales', icon: Landmark, path: '/token-sale' },
  { id: 'procurement', label: 'Procurement', icon: FileText, path: '/rfq' },
] as const

export default function PlatformTabs() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="relative mb-6">
      <div className="flex items-center gap-0 border-b border-white/[0.06] overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path
          const TabIcon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                isActive
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <TabIcon className="w-4 h-4" />
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="platform-tab-indicator"
                  className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent-400 rounded-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
