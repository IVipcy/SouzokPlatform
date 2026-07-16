// 入金明細を経理テンプレのFMTでExcel出力する。銀行別シート＋返金シート。
import ExcelJS from 'exceljs'
import type { PaymentDetail, PaymentSheet, RefundRow } from '@/lib/paymentDetail'

const YEN = '#,##0'
const thin = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }

// 列: A司/行, B日付, C案件番号, D依頼者, E入金額, F差額, G内訳, H司前受金, I司報酬, J司実費,
//     K行前受金, L行報酬, M行実費, N請求書宛名, O振込人名, P受注, Q管理, R受注ルート, S紹介元,
//     T請求書, U領収書, V領収書お渡し状況, W領収書お渡し日, X備考
const HEADERS = [
  '司/行', '日付', '案件番号', '依頼者', '入金額', '差額', '内訳',
  '司前受金', '司報酬', '司実費', '行前受金', '行報酬', '行実費',
  '請求書宛名', '振込人名', '受注', '管理', '受注ルート', '紹介元',
  '請求書', '領収書', '領収書お渡し状況', '領収書お渡し日', '備考',
]
const WIDTHS = [5, 11, 14, 16, 11, 9, 11, 10, 10, 10, 10, 10, 10, 14, 14, 8, 8, 12, 12, 7, 8, 14, 12, 20]
const NUM_COLS = [5, 6, 7, 8, 9, 10, 11, 12, 13] // E..M（1-indexed）

function buildPaymentSheet(ws: ExcelJS.Worksheet, sheet: PaymentSheet) {
  WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  // ヘッダー
  HEADERS.forEach((h, i) => {
    const cell = ws.getCell(1, i + 1)
    cell.value = h
    cell.font = { bold: true, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    cell.border = border
  })
  // データ
  let r = 2
  for (const row of sheet.rows) {
    const vals: ExcelJS.CellValue[] = [
      row.firmMark, row.date, row.caseNumber, row.client,
      row.amount, row.diff, row.breakdown,
      row.shihoAdvance || '', row.shihoReward || '', row.shihoExpense || '',
      row.gyoseiAdvance || '', row.gyoseiReward || '', row.gyoseiExpense || '',
      '', row.payer, row.sales, row.manager, row.route, row.referral,
      row.hasInvoice, '', '', '', row.note,
    ]
    vals.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1)
      cell.value = v
      cell.border = border
      cell.font = { size: 10 }
      if (NUM_COLS.includes(i + 1)) cell.numFmt = YEN
    })
    r++
  }
  // 合計行（入金額・内訳・差額）
  const set = (col: number, v: ExcelJS.CellValue) => { const cell = ws.getCell(r, col); cell.value = v; cell.font = { bold: true, size: 10 }; cell.border = border; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } } }
  set(4, '合計')
  set(5, sheet.totals.amount); ws.getCell(r, 5).numFmt = YEN
  set(6, sheet.totals.diff); ws.getCell(r, 6).numFmt = YEN
  set(7, sheet.totals.breakdown); ws.getCell(r, 7).numFmt = YEN
  for (let ci = 1; ci <= HEADERS.length; ci++) {
    const cell = ws.getCell(r, ci)
    if (!cell.border) cell.border = border
  }
}

function buildRefundSheet(ws: ExcelJS.Worksheet, refunds: RefundRow[]) {
  const H = ['日付', '案件No.', '依頼人', '返金額', '備考']
  const W = [12, 14, 16, 12, 30]
  W.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.getCell(1, 1).value = '【返金】'
  ws.getCell(1, 1).font = { bold: true, size: 11 }
  H.forEach((h, i) => {
    const cell = ws.getCell(3, i + 1)
    cell.value = h
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    cell.border = border
  })
  let r = 4
  for (const rf of refunds) {
    const vals: ExcelJS.CellValue[] = [rf.date, rf.caseNumber, rf.client, rf.amount, rf.note]
    vals.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1)
      cell.value = v
      cell.border = border
      cell.font = { size: 10 }
      if (i === 3) cell.numFmt = YEN
    })
    r++
  }
}

export async function exportPaymentDetail(detail: PaymentDetail, monthLabel: string): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  const sheets = detail.sheets.length ? detail.sheets : [{ key: '_', bank: '', title: 'データなし', rows: [], totals: { amount: 0, breakdown: 0, diff: 0 } }]
  for (const sheet of sheets) {
    const name = `${sheet.title}${monthLabel ? ' ' + monthLabel : ''}`.replace(/[\\/?*[\]:]/g, '').slice(0, 31)
    const ws = wb.addWorksheet(name || 'sheet')
    buildPaymentSheet(ws, sheet)
  }
  const wsR = wb.addWorksheet('返金')
  buildRefundSheet(wsR, detail.refunds)

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
