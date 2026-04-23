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

// ========== 方向予測（UP or DOWN）==========
// 各戦略が「次の1時間は上がるか下がるか」を予測する
function getPrediction(closes, params) {
  const i = closes.length - 1

  if (params.type === 'ma_cross') {
    // 短期MA > 長期MA → 上昇トレンド → UP
    const short = ema(closes, params.shortPeriod)
    const long = ema(closes, params.longPeriod)
    if (!short[i] || !long[i]) return 'up'
    return short[i] > long[i] ? 'up' : 'down'
  }

  if (params.type === 'rsi_trend') {
    // RSI > 50 → 買い圧強い → UP
    const values = rsi(closes, params.period)
    const r = values[i]
    if (r === null) return 'up'
    return r > 50 ? 'up' : 'down'
  }

  if (params.type === 'bb_position') {
    // 中心線より上 → UP、下 → DOWN
    const bb = bollingerBands(closes, params.period, 2.0)
    const mid = bb.middle[i]
    if (!mid) return 'up'
    return closes[i] > mid ? 'up' : 'down'
  }

  if (params.type === 'momentum') {
    // N時間前より現在価格が高い → UP
    const past = closes[i - params.period]
    if (past === undefined) return 'up'
    return closes[i] > past ? 'up' : 'down'
  }

  return 'up'
}

// ========== 全戦略一覧 ==========
function getAllStrategies() {
  const list = []

  // MAクロス系（トレンドフォロー）
  for (const [s, l] of [[5, 20], [5, 50], [10, 50], [20, 100], [5, 100]]) {
    list.push({ type: 'ma_cross', shortPeriod: s, longPeriod: l, key: `ma_${s}_${l}` })
  }

  // RSIトレンド系（RSI>50=UP）
  for (const p of [7, 14, 21]) {
    list.push({ type: 'rsi_trend', period: p, key: `rsi_${p}` })
  }

  // ボリンジャーバンド位置（中心線比較）
  for (const p of [20, 50]) {
    list.push({ type: 'bb_position', period: p, key: `bb_${p}` })
  }

  // モメンタム（N時間前比較）
  for (const p of [3, 6, 12, 24]) {
    list.push({ type: 'momentum', period: p, key: `mom_${p}` })
  }

  return list
}

