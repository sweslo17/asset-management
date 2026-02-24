import { useMemo } from 'react'
import { usePortfolioData } from './usePortfolioData'
import { investmentCostTWD, investmentMarketValueTWD } from '@/utils/currency'
import { findPrice, findExchangeRate, getLatestDate } from '@/utils/dateUtils'

export interface HoldingDetail {
  ticker: string
  name: string
  market: 'TW' | 'US'
  totalUnits: number
  avgCostPerUnit: number
  currentPrice: number | null
  totalCostTWD: number
  totalMarketValueTWD: number
  profitTWD: number
  profitPercent: number
  priceHistory: { date: string; close: number }[]
  buyPoints: { date: string; close: number; units: number; label: string; batchDesc: string }[]
  purchases: { date: string; batchDesc: string; units: number; pricePerUnit: number; costTWD: number }[]
}

export function useHoldingDetail(ticker: string | null) {
  const { data } = usePortfolioData()

  return useMemo<HoldingDetail | null>(() => {
    if (!ticker || !data) return null

    const investments = data.investments.filter((inv) => inv.ticker === ticker)
    if (investments.length === 0) return null

    const first = investments[0]
    const targetDate = getLatestDate(data.prices)

    // Aggregate units and cost
    let totalUnits = 0
    let totalCostTWD = 0
    let totalCostOriginal = 0 // cost in original currency (for avg cost per unit)
    let totalMarketValueTWD = 0

    const currentPrice = findPrice(data.prices, ticker, targetDate)
    const currentUsdTwd = first.market === 'US'
      ? (findExchangeRate(data.exchange_rates, targetDate) ?? first.exchange_rate)
      : 1

    for (const inv of investments) {
      totalUnits += inv.units
      const cost = investmentCostTWD(inv)
      totalCostTWD += cost
      totalCostOriginal += inv.units * inv.price_per_unit

      if (currentPrice !== null) {
        totalMarketValueTWD += investmentMarketValueTWD(inv, currentPrice, currentUsdTwd)
      } else {
        totalMarketValueTWD += cost
      }
    }

    const avgCostPerUnit = totalUnits !== 0 ? totalCostOriginal / totalUnits : 0
    const profitTWD = totalMarketValueTWD - totalCostTWD
    const profitPercent = totalCostTWD !== 0 ? profitTWD / totalCostTWD : 0

    // Price history for the ticker, sorted by date
    const priceHistory = data.prices
      .filter((p) => p.ticker === ticker)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({ date: p.date, close: p.close }))

    // Batch lookup map
    const batchMap = new Map(data.batches.map((b) => [b.batch_id, b]))

    // Buy points: locate each investment's purchase date on the price chart
    const unitSuffix = first.market === 'TW' ? '張' : '股'
    const buyPoints = investments.map((inv) => {
      const batch = batchMap.get(inv.batch_id)
      const close = findPrice(data.prices, ticker, inv.date) ?? inv.price_per_unit
      return {
        date: inv.date,
        close,
        units: inv.units,
        label: `${inv.units}${unitSuffix}`,
        batchDesc: batch?.description ?? '',
      }
    }).sort((a, b) => a.date.localeCompare(b.date))

    // Purchase records
    const purchases = investments
      .map((inv) => {
        const batch = batchMap.get(inv.batch_id)
        return {
          date: inv.date,
          batchDesc: batch?.description ?? '',
          units: inv.units,
          pricePerUnit: inv.price_per_unit,
          costTWD: investmentCostTWD(inv),
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      ticker,
      name: first.name,
      market: first.market,
      totalUnits,
      avgCostPerUnit,
      currentPrice,
      totalCostTWD,
      totalMarketValueTWD,
      profitTWD,
      profitPercent,
      priceHistory,
      buyPoints,
      purchases,
    }
  }, [ticker, data])
}
