// 原本の出入り（到着物タブ）と、請求に同梱する資料の共通ロジック。
//
//   原本の行は、契約時にお客様から受領した書類（contract_documents）と、受信簿で届いた到着物（document_receipt_items）から自動で作る。
//   手元の数 ＝ 受領した数 − 出払い中（請求に同梱して、まだ戻っていない）− お客様へ返した／納品した数。
//   出払い中は request_enclosures（原本・stock_key あり）の「通数 − 戻った数」と、
//   金融の請求の印鑑登録証明書（financial_requests.seal_original_sent で返却日なし。migration 272）を合算する。
//
// サーバー／クライアント両方から使う（'use client' は付けない）。

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePersonName } from '@/lib/personName'
import type { ContractDocumentRow, RequestEnclosureRow, OriginalDocOverrideRow } from '@/types'

/** 氏名を突き合わせ用に丸める（区切りの空白を全部落とし、全角英数・異体の幅を NFKC で揃える）。「山田 太郎」「山田　太郎」「山田太郎」を同じ人にする */
const nameKey = (v: string | null | undefined) => normalizePersonName(v).replace(/[\s　]/g, '').normalize('NFKC')

export const ENCLOSURE_FORMS = ['原本', '写し', 'その他'] as const
export type EnclosureForm = typeof ENCLOSURE_FORMS[number]

// ── 原本の行 ──
export type StockOut = { label: string; qty: number; since: string | null; enclosureId?: string; finRequestId?: string }
export type StockRow = {
  key: string                 // contract:{id} / receipt:{item_id} / manual:{id} / seal:{case}
  name: string
  person: string | null
  source: string              // 受領のもと（契約時に受領／9/2 到着／手で追加）
  received: number
  outstanding: number         // 出払い中
  delivered: number           // 返却・納品済（手元から外した数）
  onHand: number
  outs: StockOut[]
  override: OriginalDocOverrideRow | null
  /** 契約時受領・受信簿など、行のもとがある（false＝手で足した） */
  auto: boolean
  /** 写し（本人確認書類の写しなど）。同梱で選べるが数えない。原本の出入りの表には出さない */
  copy: boolean
  /** 行のもと：contract=契約時に受領／receipt=受信簿で届いた／manual=手で足した／seal=金融の印鑑証明の仮行 */
  origin: 'contract' | 'receipt' | 'manual' | 'seal'
}

export type StockReceiptItem = {
  id: string
  item_name: string
  quantity: number | null
  received_from?: string | null
  return_enclosure_id?: string | null
  return_fin_request_id?: string | null
  received_date: string | null
  is_parcel?: boolean | null
}
export type StockFinRequest = { id: string; institution_id: string; request_date: string | null; seal_original_sent: boolean; seal_original_returned_date: string | null }

export const stockKey = (kind: 'contract' | 'receipt' | 'manual' | 'seal', id: string) => `${kind}:${id}`
export const md = (d: string | null | undefined) => (d ? d.slice(5, 10).replace('-', '/') : '')

/** 同梱の出払い中の数（原本で、原本の行に結んだものだけ） */
export const enclosureOutstanding = (e: Pick<RequestEnclosureRow, 'form' | 'stock_key' | 'quantity' | 'returned_qty'>) =>
  e.form === '原本' && e.stock_key ? Math.max(0, (e.quantity ?? 0) - (e.returned_qty ?? 0)) : 0

/** 契約時受領の書類のうち、手元にある（受領済の）もの。写しも行にするが数えない */
const isContractOriginal = (d: ContractDocumentRow) => {
  const name = (d.name ?? '').trim()
  if (!name) return false
  return d.status === 'その場で受領' || !!d.arrival_date
}
const isCopyName = (name: string) => name.includes('写し')
const isSealDoc = (name: string) => name.includes('印鑑登録証明') || name.includes('印鑑証明')

