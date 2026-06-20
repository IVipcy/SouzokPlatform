/**
 * 委任状（Excel）生成API
 *
 * public/templates/ininjo/<variant>.xlsx をロードし、案件・依頼者データを該当セルに流し込み、
 * 法人ごとの押印画像を代理人欄に配置してバイナリで返す。
 * テンプレは split_ininjo_templates.py で参照データ（数式・枠外マスタ）を除去済み。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { getIninjoVariant, STAMP_FILES, type IninjoStamp } from '@/lib/ininjoVariants'

type Body = {
  caseId: string
  variant: string
  taskId?: string | null
  date?: string | null   // 委任日（任意。YYYY-MM-DD）
}

/** 和暦変換（YYYY-MM-DD → 元号/年/月/日）。範囲外は西暦年を返す。 */
function toWareki(dateStr: string | null | undefined): { era: string; year: number; month: number; day: number } | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(dateStr)
  if (!m) return null
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  const ymd = y * 10000 + mo * 100 + d
  if (ymd >= 20190501) return { era: '令和', year: y - 2018, month: mo, day: d }
  if (ymd >= 19890108) return { era: '平成', year: y - 1988, month: mo, day: d }
  if (ymd >= 19261225) return { era: '昭和', year: y - 1925, month: mo, day: d }
  if (ymd >= 19120730) return { era: '大正', year: y - 1911, month: mo, day: d }
  return { era: '西暦', year: y, month: mo, day: d }
}

/** 案件管理番号を4セグメントに分割（区切りや桁数が違っても落ちないよう緩く分解） */
function splitCaseNumber(caseNumber: string | null | undefined): [string, string, string, string] {
  const s = (caseNumber ?? '').trim()
  if (!s) return ['', '', '', '']
  // 区切り（-・/・空白）があれば分割、無ければ全体を先頭セグメントに
  const parts = s.split(/[-－/／\s]+/).filter(Boolean)
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '', parts[3] ?? '']
}

function setCell(ws: ExcelJS.Worksheet, addr: string | undefined, value: string | number | null) {
  if (!addr || value === null || value === undefined || value === '') return
  ws.getCell(addr).value = value
}

/** セルアドレス(例 'R22') を ExcelJS の 0始まり col/row に変換 */
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

    const def = getIninjoVariant(variant)
    if (!def) {
      return NextResponse.json({ error: `未知のバリエーション: ${variant}` }, { status: 400 })
    }

    // 案件・依頼者データ取得（メイン依頼者は case_clients 優先、無ければ clients）
    const supabase = await createClient()
    const { data: caseData, error: caseErr } = await supabase
      .from('cases')
      .select('*, clients(*)')
      .eq('id', caseId)
      .single()
    if (caseErr || !caseData) {
      return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })
    }

    type MainClient = { name?: string | null; birth_date?: string | null; priority?: string | null }
    let mainClient: MainClient | null = null
    try {
      const { data: ccs } = await supabase
        .from('case_clients')
        .select('name, birth_date, priority, sort_order')
        .eq('case_id', caseId)
        .order('sort_order', { ascending: true })
      const rows = (ccs ?? []) as MainClient[]
      if (rows.length > 0) {
        mainClient = rows.find(c => c.priority === 'main') ?? rows[0]
      }
    } catch { /* migration 未適用環境では無視 */ }

    const client = caseData.clients as { name?: string; address?: string } | null
    const clientName = mainClient?.name || client?.name || ''
    const clientAddress = client?.address ?? ''
    const birth = toWareki(mainClient?.birth_date)
    const death = toWareki(caseData.date_of_death)
    const deceasedName = caseData.deceased_name ?? ''

    // テンプレート読込
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'ininjo', `${variant}.xlsx`)
    const templateBuffer = await readFile(templatePath)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(new Uint8Array(templateBuffer).buffer as ArrayBuffer)
    const ws = wb.worksheets[0]
    if (!ws) {
      return NextResponse.json({ error: 'テンプレートのシートが見つかりません' }, { status: 500 })
    }

    const f = def.fields

    // 案件管理番号
    if (f.caseNo) {
      const seg = splitCaseNumber(caseData.case_number)
      setCell(ws, f.caseNo[0], seg[0])
      setCell(ws, f.caseNo[1], seg[1])
      setCell(ws, f.caseNo[2], seg[2])
      setCell(ws, f.caseNo[3], seg[3])
    }

    // 委任者
    setCell(ws, f.address, clientAddress)
    setCell(ws, f.name, clientName)
    // 委任者氏名はテンプレ既定だと「縮小して全体を表示」で小さく潰れるため、
    // 読みやすいサイズ＋縮小表示OFFにする。
    // また氏名ラベルは2行分（例 L10:M11）に結合されているのに値セル(N10)は1行だけのため、
    // 値が上にずれて見える。住所(N8:V8)と同じ幅・2行で結合し縦中央寄せにして位置を揃える。
    if (f.name && clientName) {
      if (f.name === 'N10') {
        try { ws.mergeCells('N10:V11') } catch { /* 既に結合済みの様式ならスキップ */ }
      }
      const nameCell = ws.getCell(f.name)
      nameCell.font = { ...(nameCell.font ?? {}), size: 14 }
      nameCell.alignment = { ...(nameCell.alignment ?? {}), vertical: 'middle', horizontal: 'center', shrinkToFit: false, wrapText: false }
    }
    if (birth) {
      setCell(ws, f.birthEra, birth.era)
      setCell(ws, f.birthYear, birth.year)
      setCell(ws, f.birthMonth, birth.month)
      setCell(ws, f.birthDay, birth.day)
    }

    // 委任日（任意。和暦で「令和○年○月○日」。元号は別セル、年月日はラベルセルへ）
    if (body.date && f.dateCell) {
      const wd = toWareki(body.date)
      if (wd) {
        setCell(ws, f.dateEraCell, wd.era)
        setCell(ws, f.dateCell, `　${wd.year}　年　${wd.month}　月　${wd.day}　日`)
      }
    }

    // 被相続人・死亡日
    setCell(ws, f.deceased, deceasedName)
    if (death) {
      setCell(ws, f.deathEra, death.era)
      setCell(ws, f.deathYear, death.year)
      setCell(ws, f.deathMonth, death.month)
      setCell(ws, f.deathDay, death.day)
    }

    // 押印画像
    for (const st of def.stamps as IninjoStamp[]) {
      const file = STAMP_FILES[st.law]
      const stampPath = path.join(process.cwd(), 'public', 'templates', 'stamps', file)
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

    // 出力
    const outBuffer = await wb.xlsx.writeBuffer()
    const downloadFilename = `委任状_${def.label}_${caseData.case_number ?? caseId}.xlsx`

    // Supabase Storage へ保存（英数字パス、日本語名は documents.name に保持）
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
        name: `委任状（${def.label}）`,
        file_path: storagePath,
        file_type: 'Excel',
        status: '作成済',
        generated_by: 'ai',
      })
    } else {
      console.error('[ininjo] storage upload failed:', uploadErr.message)
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
    console.error('[ininjo] error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
