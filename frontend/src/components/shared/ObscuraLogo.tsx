interface ObscuraLogoProps {
  className?: string
  size?: number
}

export default function ObscuraLogo({ className = '', size = 24 }: ObscuraLogoProps) {
  return (
    <img
      src="/favicon.svg"
      alt="Obscura"
      width={size}
      height={size}
      className={`rounded-full ${className}`}
    />
  )
}
