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
import { repairXlsx } from '@/lib/xlsxRepair'
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
  typeCell: string                  // 請求種別の1行目「戸籍・除籍・原戸籍」
  juminhyoCell: string              // 請求種別の2行目「住民票・除票・戸籍の附票」
  tohonCell: string                 // 「謄本・抄本」
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
    juminhyoCell: 'C19',
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
    juminhyoCell: 'C18',
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
    juminhyoCell: 'C15',
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

// ひな型の日付欄は書式が付いていないものがあり、日付をそのまま入れると
// シリアル値（46258 のような数字）で印字される。書式が既定のままなら和暦を当てる。
const WAREKI = '[$-411]ggge"年"m"月"d"日"'

/**
 * ひな型のセルに値を入れる。
 *
 * 値が無いときは「書かない」のではなく空にする。ひな型には
 * ●●市 / ●●市△△区××町二丁目～～ / 横浜　太郎 のような記入例が入っており、
 * 書かずに残すとその記入例がそのまま役所へ出る紙に載ってしまう。
 */
function setCell(ws: ExcelJS.Worksheet, addr: string, value: string | number | Date | null) {
  const cell = ws.getCell(addr)
  if (value === null || value === undefined || value === '') {
    cell.value = null
    return
  }
  cell.value = value
  if (value instanceof Date && (!cell.numFmt || cell.numFmt === 'General')) cell.numFmt = WAREKI
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
/**
 * 種別の欄に、頼むものだけを書く。
 *
 * 以前はひな型の「戸籍　・　除籍　・　原戸籍」をそのまま残し、選んだものを【】で囲っていた。
 * 頼んでいないものが紙に残るうえ、【】のぶん字が伸びて読みにくかった。
 * いまは行ごと書き換えて、選んだものだけを「・」でつないで書く。
 *
 * 何も選んでいなければ空にする。ひな型の例がそのまま役所へ出るのを防ぐため。
 */
function writeTypes(ws: ExcelJS.Worksheet, addr: string, candidates: readonly string[], selected: Set<string>) {
  const picked = candidates.filter(c => selected.has(c))
  const cell = ws.getCell(addr)
  cell.value = picked.join('　・　')
  cell.alignment = { ...(cell.alignment ?? {}), shrinkToFit: true }
}

/**
 * 代理人欄の代表者名。テンプレの数式（F11）が法人名から引いていた対応表と同じ。
 * 数式のままだと生成した xlsx で空欄になるため、値で書き込む。
 */
const KOSEKI_REPRESENTATIVE: Record<KosekiVariant, string> = {
  gyosei: '代表社員　黒田　美菜子',
  shiho: '代表社員　山田　哲',
  ikiiki: '代表理事　黒田　美菜子',
}

/** 拠点が選ばれていないときに使う電話（テンプレの既定値と同じ） */
const KOSEKI_DEFAULT_TEL: Record<KosekiVariant, string> = {
  gyosei: '045-548-9172',
  shiho: '045-548-9172',
  ikiiki: '045-620-6600',
}

/** 電話番号を全角にする（テンプレの他の行が全角のため揃える） */
const toZenkakuTel = (tel: string) =>
  tel.replace(/[0-9]/g, d => String.fromCharCode(d.charCodeAt(0) + 0xFEE0)).replace(/-/g, '－')

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
    // 元の大きなブックから1シート抜いたひな型には、参照先を失った名前付き範囲が残っている。
    // そのまま書き出すと Excel が「修復しました」と言ってくるので落とす。
    wb.definedNames.model = []

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

    // 上記代理人の欄（住所2行・代表者・電話）。
    //
    // 代表者と電話はテンプレでは数式（F11/F12）で法人名から引く作りだったが、
    // 生成した xlsx には計算結果が入らないため、開くと空欄のまま出ていた。
    // どちらもこちらが持っている情報なので、数式に頼らず値で書き込む。
    // 電話は選んだ拠点・事業部のもの（同じ拠点でも事業部で番号が変わる）。
    {
      const branch = body.agentOffice ? findBranch(body.agentOffice, body.division) : undefined
      if (branch) {
        ws.getCell('F8').value = branch.line1
        ws.getCell('F9').value = branch.line2
      }
      ws.getCell('F11').value = KOSEKI_REPRESENTATIVE[variant]
      ws.getCell('F12').value = `ＴＥＬ　${toZenkakuTel(branch?.tel ?? KOSEKI_DEFAULT_TEL[variant])}`
    }

    setCell(ws, map.copyCount, `${row.copyCount}　通`)
    setCell(ws, map.honseki, row.honseki)
    setCell(ws, map.hittousha, row.hittousha)
    setCell(ws, map.targetName, row.targetName)

    // 請求種別: 頼むものだけを書く。3行に分かれている（戸籍系／住民票系／謄本・抄本）。
    const selectedTypes = new Set(row.requestTypes ?? [])
    writeTypes(ws, map.typeCell, ['戸籍', '除籍', '原戸籍'], selectedTypes)
    writeTypes(ws, map.juminhyoCell, ['住民票', '除票', '戸籍の附票'], selectedTypes)
    writeTypes(ws, map.tohonCell, ['謄本', '抄本'], selectedTypes)

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
    // ExcelJS は <sheetPr> の子要素を規格と違う順に書き出すバグがあり、
    // そのままだと Excel がシートを丸ごと捨てて白紙で開く。書き出し後に直す。
    const uploadBuffer = repairXlsx(Buffer.from(outBuffer as ArrayBuffer))
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
