import { useState, useId } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, CheckCircle, QrCode, Download } from 'lucide-react'

interface AuctionQRProps {
  value: string
  label?: string
  sublabel?: string
  size?: number
}

export default function AuctionQR({ value, label, sublabel, size = 160 }: AuctionQRProps) {
  const [copied, setCopied] = useState(false)
  const qrId = useId()
  const svgId = `qr-${qrId.replace(/:/g, '')}`

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const handleDownload = () => {
    const svg = document.getElementById(svgId)
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      canvas.width = size * 2
      canvas.height = size * 2
      ctx?.drawImage(img, 0, 0, size * 2, size * 2)
      const pngUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = 'obscura-auction-qr.png'
      link.href = pngUrl
      link.click()
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {label && (
        <div className="text-center">
          <p className="text-xs text-gray-500 flex items-center gap-1 justify-center">
            <QrCode className="w-3 h-3" />
            {label}
          </p>
        </div>
      )}

      <div className="p-3 rounded-xl bg-white">
        <QRCodeSVG
          id={svgId}
          value={value}
          size={size}
          level="M"
          bgColor="#ffffff"
          fgColor="#1a1a2e"
        />
      </div>

      {sublabel && (
        <p className="text-[10px] text-gray-600 text-center max-w-[200px] leading-relaxed">
          {sublabel}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 hover:border-accent-500/30 transition-all"
        >
          {copied ? (
            <>
              <CheckCircle className="w-3 h-3 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy Link
            </>
          )}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 hover:border-accent-500/30 transition-all"
        >
          <Download className="w-3 h-3" />
          Save
        </button>
      </div>
    </div>
  )
}
