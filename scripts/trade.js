const fs = require('fs')
const path = require('path')
const https = require('https')

const DATA_DIR = path.join(__dirname, '..', 'data')
const PORTFOLIO_FILE = path.join(DATA_DIR, 'portfolio.json')
const TRADES_FILE = path.join(DATA_DIR, 'trades.json')
const SYMBOL = 'BTCUSDT'
const INITIAL_CAPITAL = 1000
const CANDLE_LIMIT = 300

// ========== インジケーター ==========
function ema(prices, period) {
  const result = new Array(prices.length).fill(null)
  const k = 2 / (period + 1)
  let prev = null
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) continue
    if (prev === null) {
      prev = prices.slice(0, period).reduce((a, b) => a + b, 0) / period
    } else {
      prev = prices[i] * k + prev * (1 - k)
    }
    result[i] = prev
  }
  return result
}

function rsi(prices, period) {
  const result = new Array(prices.length).fill(null)
  if (prices.length < period + 1) return result
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1]
    if (diff > 0) gains += diff
    else losses -= diff
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  for (let i = period; i < prices.length; i++) {
    if (i === period) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
      result[i] = 100 - 100 / (1 + rs)
      continue
    }
    const diff = prices[i] - prices[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result[i] = 100 - 100 / (1 + rs)
  }
  return result
}

function sma(prices, period) {
  return prices.map((_, i) => {
    if (i < period - 1) return null
    return prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  })
}

function bollingerBands(prices, period, stdMult) {
  const middle = sma(prices, period)
  const upper = [], lower = []
  for (let i = 0; i < prices.length; i++) {
    if (middle[i] === null) { upper.push(null); lower.push(null); continue }
    const slice = prices.slice(i - period + 1, i + 1)
    const mean = middle[i]
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period
    const std = Math.sqrt(variance)
    upper.push(mean + stdMult * std)
    lower.push(mean - stdMult * std)
  }
  return { upper, middle, lower }
}

// ========== シグナル生成 ==========
function getSignal(closes, params, inPosition) {
  const n = closes.length
  if (n < 2) return 'hold'

  if (params.type === 'ma_cross') {
    const short = ema(closes, params.shortPeriod)
    const long = ema(closes, params.longPeriod)
    const i = n - 1
    if (!short[i] || !long[i] || !short[i - 1] || !long[i - 1]) return 'hold'
    const prevAbove = short[i - 1] > long[i - 1]
    const currAbove = short[i] > long[i]
    if (!prevAbove && currAbove) return 'buy'
    if (prevAbove && !currAbove) return 'sell'
    return 'hold'
  }

  if (params.type === 'rsi') {
    const values = rsi(closes, params.rsiPeriod)
    const r = values[n - 1]
    if (r === null) return 'hold'
    if (!inPosition && r < params.rsiBuy) return 'buy'
    if (inPosition && r > params.rsiSell) return 'sell'
    return 'hold'
  }

  if (params.type === 'bbands') {
    const bb = bollingerBands(closes, params.bbPeriod, params.bbStd)
    const lower = bb.lower[n - 1]
    const upper = bb.upper[n - 1]
    const price = closes[n - 1]
    if (!lower || !upper) return 'hold'
    if (!inPosition && price <= lower) return 'buy'
    if (inPosition && price >= upper) return 'sell'
    return 'hold'
  }

  return 'hold'
}

// ========== 全戦略一覧 ==========
function getAllStrategies() {
  const list = []
  for (const s of [5, 10, 20]) {
    for (const l of [50, 100, 200]) {
      list.push({ type: 'ma_cross', shortPeriod: s, longPeriod: l, key: `ma_${s}_${l}` })
    }
  }
  for (const p of [7, 14]) {
    for (const b of [25, 30]) {
      for (const s of [70, 75]) {
        list.push({ type: 'rsi', rsiPeriod: p, rsiBuy: b, rsiSell: s, key: `rsi_${p}_${b}_${s}` })
      }
    }
  }
  for (const p of [20, 30]) {
    for (const s of [2.0, 2.5]) {
      list.push({ type: 'bbands', bbPeriod: p, bbStd: s, key: `bb_${p}_${s}` })
    }
  }
  return list
}

// ========== 戦略スコアリング（ε-greedy）==========
function scoreStrategy(key, trades) {
  const closed = trades.filter(t => t.strategy === key && t.closed)
  if (closed.length === 0) return 0.5
  const recent = closed.slice(-20)
  const wins = recent.filter(t => t.pnl > 0).length
  return wins / recent.length
}

function selectStrategy(trades, allStrategies, epsilon = 0.15) {
  // 15%の確率で探索（ランダム選択）
  if (Math.random() < epsilon) {
    return allStrategies[Math.floor(Math.random() * allStrategies.length)]
  }
  // 85%は活用（勝率最高の戦略）
  let best = allStrategies[0]
  let bestScore = -1
  for (const s of allStrategies) {
    const score = scoreStrategy(s.key, trades)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

function strategyLabel(params) {
  if (params.type === 'ma_cross') return `MAクロス(${params.shortPeriod}/${params.longPeriod})`
  if (params.type === 'rsi') return `RSI(${params.rsiPeriod}, ${params.rsiBuy}/${params.rsiSell})`
  if (params.type === 'bbands') return `BB(${params.bbPeriod}, σ${params.bbStd})`
  return '不明'
}

// ========== Binance API ==========
function fetchCandles(symbol, limit) {
  // Binance本家が弾かれる場合はバックアップURLにフォールバック
  const endpoints = [
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=${limit}`,
    `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=${limit}`,
    `https://api2.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=${limit}`,
    `https://api3.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=${limit}`,
  ]

  function tryFetch(urls) {
    if (urls.length === 0) return Promise.reject(new Error('全エンドポイントで取得失敗'))
    const [url, ...rest] = urls
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const raw = JSON.parse(data)
            if (!Array.isArray(raw)) {
              console.log(`⚠ ${url} → エラーレスポンス:`, JSON.stringify(raw).slice(0, 200))
              return tryFetch(rest).then(resolve).catch(reject)
            }
            resolve(raw.map(k => ({ time: k[0], close: parseFloat(k[4]) })))
          } catch (e) {
            tryFetch(rest).then(resolve).catch(reject)
          }
        })
      }).on('error', () => tryFetch(rest).then(resolve).catch(reject))
    })
  }

  return tryFetch(endpoints)
}

