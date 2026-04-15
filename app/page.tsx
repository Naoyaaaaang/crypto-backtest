'use client'

import { useState, useCallback } from 'react'
import EquityChart from '@/components/EquityChart'
import StatsCards from '@/components/StatsCards'
import RankingTable from '@/components/RankingTable'
import Dashboard from '@/components/Dashboard'
import { generateSignals, strategyLabel, StrategyParams } from '@/lib/strategies'
import { runBacktest, Candle, BacktestResult } from '@/lib/backtest'

type Symbol = 'BTCUSDT' | 'ETHUSDT'

interface OptimizeRow {
  params: StrategyParams
  label: string
  totalReturn: number
  winRate: number
  maxDrawdown: number
  totalTrades: number
  sharpe: number
  finalEquity: number
}

const DEFAULT_PARAMS: StrategyParams = { type: 'ma_cross', shortPeriod: 10, longPeriod: 50 }

export default function Home() {
  const [symbol, setSymbol] = useState<Symbol>('BTCUSDT')
  const [params, setParams] = useState<StrategyParams>(DEFAULT_PARAMS)
  const [candles, setCandles] = useState<Candle[]>([])
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [ranking, setRanking] = useState<OptimizeRow[]>([])
  const [error, setError] = useState('')
  const [dataLoaded, setDataLoaded] = useState(false)

  const loadCandles = useCallback(async (sym: Symbol): Promise<Candle[]> => {
    const res = await fetch(`/api/klines?symbol=${sym}`)
    const json = await res.json()
    if (json.error) throw new Error(json.error)
    setCandles(json.candles)
    setDataLoaded(true)
    return json.candles
  }, [])

  const handleRun = async () => {
    setLoading(true)
    setError('')
    try {
      const data = dataLoaded && candles.length > 0 ? candles : await loadCandles(symbol)
      const signals = generateSignals(data, params)
      setResult(runBacktest(data, signals, 1000))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleOptimize = async () => {
    setOptimizing(true)
    setError('')
    try {
      const data = dataLoaded && candles.length > 0 ? candles : await loadCandles(symbol)
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candles: data }),
      })
      const json = await res.json()
      setRanking(json.results)
      if (json.results.length > 0) {
        const best: OptimizeRow = json.results[0]
        setParams(best.params)
        const signals = generateSignals(data, best.params)
        setResult(runBacktest(data, signals, 1000))
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setOptimizing(false)
    }
  }

  const handleSymbolChange = (sym: Symbol) => {
    setSymbol(sym)
    setCandles([])
    setDataLoaded(false)
    setResult(null)
    setRanking([])
  }

  const handleSelectStrategy = (row: OptimizeRow) => {
    if (!candles.length) return
    setParams(row.params)
    const signals = generateSignals(candles, row.params)
    setResult(runBacktest(candles, signals, 1000))
  }

  const [tab, setTab] = useState<'auto' | 'backtest'>('auto')

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-bold">仮想売買システム</h1>
          <p className="text-gray-400 text-sm mt-1">初期資金 $1,000 USDT</p>
        </div>

        {/* タブ */}
        <div className="flex gap-2 border-b border-gray-700 pb-0">
          {([['auto', '自動運用'], ['backtest', 'バックテスト']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
                tab === key
                  ? 'bg-gray-800 text-white border-b-2 border-indigo-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'auto' && <Dashboard />}

        {tab === 'backtest' && <>

        {/* コントロール */}
        <div className="bg-gray-800 rounded-2xl p-5 space-y-4">
          <div className="flex gap-3">
            {(['BTCUSDT', 'ETHUSDT'] as Symbol[]).map(s => (
              <button
                key={s}
                onClick={() => handleSymbolChange(s)}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  symbol === s ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {s === 'BTCUSDT' ? '₿ BTC' : 'Ξ ETH'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(['ma_cross', 'rsi', 'bbands'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    if (t === 'ma_cross') setParams({ type: 'ma_cross', shortPeriod: 10, longPeriod: 50 })
                    if (t === 'rsi') setParams({ type: 'rsi', rsiPeriod: 14, rsiBuy: 30, rsiSell: 70 })
                    if (t === 'bbands') setParams({ type: 'bbands', bbPeriod: 20, bbStd: 2.0 })
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    params.type === t ? 'bg-violet-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {t === 'ma_cross' ? 'MAクロス' : t === 'rsi' ? 'RSI' : 'ボリンジャーバンド'}
                </button>
              ))}
            </div>

            {params.type === 'ma_cross' && (
              <div className="flex gap-4 flex-wrap">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">短期EMA</span>
                  <input type="number" value={params.shortPeriod} onChange={e => setParams(p => ({ ...p, shortPeriod: +e.target.value }))} className="w-20 bg-gray-700 rounded px-2 py-1 text-sm" min={2} max={50} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">長期EMA</span>
                  <input type="number" value={params.longPeriod} onChange={e => setParams(p => ({ ...p, longPeriod: +e.target.value }))} className="w-20 bg-gray-700 rounded px-2 py-1 text-sm" min={10} max={500} />
                </label>
              </div>
            )}
            {params.type === 'rsi' && (
              <div className="flex gap-4 flex-wrap">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">RSI期間</span>
                  <input type="number" value={params.rsiPeriod} onChange={e => setParams(p => ({ ...p, rsiPeriod: +e.target.value }))} className="w-20 bg-gray-700 rounded px-2 py-1 text-sm" min={2} max={50} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">買い閾値</span>
                  <input type="number" value={params.rsiBuy} onChange={e => setParams(p => ({ ...p, rsiBuy: +e.target.value }))} className="w-20 bg-gray-700 rounded px-2 py-1 text-sm" min={10} max={45} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">売り閾値</span>
                  <input type="number" value={params.rsiSell} onChange={e => setParams(p => ({ ...p, rsiSell: +e.target.value }))} className="w-20 bg-gray-700 rounded px-2 py-1 text-sm" min={55} max={90} />
                </label>
              </div>
            )}
            {params.type === 'bbands' && (
              <div className="flex gap-4 flex-wrap">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">期間</span>
                  <input type="number" value={params.bbPeriod} onChange={e => setParams(p => ({ ...p, bbPeriod: +e.target.value }))} className="w-20 bg-gray-700 rounded px-2 py-1 text-sm" min={5} max={50} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">σ倍率</span>
                  <input type="number" value={params.bbStd} onChange={e => setParams(p => ({ ...p, bbStd: +e.target.value }))} className="w-20 bg-gray-700 rounded px-2 py-1 text-sm" step={0.5} min={1} max={4} />
                </label>
              </div>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleRun}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-semibold transition-colors"
            >
              {loading ? '実行中...' : 'バックテスト実行'}
            </button>
            <button
              onClick={handleOptimize}
              disabled={optimizing}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-semibold transition-colors"
            >
              {optimizing ? '最適化中...' : '自動最適化'}
            </button>
          </div>

          {result && (
            <p className="text-xs text-gray-500">現在の戦略: {strategyLabel(params)}</p>
          )}
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
            エラー: {error}
          </div>
        )}

        {result && (
          <>
            <StatsCards stats={result} />
            <div className="bg-gray-800 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-400 mb-4">資産推移</h2>
              <EquityChart data={result.equityCurve} />
            </div>
          </>
        )}

        {ranking.length > 0 && (
          <div className="bg-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-400">戦略ランキング（Sharpe順）</h2>
              <span className="text-xs text-emerald-400">詳細ボタンでグラフに反映</span>
            </div>
            <RankingTable rows={ranking} data={ranking} onSelect={handleSelectStrategy} />
          </div>
        )}

        </>}

      </div>
    </div>
  )
}
