import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') || 'BTCUSDT'
  const limit = 1000

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=${limit}`
    const res = await fetch(url, { next: { revalidate: 3600 } })

    if (!res.ok) throw new Error(`Binance API error: ${res.status}`)

    const raw: [number, string, string, string, string, ...unknown[]][] = await res.json()
    const candles = raw.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
    }))

    return NextResponse.json({ candles })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
