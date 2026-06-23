// 銀行CSVの入金突合ロジック。振込人カナ＋金額をマスターキーに、未入金の請求書へ突合する。
// 案件番号（旧番号含む）が摘要にあれば強い手掛かりとして優先する。
// 銀行ごとに列が違うため、みずほ／きらぼしは専用パーサ、それ以外は汎用フォールバック。

import { kanaKey } from '@/lib/kana'

export type BankRow = { date: string; name: string; amount: number; memo: string; raw: string }

export type InvoiceLite = {
  id: string
  case_id: string
  amount: number
  status: string
  case_number: string
  client_name: string
  deal_name: string
  // 振込名義人（依頼者セクションで登録。カナ）。突合のマスターキー。最大3つ。
  payer_kana: string | null
  payer_kana_2?: string | null
  payer_kana_3?: string | null
  sales_member_id: string | null
  manager_member_id: string | null
}

export type MatchResult = {
  row: BankRow
  invoiceId: string | null
  // matched=自信あり(AI) / review=要確認(人が選ぶ) / unmatched=該当なし
  kind: 'matched' | 'review' | 'unmatched'
  by: 'ai' | 'human'
  reason: string
  // review時の候補（人が選べるように）
  candidates: InvoiceLite[]
}

// 全角→半角・空白除去で緩く比較するための正規化
const norm = (s: string) => (s ?? '')
  .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/[\s　]/g, '')
  .toUpperCase()

// CSV1行をフィールドへ（簡易：ダブルクオート対応）
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += ch
    } else {
      if (ch === '"') q = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

const HDR = {
  date: ['日付', '取引日', '振込日', 'お取引日', '入金日', '年月日'],
  amount: ['入金', '預入', '受取', '振込金額', 'お預り金額', '入金金額', '金額'],
  name: ['振込依頼人', '依頼人', '振込人', 'お振込人', '取引先', '振込元', '名前', '相手先'],
  memo: ['摘要', '備考', '取引内容', '記事', 'メモ'],
}

function findCol(headers: string[], keys: string[]): number {
  const h = headers.map(norm)
  for (const k of keys) {
    const idx = h.findIndex(x => x.includes(norm(k)))
    if (idx >= 0) return idx
  }
  return -1
}

const toAmount = (s: string | undefined) => Number((s ?? '').replace(/[^0-9.-]/g, ''))

// みずほ（法人口座CSV）：明細行は先頭"明細"。取引名(idx12)=振込入金 のみ入金。金額=idx19、摘要(振込人)=idx21。
function parseMizuho(lines: string[]): BankRow[] {
  const rows: BankRow[] = []
  for (const line of lines) {
    const f = splitCsvLine(line)
    if (f[0] !== '明細') continue
    if (!(f[12] ?? '').includes('振込入金')) continue // 出金・振替入金等は除外
    const amount = toAmount(f[19])
    if (!amount || amount <= 0) continue
    const payer = (f[21] ?? '').trim()
    rows.push({ date: `${f[15] ?? ''}/${f[16] ?? ''}`, name: payer, amount, memo: payer, raw: line })
  }
  return rows
}

// きらぼし（普通預金CSV）：取引区分(idx8)=振込 のみ突合対象。入金金額=idx5、摘要(振込人)=idx12、取引日=idx2。
function parseKiraboshi(lines: string[]): BankRow[] {
  const rows: BankRow[] = []
  for (const line of lines) {
    const f = splitCsvLine(line)
    if (f.length < 13) continue
    if ((f[8] ?? '') !== '振込') continue // 出金・利息・振替等は対象外
    const amount = toAmount(f[5])
    if (!amount || amount <= 0) continue
    const payer = (f[12] ?? '').trim()
    const date = (f[2] ?? '').replace(/年|月/g, '-').replace(/日/g, '')
    rows.push({ date, name: payer, amount, memo: payer, raw: line })
  }
  return rows
}

// 汎用フォールバック：ヘッダから列を推定。金額が取れない入金行のみ。
function parseGeneric(lines: string[]): BankRow[] {
  if (lines.length === 0) return []
  let headerIdx = 0
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (findCol(splitCsvLine(lines[i]), HDR.amount) >= 0) { headerIdx = i; break }
  }
  const headers = splitCsvLine(lines[headerIdx])
  const cAmount = findCol(headers, HDR.amount)
  const cName = findCol(headers, HDR.name)
  const cDate = findCol(headers, HDR.date)
  const cMemo = findCol(headers, HDR.memo)
  const rows: BankRow[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i])
    const amount = cAmount >= 0 ? toAmount(f[cAmount]) : NaN
    if (!amount || amount <= 0) continue
    rows.push({
      date: cDate >= 0 ? (f[cDate] ?? '') : '',
      name: cName >= 0 ? (f[cName] ?? '') : '',
      amount,
      memo: cMemo >= 0 ? (f[cMemo] ?? '') : '',
      raw: lines[i],
    })
  }
  return rows
}

