/**
 * 相続ステーション連携①の受信処理ユーティリティ
 *
 * - 認証検証（APIキー + HMAC-SHA256署名 + タイムスタンプ）
 * - ペイロード → DBカラムのマッピング
 *
 * 関連: docs/相続ステーション連携_仕様まとめ.md
 */
import crypto from 'crypto'

/** タイムスタンプ許容ズレ（秒） */
const TIMESTAMP_TOLERANCE_SEC = 300 // 5分

/** 認証検証結果 */
export type AuthResult =
  | { ok: true }
  | { ok: false; code: string; message: string; status: 401 }

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
