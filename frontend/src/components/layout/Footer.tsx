import { Shield, ExternalLink, Github } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-surface-700/30 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-6">
          {/* Top row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-accent-500/20 flex items-center justify-center">
                <Shield className="w-3 h-3 text-accent-400" />
              </div>
              <span className="text-sm font-medium text-gray-400">Obscura</span>
              <span className="text-xs text-gray-600">Privacy-first sealed-bid auctions</span>
            </div>

            <div className="flex items-center gap-5">
              <Link to="/docs" className="text-sm text-gray-500 hover:text-accent-400 transition-colors">
                Docs
              </Link>
              <Link to="/browse" className="text-sm text-gray-500 hover:text-accent-400 transition-colors">
                Browse
              </Link>
              <a
                href="https://github.com/Ritik200238/obscura-auction"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-accent-400 transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                GitHub
              </a>
              <a
                href="https://testnet.aleoscan.io/program?id=obscura_v3.aleo"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-accent-400 transition-colors"
              >
                Explorer <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Bottom row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-surface-800/50">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="font-mono text-gray-500">obscura_v3.aleo</span>
              <span className="text-surface-700">·</span>
              <span>17 transitions</span>
              <span className="text-surface-700">·</span>
              <span>4 records</span>
              <span className="text-surface-700">·</span>
              <span>13 mappings</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Aleo Testnet
              </span>
              <span className="text-surface-700">|</span>
              <span>Built with Leo + Zero-Knowledge Proofs</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
