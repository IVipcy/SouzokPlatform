/**
 * 相続ステーション連携① 受信エンドポイント（既存案件の更新）
 *
 *   PUT /api/integration/station/cases/{lp_case_number}
 *
 * 認証: APIキー + HMAC-SHA256 署名 + タイムスタンプ
 * 動作: lp_case_number で既存案件を突合し、全項目を上書き。
 *       存在しなければ POST 同様に新規作成（Upsert）。
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ caseNumber: string }> }
) {
  const { caseNumber: urlCaseNumber } = await params

  // 環境変数チェック
  const apiKey = process.env.INBOUND_API_KEY
  const hmacSecret = process.env.INBOUND_HMAC_SECRET
  if (!apiKey || !hmacSecret) {
    console.error('[station-integration] INBOUND_API_KEY/INBOUND_HMAC_SECRET not configured')
    return jsonError('SERVICE_UNAVAILABLE', 'Integration not configured', 503)
  }

  // 認証検証
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

  // URL のパラメータと body の case_number の一致確認
  if (urlCaseNumber !== payload.case_number) {
    return jsonError(
      'INVALID_FIELD_VALUE',
      `URL case_number (${urlCaseNumber}) does not match body case_number (${payload.case_number})`,
      400
    )
  }

  const supabase = await createServiceRoleClient()

  // マッピング
  const { caseFields, clientFields } = mapPayloadToDb(payload)

  // 既存案件チェック
  const { data: existing } = await supabase
    .from('cases')
    .select('id, case_number, lp_case_number, client_id')
    .eq('lp_case_number', payload.case_number)
    .maybeSingle()

  const dealName = caseFields.deceased_name
    ? `${caseFields.deceased_name} 様 相続手続`
    : `相続案件（${payload.case_number}）`

  if (existing) {
    // ── 既存案件あり: 全項目上書き ──
    // clients も既存があれば update、なければ insert して紐付け
    let clientId = existing.client_id
    if (clientFields.name) {
      if (clientId) {
        const { error: clientUpdateErr } = await supabase
          .from('clients')
          .update(clientFields)
          .eq('id', clientId)
        if (clientUpdateErr) {
          console.error('[station-integration] client update failed', clientUpdateErr)
          return jsonError('INTERNAL_ERROR', 'Failed to update client', 500)
        }
      } else {
        const { data: newClient, error: clientInsertErr } = await supabase
          .from('clients')
          .insert(clientFields)
          .select('id')
          .single()
        if (clientInsertErr || !newClient) {
          console.error('[station-integration] client insert failed', clientInsertErr)
          return jsonError('INTERNAL_ERROR', 'Failed to create client', 500)
        }
        clientId = newClient.id
      }
    }

    const { error: updateErr } = await supabase
      .from('cases')
      .update({
        ...caseFields,
        deal_name: dealName,
        client_id: clientId,
      })
      .eq('id', existing.id)

    if (updateErr) {
      console.error('[station-integration] case update failed', updateErr)
      return jsonError('INTERNAL_ERROR', 'Failed to update case', 500)
    }

    return NextResponse.json(
      {
        pf_case_number: existing.case_number,
        lp_case_number: existing.lp_case_number,
        updated_at: new Date().toISOString(),
      },
      { status: 200 }
    )
  }

  // ── 新規作成（Upsert）──
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

  let caseRow: { id: string; case_number: string; lp_case_number: string } | null = null
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateCaseNumber(now, seq - 1)
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
