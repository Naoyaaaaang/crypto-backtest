import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  const dataDir = path.join(process.cwd(), 'data')
  const portfolioPath = path.join(dataDir, 'portfolio.json')
  const tradesPath = path.join(dataDir, 'trades.json')

  try {
    const portfolio = fs.existsSync(portfolioPath)
      ? JSON.parse(fs.readFileSync(portfolioPath, 'utf-8'))
      : null

    const trades = fs.existsSync(tradesPath)
      ? JSON.parse(fs.readFileSync(tradesPath, 'utf-8'))
      : []

    return NextResponse.json({ portfolio, trades })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
