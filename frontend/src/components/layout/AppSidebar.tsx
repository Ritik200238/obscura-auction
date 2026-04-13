import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Gavel, Search, Activity, Radar, Scale,
  ShoppingBag, Landmark, FileText, BookOpen, Sparkles,
} from 'lucide-react'

const sections = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/my-activity', label: 'My Activity', icon: Activity },
      { to: '/explorer', label: 'Explorer', icon: Radar },
    ],
  },
  {
    label: 'Create',
    items: [
      { to: '/create', label: 'Start Auction', icon: Gavel, primary: true },
      { to: '/combinatorial', label: 'Combinatorial', icon: Sparkles, badge: 'Novel' },
      { to: '/rfq', label: 'Procurement (RFQ)', icon: FileText },
      { to: '/fixed-sales', label: 'Fixed Sale', icon: ShoppingBag },
      { to: '/token-sale', label: 'Token Sale', icon: Landmark },
    ],
  },
  {
    label: 'Market',
    items: [
      { to: '/browse', label: 'Browse Auctions', icon: Search },
    ],
  },
]

export default function AppSidebar() {
  const location = useLocation()

  return (
    <aside className="hidden lg:block w-60 shrink-0 border-r border-surface-800/80 bg-surface-950/80 backdrop-blur-xl sticky top-14 self-start h-[calc(100vh-56px)] overflow-y-auto">
      <nav className="px-3 py-5 space-y-6">
        {sections.map(section => (
          <div key={section.label}>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600 mb-2 px-2">
              {section.label}
            </h3>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = location.pathname === item.to || (item.to === '/dispute' && location.pathname.startsWith('/dispute'))
                const Icon = item.icon
                const isPrimary = 'primary' in item && item.primary
                const badge = 'badge' in item ? item.badge : null
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                      active
                        ? 'bg-accent-500/15 text-accent-300 font-medium'
                        : isPrimary
                          ? 'bg-accent-500 text-surface-950 hover:bg-accent-400 font-semibold'
                          : 'text-gray-400 hover:text-white hover:bg-surface-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? 'text-accent-400' : ''}`} />
                    <span className="flex-1">{item.label}</span>
                    {badge && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        isPrimary
                          ? 'bg-surface-950/30 text-surface-950'
                          : 'bg-brand-cyan/20 text-brand-cyan'
                      }`}>
                        {badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        <div className="pt-4 border-t border-surface-800">
          <a
            href="https://testnet.explorer.provable.com/program/obscura_core_v4.aleo"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>View Contracts</span>
          </a>
          <a
            href="https://faucet.provable.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Testnet Faucet</span>
          </a>
        </div>
      </nav>
    </aside>
  )
}
