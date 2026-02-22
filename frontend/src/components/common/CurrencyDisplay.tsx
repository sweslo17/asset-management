import { cn } from '@/lib/utils'

interface CurrencyDisplayProps {
  value: number
  showSign?: boolean
  className?: string
}

export function CurrencyDisplay({ value, showSign = false, className }: CurrencyDisplayProps) {
  const formatted = new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value))

  const isPositive = value > 0
  const isNegative = value < 0
  const sign = showSign ? (isPositive ? '+' : isNegative ? '-' : '') : (isNegative ? '-' : '')

  return (
    <span
      className={cn(
        'tabular-nums',
        showSign && isPositive && 'text-emerald-400',
        showSign && isNegative && 'text-rose-400',
        className,
      )}
    >
      {sign}{formatted}
    </span>
  )
}