export function buildOriginalStock(input: {
  contractDocs: ContractDocumentRow[]
  receiptItems: StockReceiptItem[]
  enclosures: RequestEnclosureRow[]
  overrides: OriginalDocOverrideRow[]
  finRequests?: StockFinRequest[]
  institutions?: Array<{ id: string; name: string }>
  sealCopies?: number | null
}): StockRow[] {
  const ovByKey = new Map(input.overrides.map(o => [o.stock_key, o]))
  const rows: StockRow[] = []
  const push = (key: string, name: string, person: string | null, source: string, received: number, auto: boolean) => {
    const ov = ovByKey.get(key) ?? null
    rows.push({ key, name, person, source, received: ov?.received_qty ?? received, outstanding: 0, delivered: ov?.delivered_qty ?? 0, onHand: 0, outs: [], override: ov, auto, copy: isCopyName(name), origin: key.split(':')[0] as StockRow['origin'] })
  }
  // 契約時に受領した書類
  for (const d of input.contractDocs) {
    if (!isContractOriginal(d)) continue
    const name = (d.name ?? '').trim()
    const received = isSealDoc(name) && input.sealCopies != null ? input.sealCopies : 1
    push(stockKey('contract', d.id), name, null, `契約時に受領${d.arrival_date ? `（${md(d.arrival_date)}）` : ''}`, received, true)
  }
  // 受信簿の到着物（原本の返却・未開封の一式は行にしない）
  for (const it of input.receiptItems) {
    if (it.return_enclosure_id || it.return_fin_request_id || it.is_parcel) continue
    if (it.item_name.includes('未開封')) continue
    push(stockKey('receipt', it.id), it.item_name, null, `${md(it.received_date)} 到着${it.received_from ? `（${it.received_from}）` : ''}`, it.quantity ?? 1, true)
  }
  // 手で足した原本
  for (const o of input.overrides) {
    if (!o.stock_key.startsWith('manual:')) continue
    push(o.stock_key, (o.doc_name ?? '').trim() || '（名称未入力）', o.person ?? null, '手で追加', o.received_qty ?? 1, false)
  }
  // 出払い中：同梱
  for (const e of input.enclosures) {
    const n = enclosureOutstanding(e)
    const total = e.form === '原本' && e.stock_key ? e.quantity : 0
    if (!e.stock_key || total === 0) continue
    const row = rows.find(r => r.key === e.stock_key)
    if (!row) continue
    row.outstanding += n
    row.outs.push({ label: `${e.ref_label || '請求'}${e.returned_qty > 0 ? `（${e.returned_qty}通 ${md(e.returned_on)} 返却）` : ''}`, qty: n, since: e.created_at?.slice(0, 10) ?? null, enclosureId: e.id })
  }
  // 出払い中：金融の請求に出した印鑑登録証明書（migration 272 の仕組み。印鑑証明の行があればそこへ、無ければ行を作る）
  const finOuts = (input.finRequests ?? []).filter(r => r.seal_original_sent && !r.seal_original_returned_date)
  if (finOuts.length > 0) {
    const nameOf = new Map((input.institutions ?? []).map(i => [i.id, i.name]))
    // 印鑑証明の行は契約時受領だけでなく、受信簿で届いたもの・手で足したものも同じ1行として扱う。
    // 契約行に限ると、受信簿で届いた案件で仮行（seal:case）がもう1本できて手元の数が倍になる。契約行があればそれを優先
    let row = rows.find(r => r.key.startsWith('contract:') && isSealDoc(r.name) && !r.copy)
      ?? rows.find(r => isSealDoc(r.name) && !r.copy)
    if (!row) {
      push(stockKey('seal', 'case'), '印鑑登録証明書（依頼者）', null, '契約手続きの受領書類', input.sealCopies ?? 0, true)
      row = rows[rows.length - 1]
    }
    for (const r of finOuts) {
      row.outstanding += 1
      row.outs.push({ label: `${nameOf.get(r.institution_id) ?? '調査先'} への請求`, qty: 1, since: r.request_date, finRequestId: r.id })
    }
  }
  for (const r of rows) r.onHand = Math.max(0, r.received - r.outstanding - r.delivered)
  return rows
}


