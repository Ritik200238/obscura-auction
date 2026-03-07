import { Shield, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-surface-700/30 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-accent-500/20 flex items-center justify-center">
              <Shield className="w-3 h-3 text-accent-400" />
            </div>
            <span className="text-sm text-gray-500">Obscura</span>
            <span className="text-xs text-gray-700">Privacy-first sealed-bid auctions</span>
          </div>

          <div className="flex items-center gap-5">
            <Link to="/docs" className="text-sm text-gray-500 hover:text-accent-400 transition-colors">
              Docs
            </Link>
            <Link to="/browse" className="text-sm text-gray-500 hover:text-accent-400 transition-colors">
              Browse
            </Link>
            <a
              href="https://aleo.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-accent-400 transition-colors"
            >
              Aleo <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Testnet
            </span>
            <span className="text-gray-700">|</span>
            <span>Aleo ZK Proofs</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
