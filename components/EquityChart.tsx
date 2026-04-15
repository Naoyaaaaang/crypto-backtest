'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

interface Props {
  data: { time: number; equity: number; price: number }[]
}

export default function EquityChart({ data }: Props) {
  if (!data.length) return null

  const formatted = data.map(d => ({
    ...d,
    date: new Date(d.time).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }),
  }))

  // 価格をスケール調整（equity基準に正規化して同一グラフに表示）
  const initPrice = formatted[0].price
  const initEquity = formatted[0].equity
  const scaled = formatted.map(d => ({
    ...d,
    priceScaled: (d.price / initPrice) * initEquity,
  }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={scaled} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          interval={Math.floor(scaled.length / 8)}
        />
        <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={v => `$${v.toFixed(0)}`} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#E5E7EB' }}
          formatter={(value, name) => [
            typeof value === 'number' ? `$${value.toFixed(2)}` : String(value),
            name === 'equity' ? '資産推移' : name === 'priceScaled' ? '価格（正規化）' : String(name),
          ]}
        />
        <Legend
          formatter={v => (v === 'equity' ? '資産推移' : '価格（正規化）')}
          wrapperStyle={{ color: '#D1D5DB' }}
        />
        <Line type="monotone" dataKey="equity" stroke="#10B981" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="priceScaled" stroke="#6B7280" dot={false} strokeWidth={1} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  )
}
