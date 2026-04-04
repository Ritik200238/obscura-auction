import { ExternalLink, Github } from 'lucide-react'
import { Link } from 'react-router-dom'
import ObscuraLogo from '@/components/shared/ObscuraLogo'

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.04] mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col gap-5">
          {/* Top row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ObscuraLogo size={20} />
              <span className="text-sm font-medium text-gray-400">Obscura</span>
            </div>

            <div className="flex items-center gap-5">
              <Link to="/docs" className="text-xs text-gray-600 hover:text-gray-300 transition-colors duration-200">
                Docs
              </Link>
              <Link to="/browse" className="text-xs text-gray-600 hover:text-gray-300 transition-colors duration-200">
                Browse
              </Link>
              <Link to="/fixed-sales" className="text-xs text-gray-600 hover:text-gray-300 transition-colors duration-200">
                Buy Now
              </Link>
              <Link to="/token-sale" className="text-xs text-gray-600 hover:text-gray-300 transition-colors duration-200">
                Token Sales
              </Link>
              <a
                href="https://github.com/Ritik200238/obscura-auction"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-300 transition-colors duration-200"
              >
                <Github className="w-3 h-3" />
                GitHub
              </a>
              <a
                href="https://testnet.explorer.provable.com/program/obscura_core.aleo"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-300 transition-colors duration-200"
              >
                Explorer <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {/* Bottom row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/[0.04]">
            <span className="font-mono text-[11px] text-gray-600 tracking-wide">
              4 programs &middot; 52 transitions &middot; 10 records
            </span>
            <div className="flex items-center gap-3 text-[11px] text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <span className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-green-500 animate-ping opacity-75" />
                </span>
                Live on Aleo Testnet
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