// ========== 戦略ラベル ==========
function strategyLabel(params) {
  if (params.type === 'ma_cross') return `MAクロス(${params.shortPeriod}/${params.longPeriod})`
  if (params.type === 'rsi_trend') return `RSIトレンド(${params.period})`
  if (params.type === 'bb_position') return `BB位置(${params.period})`
  if (params.type === 'momentum') return `モメンタム(${params.period}h)`
  return '不明'
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
  if (Math.random() < epsilon) {
    return allStrategies[Math.floor(Math.random() * allStrategies.length)]
  }
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

// ========== 価格データ取得（Bybit → OKX → Kraken の順でフォールバック）==========
// interval: Bybit/Kraken用の分数(60=1h, 240=4h)、okxBar: OKX用('1H','4H')
function fetchFromBybit(symbol, limit, interval) {
  return new Promise((resolve, reject) => {
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`
    https.get(url, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.retCode !== 0 || !json.result?.list) return reject(new Error('Bybit: ' + json.retMsg))
          const candles = [...json.result.list].reverse().map(k => ({
            time: parseInt(k[0]),
            close: parseFloat(k[4]),
          }))
          resolve(candles)
        } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function fetchFromOKX(symbol, limit, okxBar) {
  const instId = symbol.replace('USDT', '-USDT')
  return new Promise((resolve, reject) => {
    const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${okxBar}&limit=${limit}`
    https.get(url, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.code !== '0' || !Array.isArray(json.data)) return reject(new Error('OKX: ' + json.msg))
          const candles = [...json.data].reverse().map(k => ({
            time: parseInt(k[0]),
            close: parseFloat(k[4]),
          }))
          resolve(candles)
        } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function fetchFromKraken(symbol, interval) {
  const pair = symbol === 'BTCUSDT' ? 'XBTUSD' : 'ETHUSD'
  return new Promise((resolve, reject) => {
    const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`
    https.get(url, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error?.length) return reject(new Error('Kraken: ' + json.error[0]))
          const list = json.result[Object.keys(json.result).find(k => k !== 'last')]
          const candles = list.map(k => ({ time: k[0] * 1000, close: parseFloat(k[4]) }))
          resolve(candles)
        } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function fetchCandles(symbol, limit, interval, okxBar, label) {
  try {
    const candles = await fetchFromBybit(symbol, limit, interval)
    console.log(`✅ Bybitから${label} ${candles.length}本取得`)
    return candles
  } catch (e) { console.log(`⚠ Bybit(${label})失敗:`, e.message) }

  try {
    const candles = await fetchFromOKX(symbol, limit, okxBar)
    console.log(`✅ OKXから${label} ${candles.length}本取得`)
    return candles
  } catch (e) { console.log(`⚠ OKX(${label})失敗:`, e.message) }

  try {
    const candles = await fetchFromKraken(symbol, interval)
    console.log(`✅ Krakenから${label} ${candles.length}本取得`)
    return candles
  } catch (e) { console.log(`⚠ Kraken(${label})失敗:`, e.message) }

  throw new Error(`全取引所で価格取得失敗(${label})`)
}

// ========== ファイル操作 ==========
function loadPortfolio() {
  if (!fs.existsSync(PORTFOLIO_FILE)) {
    return {
      cash: INITIAL_CAPITAL,
      positionSide: null,   // 'long' | 'short' | null
      positionCapital: 0,   // ポジションに入れた資金
      positionEntry: 0,
      positionEntryTime: null,
      positionStrategy: null,
      totalValue: INITIAL_CAPITAL,
      currentPrice: 0,
      startedAt: new Date().toISOString(),
      lastUpdated: null
    }
  }
  const p = JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf-8'))
  // 旧形式からの移行（positionUnitsを使っていた場合）
  if (p.positionSide === undefined) {
    p.positionSide = p.positionUnits > 0 ? 'long' : null
    p.positionCapital = p.positionUnits > 0 ? p.positionUnits * p.positionEntry : 0
    delete p.positionUnits
  }
  return p
}

function loadTrades() {
  if (!fs.existsSync(TRADES_FILE)) return []
  return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf-8'))
}

// ========== P&L計算 ==========
function calcExitValue(positionSide, positionCapital, entryPrice, exitPrice) {
  if (positionSide === 'long') {
    return positionCapital * (exitPrice / entryPrice)
  }
  if (positionSide === 'short') {
    // ショート：価格が下がるほど利益
    return positionCapital * (2 - exitPrice / entryPrice)
  }
  return positionCapital
}

// ========== メイン ==========
async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  console.log('🤖 自動売買開始:', new Date().toISOString())

  const portfolio = loadPortfolio()
  const trades = loadTrades()
  const allStrategies = getAllStrategies()

  if (!portfolio.startedAt) portfolio.startedAt = new Date().toISOString()

  // 同じUTC時間内にすでに実行済みならスキップ（4重cronのフォールバック用）
  if (portfolio.lastUpdated) {
    const last = new Date(portfolio.lastUpdated)
    const now = new Date()
    const sameHour =
      last.getUTCFullYear() === now.getUTCFullYear() &&
      last.getUTCMonth() === now.getUTCMonth() &&
      last.getUTCDate() === now.getUTCDate() &&
      last.getUTCHours() === now.getUTCHours()
    if (sameHour) {
      console.log(`⏭ 今時間（UTC ${now.getUTCHours()}:xx）はすでに実行済みです。スキップ。`)
      process.exit(0)
    }
  }

  // 価格データ取得（1h + 4h の同時取得）
  let candles1h, candles4h
  try {
    ;[candles1h, candles4h] = await Promise.all([
      fetchCandles(SYMBOL, CANDLE_LIMIT, 60, '1H', '1h'),
      fetchCandles(SYMBOL, 100, 240, '4H', '4h'),
    ])
  } catch (e) {
    console.error('❌ 価格取得失敗:', e.message)
    process.exit(1)
  }

  const closes = candles1h.map(c => c.close)
  const closes4h = candles4h.map(c => c.close)
  const currentPrice = closes[closes.length - 1]
  console.log(`💰 現在価格: $${currentPrice.toFixed(2)}`)

  // ========== STEP1: 前回ポジションをクローズ ==========
  if (portfolio.positionSide) {
    const exitValue = calcExitValue(
      portfolio.positionSide,
      portfolio.positionCapital,
      portfolio.positionEntry,
      currentPrice
    )
    const pnl = exitValue - portfolio.positionCapital
    const pnlPct = (pnl / portfolio.positionCapital) * 100
    const sign = pnl >= 0 ? '+' : ''

    const sideLabel = portfolio.positionSide === 'long' ? '📈 ロング' : '📉 ショート'
    console.log(`🔒 ${sideLabel}クローズ: $${portfolio.positionEntry.toFixed(2)} → $${currentPrice.toFixed(2)} (${sign}$${pnl.toFixed(2)} / ${sign}${pnlPct.toFixed(2)}%)`)

    // 対応するオープントレードを閉じる
    const openTrade = [...trades].reverse().find(t => !t.closed)
    if (openTrade) {
      openTrade.closed = true
      openTrade.exitPrice = currentPrice
      openTrade.exitTime = candles1h[candles1h.length - 1].time
      openTrade.pnl = Math.round(pnl * 100) / 100
      openTrade.pnlPct = Math.round(pnlPct * 100) / 100
    }

    portfolio.cash = exitValue
    portfolio.positionSide = null
    portfolio.positionCapital = 0
    portfolio.positionEntry = 0
    portfolio.positionEntryTime = null
    portfolio.positionStrategy = null
  }

  // ========== STEP2: 新しい予測でエントリー（マルチタイムフレーム）==========
  const strategy = selectStrategy(trades, allStrategies)
  const prediction1h = getPrediction(closes, strategy)
  const prediction4h = getPrediction(closes4h, strategy)

  // 1hと4hが一致 → その方向、不一致 → 4h足を優先（大きなトレンドに従う）
  const prediction = prediction1h === prediction4h ? prediction1h : prediction4h
  const tfAgreed = prediction1h === prediction4h
  const side = prediction === 'up' ? 'long' : 'short'
  const sideLabel = side === 'long' ? '📈 ロング' : '📉 ショート'

  console.log(`📊 1h: ${prediction1h.toUpperCase()}, 4h: ${prediction4h.toUpperCase()} → ${tfAgreed ? '✅ 一致' : '⚠ 不一致(4h優先)'}`)
  console.log(`🎯 戦略: ${strategyLabel(strategy)} → ${sideLabel}エントリー`)

  const capital = portfolio.cash
  portfolio.positionSide = side
  portfolio.positionCapital = capital
  portfolio.positionEntry = currentPrice
  portfolio.positionEntryTime = candles1h[candles1h.length - 1].time
  portfolio.positionStrategy = strategy.key
  portfolio.cash = 0

  trades.push({
    id: trades.length + 1,
    strategy: strategy.key,
    strategyLabel: strategyLabel(strategy),
    symbol: SYMBOL,
    side,
    prediction,
    entryPrice: currentPrice,
    capital,
    entryTime: candles1h[candles1h.length - 1].time,
    closed: false,
    exitPrice: null,
    exitTime: null,
    pnl: null,
    pnlPct: null
  })

  // 現在の含み損益を計算して総資産を更新
  const currentValue = calcExitValue(side, capital, currentPrice, currentPrice)
  portfolio.totalValue = portfolio.cash + currentValue
  portfolio.currentPrice = currentPrice
  portfolio.lastUpdated = new Date().toISOString()

  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2))
  fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2))

  const totalReturn = ((portfolio.totalValue - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100)
  const sign = totalReturn >= 0 ? '+' : ''
  console.log(`💼 総資産: $${portfolio.totalValue.toFixed(2)} (${sign}${totalReturn.toFixed(2)}%)`)
  console.log('✨ 完了')
}

main().catch(e => { console.error(e); process.exit(1) })