/** CSVテキストを取引行へ。みずほ／きらぼしは専用パーサ、それ以外は汎用フォールバック。 */
export function parseBankCsv(text: string): BankRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length === 0) return []
  const head = lines.slice(0, 6)
  // みずほ：項目名称ヘッダ＋取引名列
  if (head.some(l => l.includes('項目名称') && l.includes('取引名'))) return parseMizuho(lines)
  // きらぼし：入金金額列を持つヘッダ
  if (head.some(l => l.includes('入金金額'))) return parseKiraboshi(lines)
  return parseGeneric(lines)
}

/**
 * 取引行を未入金請求へ突合。
 * マスターキー＝振込人カナ＋金額（代理振込・無記入が多いため）。
 * 案件番号（旧番号含む）が摘要にあれば最優先の手掛かりにする。
 * 振込人カナが一致しない金額単独ヒットは「要確認」に留め、人がカナを確認して確定する。
 */
export function matchBankRows(rows: BankRow[], invoices: InvoiceLite[]): MatchResult[] {
  const unpaid = invoices.filter(i => i.status !== '入金済')
  return rows.map<MatchResult>(row => {
    const hayAlnum = norm(`${row.memo} ${row.name}`)        // 案件番号照合用（英数）
    const hayKana = kanaKey(`${row.memo} ${row.name}`)       // 振込人カナ照合用（全角カナ）
    const amountEq = (i: InvoiceLite) => i.amount === row.amount
    // 振込名義人カナ（最大3つ）のいずれかが摘要/振込人に部分一致するか（マスターキー）
    const payerHit = (i: InvoiceLite) =>
      [i.payer_kana, i.payer_kana_2, i.payer_kana_3].some(raw => {
        const k = kanaKey(raw)
        return !!k && (hayKana.includes(k) || k.includes(hayKana))
      })
    // カナ一致を先頭に寄せた候補並び（人が選びやすいように）
    const sortByKana = (arr: InvoiceLite[]) => [...arr].sort((a, b) => Number(payerHit(b)) - Number(payerHit(a)))
    // 振込額と請求額の差を「不足/超過」で言葉にする（過少/過払いの予測）
    const diffNote = (invAmt: number) => {
      const d = row.amount - invAmt
      return d > 0
        ? `${d.toLocaleString()}円 超過（過払いの可能性）`
        : `${(-d).toLocaleString()}円 不足（過少入金の可能性）`
    }

    // 1) 案件番号一致 ＋ 金額一致 → 確定（AI）
    const byCaseNo = unpaid.filter(i => i.case_number && hayAlnum.includes(norm(i.case_number)))
    const caseAmt = byCaseNo.filter(amountEq)
    if (caseAmt.length === 1) {
      return { row, invoiceId: caseAmt[0].id, kind: 'matched', by: 'ai', reason: '案件番号・金額が一致', candidates: caseAmt }
    }
    // 2) 案件番号一致だが金額不一致 → 要確認（差額・過不足を明示。候補1件なら先に選択）
    if (byCaseNo.length > 0 && caseAmt.length === 0) {
      if (byCaseNo.length === 1) {
        return { row, invoiceId: byCaseNo[0].id, kind: 'review', by: 'human', reason: `案件番号一致・金額が${diffNote(byCaseNo[0].amount)}`, candidates: byCaseNo }
      }
      return { row, invoiceId: null, kind: 'review', by: 'human', reason: '案件番号は一致するが金額が違う。候補から選択', candidates: sortByKana(byCaseNo) }
    }
    // 3) 振込人カナ一致 ＋ 金額一致 → 確定（AI）＝マスターキー
    const kanaCands = unpaid.filter(payerHit)
    const kanaAmt = kanaCands.filter(amountEq)
    if (kanaAmt.length === 1) {
      return { row, invoiceId: kanaAmt[0].id, kind: 'matched', by: 'ai', reason: '振込人カナ・金額が一致', candidates: kanaAmt }
    }
    if (kanaAmt.length > 1) {
      return { row, invoiceId: null, kind: 'review', by: 'human', reason: '振込人カナ・金額一致が複数。選択してください', candidates: kanaAmt }
    }
    // 4) 振込人カナは一致するが金額が違う → 要確認（差額・過不足を明示。候補1件なら先に選択）
    if (kanaCands.length > 0) {
      if (kanaCands.length === 1) {
        return { row, invoiceId: kanaCands[0].id, kind: 'review', by: 'human', reason: `振込人カナ一致・金額が${diffNote(kanaCands[0].amount)}`, candidates: kanaCands }
      }
      return { row, invoiceId: null, kind: 'review', by: 'human', reason: '振込人カナは一致するが金額が違う。候補から選択', candidates: sortByKana(kanaCands) }
    }
    // 5) 金額一致のみ（カナ未登録/不一致）→ 要確認（人がカナを確認）
    const amtMatches = unpaid.filter(amountEq)
    if (amtMatches.length === 1) {
      return { row, invoiceId: amtMatches[0].id, kind: 'review', by: 'human', reason: '金額は一致（振込人カナを要確認）', candidates: amtMatches }
    }
    if (amtMatches.length > 1) {
      return { row, invoiceId: null, kind: 'review', by: 'human', reason: '同額の請求が複数あります。選択してください', candidates: sortByKana(amtMatches) }
    }
    // 6) 該当なし
    return { row, invoiceId: null, kind: 'unmatched', by: 'human', reason: '一致する未入金の請求がありません', candidates: [] }
  })
}