// ========== ファイル操作 ==========
function loadPortfolio() {
  if (!fs.existsSync(PORTFOLIO_FILE)) {
    return {
      cash: INITIAL_CAPITAL, positionUnits: 0, positionEntry: 0,
      positionEntryTime: null, positionStrategy: null,
      totalValue: INITIAL_CAPITAL, currentPrice: 0,
      startedAt: new Date().toISOString(), lastUpdated: null
    }
  }
  return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf-8'))
}

function loadTrades() {
  if (!fs.existsSync(TRADES_FILE)) return []
  return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf-8'))
}

// ========== メイン ==========
async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  console.log('🤖 自動売買開始:', new Date().toISOString())

  const portfolio = loadPortfolio()
  const trades = loadTrades()
  const allStrategies = getAllStrategies()

  if (!portfolio.startedAt) {
    portfolio.startedAt = new Date().toISOString()
  }

  // 価格データ取得
  let candles
  try {
    candles = await fetchCandles(SYMBOL, CANDLE_LIMIT)
    console.log(`✅ ${candles.length}本取得`)
  } catch (e) {
    console.error('❌ 価格取得失敗:', e.message)
    process.exit(1)
  }

  const closes = candles.map(c => c.close)
  const currentPrice = closes[closes.length - 1]
  const inPosition = portfolio.positionUnits > 0

  console.log(`💰 現在価格: $${currentPrice.toFixed(2)}`)
  console.log(`📊 ポジション: ${inPosition ? `あり (エントリー: $${portfolio.positionEntry})` : 'なし'}`)

  let action = 'hold'
  let strategy = null

  if (inPosition) {
    // エントリー時の戦略で売りシグナルを確認
    strategy = allStrategies.find(s => s.key === portfolio.positionStrategy) || allStrategies[0]
    const signal = getSignal(closes, strategy, true)
    if (signal === 'sell') action = 'sell'
  } else {
    // 最良戦略を選んで買いシグナルを確認
    strategy = selectStrategy(trades, allStrategies)
    const signal = getSignal(closes, strategy, false)
    if (signal === 'buy') action = 'buy'
  }

  console.log(`🎯 戦略: ${strategyLabel(strategy)} → ${action.toUpperCase()}`)

  // 売買実行
  if (action === 'buy') {
    const units = portfolio.cash / currentPrice
    portfolio.positionUnits = units
    portfolio.positionEntry = currentPrice
    portfolio.positionEntryTime = candles[candles.length - 1].time
    portfolio.positionStrategy = strategy.key
    portfolio.cash = 0

    trades.push({
      id: trades.length + 1,
      strategy: strategy.key,
      strategyLabel: strategyLabel(strategy),
      symbol: SYMBOL,
      side: 'buy',
      price: currentPrice,
      units,
      time: candles[candles.length - 1].time,
      closed: false,
      exitPrice: null,
      exitTime: null,
      pnl: null,
      pnlPct: null
    })
    console.log(`✅ 買い: ${units.toFixed(6)} BTC @ $${currentPrice}`)
  }

  if (action === 'sell') {
    const exitValue = portfolio.positionUnits * currentPrice
    const pnl = exitValue - (portfolio.positionUnits * portfolio.positionEntry)
    const pnlPct = ((currentPrice - portfolio.positionEntry) / portfolio.positionEntry) * 100

    // 対応するbuyトレードを閉じる
    const openTrade = [...trades].reverse().find(t => t.side === 'buy' && !t.closed)
    if (openTrade) {
      openTrade.closed = true
      openTrade.exitPrice = currentPrice
      openTrade.exitTime = candles[candles.length - 1].time
      openTrade.pnl = Math.round(pnl * 100) / 100
      openTrade.pnlPct = Math.round(pnlPct * 100) / 100
    }

    portfolio.cash = exitValue
    portfolio.positionUnits = 0
    portfolio.positionEntry = 0
    portfolio.positionEntryTime = null
    portfolio.positionStrategy = null

    const sign = pnl >= 0 ? '+' : ''
    console.log(`✅ 売り: $${currentPrice} (${sign}$${pnl.toFixed(2)} / ${sign}${pnlPct.toFixed(2)}%)`)
  }

  portfolio.currentPrice = currentPrice
  portfolio.totalValue = portfolio.cash + portfolio.positionUnits * currentPrice
  portfolio.lastUpdated = new Date().toISOString()

  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2))
  fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2))

  const totalReturn = ((portfolio.totalValue - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100)
  const sign = totalReturn >= 0 ? '+' : ''
  console.log(`💼 総資産: $${portfolio.totalValue.toFixed(2)} (${sign}${totalReturn.toFixed(2)}%)`)
  console.log('✨ 完了')
}

main().catch(e => { console.error(e); process.exit(1) })
