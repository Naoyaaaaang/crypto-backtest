'use client'

import { useEffect, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

interface Trade {
  id: number
  strategy: string
  strategyLabel: string
  symbol: string
  side: string
  price: number
  units: number
  time: number
  closed: boolean
  exitPrice: number | null
  exitTime: number | null
  pnl: number | null
  pnlPct: number | null
}

interface Portfolio {
  cash: number
  positionUnits: number
  positionEntry: number
  positionStrategy: string | null
  totalValue: number
  currentPrice: number
  startedAt: string | null
  lastUpdated: string | null
}

const INITIAL_CAPITAL = 1000

export default function Dashboard() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/portfolio')
      const json = await res.json()
      if (json.portfolio) setPortfolio(json.portfolio)
      if (json.trades) setTrades(json.trades)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 60000) // 1分ごとに更新
    return () => clearInterval(timer)
  }, [])

  // 戦略別スコア集計
  const strategyStats = (() => {
    const map: Record<string, { label: string; wins: number; total: number }> = {}
    for (const t of trades.filter(t => t.closed)) {
      if (!map[t.strategy]) map[t.strategy] = { label: t.strategyLabel, wins: 0, total: 0 }
      map[t.strategy].total++
      if ((t.pnl ?? 0) > 0) map[t.strategy].wins++
    }
    return Object.entries(map)
      .map(([key, v]) => ({ key, ...v, winRate: Math.round(v.wins / v.total * 100) }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5)
  })()

  // 資産推移（クローズ済みトレードから）
  const equityCurve = (() => {
    let equity = INITIAL_CAPITAL
    const points: { label: string; equity: number }[] = [
      { label: '開始', equity: INITIAL_CAPITAL }
    ]
    for (const t of trades.filter(t => t.closed && t.pnl !== null)) {
      equity += t.pnl!
      points.push({
        label: new Date(t.exitTime!).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }),
        equity: Math.round(equity * 100) / 100
      })
    }
    return points
  })()

  const closedTrades = trades.filter(t => t.closed)
  const wins = closedTrades.filter(t => (t.pnl ?? 0) > 0).length
  const winRate = closedTrades.length > 0 ? Math.round(wins / closedTrades.length * 100) : 0
  const totalReturn = portfolio ? ((portfolio.totalValue - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        読み込み中...
      </div>
    )
  }

  if (!portfolio) {
    return (
      <div className="bg-gray-800 rounded-2xl p-6 text-center text-gray-400">
        <p className="text-lg mb-2">まだ運用が始まっていません</p>
        <p className="text-sm">GitHubにpushしてVercelにデプロイすると、毎時0分に自動売買が始まります</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ステータスバー */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>最終更新: {portfolio.lastUpdated ? new Date(portfolio.lastUpdated).toLocaleString('ja-JP') : '未実行'}</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
          毎時0分に自動実行中
        </span>
      </div>

      {/* 主要指標 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">総資産</p>
          <p className={`text-xl font-bold ${portfolio.totalValue >= INITIAL_CAPITAL ? 'text-emerald-400' : 'text-red-400'}`}>
            ${portfolio.totalValue.toFixed(2)}
          </p>
          <p className="text-gray-500 text-xs mt-1">初期 $1,000.00</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">総リターン</p>
          <p className={`text-xl font-bold ${totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
          </p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">勝率</p>
          <p className={`text-xl font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-yellow-400'}`}>
            {winRate}%
          </p>
          <p className="text-gray-500 text-xs mt-1">{closedTrades.length}トレード</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">現在のポジション</p>
          {portfolio.positionUnits > 0 ? (
            <>
              <p className="text-yellow-400 text-sm font-bold">保有中</p>
              <p className="text-gray-500 text-xs mt-1">エントリー ${portfolio.positionEntry.toFixed(0)}</p>
            </>
          ) : (
            <p className="text-gray-400 text-sm">待機中</p>
          )}
        </div>
      </div>

      {/* 現在使用中の戦略 */}
      {portfolio.positionUnits > 0 && portfolio.positionStrategy && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4 flex items-center gap-3">
          <span className="text-yellow-400 text-lg">⚡</span>
          <div>
            <p className="text-yellow-300 text-sm font-semibold">現在の戦略</p>
            <p className="text-yellow-400 text-xs">{portfolio.positionStrategy}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">含み損益</p>
            {(() => {
              const unrealized = (portfolio.currentPrice - portfolio.positionEntry) / portfolio.positionEntry * 100
              return (
                <p className={`text-sm font-bold ${unrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {unrealized >= 0 ? '+' : ''}{unrealized.toFixed(2)}%
                </p>
              )
            })()}
          </div>
        </div>
      )}

      {/* 資産推移グラフ */}
      {equityCurve.length > 1 && (
        <div className="bg-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">資産推移</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={v => `$${v}`} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v) => [typeof v === 'number' ? `$${v.toFixed(2)}` : String(v), '資産']}
              />
              <Line type="monotone" dataKey="equity" stroke="#10B981" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 戦略別勝率 */}
        {strategyStats.length > 0 && (
          <div className="bg-gray-800 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-400 mb-4">戦略別勝率（上位5）</h2>
            <div className="space-y-2">
              {strategyStats.map(s => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-300 w-40 shrink-0">{s.label}</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${s.winRate >= 60 ? 'bg-emerald-500' : s.winRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${s.winRate}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold w-10 text-right ${s.winRate >= 60 ? 'text-emerald-400' : s.winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {s.winRate}%
                  </span>
                  <span className="text-xs text-gray-500 w-12 text-right">{s.total}回</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 直近トレード履歴 */}
        <div className="bg-gray-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">直近トレード</h2>
          {closedTrades.length === 0 ? (
            <p className="text-gray-500 text-sm">まだトレード履歴がありません</p>
          ) : (
            <div className="space-y-2">
              {[...closedTrades].reverse().slice(0, 8).map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 w-32 shrink-0">
                    {new Date(t.time).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-gray-300 flex-1 truncate">{t.strategyLabel}</span>
                  <span className={`font-bold ml-2 ${(t.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(t.pnl ?? 0) >= 0 ? '+' : ''}${t.pnl?.toFixed(2) ?? '0.00'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
