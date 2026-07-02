/**
 * 確定請求書＋立替実費明細（Excel・1ファイル2シート）生成API
 *
 * public/templates/kakutei/<variant>.xlsx をロードし、1枚目=確定請求書／2枚目=立替実費明細を流し込む。
 * 報酬・立替は税込入力、内消費税は計算して反映。前受金は消費税対象外で差し引く。
 * テンプレは split_kakutei_templates.py で参照データ（数式・枠外マスタ・社印画像）を除去済み。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { getKakuteiVariant, KAKUTEI_FIELDS, computeKakutei, type ExpenseItem } from '@/lib/kakuteiVariants'
import { STAMP_FILES } from '@/lib/ininjoVariants'
import { KOSEKI_AGENT_OFFICES, OFFICE_PROFILES } from '@/lib/officeProfiles'
import { isMinimalMode } from '@/lib/featureMode'

type Body = {
  caseId: string
  variant: string
  kenmei: string
  fee: number
  advanceReceived: number
  expenses: ExpenseItem[]
  taskId?: string | null
  invoiceId?: string | null   // メイン請求モーダル経由＝既に invoices 行があるので二重作成しない
  officeId?: string           // 事務所住所（拠点: kureator/kyodo/fujisawa）
}

function setCell(ws: ExcelJS.Worksheet, addr: string | undefined, value: string | number | null) {
  if (!addr || value === null || value === undefined || value === '') return
  ws.getCell(addr).value = value
}

// 案件管理番号などを左揃えにする（右揃えテンプレで見切れる問題の対策）
function alignLeft(ws: ExcelJS.Worksheet, addr: string | undefined) {
  if (!addr) return
  const cur = ws.getCell(addr).alignment ?? {}
  ws.getCell(addr).alignment = { ...cur, horizontal: 'left', vertical: 'middle' }
}


function cellToColRow(addr: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(addr)
  if (!m) return { col: 0, row: 0 }
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { col: col - 1, row: Number(m[2]) - 1 }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const { caseId, variant, kenmei, fee, advanceReceived, expenses, taskId } = body

    if (!caseId || !variant) {
      return NextResponse.json({ error: 'caseId, variant は必須です' }, { status: 400 })
    }
    const def = getKakuteiVariant(variant)
    if (!def) {
      return NextResponse.json({ error: `未知のバリエーション: ${variant}` }, { status: 400 })
    }
    if (typeof fee !== 'number' || fee < 0) {
      return NextResponse.json({ error: '報酬額を正しく入力してください' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: caseData, error: caseErr } = await supabase
      .from('cases').select('*, clients(*)').eq('id', caseId).single()
    if (caseErr || !caseData) {
      return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })
    }

    let mainName: string | null = null
    try {
      const { data: ccs } = await supabase
        .from('case_clients').select('name, priority, sort_order').eq('case_id', caseId)
        .order('sort_order', { ascending: true })
      const rows = (ccs ?? []) as Array<{ name?: string | null; priority?: string | null }>
      if (rows.length > 0) mainName = (rows.find(c => c.priority === 'main') ?? rows[0]).name ?? null
    } catch { /* migration 未適用環境では無視 */ }

    const client = caseData.clients as { name?: string } | null
    const clientName = mainName || client?.name || ''

    const items = (expenses ?? []).filter(e => e && (e.name?.trim() || e.amount > 0))
    const c = computeKakutei(fee, advanceReceived || 0, items)

    const templatePath = path.join(process.cwd(), 'public', 'templates', 'kakutei', `${variant}.xlsx`)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(new Uint8Array(await readFile(templatePath)).buffer as ArrayBuffer)
    const kak = wb.worksheets[0]   // 確定請求書
    const tate = wb.worksheets[1]  // 立替実費明細
    if (!kak || !tate) {
      return NextResponse.json({ error: 'テンプレートのシートが見つかりません' }, { status: 500 })
    }

    // --- 確定請求書 ---
    const K = KAKUTEI_FIELDS
    // 案件番号は分割せず B3 に1セルでまとめて表示（分割の余分な空白を無くす）。旧・分割セルはクリア。
    setCell(kak, K.caseNo[0], caseData.case_number ?? '')
    alignLeft(kak, K.caseNo[0])
    for (const cell of K.caseNoClear) kak.getCell(cell).value = null
    setCell(kak, K.clientName, clientName)
    for (const cell of K.kenmei) setCell(kak, cell, kenmei || '')
    if (fee > 0) { setCell(kak, K.fee, fee); setCell(kak, K.feeTax, c.feeTax) }
    if (advanceReceived > 0) setCell(kak, K.advanceNeg, -advanceReceived)
    if (c.taxSubtotal > 0) { setCell(kak, K.taxableExpense, c.taxSubtotal); setCell(kak, K.taxableExpenseTax, c.taxExpTax) }
    if (c.nonTaxSubtotal > 0) setCell(kak, K.nonTaxExpense, c.nonTaxSubtotal)
    setCell(kak, K.subtotal, c.subtotal)
    setCell(kak, K.taxableBase, c.taxableBase)
    setCell(kak, K.taxTotal, c.taxTotal)
    setCell(kak, K.billAmount, c.billAmount)
    setCell(kak, K.amountTop, c.billAmount)
    // 事務所住所（選択した拠点で上書き）＋担当者（代表社員 氏名）
    const office = KOSEKI_AGENT_OFFICES.find(o => o.id === body.officeId)
    if (office) { setCell(kak, K.address1, office.line1); setCell(kak, K.address2, office.line2) }
    const prof = OFFICE_PROFILES[def.office]
    if (prof) setCell(kak, K.repName, `${prof.representativeTitle}　${prof.representativeName}`)

    // 社印
    try {
      const imgBuf = await readFile(path.join(process.cwd(), 'public', 'templates', 'stamps', STAMP_FILES[def.office]))
      const imageId = wb.addImage({ buffer: new Uint8Array(imgBuf).buffer as ArrayBuffer, extension: 'png' })
      const { col, row } = cellToColRow(K.sealCell)
      kak.addImage(imageId, { tl: { col, row } as ExcelJS.Anchor, ext: { width: 56, height: 56 }, editAs: 'oneCell' })
    } catch { /* 画像が無ければスキップ */ }

    // --- 立替実費明細 ---
    // テンプレのsheet2は結合セル131個等の複雑構造をExcelJSが再保存時に壊し、Excelで開けなくなる。
    // そのため sheet2 を削除し、ExcelJS でクリーンな明細シートを新規作成する（原本の見た目に寄せる）。
    // 列: A〜D=名目(結合) / E=数量 / F=単価 / G=金額 / H=備考
    wb.removeWorksheet(tate.id)
    const ws = wb.addWorksheet('立替実費明細')
    ;[9, 8.4, 7.5, 6.7, 6, 10.5, 13.8, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w })
    const FONT = 'ＭＳ Ｐ明朝'
    const thin = { style: 'thin' as const }
    const bd: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin }
    const borderRow = (r: number) => { for (let ci = 1; ci <= 8; ci++) ws.getCell(r, ci).border = bd }
    const rightText = (r: number, text: string, opt?: { bold?: boolean; size?: number }) => {
      const cell = ws.getCell(r, 5); cell.value = text; ws.mergeCells(r, 5, r, 8)
      cell.alignment = { horizontal: 'right' }; cell.font = { name: FONT, bold: opt?.bold, size: opt?.size ?? 10 }
    }
    let rr = 1
    // タイトル
    const title = ws.getCell(rr, 1); title.value = '立 替 実 費 内 訳'; title.font = { name: FONT, bold: true, size: 18 }
    ws.mergeCells(rr, 1, rr, 8); title.alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(rr).height = 30
    rr += 2
    // 案件番号（左）＋ 法人名（右）
    const cno = ws.getCell(rr, 1); cno.value = `案件管理番号：${caseData.case_number ?? ''}`; cno.font = { name: FONT, size: 10 }
    rightText(rr, def.officeLabel, { bold: true, size: 11 }); rr++
    // 依頼者（左）＋ 〒住所（右）
    const cn = ws.getCell(rr, 1); cn.value = `${clientName}　様`; cn.font = { name: FONT, bold: true, size: 14 }; ws.mergeCells(rr, 1, rr, 4)
    if (office) rightText(rr, `〒${prof?.postalCode ?? ''}　${office.line1}`); rr++
    if (office) { rightText(rr, office.line2); rr++ }
    if (prof) { rightText(rr, `${prof.representativeTitle}　${prof.representativeName}`); rr++ }
    rr++
    const lead = ws.getCell(rr, 1); lead.value = '下記の通りご請求申し上げます。'; lead.font = { name: FONT, size: 10 }
    rr += 2
    // セクション（非課税/課税）を原本の体裁で描画（セル色なし）
    const putSection = (label: string, items: { name: string; amount: number; quantity?: number | null; unitPrice?: number | null }[], subtotalLabel: string, subtotal: number) => {
      const sec = ws.getCell(rr, 1); sec.value = label; sec.font = { name: FONT, bold: true, size: 11 }
      rr++
      // ヘッダ（名目=A:D結合、数量/単価/金額/備考）
      ws.mergeCells(rr, 1, rr, 4); ws.getCell(rr, 1).value = '名目'
      ws.getCell(rr, 5).value = '数量'; ws.getCell(rr, 6).value = '単価'; ws.getCell(rr, 7).value = '金額'; ws.getCell(rr, 8).value = '備考'
      for (let ci = 1; ci <= 8; ci++) { const cell = ws.getCell(rr, ci); cell.font = { name: FONT, bold: true, size: 10 }; cell.alignment = { horizontal: ci === 1 ? 'left' : 'center' } }
      borderRow(rr); rr++
      // 明細行
      for (const e of items) {
        ws.mergeCells(rr, 1, rr, 4)
        for (let ci = 1; ci <= 8; ci++) ws.getCell(rr, ci).font = { name: FONT, size: 10 }
        ws.getCell(rr, 1).value = e.name
        ws.getCell(rr, 5).value = e.quantity ?? null
        ws.getCell(rr, 6).value = e.unitPrice ?? null
        ws.getCell(rr, 7).value = e.amount
        ws.getCell(rr, 6).numFmt = '#,##0'; ws.getCell(rr, 7).numFmt = '#,##0'
        for (const ci of [5, 6, 7]) ws.getCell(rr, ci).alignment = { horizontal: 'right' }
        borderRow(rr); rr++
      }
      // 小計（合計ラベルを右寄せ、金額列に）
      ws.mergeCells(rr, 1, rr, 6); const sl = ws.getCell(rr, 1); sl.value = subtotalLabel; sl.font = { name: FONT, bold: true, size: 10 }; sl.alignment = { horizontal: 'right' }
      const sa = ws.getCell(rr, 7); sa.value = subtotal; sa.font = { name: FONT, bold: true, size: 10 }; sa.numFmt = '#,##0'; sa.alignment = { horizontal: 'right' }
      borderRow(rr); rr += 2
    }
    putSection('立替実費　（非課税）', c.nonTaxItems, '非課税 合計', c.nonTaxSubtotal)
    putSection('立替実費　（課税）', c.taxItems, '課税 合計（税込）', c.taxSubtotal)
    // 総合計
    ws.mergeCells(rr, 1, rr, 6); const gl = ws.getCell(rr, 1); gl.value = '立替実費 合計'; gl.font = { name: FONT, bold: true, size: 12 }; gl.alignment = { horizontal: 'right' }
    const ga = ws.getCell(rr, 7); ga.value = c.expenseGrand; ga.font = { name: FONT, bold: true, size: 12 }; ga.numFmt = '#,##0'; ga.alignment = { horizontal: 'right' }
    borderRow(rr)

    // 出力
    const outBuffer = await wb.xlsx.writeBuffer()
    const downloadFilename = `確定請求書_立替実費_${def.officeLabel}_${caseData.case_number ?? caseId}.xlsx`
    const storagePath = `${caseId}/${Date.now()}_${crypto.randomUUID()}.xlsx`
    const uploadBuffer = Buffer.from(outBuffer as ArrayBuffer)
    // ミニマム運用モードでは案件フォルダ（storage/documents）へ保存せず、ローカルDLのみ。
    const minimal = isMinimalMode()
    let savedPath: string | null = null
    if (!minimal) {
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, uploadBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      if (!uploadErr) {
        savedPath = storagePath
        await supabase.from('documents').insert({
          case_id: caseId,
          task_id: taskId ?? null,
          name: `確定請求書＋立替実費明細（${def.office === 'gyosei' ? '行政' : '司法'}）`,
          file_path: storagePath,
          file_type: 'Excel',
          status: '作成済',
          generated_by: 'ai',
        })
      } else {
        console.error('[kakutei] storage upload failed:', uploadErr.message)
      }
    }

    // 請求一覧(invoices)にも反映（ファイルパスは案件フォルダ保存時のみ）
    if (body.invoiceId) {
      await supabase.from('invoices').update({ generated_file_path: savedPath }).eq('id', body.invoiceId)
    } else {
      const { error: invErr } = await supabase.from('invoices').insert({
        case_id: caseId,
        invoice_type: '確定請求',
        firm_type: def.office,
        amount: c.billAmount,
        fee_amount: fee,
        expenses_amount: c.expenseGrand,
        advance_deduction: advanceReceived || 0,
        status: '作成済',
        issued_date: new Date().toISOString().slice(0, 10),
        generated_file_path: savedPath,
      })
      if (invErr) console.error('[kakutei] invoices insert failed:', invErr.message)
    }

    return new NextResponse(uploadBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '不明なエラー'
    console.error('[kakutei] error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
