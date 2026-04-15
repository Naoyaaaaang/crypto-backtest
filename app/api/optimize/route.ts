import { NextRequest, NextResponse } from 'next/server'
import { Candle, runBacktest } from '@/lib/backtest'
import { generateSignals, getAllParamCombinations, strategyLabel, StrategyParams } from '@/lib/strategies'

export async function POST(req: NextRequest) {
  const { candles }: { candles: Candle[] } = await req.json()

  const paramList = getAllParamCombinations()
  const results = []

  for (const params of paramList) {
    try {
      const signals = generateSignals(candles, params)
      const result = runBacktest(candles, signals, 1000)
      results.push({
        params,
        label: strategyLabel(params),
        totalReturn: result.totalReturn,
        winRate: result.winRate,
        maxDrawdown: result.maxDrawdown,
        totalTrades: result.totalTrades,
        sharpe: result.sharpe,
        finalEquity: result.finalEquity,
      })
    } catch {
      // スキップ
    }
  }

  // シャープレシオ → 総リターン順でランク付け
  results.sort((a, b) => {
    if (b.sharpe !== a.sharpe) return b.sharpe - a.sharpe
    return b.totalReturn - a.totalReturn
  })

  return NextResponse.json({ results: results.slice(0, 30) })
}

export async function GET() {
  const paramList = getAllParamCombinations()
  return NextResponse.json({ count: paramList.length })
}
