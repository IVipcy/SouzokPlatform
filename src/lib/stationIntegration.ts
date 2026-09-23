/**
 * 相続ステーション連携①の受信処理ユーティリティ
 *
 * - 認証検証（APIキー + HMAC-SHA256署名 + タイムスタンプ）
 * - リプレイ防止（X-Request-Id／署名値のナンス。integration_nonces 表。migration 296）
 * - ペイロードの型検証
 * - ペイロード → DBカラムのマッピング
 *
 * 関連: docs/相続ステーション連携/相続ステーション連携_仕様まとめ.md
 */
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/** タイムスタンプ許容ズレ（秒） */
const TIMESTAMP_TOLERANCE_SEC = 300 // 5分

/**
 * ナンスを覚えておく時間（秒）。許容ズレの2倍。
 * X-Timestamp は「未来に5分」までも通るので、許容ズレと同じ5分で掃除すると
 * 「未来寄りのタイムスタンプで送った要求を、掃除直後に再送する」隙間が空く。2倍なら埋まる。
 */
export const NONCE_RETENTION_SEC = TIMESTAMP_TOLERANCE_SEC * 2

/** 認証検証結果 */
export type AuthResult =
  | { ok: true }
  | { ok: false; code: string; message: string; status: 401 | 500 }

/**
 * リクエストの認証検証。
 *
 * - Authorization: Bearer <key> が環境変数 INBOUND_API_KEY と一致するか
 * - X-Timestamp が現在時刻 ±5分以内か（リプレイ攻撃対策）
 * - X-Signature が HMAC-SHA256(secret, timestamp + "." + body) と一致するか
 *
 * @param rawBody 受信した body の生バイト列（再シリアライズしたものを使わない）
 */
