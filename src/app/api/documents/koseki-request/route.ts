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
import { KOSEKI_VARIANT_PRESETS, findBranch, type KosekiVariant, type KosekiAgentOfficeId } from '@/lib/officeProfiles'

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
  purpose?: string   // 使用目的（出力画面で選択）
  rows: RequestRow[]
  rowIndex?: number  // どの請求先を出力するか（省略時は全件まとめて別xlsx化→未対応、0番で1件）
  taskId?: string | null  // 紐づける作成タスク（タスク詳細から作成時）
  agentOffice?: KosekiAgentOfficeId  // 上記代理人の所在地（拠点）。省略時はテンプレ既定（共同ビル）
  division?: string                  // 事業部（第一/第二など）。同じ拠点でも電話が変わるため
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
  typeCell: string                  // 請求種別「戸籍・除籍・原戸籍」（選択種別を〇で囲う）
  tohonCell: string                 // 「謄本・抄本」（同上）
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
    typeCell: 'C18',
    tohonCell: 'F18',
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
    typeCell: 'C17',
    tohonCell: 'F17',
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
  // いきいきは代表社員の住所・生年月日の欄が無いぶん、行政より4行ぶん上に詰まっている。
  ikiiki: {
    municipality: 'A3',
    requestDate: ['G3'],
    requesterAddress: 'F5',
    requesterName: 'F6',
    typeCell: 'C14',
    tohonCell: 'F14',
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

/**
 * 「戸籍　・　除籍　・　原戸籍」のようなラベルのうち、選択された種別を【】で囲う
 * （Excel図形の□囲い相当をテキストで表現）。
 *
 * 以前は '・' で切って1語ずつ突き合わせていたが、テンプレの
 * 「戸籍の附票（本籍地・筆頭者記載あり）」はカッコの中にも '・' があるため語が割れ、
 * 附票だけ永久に印が付かなかった。区切りに頼らず、種別名そのものを探して囲む。
 *
 * 「戸籍」は「原戸籍」「戸籍の附票」の一部でもあるので、長い名前から順に処理し、
 * 既に囲んだところは二重に囲まない。
 */
function markTypes(ws: ExcelJS.Worksheet, addr: string, selected: Set<string>) {
  const cell = ws.getCell(addr)
  const cur = cell.value
  if (typeof cur !== 'string' || cur.trim() === '') return

  let text = cur
  const names = [...selected].filter(Boolean).sort((a, b) => b.length - a.length)
  for (const name of names) {
    if (text.includes(`【${name}】`)) continue
    const idx = text.indexOf(name)
    if (idx < 0) continue
    // 既に囲んだ語の内側（例：【戸籍の附票】の中の「戸籍」）は触らない
    const before = text.slice(0, idx)
    if ((before.match(/【/g)?.length ?? 0) > (before.match(/】/g)?.length ?? 0)) continue
    text = `${before}【${name}】${text.slice(idx + name.length)}`
  }
  if (text === cur) return
  cell.value = text

  // 【】のぶん文字が伸びる。セル幅は固定なので、収まるように縮める。
  // 結合セルでは shrinkToFit が効かないことがあるため、伸びた量に応じてフォントも落とす。
  const grew = text.length - cur.length
  const base = cell.font?.size ?? 11
  const size = grew >= 8 ? Math.max(8, base - 2) : grew >= 4 ? Math.max(9, base - 1) : base
  cell.alignment = { ...(cell.alignment ?? {}), shrinkToFit: true }
  cell.font = { ...(cell.font ?? {}), size }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const { caseId, variant, requestDate, rows, rowIndex = 0 } = body

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

    // 上記代理人の所在地（拠点＋事業部）。選択時は住所と電話を上書き（未選択はテンプレ既定）。
    // 同じ拠点でも事業部で電話が変わるので、電話まで差し替える。
    if (body.agentOffice) {
      const branch = findBranch(body.agentOffice, body.division)
      if (branch) {
        ws.getCell('F8').value = branch.line1
        ws.getCell('F9').value = branch.line2
        // 電話はテンプレ側が数式（F12）で法人名から引いている行があるため、
        // いきいきのように数式で拾えないものだけ直接入れる。
        if (variant === 'ikiiki') ws.getCell('F12').value = `ＴＥＬ　${branch.tel}`
      }
    }

    setCell(ws, map.copyCount, `${row.copyCount}　通`)
    setCell(ws, map.honseki, row.honseki)
    setCell(ws, map.hittousha, row.hittousha)
    setCell(ws, map.targetName, row.targetName)

    // 請求種別: 選択された種別を 〇 で囲って表示
    const selectedTypes = new Set(row.requestTypes ?? [])
    markTypes(ws, map.typeCell, selectedTypes)
    markTypes(ws, map.tohonCell, selectedTypes)

    // 使用目的: 出力画面で選択された目的を優先（未指定はプリセット）
    setCell(ws, map.purpose, body.purpose || preset.purpose)

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
        task_id: body.taskId ?? null,
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