// ── 請求の種類ごとに「決まって要る同梱資料」 ──
// 請求カードの同梱する資料は、この一覧を縦に並べ、行ごとに手元の数と今回入れる数を出す。
// 手元の数は原本の出入りの行を名前で拾う（match）。一覧を直せば全カードに効く。
export type RequiredEnclosure = {
  key: 'poa' | 'idcopy' | 'seal' | 'koseki_any' | 'koseki_deceased' | 'koseki_heir' | 'legal_info'
  name: string                 // 表示名（enclosure.doc_name にもこの名前が入る）
  copy?: boolean               // 写し＝数えない
  note?: string
  onlyWhen?: 'not_shokumujo'   // 職務上請求のときは出さない（委任状）
}
export const REQUIRED_ENCLOSURES: Record<'koseki' | 're' | 'fin' | 'cancel', RequiredEnclosure[]> = {
  koseki: [
    { key: 'poa', name: '委任状', onlyWhen: 'not_shokumujo' },
    { key: 'idcopy', name: '本人確認書類の写し', copy: true },
    { key: 'seal', name: '印鑑登録証明書', note: '役所が求めるとき' },
    { key: 'koseki_any', name: '被相続人との関係がわかる戸籍', note: '相続人の請求のとき' },
  ],
  re: [
    { key: 'poa', name: '委任状' },
    { key: 'idcopy', name: '本人確認書類の写し', copy: true },
    { key: 'koseki_deceased', name: '被相続人の除籍謄本', note: '死亡の記載があるもの' },
    { key: 'koseki_heir', name: '相続人の戸籍謄本' },
  ],
  fin: [
    { key: 'seal', name: '印鑑登録証明書' },
    { key: 'poa', name: '委任状' },
    { key: 'idcopy', name: '本人確認書類の写し', copy: true },
    { key: 'koseki_deceased', name: '被相続人の戸籍（除籍）' },
    { key: 'koseki_heir', name: '相続人の戸籍' },
    { key: 'legal_info', name: '法定相続情報一覧図' },
  ],
  cancel: [
    { key: 'seal', name: '印鑑登録証明書' },
    { key: 'poa', name: '委任状' },
    { key: 'idcopy', name: '本人確認書類の写し', copy: true },
    { key: 'koseki_deceased', name: '被相続人の戸籍（除籍）' },
    { key: 'koseki_heir', name: '相続人の戸籍' },
    { key: 'legal_info', name: '法定相続情報一覧図' },
  ],
}
const KOSEKI_RE = /戸籍|除籍|原戸籍/
const NOT_KOSEKI_RE = /附票|住民票|除票/
/** 原本の行が、この要る資料に当たるか（名前で拾う。戸籍は被相続人の名前で被相続人／相続人を分ける） */
export function matchStockForRequired(item: RequiredEnclosure, s: Pick<StockRow, 'name' | 'copy'>, ctx: { deceasedName?: string | null }): boolean {
  if (!!item.copy !== s.copy) return false
  const n = s.name
  // 氏名は表記ゆれ（空白の有無・全角半角）を吸収して比べる。「山田太郎の戸籍」を被相続人「山田　太郎」の戸籍と判定できないと、
  // 被相続人の戸籍が相続人の戸籍に分類されてゲートが解けない
  const dn = nameKey(ctx.deceasedName)
  const nk = nameKey(n)
  const hasDeceased = !!dn && nk.includes(dn)
  const isKoseki = KOSEKI_RE.test(n) && !NOT_KOSEKI_RE.test(n)
  switch (item.key) {
    case 'poa': return n.includes('委任状')
    case 'idcopy': return n.includes('本人確認')
    case 'seal': return n.includes('印鑑')
    case 'koseki_any': return isKoseki
    case 'koseki_deceased': return isKoseki && hasDeceased
    case 'koseki_heir': return isKoseki && !hasDeceased
    case 'legal_info': return n.includes('法定相続情報')
    default: return false
  }
}
export function requiredEnclosuresFor(kind: 'koseki' | 're' | 'fin' | 'cancel', ctx: { shokumujo?: boolean }): RequiredEnclosure[] {
  return REQUIRED_ENCLOSURES[kind].filter(i => !(i.onlyWhen === 'not_shokumujo' && ctx.shokumujo))
}

/**
 * この請求（ref_kind + ref_id）が既に同梱している通数を、要る資料の名前ごとに数える（原本ゲートの ctx.ownQty）。
 * 自分で同梱した委任状は手元から減っているが「その請求には入っている」ので、自分自身を原本待ちで止めない。
 */
export function ownEnclosureQty(enclosures: Array<Pick<RequestEnclosureRow, 'ref_kind' | 'ref_id' | 'doc_name' | 'form' | 'quantity'>>, refKind: RequestEnclosureRow['ref_kind'], refId: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of enclosures) {
    if (e.ref_kind !== refKind || e.ref_id !== refId || e.form !== '原本') continue
    out[e.doc_name] = (out[e.doc_name] ?? 0) + (e.quantity ?? 0)
  }
  return out
}

/** ownQtyForRid に渡す材料。rid が請求の集まり（市区町村・調査先）を指すので、その中の請求IDに解くのに使う */
export type OwnQtyContext = {
  /** 不動産の請求（ref_id はこれの id）。re-muni:{市区町村} は target_municipality で絞る */
  acquisitions?: Array<{ id: string; target_municipality: string | null }>
  /** 金融の請求（ref_id はこれの id）。fin:{調査先名} は調査先の名前で絞る */
  finRequests?: Array<{ id: string; institution_id: string }>
  institutions?: Array<{ id: string; name: string }>
}

/**
 * タスクの source_rid（koseki:{請求id} / re-muni:{市区町村} / fin:{調査先名}）から、その請求（群）が既に同梱している通数（要る資料名 → 通数）。
 * 原本ゲートの ctx.ownQty に渡す。請求のタスクでなければ空。
 */
