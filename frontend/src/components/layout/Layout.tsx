import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Header from './Header'
import Footer from './Footer'
import AppSidebar from './AppSidebar'

interface LayoutProps {
  children: ReactNode
}

// Routes that get the Alpaca-style left sidebar (app-mode pages).
// Marketing/landing pages (/, /combinatorial, /learn when used as explainers) stay full-width.
const APP_ROUTES = [
  '/dashboard',
  '/my-activity',
  '/explorer',
  '/create',
  '/browse',
  '/rfq',
  '/fixed-sales',
  '/token-sale',
  '/docs',
  '/auction',      // /auction/:id
  '/dispute',      // /dispute/:id
]

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some(r => pathname === r || pathname.startsWith(`${r}/`))
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const showSidebar = isAppRoute(location.pathname)

  return (
    <div className="min-h-screen flex flex-col bg-surface-950 noise-bg">
      <Header />
      <div className="flex-1 flex">
        {showSidebar && <AppSidebar />}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
      <Footer />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1a1a3e',
            color: '#fff',
            border: '1px solid rgba(42, 42, 85, 0.8)',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#22c55e', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />
    </div>
  )
}
