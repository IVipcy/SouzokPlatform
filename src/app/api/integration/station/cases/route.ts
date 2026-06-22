/**
 * 相続ステーション連携① 受信エンドポイント（新規作成）
 *
 *   POST /api/integration/station/cases
 *
 * 認証: APIキー + HMAC-SHA256 署名 + タイムスタンプ
 * 動作: 新規案件作成（cases + clients）。lp_case_number で既存検索し、
 *       既にあれば 200（重複扱い）、なければ INSERT して 201。
 *
 * 関連: docs/相続ステーション連携_仕様まとめ.md
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import {
  verifyStationRequest,
  mapPayloadToDb,
  generateCaseNumber,
  type StationCasePayload,
} from '@/lib/stationIntegration'

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export async function POST(req: NextRequest) {
  // 環境変数チェック
  const apiKey = process.env.INBOUND_API_KEY
  const hmacSecret = process.env.INBOUND_HMAC_SECRET
  if (!apiKey || !hmacSecret) {
    console.error('[station-integration] INBOUND_API_KEY/INBOUND_HMAC_SECRET not configured')
    return jsonError('SERVICE_UNAVAILABLE', 'Integration not configured', 503)
  }

  // 認証検証（rawBody を維持してHMAC計算するため、まず text() で取得）
  const rawBody = await req.text()
  const authResult = verifyStationRequest({
    authorization: req.headers.get('authorization'),
    timestamp: req.headers.get('x-timestamp'),
    signature: req.headers.get('x-signature'),
    rawBody,
    apiKey,
    hmacSecret,
  })
  if (!authResult.ok) {
    return jsonError(authResult.code, authResult.message, authResult.status)
  }

  // JSONパース
  let payload: StationCasePayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return jsonError('INVALID_JSON', 'Request body is not valid JSON', 400)
  }

  // 必須項目
  if (!payload.case_number || typeof payload.case_number !== 'string') {
    return jsonError('MISSING_FIELD', 'case_number is required', 400)
  }

  const supabase = await createServiceRoleClient()

  // 重複チェック（lp_case_number で突合）
  const { data: existing } = await supabase
    .from('cases')
    .select('id, case_number, lp_case_number')
    .eq('lp_case_number', payload.case_number)
    .maybeSingle()

  if (existing) {
    // 既に存在する場合は重複扱いで 200 を返す（Upsert扱いはPUTに任せる方針）
    return NextResponse.json(
      {
        message: 'Case already exists',
        pf_case_number: existing.case_number,
        lp_case_number: existing.lp_case_number,
      },
      { status: 200 }
    )
  }

  // マッピング
  const { caseFields, clientFields } = mapPayloadToDb(payload)

  // 当日の既存 case_number から最大連番+1 を求めて採番（削除や同時挿入による番号衝突に強い）
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const { data: todayCases } = await supabase
    .from('cases')
    .select('case_number')
    .gte('created_at', todayStart)
  let seq = (todayCases ?? []).reduce((max, c) => {
    const n = parseInt(String(c.case_number ?? '').slice(-4), 10)
    return Number.isFinite(n) && n > max ? n : max
  }, 0) + 1

  // clients を先に作成（client_id を取得）
  let clientId: string | null = null
  if (clientFields.name) {
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .insert(clientFields)
      .select('id')
      .single()
    if (clientErr) {
      console.error('[station-integration] client insert failed', clientErr)
      return jsonError('INTERNAL_ERROR', 'Failed to create client', 500)
    }
    clientId = client.id
  }

  // cases を作成（一意制約違反したら連番を進めてリトライ）
  const dealName = caseFields.deceased_name
    ? `${caseFields.deceased_name} 様 相続手続`
    : `相続案件（${payload.case_number}）`

  let caseRow: { id: string; case_number: string; lp_case_number: string } | null = null
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateCaseNumber(now, seq - 1) // seq=1 → candidate末尾0001
    const { data, error } = await supabase
      .from('cases')
      .insert({
        ...caseFields,
        case_number: candidate,
        deal_name: dealName,
        status: '面談設定済',
        client_id: clientId,
      })
      .select('id, case_number, lp_case_number')
      .single()
    if (!error && data) { caseRow = data; break }
    lastErr = error
    if (error?.code === '23505') { seq += 1; continue }
    break
  }

  if (!caseRow) {
    console.error('[station-integration] case insert failed', lastErr)
    return jsonError('INTERNAL_ERROR', 'Failed to create case', 500)
  }

  return NextResponse.json(
    {
      pf_case_number: caseRow.case_number,
      lp_case_number: caseRow.lp_case_number,
      received_at: new Date().toISOString(),
    },
    { status: 201 }
  )
}