export function ownQtyForRid(rid: string | null | undefined, enclosures: Array<Pick<RequestEnclosureRow, 'ref_kind' | 'ref_id' | 'doc_name' | 'form' | 'quantity'>>, ctx: OwnQtyContext = {}): Record<string, number> {
  const r = rid ?? ''
  let refKind: RequestEnclosureRow['ref_kind'] | null = null
  let ids: string[] = []
  const m = r.match(/^(koseki|re-muni|fin):(.+)$/)
  if (!m) return {}
  const key = m[2].trim()
  if (m[1] === 'koseki') { refKind = 'koseki'; ids = [key] }
  else if (m[1] === 're-muni') { refKind = 're'; ids = (ctx.acquisitions ?? []).filter(a => (a.target_municipality ?? '').trim() === key).map(a => a.id) }
  else {
    refKind = 'fin'
    const instIds = new Set((ctx.institutions ?? []).filter(i => i.name.trim() === key).map(i => i.id))
    ids = (ctx.finRequests ?? []).filter(f => instIds.has(f.institution_id)).map(f => f.id)
  }
  const out: Record<string, number> = {}
  for (const id of ids) for (const [name, n] of Object.entries(ownEnclosureQty(enclosures, refKind, id))) out[name] = (out[name] ?? 0) + n
  return out
}

/**
 * 請求行を消すときに、その請求の同梱行（request_enclosures）も消す。
 * ref_id に外部キーが無いので、請求だけ消すと同梱行が残り「出払い中」が永久に戻らない。
 * 請求（戸籍・不動産・金融・解約）の削除の直前に呼ぶ。戻ってきた分（returned_qty）も一緒に消えるので、
 * 手元の数は「同梱しなかった」状態に戻る。
 */
export async function deleteRequestEnclosures(supabase: SupabaseClient, refIds: string[]): Promise<{ error: string | null }> {
  const ids = [...new Set(refIds.filter(Boolean))]
  if (ids.length === 0) return { error: null }
  const { error } = await supabase.from('request_enclosures').delete().in('ref_id', ids)
  return { error: error?.message ?? null }
}

/**
 * 受信（到着物）を消すときに、その到着物が「原本の返却」だったぶんを巻き戻す。
 *   同梱の返却 … returned_qty から到着物の通数を引く（0 未満にはしない）。0 になったら返却日も消す
 *   金融の請求の印鑑証明 … 返却日を空に戻す
 * 消し忘れると、誤登録した返却で「出払い中」が減ったまま直せない。
 */
export async function revertReceiptItemReturns(
  supabase: SupabaseClient,
  items: Array<{ quantity: number | null; return_enclosure_id?: string | null; return_fin_request_id?: string | null }>,
): Promise<{ error: string | null }> {
  const errors: string[] = []
  for (const it of items) {
    if (it.return_enclosure_id) {
      const { data: cur } = await supabase.from('request_enclosures').select('returned_qty').eq('id', it.return_enclosure_id).maybeSingle()
      if (!cur) continue   // 請求ごと消えていれば戻す先が無い
      const next = Math.max(0, ((cur as { returned_qty?: number | null }).returned_qty ?? 0) - (it.quantity ?? 1))
      const { error } = await supabase.from('request_enclosures').update({ returned_qty: next, ...(next === 0 ? { returned_on: null } : {}) }).eq('id', it.return_enclosure_id)
      if (error) errors.push(error.message)
    } else if (it.return_fin_request_id) {
      const { error } = await supabase.from('financial_requests').update({ seal_original_returned_date: null }).eq('id', it.return_fin_request_id)
      if (error) errors.push(error.message)
    }
  }
  return { error: errors.length > 0 ? errors.join(' / ') : null }
}

/** 受信簿の「原本の返却」で選べるもの＝出払い中の同梱と、金融の請求に出した印鑑証明 */
export type ReturnOption = { value: string; label: string; remaining: number; enclosureId?: string; finRequestId?: string }
export function buildReturnOptions(enclosures: RequestEnclosureRow[], finRequests: StockFinRequest[], institutions: Array<{ id: string; name: string }>): ReturnOption[] {
  const out: ReturnOption[] = []
  for (const e of enclosures) {
    const n = enclosureOutstanding(e)
    if (n <= 0) continue
    out.push({ value: `ret-enc:${e.id}`, label: `返却：${e.doc_name}（${e.ref_label || '請求'} に出したもの）`, remaining: n, enclosureId: e.id })
  }
  const nameOf = new Map(institutions.map(i => [i.id, i.name]))
  for (const r of finRequests) {
    if (!r.seal_original_sent || r.seal_original_returned_date) continue
    out.push({ value: `ret-fin:${r.id}`, label: `返却：印鑑登録証明書（${nameOf.get(r.institution_id) ?? '調査先'} への請求 に出したもの）`, remaining: 1, finRequestId: r.id })
  }
  return out
}
