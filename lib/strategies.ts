import { Candle, Signal } from './backtest'
import { ema, rsi, bollingerBands } from './indicators'

export interface StrategyParams {
  type: 'ma_cross' | 'rsi' | 'bbands'
  // MA Cross
  shortPeriod?: number
  longPeriod?: number
  // RSI
  rsiPeriod?: number
  rsiBuy?: number
  rsiSell?: number
  // BBands
  bbPeriod?: number
  bbStd?: number
}

export function generateSignals(candles: Candle[], params: StrategyParams): Signal[] {
  const closes = candles.map(c => c.close)
  const signals: Signal[] = new Array(closes.length).fill(0)

  if (params.type === 'ma_cross') {
    const short = ema(closes, params.shortPeriod!)
    const long = ema(closes, params.longPeriod!)

    for (let i = 1; i < closes.length; i++) {
      if (short[i] === null || long[i] === null || short[i - 1] === null || long[i - 1] === null) continue
      const prevAbove = (short[i - 1] as number) > (long[i - 1] as number)
      const currAbove = (short[i] as number) > (long[i] as number)
      if (!prevAbove && currAbove) signals[i] = 1  // ゴールデンクロス
      if (prevAbove && !currAbove) signals[i] = -1 // デッドクロス
    }
  }

  if (params.type === 'rsi') {
    const rsiValues = rsi(closes, params.rsiPeriod!)
    let inPosition = false

    for (let i = 0; i < closes.length; i++) {
      const r = rsiValues[i]
      if (r === null) continue
      if (!inPosition && r < params.rsiBuy!) {
        signals[i] = 1
        inPosition = true
      } else if (inPosition && r > params.rsiSell!) {
        signals[i] = -1
        inPosition = false
      }
    }
  }

  if (params.type === 'bbands') {
    const bb = bollingerBands(closes, params.bbPeriod!, params.bbStd!)
    let inPosition = false

    for (let i = 0; i < closes.length; i++) {
      const lower = bb.lower[i]
      const upper = bb.upper[i]
      if (lower === null || upper === null) continue

      if (!inPosition && closes[i] <= lower) {
        signals[i] = 1
        inPosition = true
      } else if (inPosition && closes[i] >= upper) {
        signals[i] = -1
        inPosition = false
      }
    }
  }

  return signals
}

export function strategyLabel(params: StrategyParams): string {
  if (params.type === 'ma_cross') return `MAクロス (${params.shortPeriod}/${params.longPeriod})`
  if (params.type === 'rsi') return `RSI (${params.rsiPeriod}, ${params.rsiBuy}/${params.rsiSell})`
  if (params.type === 'bbands') return `BB (${params.bbPeriod}, σ${params.bbStd})`
  return '不明'
}

// 最適化用パラメータ候補
export function getAllParamCombinations(): StrategyParams[] {
  const combos: StrategyParams[] = []

  // MA Cross
  const shortPeriods = [5, 10, 20, 25]
  const longPeriods = [50, 75, 100, 200]
  for (const s of shortPeriods) {
    for (const l of longPeriods) {
      if (s >= l) continue
      combos.push({ type: 'ma_cross', shortPeriod: s, longPeriod: l })
    }
  }

  // RSI
  const rsiPeriods = [7, 14, 21]
  const buyThresholds = [20, 25, 30]
  const sellThresholds = [65, 70, 75, 80]
  for (const p of rsiPeriods) {
    for (const b of buyThresholds) {
      for (const s of sellThresholds) {
        combos.push({ type: 'rsi', rsiPeriod: p, rsiBuy: b, rsiSell: s })
      }
    }
  }

  // BBands
  const bbPeriods = [14, 20, 30]
  const bbStds = [1.5, 2.0, 2.5]
  for (const p of bbPeriods) {
    for (const s of bbStds) {
      combos.push({ type: 'bbands', bbPeriod: p, bbStd: s })
    }
  }

  return combos
}
