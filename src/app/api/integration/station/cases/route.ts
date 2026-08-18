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
    : clientFields.name
      ? `${clientFields.name} 様 ご相続`
      : `相続案件（${payload.case_number}）`

  // 受信しただけの案件は「受信箱」に置く（migration 247）。
  //   ・case_number は振らない（面談登録アプリで入力した時点で採番する）
  //   ・intake_draft=true なので相談案件一覧・KPI・タスクには出ない
  //   ・面談登録アプリの「LP直案件」リストにだけ出て、そこから選んで入力できる
  const { data: caseRow, error: caseErr } = await supabase
    .from('cases')
    .insert({
      ...caseFields,
      case_number: null,
      intake_draft: true,
      deal_name: dealName,
      status: '面談設定済',
      client_id: clientId,
    })
    .select('id, case_number, lp_case_number')
    .single()

  if (caseErr || !caseRow) {
    console.error('[station-integration] case insert failed', caseErr)
    return jsonError('INTERNAL_ERROR', 'Failed to create case', 500)
  }

  // case_clients にもメイン依頼者を登録（案件詳細「依頼者一覧」用）
  if (clientFields.name) {
    const { error: caseClientErr } = await supabase.from('case_clients').insert({
      case_id: caseRow.id,
      name: clientFields.name,
      furigana: clientFields.furigana,
      priority: 'main',
      relationship: clientFields.relationship_to_deceased,
      phone: clientFields.phone,
      mobile_phone: clientFields.mobile_phone,
      sort_order: 0,
    })
    if (caseClientErr) {
      console.error('[station-integration] case_clients insert failed', caseClientErr)
      // 致命的ではないので継続（運用で確認できる）
    }
  }

  return NextResponse.json(
    {
      // 案件管理番号は面談登録の時点で確定するので、受信時点では null（キーは互換のため残す）
      pf_case_number: caseRow.case_number,
      lp_case_number: caseRow.lp_case_number,
      received_at: new Date().toISOString(),
    },
    { status: 201 }
  )
}
