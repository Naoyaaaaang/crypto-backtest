interface Stats {
  finalEquity: number
  totalReturn: number
  winRate: number
  maxDrawdown: number
  totalTrades: number
  sharpe: number
}

export default function StatsCards({ stats }: { stats: Stats }) {
  const cards = [
    {
      label: '最終資産',
      value: `$${stats.finalEquity.toFixed(2)}`,
      sub: `初期 $1,000.00`,
      color: stats.finalEquity >= 1000 ? 'text-emerald-400' : 'text-red-400',
    },
    {
      label: '総リターン',
      value: `${stats.totalReturn >= 0 ? '+' : ''}${stats.totalReturn.toFixed(2)}%`,
      sub: '',
      color: stats.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400',
    },
    {
      label: '勝率',
      value: `${stats.winRate.toFixed(1)}%`,
      sub: `${stats.totalTrades}トレード`,
      color: stats.winRate >= 50 ? 'text-emerald-400' : 'text-yellow-400',
    },
    {
      label: '最大ドローダウン',
      value: `-${stats.maxDrawdown.toFixed(2)}%`,
      sub: '',
      color: stats.maxDrawdown > 30 ? 'text-red-400' : stats.maxDrawdown > 15 ? 'text-yellow-400' : 'text-emerald-400',
    },
    {
      label: 'シャープレシオ',
      value: stats.sharpe.toFixed(2),
      sub: '1以上が良好',
      color: stats.sharpe >= 1 ? 'text-emerald-400' : stats.sharpe >= 0 ? 'text-yellow-400' : 'text-red-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-1">{c.label}</p>
          <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          {c.sub && <p className="text-gray-500 text-xs mt-1">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}
