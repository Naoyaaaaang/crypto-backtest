interface RankRow {
  label: string
  totalReturn: number
  winRate: number
  maxDrawdown: number
  totalTrades: number
  sharpe: number
  finalEquity: number
}

interface Props<T extends RankRow> {
  rows: T[]
  onSelect: (row: T) => void
  data: T[]
}

export default function RankingTable<T extends RankRow>({ rows, onSelect, data }: Props<T>) {
  if (!rows.length) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700">
            <th className="text-left py-2 px-3">#</th>
            <th className="text-left py-2 px-3">戦略</th>
            <th className="text-right py-2 px-3">リターン</th>
            <th className="text-right py-2 px-3">勝率</th>
            <th className="text-right py-2 px-3">MDD</th>
            <th className="text-right py-2 px-3">取引数</th>
            <th className="text-right py-2 px-3">Sharpe</th>
            <th className="py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
            >
              <td className="py-2 px-3 text-gray-500">{i + 1}</td>
              <td className="py-2 px-3 font-medium text-gray-200">{row.label}</td>
              <td className={`py-2 px-3 text-right font-bold ${row.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {row.totalReturn >= 0 ? '+' : ''}{row.totalReturn.toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-right text-gray-300">{row.winRate.toFixed(1)}%</td>
              <td className="py-2 px-3 text-right text-yellow-400">-{row.maxDrawdown.toFixed(2)}%</td>
              <td className="py-2 px-3 text-right text-gray-400">{row.totalTrades}</td>
              <td className={`py-2 px-3 text-right ${row.sharpe >= 1 ? 'text-emerald-400' : row.sharpe >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                {row.sharpe.toFixed(2)}
              </td>
              <td className="py-2 px-3">
                <button
                  onClick={() => onSelect(data[i])}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded transition-colors"
                >
                  詳細
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
