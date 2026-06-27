/**
 * 契約書（Excel）生成API
 *
 * public/templates/keiyaku/<variant>.xlsx をロードし、甲（依頼者）住所・氏名・被相続人を
 * 流し込み、乙（行政）・丙（司法）の署名欄に法人ごとの押印画像を配置してバイナリで返す。
 * テンプレは split_keiyaku_templates.py で参照データ（数式・枠外マスタ・案件番号見本）を除去済み。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { getKeiyakuVariant, STAMP_FILES, type KeiyakuStamp } from '@/lib/keiyakuVariants'

type Body = {
  caseId: string
  variant: string
  taskId?: string | null
  date?: string | null   // 契約日（任意。YYYY-MM-DD）
}

/** 和暦変換（契約日用）。 */
function toWareki(dateStr: string | null | undefined): { era: string; year: number; month: number; day: number } | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(dateStr)
  if (!m) return null
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  const ymd = y * 10000 + mo * 100 + d
  if (ymd >= 20190501) return { era: '令和', year: y - 2018, month: mo, day: d }
  if (ymd >= 19890108) return { era: '平成', year: y - 1988, month: mo, day: d }
  if (ymd >= 19261225) return { era: '昭和', year: y - 1925, month: mo, day: d }
  return { era: '西暦', year: y, month: mo, day: d }
}

function setCell(ws: ExcelJS.Worksheet, addr: string | undefined, value: string | number | null) {
  if (!addr || value === null || value === undefined || value === '') return
  ws.getCell(addr).value = value
}

/** セルアドレス(例 'AP52') を ExcelJS の 0始まり col/row に変換 */
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
    const { caseId, variant, taskId } = body

    if (!caseId || !variant) {
      return NextResponse.json({ error: 'caseId, variant は必須です' }, { status: 400 })
    }

    const def = getKeiyakuVariant(variant)
    if (!def) {
      return NextResponse.json({ error: `未知のバリエーション: ${variant}` }, { status: 400 })
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

    // メイン依頼者は case_clients 優先、無ければ clients
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

    const client = caseData.clients as { name?: string; address?: string } | null
    const clientName = mainName || client?.name || ''
    const clientAddress = client?.address ?? ''
    const deceasedName = caseData.deceased_name ?? ''

    const templatePath = path.join(process.cwd(), 'public', 'templates', 'keiyaku', `${variant}.xlsx`)
    const templateBuffer = await readFile(templatePath)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(new Uint8Array(templateBuffer).buffer as ArrayBuffer)
    const ws = wb.worksheets[0]
    if (!ws) {
      return NextResponse.json({ error: 'テンプレートのシートが見つかりません' }, { status: 500 })
    }

    const f = def.fields
    setCell(ws, f.address, clientAddress)
    // 甲（依頼者）署名欄の氏名は手書き署名のため空欄で出力する（住所・本文中の氏名は印字）。
    setCell(ws, f.deceased, deceasedName)
    setCell(ws, f.bodyClientName, clientName)

    // 契約日（任意。和暦で「令和○年○月○日」。元号もこのセル内に書く）
    if (body.date && f.dateCell) {
      const wd = toWareki(body.date)
      if (wd) setCell(ws, f.dateCell, `${wd.era}　${wd.year}　年　${wd.month}　月　${wd.day}　日`)
    }

    // 押印画像（乙＝行政／丙＝司法）
    for (const st of def.stamps as KeiyakuStamp[]) {
      const stampPath = path.join(process.cwd(), 'public', 'templates', 'stamps', STAMP_FILES[st.law])
      try {
        const imgBuf = await readFile(stampPath)
        const imageId = wb.addImage({ buffer: new Uint8Array(imgBuf).buffer as ArrayBuffer, extension: 'png' })
        const { col, row } = cellToColRow(st.cell)
        // 代表者名の行に角印を重ねる。小さめにして上の住所行へはみ出さないようにする。
        ws.addImage(imageId, {
          tl: { col, row: row - 0.1 } as ExcelJS.Anchor,
          ext: { width: 48, height: 48 },
          editAs: 'oneCell',
        })
      } catch { /* 画像が無ければ押印スキップ */ }
    }

    const outBuffer = await wb.xlsx.writeBuffer()
    const downloadFilename = `契約書_${def.label}_${caseData.case_number ?? caseId}.xlsx`

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
        name: `契約書（${def.label}）`,
        file_path: storagePath,
        file_type: 'Excel',
        status: '作成済',
        generated_by: 'ai',
      })
    } else {
      console.error('[keiyaku] storage upload failed:', uploadErr.message)
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
    console.error('[keiyaku] error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
