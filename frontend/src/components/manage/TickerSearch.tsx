import { useState, useEffect, useRef } from 'react'
import { api } from '@/api/client'
import type { TickerSearchResult } from '@/api/types'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface TickerSearchProps {
  value: string
  onChange: (value: string) => void
  onSelect: (result: TickerSearchResult) => void
}

export function TickerSearch({ value, onChange, onSelect }: TickerSearchProps) {
  const [results, setResults] = useState<TickerSearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (value.length < 1) {
      setResults([])
      setShowDropdown(false)
      return
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await api.searchTicker(value)
        setResults(data)
        setShowDropdown(data.length > 0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        placeholder="搜尋代碼或名稱"
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          ...
        </div>
      )}
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <ul className="max-h-48 overflow-y-auto py-1">
            {results.map((r) => (
              <li
                key={r.ticker}
                className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-accent"
                onMouseDown={() => {
                  onSelect(r)
                  setShowDropdown(false)
                }}
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{r.ticker}</span>
                  <span className="ml-2 truncate text-muted-foreground">{r.name}</span>
                </div>
                <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                  {r.market}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
