import React, { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { pageVariants } from '@/lib/animations'
import { BlockHeightProvider } from '@/contexts/BlockHeightContext'
import Layout from './components/layout/Layout'
import Landing from './pages/Landing'
import Browse from './pages/Browse'
import CreateAuction from './pages/CreateAuction'

const AuctionDetail = React.lazy(() => import('./pages/AuctionDetail'))
const MyActivity = React.lazy(() => import('./pages/MyActivity'))
const Docs = React.lazy(() => import('./pages/Docs'))
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const VickreyExplainer = React.lazy(() => import('./pages/VickreyExplainer'))

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-950 flex items-center justify-center p-8">
          <div className="card max-w-lg text-center">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-gray-400 text-sm mb-4">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.href = '/'
              }}
              className="btn-primary"
            >
              Return Home
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <Routes location={location}>
          <Route path="/" element={<Landing />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/create" element={<CreateAuction />} />
          <Route path="/auction/:id" element={<AuctionDetail />} />
          <Route path="/my-activity" element={<MyActivity />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/learn" element={<VickreyExplainer />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BlockHeightProvider>
        <ScrollToTop />
        <Layout>
          <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <AnimatedRoutes />
          </Suspense>
        </Layout>
      </BlockHeightProvider>
    </ErrorBoundary>
  )
}
