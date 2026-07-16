// 確定売上表をサンプルFMTでExcel出力する。
// book(司法/行政) ごとに1ブック、営業部×銀行ごとに1シート。既存テンプレは壊れやすいので新規構築。
import ExcelJS from 'exceljs'
import type { SalesBook, SalesSheet } from '@/lib/salesReport'

const HEADER_TITLE = (bookLabel: string, monthLabel: string) => `${bookLabel}${monthLabel}売上一覧表`

// 列定義（サンプルの A〜W 相当）
const COLS: { key: string; width: number }[] = [
  { key: 'A', width: 11 }, // 計上日
  { key: 'B', width: 6 },  // 連番
  { key: 'C', width: 12 }, // 発行日
  { key: 'D', width: 14 }, // 案件管理番号
  { key: 'E', width: 18 }, // クライアント名
  { key: 'F', width: 11 }, // 報酬 税込
  { key: 'G', width: 10 }, // （消費税）
  { key: 'H', width: 10 }, // 立替 非課税
  { key: 'I', width: 11 }, // 立替 課税(税込)
  { key: 'J', width: 10 }, // （消費税）
  { key: 'K', width: 11 }, // 立替計
  { key: 'L', width: 10 }, // 差引 非課税
  { key: 'M', width: 11 }, // 差引 課税(税込)
  { key: 'N', width: 10 }, // 差引額計
  { key: 'O', width: 12 }, // 合計
  { key: 'P', width: 11 }, // 前受金
  { key: 'Q', width: 12 }, // 差引請求額
  { key: 'R', width: 11 }, // 入金日
  { key: 'S', width: 16 }, // 備考
  { key: 'T', width: 8 },  // チーム
  { key: 'U', width: 8 },  // 受注
  { key: 'V', width: 8 },  // 管理
  { key: 'W', width: 16 }, // 不備内容
]

const YEN = '#,##0'
const thin = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }

function buildSheet(ws: ExcelJS.Worksheet, sheet: SalesSheet, bookLabel: string, monthLabel: string) {
  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })

  // 1行目：タイトル
  ws.mergeCells(1, 1, 1, 8)
  const t = ws.getCell(1, 1)
  t.value = HEADER_TITLE(bookLabel, monthLabel)
  t.font = { bold: true, size: 12 }

  // 3〜4行目：ヘッダー（2段）
  const H3: Record<string, string> = {
    A: '計上日', B: 'No', C: '発行日', D: '案件管理番号\n（請求書番号）', E: 'クライアント名',
    F: '報酬額', H: '立替実費', L: '立替実費差引額', O: '合　計', P: '前受金', Q: '差引請求額', R: '入金日', S: '備　考',
  }
  const H4: Record<string, string> = {
    F: '税　込', G: '（消費税）', H: '非課税分', I: '課税分(税込)', J: '（消費税）', K: '立替実費計',
    L: '非課税分', M: '課税分（税込）', N: '差引額計', T: 'チーム', U: '受注', V: '管理', W: '不備内容',
  }
  const colIdx = (letter: string) => COLS.findIndex(c => c.key === letter) + 1
  Object.entries(H3).forEach(([k, v]) => { const cell = ws.getCell(3, colIdx(k)); cell.value = v })
  Object.entries(H4).forEach(([k, v]) => { const cell = ws.getCell(4, colIdx(k)); cell.value = v })
  // 縦結合（単段ヘッダー）と横結合
  const mergeV = ['A', 'B', 'C', 'D', 'E', 'O', 'P', 'Q', 'R', 'S']
  mergeV.forEach(k => ws.mergeCells(3, colIdx(k), 4, colIdx(k)))
  ws.mergeCells(3, colIdx('F'), 3, colIdx('G')) // 報酬額
  ws.mergeCells(3, colIdx('H'), 3, colIdx('K')) // 立替実費
  ws.mergeCells(3, colIdx('L'), 3, colIdx('N')) // 立替実費差引額
  for (const r of [3, 4]) {
    for (let ci = 1; ci <= COLS.length; ci++) {
      const cell = ws.getCell(r, ci)
      cell.font = { bold: true, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      cell.border = border
    }
  }

  // データ行（5行目〜）
  let r = 5
  let no = 1
  let prevPosted: string | null = null
  const numCols = ['F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q']
  for (const row of sheet.rows) {
    const set = (letter: string, val: ExcelJS.CellValue) => { ws.getCell(r, colIdx(letter)).value = val }
    // 計上日は変わったときだけ表示（サンプル準拠）
    if (row.postedDate && row.postedDate !== prevPosted) { set('A', row.postedDate); prevPosted = row.postedDate }
    set('B', no)
    set('C', row.issuedDate ?? '')
    set('D', row.caseNumber)
    set('E', row.clientName)
    set('F', row.rewardInclTax); set('G', row.rewardTax)
    set('H', row.expNonTax); set('I', row.expTaxInclTax); set('J', row.expTax); set('K', row.expTotal)
    set('L', row.dedNonTax); set('M', row.dedTaxIncl); set('N', row.dedTotal)
    set('O', row.total); set('P', row.advance); set('Q', row.billed)
    set('R', row.paidDate ?? '未入金')
    set('S', row.note)
    set('T', row.teamName); set('U', row.salesName); set('V', row.managerName); set('W', row.defect)
    for (let ci = 1; ci <= COLS.length; ci++) {
      const cell = ws.getCell(r, ci)
      cell.border = border
      cell.font = { size: 10 }
    }
    numCols.forEach(k => { ws.getCell(r, colIdx(k)).numFmt = YEN })
    r++; no++
  }

  // 合計行
  const set = (letter: string, val: ExcelJS.CellValue) => { ws.getCell(r, colIdx(letter)).value = val }
  set('B', '合　計')
  const T = sheet.totals
  const totalMap: Record<string, number> = {
    F: T.rewardInclTax, G: T.rewardTax, H: T.expNonTax, I: T.expTaxInclTax, J: T.expTax, K: T.expTotal,
    L: T.dedNonTax, M: T.dedTaxIncl, N: T.dedTotal, O: T.total, P: T.advance, Q: T.billed,
  }
  Object.entries(totalMap).forEach(([k, v]) => { set(k, v); ws.getCell(r, colIdx(k)).numFmt = YEN })
  for (let ci = 1; ci <= COLS.length; ci++) {
    const cell = ws.getCell(r, ci)
    cell.border = border
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
  }
}

export async function exportSalesBook(book: SalesBook, monthLabel: string): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  const sheets = book.sheets.length ? book.sheets : [{ key: '_', division: '未設定', bank: '未設定', title: 'データなし', rows: [], totals: null as never }]
  for (const sheet of sheets) {
    const name = sheet.title.replace(/[\\/?*[\]:]/g, '').slice(0, 31)
    const ws = wb.addWorksheet(name || 'sheet')
    if (sheet.rows.length || sheet.totals) buildSheet(ws, sheet as SalesSheet, book.label, monthLabel)
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
