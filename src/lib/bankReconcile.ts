// 銀行CSVの入金突合ロジック。案件管理番号・振込人名・金額をキーに、未入金の請求書へ突合する。
// 銀行ごとに列が違うため、ヘッダのキーワードで列を推定する（取込時マッピング）。

export type BankRow = { date: string; name: string; amount: number; memo: string; raw: string }

export type InvoiceLite = {
  id: string
  case_id: string
  amount: number
  status: string
  case_number: string
  client_name: string
  deal_name: string
  sales_member_id: string | null
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

/** CSVテキストを取引行へ。ヘッダから列を推定。金額が取れない行は捨てる。 */
export function parseBankCsv(text: string): BankRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length === 0) return []
  // ヘッダ行＝「金額」系の列が見つかる最初の行
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
    const amount = cAmount >= 0 ? Number((f[cAmount] ?? '').replace(/[^0-9.-]/g, '')) : NaN
    if (!amount || amount <= 0) continue // 入金（プラス）のみ
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

/** 取引行を未入金請求へ突合。案件番号(摘要/振込人)＋金額＋振込人名で判定。 */
export function matchBankRows(rows: BankRow[], invoices: InvoiceLite[]): MatchResult[] {
  const unpaid = invoices.filter(i => i.status !== '入金済')
  return rows.map<MatchResult>(row => {
    const hay = norm(`${row.memo} ${row.name}`)
    // 案件番号が摘要/振込人に含まれる請求
    const byCaseNo = unpaid.filter(i => i.case_number && hay.includes(norm(i.case_number)))
    const amountEq = (i: InvoiceLite) => i.amount === row.amount
    const nameHit = (i: InvoiceLite) => {
      const n = norm(row.name)
      if (!n) return false
      return [i.client_name, i.deal_name].some(x => x && (norm(x).includes(n) || n.includes(norm(x))))
    }

    // 1) 案件番号一致 ＋ 金額一致 → 確定（AI）
    const caseAmt = byCaseNo.filter(amountEq)
    if (caseAmt.length === 1) {
      return { row, invoiceId: caseAmt[0].id, kind: 'matched', by: 'ai', reason: '案件番号・金額が一致', candidates: caseAmt }
    }
    // 2) 案件番号一致だが金額不一致 → 要確認（理由）
    if (byCaseNo.length > 0 && caseAmt.length === 0) {
      return { row, invoiceId: null, kind: 'review', by: 'human', reason: '案件番号は一致するが金額が違う', candidates: byCaseNo }
    }
    // 3) 金額一致が1件 ＋ 振込人も一致 → 確定（AI）
    const amtMatches = unpaid.filter(amountEq)
    if (amtMatches.length === 1 && nameHit(amtMatches[0])) {
      return { row, invoiceId: amtMatches[0].id, kind: 'matched', by: 'ai', reason: '金額・振込人が一致', candidates: amtMatches }
    }
    // 4) 金額一致が1件（振込人は未確認）→ 要確認
    if (amtMatches.length === 1) {
      return { row, invoiceId: amtMatches[0].id, kind: 'review', by: 'human', reason: '金額一致（振込人/案件番号は未確認）', candidates: amtMatches }
    }
    // 5) 同額の請求が複数 → 要確認（選択）
    if (amtMatches.length > 1) {
      return { row, invoiceId: null, kind: 'review', by: 'human', reason: '同額の請求が複数あります。選択してください', candidates: amtMatches }
    }
    // 6) 該当なし
    return { row, invoiceId: null, kind: 'unmatched', by: 'human', reason: '一致する未入金の請求がありません', candidates: [] }
  })
}
