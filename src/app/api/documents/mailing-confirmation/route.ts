/**
 * 郵送書類確認票（Excel）生成API
 *
 * public/templates/mailing-confirmation/mailing_confirmation.xlsx をロードし、
 * 契約残手続き（お客様から返送してもらう書類）を「ご返送書類一覧」に流し込んで返す。
 * 生成方式は戸籍請求書(koseki-request)と同じ（テンプレのセルを埋める → Storage保存 → documents登録 → DL）。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'

type Body = {
  caseId: string
  returnDocs: string[]        // ご返送書類一覧（お客様が返送する書類。最大10）
  sendDocs?: string[]         // 送付書類一覧（こちらから送る書類。任意・最大10）
  shipDate?: string | null    // 発送日（YYYY-MM-DD）。未指定なら空欄（手書き）
  clientStaff?: string | null // お客様担当
  taskId?: string | null      // 紐づける作成タスク（タスク詳細から作成時）
}

// セル位置（mailing_confirmation.xlsx＝郵送書類確認票）
const RETURN_START_ROW = 9   // ご返送書類一覧 I9:I18（merged I:J）
const SEND_START_ROW = 9     // 送付書類一覧   D9:D18（merged D:E）
const MAX_ROWS = 10
const CELL = {
  shipDate: 'C22',   // 発送日（令和　年　月　日）
  clientStaff: 'J26',// お客様担当：
}

// 令和表記（令和元年=2019）
function reiwa(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear() - 2018
  return `令和　${y}　年　${d.getMonth() + 1}　月　${d.getDate()}　日`
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const { caseId, returnDocs, sendDocs = [], shipDate, clientStaff } = body
    if (!caseId) return NextResponse.json({ error: 'caseId は必須です' }, { status: 400 })

    const supabase = await createClient()
    const { data: caseData, error: caseErr } = await supabase
      .from('cases')
      .select('case_number, deal_name')
      .eq('id', caseId)
      .single()
    if (caseErr || !caseData) {
      return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })
    }

    const templatePath = path.join(process.cwd(), 'public', 'templates', 'mailing-confirmation', 'mailing_confirmation.xlsx')
    const templateBuffer = await readFile(templatePath)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(new Uint8Array(templateBuffer).buffer as ArrayBuffer)
    const ws = wb.getWorksheet('郵送書類確認票') ?? wb.worksheets[0]
    if (!ws) return NextResponse.json({ error: 'テンプレートのシートが見つかりません' }, { status: 500 })

    // 一覧をいったんクリア（テンプレの例を消す）してから流し込み
    for (let i = 0; i < MAX_ROWS; i++) {
      ws.getCell(`I${RETURN_START_ROW + i}`).value = null
      ws.getCell(`D${SEND_START_ROW + i}`).value = null
    }
    returnDocs.slice(0, MAX_ROWS).forEach((name, i) => {
      if (name && name.trim()) ws.getCell(`I${RETURN_START_ROW + i}`).value = name.trim()
    })
    sendDocs.slice(0, MAX_ROWS).forEach((name, i) => {
      if (name && name.trim()) ws.getCell(`D${SEND_START_ROW + i}`).value = name.trim()
    })

    // 発送日・お客様担当（任意）
    if (shipDate) ws.getCell(CELL.shipDate).value = reiwa(shipDate)
    if (clientStaff) ws.getCell(CELL.clientStaff).value = clientStaff

    const outBuffer = await wb.xlsx.writeBuffer()
    const downloadFilename = `郵送書類確認票_${caseData.case_number ?? caseId}.xlsx`

    // Storage 保存＋documents 登録（失敗してもDLは続行）
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
        task_id: body.taskId ?? null,
        name: `郵送書類確認票（${caseData.case_number ?? ''}）`,
        file_path: storagePath,
        file_type: 'Excel',
        status: '作成済',
        generated_by: 'manual',
      })
    } else {
      console.error('[mailing-confirmation] storage upload failed:', uploadErr.message)
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
    console.error('[mailing-confirmation] error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
