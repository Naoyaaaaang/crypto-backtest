export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export interface Trade {
  entryTime: number
  exitTime: number
  entryPrice: number
  exitPrice: number
  pnl: number
  pnlPct: number
  side: 'long'
}

export interface BacktestResult {
  equityCurve: { time: number; equity: number; price: number }[]
  trades: Trade[]
  finalEquity: number
  totalReturn: number
  winRate: number
  maxDrawdown: number
  totalTrades: number
  sharpe: number
}

export type Signal = 1 | -1 | 0 // 1=buy, -1=sell, 0=hold

export function runBacktest(
  candles: Candle[],
  signals: Signal[],
  initialCapital = 1000
): BacktestResult {
  let equity = initialCapital
  let position = 0 // units held
  let entryPrice = 0
  let entryTime = 0
  const equityCurve: { time: number; equity: number; price: number }[] = []
  const trades: Trade[] = []
  let peakEquity = initialCapital

  for (let i = 0; i < candles.length; i++) {
    const { close, time } = candles[i]
    const sig = signals[i]

    // ポジションなし + 買いシグナル
    if (sig === 1 && position === 0) {
      position = equity / close
      entryPrice = close
      entryTime = time
      equity = 0
    }

    // ポジションあり + 売りシグナル
    if (sig === -1 && position > 0) {
      const exitValue = position * close
      const pnl = exitValue - position * entryPrice
      const pnlPct = ((close - entryPrice) / entryPrice) * 100
      trades.push({
        entryTime,
        exitTime: time,
        entryPrice,
        exitPrice: close,
        pnl,
        pnlPct,
        side: 'long',
      })
      equity = exitValue
      position = 0
    }

    const currentEquity = position > 0 ? position * close : equity
    peakEquity = Math.max(peakEquity, currentEquity)
    equityCurve.push({ time, equity: Math.round(currentEquity * 100) / 100, price: close })
  }

  // ポジション強制クローズ
  if (position > 0) {
    const lastCandle = candles[candles.length - 1]
    const exitValue = position * lastCandle.close
    const pnl = exitValue - position * entryPrice
    const pnlPct = ((lastCandle.close - entryPrice) / entryPrice) * 100
    trades.push({
      entryTime,
      exitTime: lastCandle.time,
      entryPrice,
      exitPrice: lastCandle.close,
      pnl,
      pnlPct,
      side: 'long',
    })
    equity = exitValue
  }

  const finalEquity = equity
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100

  const wins = trades.filter(t => t.pnl > 0).length
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0

  // 最大ドローダウン
  let maxDD = 0
  let peak = initialCapital
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity
    const dd = ((peak - p.equity) / peak) * 100
    if (dd > maxDD) maxDD = dd
  }

  // シャープレシオ（簡易）
  const returns = equityCurve.slice(1).map((p, i) => {
    const prev = equityCurve[i].equity
    return prev > 0 ? (p.equity - prev) / prev : 0
  })
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length
  const stdReturn = Math.sqrt(
    returns.reduce((acc, r) => acc + (r - meanReturn) ** 2, 0) / returns.length
  )
  const sharpe = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(24 * 365) : 0

  return {
    equityCurve,
    trades,
    finalEquity: Math.round(finalEquity * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    totalTrades: trades.length,
    sharpe: Math.round(sharpe * 100) / 100,
  }
}
