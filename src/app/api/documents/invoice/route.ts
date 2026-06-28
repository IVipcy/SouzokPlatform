/**
 * 請求書・領収書（前受金）（Excel）生成API
 *
 * public/templates/invoice/<variant>.xlsx をロードし、案件番号・依頼者・件名・金額を流し込み、
 * 法人の社印を配置してバイナリで返す。前受金は消費税対象外のため合計＝入力額。
 * テンプレは split_invoice_templates.py で参照データ（数式・枠外マスタ・社印画像）を除去済み。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { getInvoiceVariant, INVOICE_FIELDS } from '@/lib/invoiceVariants'
import { STAMP_FILES } from '@/lib/ininjoVariants'
import { KOSEKI_AGENT_OFFICES } from '@/lib/officeProfiles'

type Body = {
  caseId: string
  variant: string
  kenmei: string
  amount: number
  taskId?: string | null
  invoiceId?: string | null   // メイン請求モーダル経由＝既に invoices 行があるので二重作成しない
  kubun?: string              // 区分セル（請求書=前受金、領収書=前受金/確定請求 等）。既定は前受金
  officeId?: string           // 事務所住所（kureator/kyodo/fujisawa）。未指定はテンプレ既定
}

function setCell(ws: ExcelJS.Worksheet, addr: string | undefined, value: string | number | null) {
  if (!addr || value === null || value === undefined || value === '') return
  ws.getCell(addr).value = value
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
    const { caseId, variant, kenmei, amount, taskId } = body

    if (!caseId || !variant) {
      return NextResponse.json({ error: 'caseId, variant は必須です' }, { status: 400 })
    }
    const def = getInvoiceVariant(variant)
    if (!def) {
      return NextResponse.json({ error: `未知のバリエーション: ${variant}` }, { status: 400 })
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: '金額を正しく入力してください' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: caseData, error: caseErr } = await supabase
      .from('cases')
      .select('*, clients(*)')
      .eq('id', caseId)
      .single()
    if (caseErr || !caseData) {
      return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })
    }

    let mainName: string | null = null
    try {
      const { data: ccs } = await supabase
        .from('case_clients')
        .select('name, priority, sort_order')
        .eq('case_id', caseId)
        .order('sort_order', { ascending: true })
      const rows = (ccs ?? []) as Array<{ name?: string | null; priority?: string | null }>
      if (rows.length > 0) mainName = (rows.find(c => c.priority === 'main') ?? rows[0]).name ?? null
    } catch { /* migration 未適用環境では無視 */ }

    const client = caseData.clients as { name?: string } | null
    const clientName = mainName || client?.name || ''

    const templatePath = path.join(process.cwd(), 'public', 'templates', 'invoice', `${variant}.xlsx`)
    const templateBuffer = await readFile(templatePath)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(new Uint8Array(templateBuffer).buffer as ArrayBuffer)
    const ws = wb.worksheets[0]
    if (!ws) {
      return NextResponse.json({ error: 'テンプレートのシートが見つかりません' }, { status: 500 })
    }

    const F = INVOICE_FIELDS

    // 案件番号（枠内に1セルでまとめて表示。旧テンプレの区切りセルは消す）
    setCell(ws, F.caseNoCell, caseData.case_number ?? '')
    for (const c of F.caseNoClear) ws.getCell(c).value = null

    // 依頼者・件名・区分
    setCell(ws, F.clientName, clientName)
    for (const c of F.kenmei) setCell(ws, c, kenmei || '')
    setCell(ws, F.kubun, body.kubun || '前受金')

    // 事務所住所（選択された拠点で上書き。未指定はテンプレ既定のまま）
    const office = KOSEKI_AGENT_OFFICES.find(o => o.id === body.officeId)
    if (office) {
      setCell(ws, F.address1, office.line1)
      setCell(ws, F.address2, office.line2)
    }

    // 金額（前受金は消費税対象外＝合計も同額）
    for (const c of F.amount) setCell(ws, c, amount)

    // 社印（行＝行政／司＝司法）
    try {
      const stampPath = path.join(process.cwd(), 'public', 'templates', 'stamps', STAMP_FILES[def.office])
      const imgBuf = await readFile(stampPath)
      const imageId = wb.addImage({ buffer: new Uint8Array(imgBuf).buffer as ArrayBuffer, extension: 'png' })
      const { col, row } = cellToColRow(F.sealCell)
      // 代表者名の行に角印を重ねる。上の住所行へはみ出さないよう少し下げ・小さめに。
      ws.addImage(imageId, {
        tl: { col, row: row - 0.2 } as ExcelJS.Anchor,
        ext: { width: 50, height: 50 },
        editAs: 'oneCell',
      })
    } catch { /* 画像が無ければ社印スキップ */ }

    const outBuffer = await wb.xlsx.writeBuffer()
    const downloadFilename = `${def.docType}_前受金_${def.officeLabel}_${caseData.case_number ?? caseId}.xlsx`

    const storagePath = `${caseId}/${Date.now()}_${crypto.randomUUID()}.xlsx`
    const uploadBuffer = Buffer.from(outBuffer as ArrayBuffer)
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, uploadBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

    if (!uploadErr) {
      await supabase.from('documents').insert({
        case_id: caseId,
        task_id: taskId ?? null,
        name: `${def.docType}（前受金・${def.office === 'gyosei' ? '行政' : '司法'}）`,
        file_path: storagePath,
        file_type: 'Excel',
        status: '作成済',
        generated_by: 'ai',
      })
    } else {
      console.error('[invoice] storage upload failed:', uploadErr.message)
    }

    // 請求一覧(invoices)にも反映（請求書のみ。領収書は請求実体ではない）。
    if (def.docType === '請求書') {
      if (body.invoiceId) {
        // メイン請求モーダル経由＝既に行があるので、公式Excelのパスだけ追記
        await supabase.from('invoices').update({ generated_file_path: storagePath }).eq('id', body.invoiceId)
      } else {
        const { error: invErr } = await supabase.from('invoices').insert({
          case_id: caseId,
          invoice_type: '前受金',
          firm_type: def.office,
          amount,
          fee_amount: amount,
          status: '作成済',
          issued_date: new Date().toISOString().slice(0, 10),
          generated_file_path: storagePath,
        })
        if (invErr) console.error('[invoice] invoices insert failed:', invErr.message)
      }
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
    console.error('[invoice] error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
