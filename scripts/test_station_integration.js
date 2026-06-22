/**
 * 相続ステーション連携 ローカル疎通テスト
 *
 * 仮想の相続ステーションとして、相続PF のローカル受信エンドポイントに
 * 各種シナリオで POST/PUT を投げて挙動を検証する。
 *
 * 【事前準備】
 *   1. 鍵を発行:    node scripts/gen_integration_keys.js
 *   2. .env.local に以下を設定:
 *        INBOUND_API_KEY=<上で出力された値>
 *        INBOUND_HMAC_SECRET=<上で出力された値>
 *        SUPABASE_SERVICE_ROLE_KEY=<Supabaseの service_role キー>
 *   3. マイグレーション 058・059 を Supabase に適用
 *   4. PF を起動:    npm run dev
 *   5. このスクリプトを実行:
 *        STATION_API_KEY=<同じ値> STATION_HMAC_SECRET=<同じ値> \
 *        node scripts/test_station_integration.js
 *
 * URL を変えたい場合: PF_URL=http://localhost:3000 等
 */

const crypto = require('crypto')

const PF_URL = process.env.PF_URL || 'http://localhost:3000'
const API_KEY = process.env.STATION_API_KEY || process.env.INBOUND_API_KEY
const HMAC_SECRET = process.env.STATION_HMAC_SECRET || process.env.INBOUND_HMAC_SECRET

if (!API_KEY || !HMAC_SECRET) {
  console.error('❌ STATION_API_KEY と STATION_HMAC_SECRET を環境変数で指定してください')
  console.error('   または INBOUND_API_KEY / INBOUND_HMAC_SECRET でも可')
  process.exit(1)
}

// テスト用に一意な case_number を生成（タイムスタンプベース）
const TEST_CASE_NUMBER = `TEST${Date.now()}`

// ─── サンプルペイロード ───
function samplePayload(caseNumber, opts = {}) {
  return {
    case_number: caseNumber,
    referral_partner: '株式会社セレモニー結',
    referral_partner_number: 'KN02',
    decedent_name: '山田太郎',
    decedent_age: 80,
    decedent_kana: 'やまだたろう',
    decedent_address: '東京都港区',
    client_name: '山田花子',
    client_relation: '子',
    client_kana: 'やまだはなこ',
    client_tel1: '03-0000-0000',
    client_tel2: '090-0000-0000',
    client_address: '神奈川県横浜市',
    visit_address: '訪問先住所',
    visit_supplement: '伺い先 補足事項',
    client_detail: '顧客備考',
    hearing_content: 'ヒアリング内容',
    special_note: '特記事項',
    other_needs: 'その他ニーズ',
    ...opts,
  }
}

// ─── HMAC署名生成 ───
function signRequest(rawBody, timestamp, secret) {
  const canonical = `${timestamp}.${rawBody}`
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex')
}

// ─── HTTPリクエスト送信 ───
async function send({
  method,
  path,
  payload,
  apiKey = API_KEY,
  hmacSecret = HMAC_SECRET,
  timestamp = Math.floor(Date.now() / 1000),
  signatureOverride,
}) {
  const url = `${PF_URL}${path}`
  const rawBody = JSON.stringify(payload)
  const signature = signatureOverride ?? signRequest(rawBody, String(timestamp), hmacSecret)
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Timestamp': String(timestamp),
      'X-Signature': signature,
      'Content-Type': 'application/json',
    },
    body: rawBody,
  })
  let body
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, body }
}

// ─── テストアサート ───
let passed = 0
let failed = 0
const results = []

function assert(name, expected, actual) {
  const ok = expected === actual
  if (ok) passed++
  else failed++
  results.push({ name, ok, expected, actual })
  const mark = ok ? '✅' : '❌'
  console.log(`${mark} ${name}  expected=${expected} actual=${actual}`)
}

// ─── 各テストシナリオ ───

