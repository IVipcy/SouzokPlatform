/**
 * 封筒（宛名）（Excel）生成API
 *
 * public/templates/envelope/<variant>.xlsx をロードし、依頼者の郵便番号（各桁）・住所・氏名を流し込む。
 * テンプレは split_envelope_templates.py で参照データ（数式・枠外マスタ・画像）を除去済み。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { getEnvelopeVariant, splitPostal } from '@/lib/envelopeVariants'

type Body = {
  caseId: string
  variant: string
  taskId?: string | null
}

function setCell(ws: ExcelJS.Worksheet, addr: string | undefined, value: string | number | null) {
  if (!addr || value === null || value === undefined || value === '') return
  ws.getCell(addr).value = value
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const { caseId, variant, taskId } = body
    if (!caseId || !variant) {
      return NextResponse.json({ error: 'caseId, variant は必須です' }, { status: 400 })
    }
    const def = getEnvelopeVariant(variant)
    if (!def) {
      return NextResponse.json({ error: `未知のバリエーション: ${variant}` }, { status: 400 })
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

    const client = caseData.clients as { name?: string; address?: string; postal_code?: string } | null
    const clientName = mainName || client?.name || ''
    const clientAddress = client?.address ?? ''
    const { p3, p4 } = splitPostal(client?.postal_code)

    const templatePath = path.join(process.cwd(), 'public', 'templates', 'envelope', `${variant}.xlsx`)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(new Uint8Array(await readFile(templatePath)).buffer as ArrayBuffer)
    const ws = wb.worksheets[0]
    if (!ws) {
      return NextResponse.json({ error: 'テンプレートのシートが見つかりません' }, { status: 500 })
    }

    def.postal3.forEach((addr, i) => setCell(ws, addr, p3[i] ?? ''))
    def.postal4.forEach((addr, i) => setCell(ws, addr, p4[i] ?? ''))
    setCell(ws, def.address, clientAddress)
    setCell(ws, def.name, clientName)

    const outBuffer = await wb.xlsx.writeBuffer()
    const downloadFilename = `封筒_${def.label}_${caseData.case_number ?? caseId}.xlsx`
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
        name: `封筒（${def.label}）`,
        file_path: storagePath,
        file_type: 'Excel',
        status: '作成済',
        generated_by: 'ai',
      })
    } else {
      console.error('[envelope] storage upload failed:', uploadErr.message)
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
    console.error('[envelope] error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
