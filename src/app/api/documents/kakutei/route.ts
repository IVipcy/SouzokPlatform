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
import { getKakuteiVariant, KAKUTEI_FIELDS, TATEKAE_FIELDS, computeKakutei, type ExpenseItem } from '@/lib/kakuteiVariants'
import { STAMP_FILES } from '@/lib/ininjoVariants'
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

    // 社印（切り分け中：2シート＋画像でファイルが破損する疑いのため一時停止。後で確実な方法で戻す）
    // try {
    //   const imgBuf = await readFile(path.join(process.cwd(), 'public', 'templates', 'stamps', STAMP_FILES[def.office]))
    //   const imageId = wb.addImage({ buffer: new Uint8Array(imgBuf).buffer as ArrayBuffer, extension: 'png' })
    //   const { col, row } = cellToColRow(K.sealCell)
    //   kak.addImage(imageId, { tl: { col, row } as ExcelJS.Anchor, ext: { width: 56, height: 56 }, editAs: 'oneCell' })
    // } catch { /* 画像が無ければスキップ */ }

    // --- 立替実費明細 ---
    const T = TATEKAE_FIELDS
    setCell(tate, T.caseNoConcat, caseData.case_number ?? '')
    alignLeft(tate, T.caseNoConcat)  // 立替明細シートの案件番号も左揃え
    setCell(tate, T.clientName, clientName)
    setCell(tate, T.totalTop, c.expenseGrand)
    const writeExpenseRow = (r: number, e: { name: string; amount: number; quantity?: number | null; unitPrice?: number | null }) => {
      setCell(tate, `${T.nameCol}${r}`, e.name)
      setCell(tate, `${T.qtyCol}${r}`, e.quantity ?? null)
      setCell(tate, `${T.unitCol}${r}`, e.unitPrice ?? null)
      setCell(tate, `${T.amountCol}${r}`, e.amount)
    }
    c.nonTaxItems.slice(0, T.nonTaxRows.length).forEach((e, i) => writeExpenseRow(T.nonTaxRows[i], e))
    setCell(tate, T.nonTaxSubtotal, c.nonTaxSubtotal)
    c.taxItems.slice(0, T.taxRows.length).forEach((e, i) => writeExpenseRow(T.taxRows[i], e))
    setCell(tate, T.taxSubtotal, c.taxSubtotal)
    setCell(tate, T.grandTotal, c.expenseGrand)

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