async function runTests() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  相続ステーション ⇔ 相続PF 連携テスト')
  console.log('═══════════════════════════════════════════════════')
  console.log(`PF URL:       ${PF_URL}`)
  console.log(`Test case#:   ${TEST_CASE_NUMBER}`)
  console.log()

  // === 正常系 ===

  console.log('───── 正常系 ─────')

  // TC-01: 新規 POST → 201
  {
    const { status, body } = await send({
      method: 'POST',
      path: '/api/integration/station/cases',
      payload: samplePayload(TEST_CASE_NUMBER),
    })
    assert('TC-01: 新規 POST → 201', 201, status)
    if (status === 201) console.log(`        PF case_number: ${body?.pf_case_number}`)
  }

  // TC-02: 同じ case_number で再度 POST → 200 (重複扱い)
  {
    const { status } = await send({
      method: 'POST',
      path: '/api/integration/station/cases',
      payload: samplePayload(TEST_CASE_NUMBER),
    })
    assert('TC-02: 重複 POST → 200', 200, status)
  }

  // TC-03: PUT で同じ case_number を更新 → 200
  {
    const updated = samplePayload(TEST_CASE_NUMBER, { client_tel1: '03-9999-9999' })
    const { status, body } = await send({
      method: 'PUT',
      path: `/api/integration/station/cases/${TEST_CASE_NUMBER}`,
      payload: updated,
    })
    assert('TC-03: PUT で既存上書き → 200', 200, status)
    if (status === 200) console.log(`        updated_at: ${body?.updated_at}`)
  }

  // TC-04: PUT で新規 case_number を送る → 201 (Upsert)
  {
    const newCase = `${TEST_CASE_NUMBER}_NEW`
    const { status } = await send({
      method: 'PUT',
      path: `/api/integration/station/cases/${newCase}`,
      payload: samplePayload(newCase),
    })
    assert('TC-04: PUT で新規 (Upsert) → 201', 201, status)
  }

  // === 異常系 ===

  console.log()
  console.log('───── 異常系 ─────')

  // TC-11: 不正なAPIキー → 401
  {
    const { status } = await send({
      method: 'POST',
      path: '/api/integration/station/cases',
      payload: samplePayload(`${TEST_CASE_NUMBER}_AUTH`),
      apiKey: 'WRONG_KEY_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    })
    assert('TC-11: 不正APIキー → 401', 401, status)
  }

  // TC-12: HMAC署名不一致 → 401
  {
    const { status } = await send({
      method: 'POST',
      path: '/api/integration/station/cases',
      payload: samplePayload(`${TEST_CASE_NUMBER}_SIG`),
      signatureOverride: '0'.repeat(64),
    })
    assert('TC-12: HMAC署名不一致 → 401', 401, status)
  }

  // TC-13: タイムスタンプ範囲外 (10分前) → 401
  {
    const oldTs = Math.floor(Date.now() / 1000) - 600
    const { status } = await send({
      method: 'POST',
      path: '/api/integration/station/cases',
      payload: samplePayload(`${TEST_CASE_NUMBER}_TS`),
      timestamp: oldTs,
    })
    assert('TC-13: タイムスタンプ範囲外 → 401', 401, status)
  }

  // TC-14: case_number 欠落 → 400
  {
    const payload = samplePayload(`${TEST_CASE_NUMBER}_NOKEY`)
    delete payload.case_number
    const { status } = await send({
      method: 'POST',
      path: '/api/integration/station/cases',
      payload,
    })
    assert('TC-14: case_number 欠落 → 400', 400, status)
  }

  // TC-15: URL と body の case_number 不一致 → 400
  {
    const { status } = await send({
      method: 'PUT',
      path: `/api/integration/station/cases/MISMATCH_URL_KEY`,
      payload: samplePayload(`MISMATCH_BODY_KEY`),
    })
    assert('TC-15: URL/body case_number不一致 → 400', 400, status)
  }

  // ─── サマリ ───
  console.log()
  console.log('═══════════════════════════════════════════════════')
  console.log(`  結果: ${passed} passed / ${failed} failed`)
  console.log('═══════════════════════════════════════════════════')

  if (failed > 0) {
    console.log()
    console.log('失敗したテスト:')
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  - ${r.name}`)
    })
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err)
  process.exit(1)
})
