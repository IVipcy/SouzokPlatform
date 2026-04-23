/**
 * 戸籍・住民票等請求書（Excel）生成API
 *
 * public/templates/koseki/ に配置したバリエーション別テンプレ xlsx をロードし、
 * 案件データ・入力値を該当セルに流し込んで、バイナリで返す。
 *
 * 複数請求先がある場合、クライアント側で 1行ずつ本APIを呼び出して順次ダウンロードする。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { KOSEKI_VARIANT_PRESETS, type KosekiVariant } from '@/lib/officeProfiles'

type RequestRow = {
  municipality: string
  honseki: string
  hittousha: string
  targetName: string
  requestTypes: string[]
  copyCount: number
  kogawaseAmount: number | null
  notes: string
}

type Body = {
  caseId: string
  variant: KosekiVariant
  requestDate: string
  submitCourt: string | null
  rows: RequestRow[]
  rowIndex?: number  // どの請求先を出力するか（省略時は全件まとめて別xlsx化→未対応、0番で1件）
}

/**
 * バリエーション別 セル位置マップ
 *
 * 原本テンプレの行位置が gyosei / shiho / ikiiki(+kennin) で異なるため個別定義。
 * - gyosei: 代表社員住所＋生年月日ブロック(E14〜F16)で 1行分下にずれる
 * - shiho:  代表社員住所＋生年月日を F14,F15 に圧縮
 * - ikiiki: 代表社員ブロックなし
 */
const CELL_MAP: Record<KosekiVariant, {
  municipality: string
  requestDate: string[]
  requesterAddress: string | null   // F5など。検認時は null（テンプレに協会情報既設）
  requesterName: string | null      // F6
  kosekiTypeLabel: string | null    // 請求種別「戸籍・除籍・原戸籍」(そのまま残す場合はnull)
  juminhyoLabel: string | null      // 住民票行(同上)
  copyCount: string                 // 通数
  honseki: string                   // 本籍・住所
  hittousha: string                 // 筆頭者氏名
  targetName: string                // 請求に係る者の氏名
  purpose: string                   // 使用目的
  submitTo: string | null           // 提出先（検認時の家裁名）
  deceasedName: string              // 被相続人欄
  kogawaseAmount: string            // 同封小為替額
  notesStart: string                // 備考（最初の行）
}> = {
  gyosei: {
    municipality: 'A3',
    requestDate: ['G3', 'I1'],
    requesterAddress: 'F5',
    requesterName: 'F6',
    kosekiTypeLabel: null,
    juminhyoLabel: null,
    copyCount: 'H18',
    honseki: 'C20',
    hittousha: 'C21',
    targetName: 'C23',
    purpose: 'C27',
    submitTo: 'G28',
    deceasedName: 'D28',
    kogawaseAmount: 'G36',
    notesStart: 'C29',
  },
  shiho: {
    municipality: 'A3',
    requestDate: ['G3', 'I1'],
    requesterAddress: 'F5',
    requesterName: 'F6',
    kosekiTypeLabel: null,
    juminhyoLabel: null,
    copyCount: 'H17',
    honseki: 'C19',
    hittousha: 'C20',
    targetName: 'C22',
    purpose: 'C26',
    submitTo: null,
    deceasedName: 'D27',
    kogawaseAmount: 'G34',
    notesStart: 'C28',
  },
  ikiiki: {
    municipality: 'A3',
    requestDate: ['G3', 'I1'],
    requesterAddress: 'F5',
    requesterName: 'F6',
    kosekiTypeLabel: null,
    juminhyoLabel: null,
    copyCount: 'H14',
    honseki: 'C16',
    hittousha: 'C17',
    targetName: 'C19',
    purpose: 'C23',
    submitTo: null,
    deceasedName: 'D24',
    kogawaseAmount: 'G32',
    notesStart: 'C25',
  },
  ikiiki_kennin: {
    municipality: 'A3',
    requestDate: ['G3', 'I1'],
    requesterAddress: null,  // 検認時は遺言保管者=協会の住所がテンプレ既設
    requesterName: null,
    kosekiTypeLabel: null,
    juminhyoLabel: null,
    copyCount: 'H14',
    honseki: 'C16',
    hittousha: 'C17',
    targetName: 'C19',
    purpose: 'C23',
    submitTo: null,
    deceasedName: 'D24',
    kogawaseAmount: 'G32',
    notesStart: 'C25',
  },
}