export function verifyStationRequest(opts: {
  authorization: string | null
  timestamp: string | null
  signature: string | null
  rawBody: string
  apiKey: string
  hmacSecret: string
}): AuthResult {
  const { authorization, timestamp, signature, rawBody, apiKey, hmacSecret } = opts

  // ① APIキー検証
  const bearer = authorization?.match(/^Bearer\s+(.+)$/)?.[1]
  if (!bearer) {
    return { ok: false, code: 'INVALID_AUTH', message: 'Authorization header missing or malformed', status: 401 }
  }
  if (!timingSafeEqual(bearer, apiKey)) {
    return { ok: false, code: 'INVALID_AUTH', message: 'API key mismatch', status: 401 }
  }

  // ② タイムスタンプ検証
  if (!timestamp || !/^\d+$/.test(timestamp)) {
    return { ok: false, code: 'TIMESTAMP_OUT_OF_RANGE', message: 'X-Timestamp missing or malformed', status: 401 }
  }
  const tsNum = Number(timestamp)
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - tsNum) > TIMESTAMP_TOLERANCE_SEC) {
    return { ok: false, code: 'TIMESTAMP_OUT_OF_RANGE', message: 'X-Timestamp is outside tolerance window', status: 401 }
  }

  // ③ HMAC署名検証
  if (!signature) {
    return { ok: false, code: 'INVALID_SIGNATURE', message: 'X-Signature missing', status: 401 }
  }
  const canonical = `${timestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', hmacSecret).update(canonical).digest('hex')
  if (!timingSafeEqual(signature.toLowerCase(), expected)) {
    return { ok: false, code: 'INVALID_SIGNATURE', message: 'HMAC signature mismatch', status: 401 }
  }

  return { ok: true }
}

/** 定数時間文字列比較（タイミング攻撃対策） */
function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

/**
 * リプレイ防止。同じ要求（X-Request-Id、無ければ署名値）を2回受け取ったら 401 にする。
 *
 * タイムスタンプ検証だけだと「5分以内なら同じ要求を何度でも再送できる」ので、
 * 受け取った要求の識別子を integration_nonces に入れ、主キー違反（23505）＝再送として弾く。
 * 保持期間を過ぎた行は同じ処理の中で掃除する（cron を増やさない）。
 *
 * 表が無い（migration 296 未適用）ときは止めずに通し、ログにだけ残す。
 * 連携そのものを止めるより、適用漏れを気づける方を取る。
 *
 * verifyStationRequest が通った後に呼ぶこと（署名の検証前に DB に書かないため）。
 */
export async function rejectReplay(
  supabase: SupabaseClient,
  requestId: string | null,
  signature: string,
): Promise<AuthResult> {
  // 識別子：X-Request-Id があればそれ、無ければ署名値（timestamp+body に一意なので代用できる）。
  // 長すぎる ID は主キーとして持ちたくないので署名値に落とす
  const rid = requestId?.trim()
  const nonce = rid && rid.length <= 128 ? `req:${rid}` : `sig:${signature.toLowerCase()}`

  // 掃除（失敗しても本筋には影響しない）
  const cutoff = new Date(Date.now() - NONCE_RETENTION_SEC * 1000).toISOString()
  const { error: sweepErr } = await supabase.from('integration_nonces').delete().lt('created_at', cutoff)
  if (sweepErr && !isMissingNonceTable(sweepErr)) console.error('[station-integration] nonce sweep failed', sweepErr)

  const { error } = await supabase.from('integration_nonces').insert({ nonce })
  if (!error) return { ok: true }
  if (error.code === '23505') {
    return { ok: false, code: 'REPLAY_DETECTED', message: '同じリクエストを既に受け取っています（X-Request-Id または署名が重複）', status: 401 }
  }
  if (isMissingNonceTable(error)) {
    console.error('[station-integration] integration_nonces が無い（migration 296 未適用）。リプレイ防止なしで通す')
    return { ok: true }
  }
  console.error('[station-integration] nonce insert failed', error)
  return { ok: false, code: 'INTERNAL_ERROR', message: 'リプレイ検査に失敗しました', status: 500 }
}

/** 表が無い：Postgres 42P01 か、PostgREST のスキーマキャッシュに無い（PGRST205） */
function isMissingNonceTable(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || error.code === 'PGRST205' || /could not find the table|does not exist/i.test(error.message ?? '')
}

/**
 * 連携①ペイロードの型（先方提示の19キー）
 */
export type StationCasePayload = {
  case_number: string
  referral_partner?: string | null
  referral_partner_number?: string | null
  decedent_name?: string | null
  decedent_age?: number | null
  decedent_kana?: string | null
  decedent_address?: string | null
  client_name?: string | null
  client_relation?: string | null
  client_kana?: string | null
  client_tel1?: string | null
  client_tel2?: string | null
  client_address?: string | null
  visit_address?: string | null
  visit_supplement?: string | null
  client_detail?: string | null
  hearing_content?: string | null
  special_note?: string | null
  other_needs?: string | null
}

/** 文字列で受ける項目（case_number と decedent_age 以外の全部） */
const STRING_FIELDS = [
  'referral_partner', 'referral_partner_number',
  'decedent_name', 'decedent_kana', 'decedent_address',
  'client_name', 'client_relation', 'client_kana', 'client_tel1', 'client_tel2', 'client_address',
  'visit_address', 'visit_supplement', 'client_detail',
  'hearing_content', 'special_note', 'other_needs',
] as const satisfies readonly (keyof StationCasePayload)[]

/** ペイロード検証の結果 */
export type PayloadValidation =
  | { ok: true; payload: StationCasePayload }
  | { ok: false; code: 'INVALID_JSON' | 'MISSING_FIELD' | 'INVALID_FIELD_VALUE'; message: string; field?: string }

/**
 * 受け取った JSON を型で検証して StationCasePayload に整える。
 *
 * 型が合わないまま INSERT すると DB エラーで 500 になり、送り側は原因が分からず再送を繰り返す。
 * 400 で「どの項目が悪いか」を返して止める。
 *   ・case_number … 必須。空でない文字列
 *   ・decedent_age … 数値、または数字だけの文字列（"80"）→ 数値にする。null／空文字は未設定
 *   ・その他 … 文字列か null。数値や配列・オブジェクトは弾く
 * 形式・文字種・文字数は見ない（仕様 §7.2「入力値をそのまま受け取る」）。知らないキーは無視する。
 */
export function validateStationPayload(raw: unknown): PayloadValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'INVALID_JSON', message: 'リクエスト本文は JSON オブジェクトである必要があります' }
  }
  const obj = raw as Record<string, unknown>

  if (typeof obj.case_number !== 'string' || !obj.case_number.trim()) {
    return { ok: false, code: 'MISSING_FIELD', message: 'case_number は必須です（文字列）', field: 'case_number' }
  }
  const payload: StationCasePayload = { case_number: obj.case_number }

  for (const f of STRING_FIELDS) {
    const v = obj[f]
    if (v === undefined) continue
    if (v === null) { payload[f] = null; continue }
    if (typeof v !== 'string') {
      return { ok: false, code: 'INVALID_FIELD_VALUE', message: `${f} は文字列で送ってください`, field: f }
    }
    payload[f] = v
  }

  const age = obj.decedent_age
  if (age !== undefined) {
    if (age === null) {
      payload.decedent_age = null
    } else if (typeof age === 'number') {
      if (!Number.isInteger(age) || age < 0) {
        return { ok: false, code: 'INVALID_FIELD_VALUE', message: 'decedent_age は 0 以上の整数で送ってください', field: 'decedent_age' }
      }
      payload.decedent_age = age
    } else if (typeof age === 'string') {
      const t = age.trim()
      if (t === '') payload.decedent_age = null
      else if (/^\d+$/.test(t)) payload.decedent_age = Number(t)
      else return { ok: false, code: 'INVALID_FIELD_VALUE', message: 'decedent_age は数値（または数字だけの文字列）で送ってください', field: 'decedent_age' }
    } else {
      return { ok: false, code: 'INVALID_FIELD_VALUE', message: 'decedent_age は数値（または数字だけの文字列）で送ってください', field: 'decedent_age' }
    }
  }

  return { ok: true, payload }
}

/** cases テーブル用にマッピングしたペイロード */
export type MappedCaseFields = {
  lp_case_number: string
  order_route: 'LP経由'
  order_route_detail: string | null
  referral_partner_number: string | null
  deceased_name: string | null
  deceased_age: number | null
  deceased_furigana: string | null
  deceased_address: string | null
  visit_address: string | null
  visit_notes: string | null
  hearing_content: string | null
  special_notes: string | null
  other_needs: string | null
  /** 顧客情報備考 → ClientInfoTab「依頼者特徴詳細」に表示される */
  client_trait_detail: string | null
}

/** clients テーブル用にマッピングしたペイロード */
export type MappedClientFields = {
  name: string | null
  relationship_to_deceased: string | null
  furigana: string | null
  phone: string | null
  mobile_phone: string | null
  address: string | null
}

/**
 * ペイロードを cases / clients テーブル用に分解してマッピング。
 */
export function mapPayloadToDb(payload: StationCasePayload): {
  caseFields: MappedCaseFields
  clientFields: MappedClientFields
} {
  return {
    caseFields: {
      lp_case_number: payload.case_number,
      order_route: 'LP経由',
      order_route_detail: payload.referral_partner ?? null,
      referral_partner_number: payload.referral_partner_number ?? null,
      deceased_name: payload.decedent_name ?? null,
      deceased_age: payload.decedent_age ?? null,
      deceased_furigana: payload.decedent_kana ?? null,
      deceased_address: payload.decedent_address ?? null,
      visit_address: payload.visit_address ?? null,
      visit_notes: payload.visit_supplement ?? null,
      hearing_content: payload.hearing_content ?? null,
      special_notes: payload.special_note ?? null,
      other_needs: payload.other_needs ?? null,
      // 顧客情報備考 → ClientInfoTab「依頼者特徴詳細」（cases.client_trait_detail）
      client_trait_detail: payload.client_detail ?? null,
    },
    clientFields: {
      name: payload.client_name ?? null,
      relationship_to_deceased: payload.client_relation ?? null,
      furigana: payload.client_kana ?? null,
      phone: payload.client_tel1 ?? null,
      mobile_phone: payload.client_tel2 ?? null,
      address: payload.client_address ?? null,
    },
  }
}

/**
 * 相続PF案件管理番号の自動採番（YYMM + LP + 連番4桁）
 * 例: 2606LP0001
 *
 * @param existingTodayCount 当日既に作成された案件数（経路問わず）
 */
export function generateCaseNumber(now: Date, existingTodayCount: number): string {
  const yy = String(now.getFullYear() % 100).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const seq = String(existingTodayCount + 1).padStart(4, '0')
  return `${yy}${mm}LP${seq}`
}

/**
 * エラーレスポンス形式
 */
export function errorResponse(code: string, message: string, status: number) {
  return {
    body: { error: { code, message } },
    status,
  }
}