function setCell(ws: ExcelJS.Worksheet, addr: string, value: string | number | Date | null) {
  if (value === null || value === undefined || value === '') return
  const cell = ws.getCell(addr)
  cell.value = value
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const { caseId, variant, requestDate, submitCourt, rows, rowIndex = 0 } = body

    if (!caseId || !variant || !rows || rows.length === 0) {
      return NextResponse.json({ error: 'caseId, variant, rows は必須です' }, { status: 400 })
    }

    const preset = KOSEKI_VARIANT_PRESETS[variant]
    if (!preset) {
      return NextResponse.json({ error: `未知のバリエーション: ${variant}` }, { status: 400 })
    }

    const row = rows[rowIndex]
    if (!row) {
      return NextResponse.json({ error: `rowIndex ${rowIndex} が不正です` }, { status: 400 })
    }

    // 案件+依頼者データを取得
    const supabase = await createClient()
    const { data: caseData, error: caseErr } = await supabase
      .from('cases')
      .select('*, clients(*)')
      .eq('id', caseId)
      .single()

    if (caseErr || !caseData) {
      return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })
    }

    // テンプレート読込
    const templateFile = `koseki_${variant}.xlsx`
    const templatePath = path.join(process.cwd(), 'public', 'templates', 'koseki', templateFile)
    const templateBuffer = await readFile(templatePath)

    const wb = new ExcelJS.Workbook()
    // NodeのBufferとExcelJSの期待する型の互換対応: Uint8Array経由で渡す
    await wb.xlsx.load(new Uint8Array(templateBuffer).buffer as ArrayBuffer)
    const ws = wb.getWorksheet('koseki') ?? wb.worksheets[0]
    if (!ws) {
      return NextResponse.json({ error: 'テンプレートのシートが見つかりません' }, { status: 500 })
    }

    const map = CELL_MAP[variant]
    const client = caseData.clients as { name?: string; address?: string } | null
    const clientName = client?.name ?? ''
    const clientAddress = client?.address ?? ''
    const deceasedName = caseData.deceased_name ?? ''

    // 日付: 令和元号 or yyyy/m/d で流す。Excel側でフォーマット適用（とりあえず文字列）
    const dateObj = requestDate ? new Date(requestDate) : new Date()

    // --- 流し込み ---
    setCell(ws, map.municipality, row.municipality)

    for (const addr of map.requestDate) {
      setCell(ws, addr, dateObj)
    }

    if (map.requesterAddress) setCell(ws, map.requesterAddress, clientAddress)
    if (map.requesterName) setCell(ws, map.requesterName, clientName)

    setCell(ws, map.copyCount, `${row.copyCount}　通`)
    setCell(ws, map.honseki, row.honseki)
    setCell(ws, map.hittousha, row.hittousha)
    setCell(ws, map.targetName, row.targetName)

    // 使用目的: 検認時は＿＿＿を家裁名で埋める
    let purposeText = preset.purpose
    if (variant === 'ikiiki_kennin' && submitCourt) {
      purposeText = purposeText.replace('＿＿＿＿＿', submitCourt)
    }
    setCell(ws, map.purpose, purposeText)

    setCell(ws, map.deceasedName, deceasedName)

    if (row.kogawaseAmount !== null && row.kogawaseAmount !== undefined) {
      setCell(ws, map.kogawaseAmount, row.kogawaseAmount)
    }

    if (row.notes) {
      // 備考欄(notesStart)に流し込み（複数行はテンプレ既存レイアウトに委ねる）
      setCell(ws, map.notesStart, row.notes)
    }

    // 出力
    const outBuffer = await wb.xlsx.writeBuffer()
    const cityLabel = row.municipality || 'untitled'
    const downloadFilename = `戸籍請求書_${caseData.case_number ?? caseId}_${cityLabel}_${requestDate}.xlsx`

    // Supabase Storage にアップロード（英数字パスで、日本語ファイル名はdocuments.nameに保持）
    const storageFilename = `${Date.now()}_${crypto.randomUUID()}.xlsx`
    const storagePath = `${caseId}/${storageFilename}`
    const uploadBuffer = Buffer.from(outBuffer as ArrayBuffer)
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, uploadBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

    // documentsテーブルにレコード作成（アップロード失敗時はスキップしてダウンロードは続行）
    if (!uploadErr) {
      const docName = `戸籍請求書_${cityLabel}_${requestDate}（${preset.label}）`
      await supabase.from('documents').insert({
        case_id: caseId,
        name: docName,
        file_path: storagePath,
        file_type: 'Excel',
        status: '作成済',
        generated_by: 'manual',
      })
    } else {
      console.error('[koseki-request] storage upload failed:', uploadErr.message)
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
    console.error('[koseki-request] error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
