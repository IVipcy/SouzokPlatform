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
import { repairXlsx } from '@/lib/xlsxRepair'
import { getKakuteiVariant, KAKUTEI_FIELDS, computeKakutei, type ExpenseItem } from '@/lib/kakuteiVariants'
import { STAMP_FILES } from '@/lib/ininjoVariants'
import { KOSEKI_AGENT_OFFICES, OFFICE_PROFILES, findBranch, type OfficeBranchId } from '@/lib/officeProfiles'

type Body = {
  caseId: string
  variant: string
  kenmei: string
  fee: number
  advanceReceived: number
  expenses: ExpenseItem[]
  taskId?: string | null
  dueDate?: string | null      // 入金期日（任意）。invoices.due_date に保存。
  invoiceId?: string | null   // メイン請求モーダル経由＝既に invoices 行があるので二重作成しない
  officeId?: string           // 事務所住所（拠点: kureator/kyodo/fujisawa）
  division?: string           // 事業部（第一/第二 等）。同じ拠点でも電話・FAXが変わる
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
        .order('sort_order', { ascending: true }).order('created_at')
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
    // 元の大きなブックから2シート抜いたひな型なので、
    //   ・参照先を失った名前付き範囲（'検索元'!$A$1 など。開いたときの「修復しました」の原因）
    //   ・存在しないシート番号を指したブックの表示位置（firstSheet=10・画面外の座標）
    // が残っている。どちらも確定請求書シートが白紙で開く原因になるので、書き出す前に直す。
    wb.definedNames.model = []
    wb.views = [{ x: 0, y: 0, width: 28000, height: 16000, firstSheet: 0, activeTab: 0, visibility: 'visible' }]

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
    if (office) {
      setCell(kak, K.address1, office.line1); setCell(kak, K.address2, office.line2)
      // 電話・FAXは拠点＋事業部で（共同ビルの第一／第二で変わる）
      const branch = body.officeId ? findBranch(body.officeId as OfficeBranchId, body.division) : undefined
      if (branch) { setCell(kak, K.tel, branch.tel); setCell(kak, K.fax, branch.fax) }
    }
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
    // ひな型のsheet2は結合セルが131個あり、ExcelJS が再保存で壊してしまう。
    // そのため sheet2 は捨てて、実際に使っている様式（docs/AI書類作成/立替実費明細.xlsx）と
    // 同じ組み方で新しく作る。列は A〜D=名目 / E=数量 / F=単価 / G=金額 / H〜J=備考。
    // 1明細＝2行（長い名目が折り返せるように）。
    wb.removeWorksheet(tate.id)
    const ws = wb.addWorksheet('立替実費明細')
    ws.pageSetup.orientation = 'portrait'
    ws.pageSetup.fitToPage = true
    ws.pageSetup.fitToWidth = 1
    ws.pageSetup.fitToHeight = 0

    // 様式どおりの列幅（B/I/J は既定のまま）
    const colW: Record<number, number> = { 1: 9, 3: 7.6, 4: 6.7, 5: 5.6, 6: 10.6, 7: 13.9, 8: 12.1 }
    Object.entries(colW).forEach(([ci, w]) => { ws.getColumn(Number(ci)).width = w })

    const FONT = 'Meiryo'
    const font = (size = 11, bold = false) => ({ name: FONT, size, bold })
    const RED = { argb: 'FFC00000' }
    const thin = { style: 'thin' as const }
    const YEN = '"¥"#,##0'
    const NUM = '#,##0'

    /** r1〜r2行・c1〜c2列を1つの箱で囲う。colSeps に入れた列の右側に内側の縦線を引く。 */
    const boxRow = (r1: number, r2: number, c1: number, c2: number, colSeps: number[] = []) => {
      for (let r = r1; r <= r2; r++) {
        for (let ci = c1; ci <= c2; ci++) {
          ws.getCell(r, ci).border = {
            top: r === r1 ? thin : undefined,
            bottom: r === r2 ? thin : undefined,
            left: ci === c1 || colSeps.includes(ci - 1) ? thin : undefined,
            right: ci === c2 || colSeps.includes(ci) ? thin : undefined,
          }
        }
      }
    }
    const SEPS = [4, 5, 6, 7]   // 名目|数量|単価|金額|備考 の境目

    // ── ヘッダ ──
    ws.getCell('A1').value = '案件管理№'; ws.getCell('A1').font = font(10.5)
    ws.getCell('H1').value = '発行日：'; ws.getCell('H1').font = font(11)
    ws.mergeCells('I1:J1')
    const issued = ws.getCell('I1')
    issued.value = new Date()
    issued.numFmt = 'yyyy/m/d'
    issued.font = font(11)
    issued.alignment = { horizontal: 'left', vertical: 'middle' }

    ws.mergeCells('A2:C3')
    const cno = ws.getCell('A2')
    cno.value = caseData.case_number ?? ''
    cno.font = font(16)
    cno.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.mergeCells('H2:J2')
    ws.getCell('H2').value = '担　当'
    ws.getCell('H2').font = font(11)
    ws.getCell('H2').alignment = { horizontal: 'center', vertical: 'middle' }

    ws.mergeCells('A4:J5')
    const ttl = ws.getCell('A4')
    ttl.value = '立替実費明細書'
    ttl.font = font(20, true)
    ttl.alignment = { horizontal: 'center', vertical: 'middle' }

    ws.mergeCells('A7:C8')
    const cl = ws.getCell('A7')
    cl.value = clientName
    cl.font = font(18)
    cl.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('D8').value = '様'
    ws.getCell('D8').font = font(11)

    // 事務所ブロック（右）
    ws.getCell('G9').value = `${def.officeLabel}　${prof ? prof.representativeTitle + '　' + prof.representativeName : ''}`
    ws.getCell('G9').font = font(11)
    ws.getCell('G11').value = `〒 ${prof?.postalCode ?? ''}`
    ws.getCell('G11').font = font(10)
    ws.getCell('G12').value = office ? `${office.line1}${office.line2}` : ''
    ws.getCell('G12').font = font(10)

    // 立替実費の合計（大きく出す欄）。何の金額なのかを必ず添える。
    ws.getCell('A11').value = '立替実費 合計'
    ws.getCell('A11').font = font(10)
    ws.mergeCells('A12:C13')
    const gtop = ws.getCell('A12')
    gtop.value = c.expenseGrand
    gtop.numFmt = YEN
    gtop.font = font(22)
    gtop.alignment = { horizontal: 'right', vertical: 'middle' }
    ws.getCell('D13').value = '也'
    ws.getCell('D13').font = font(11)

    // ── 請求書と間違えないための注意（この様式でいちばん大事なところ）──
    // 内訳なのに大きな金額が載るので、この紙を見て振り込んでしまう事故が起こりうる。
    ws.mergeCells('A15:J15')
    const warn = ws.getCell('A15')
    warn.value = '※ この用紙は立替実費の「内訳」です。請求書ではありません。'
    warn.font = { name: FONT, size: 12, bold: true, color: RED }
    warn.alignment = { horizontal: 'center', vertical: 'middle' }
    warn.border = { top: thin, bottom: thin, left: thin, right: thin }
    ws.getRow(15).height = 22

    ws.mergeCells('A16:J16')
    const warn2 = ws.getCell('A16')
    warn2.value = 'お振込みは、同封の「御請求書」に記載された請求額でお願いいたします。この金額だけをお振込みにならないようご注意ください。'
    warn2.font = { name: FONT, size: 10, color: RED }
    warn2.alignment = { horizontal: 'center', vertical: 'middle' }

    // ── 明細（非課税 → 課税）──
    let rr = 18
    const section = (
      label: string,
      amountLabel: string,
      items: { name: string; amount: number; quantity?: number | null; unitPrice?: number | null }[],
      subtotal: number,
    ) => {
      // 見出し行
      ws.mergeCells(rr, 1, rr, 4)
      ws.getCell(rr, 1).value = label
      ws.getCell(rr, 5).value = '数量'
      ws.getCell(rr, 6).value = '単価'
      ws.getCell(rr, 7).value = amountLabel
      ws.mergeCells(rr, 8, rr, 10)
      ws.getCell(rr, 8).value = '備考'
      for (let ci = 1; ci <= 10; ci++) {
        ws.getCell(rr, ci).font = font(11)
        ws.getCell(rr, ci).alignment = { horizontal: 'center', vertical: 'middle' }
      }
      ws.getRow(rr).height = 21
      boxRow(rr, rr, 1, 10, SEPS)
      rr++

      // 明細：1件2行。名目は折り返し、数量・単価・金額・備考は2行ぶんを1マスに。
      for (const e of items) {
        ws.mergeCells(rr, 1, rr + 1, 4)
        ws.getCell(rr, 1).value = e.name
        ws.getCell(rr, 1).font = font(11)
        ws.getCell(rr, 1).alignment = { vertical: 'middle', wrapText: true }
        ws.mergeCells(rr, 5, rr + 1, 5)
        ws.getCell(rr, 5).value = e.quantity ?? null
        ws.mergeCells(rr, 6, rr + 1, 6)
        ws.getCell(rr, 6).value = e.unitPrice ?? null
        ws.mergeCells(rr, 7, rr + 1, 7)
        ws.getCell(rr, 7).value = e.amount
        ws.mergeCells(rr, 8, rr + 1, 10)
        for (const ci of [5, 6, 7]) {
          ws.getCell(rr, ci).font = font(11)
          ws.getCell(rr, ci).numFmt = NUM
          ws.getCell(rr, ci).alignment = { horizontal: 'right', vertical: 'middle' }
        }
        boxRow(rr, rr + 1, 1, 10, SEPS)
        rr += 2
      }

      // 小計
      ws.getCell(rr, 6).value = '小計'
      ws.getCell(rr, 6).font = font(11)
      ws.getCell(rr, 6).alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getCell(rr, 7).value = subtotal
      ws.getCell(rr, 7).font = font(11)
      ws.getCell(rr, 7).numFmt = NUM
      ws.getCell(rr, 7).alignment = { horizontal: 'right', vertical: 'middle' }
      ws.getRow(rr).height = 24
      boxRow(rr, rr, 6, 7, [6])
      rr += 3
    }
    section('立替実費名目　（非課税）', '金額', c.nonTaxItems, c.nonTaxSubtotal)
    section('立替実費名目　（課税）', '金額（税込）', c.taxItems, c.taxSubtotal)

    // ── 注記 ＋ 合計 ──
    ws.getCell(rr, 1).value = '上段の 国、地方公共団体等の手数料については消費税非課税となります。'
    ws.getCell(rr, 1).font = font(9)
    ws.getCell(rr, 8).value = '合計'
    ws.getCell(rr, 8).font = font(14)
    ws.getCell(rr, 8).alignment = { horizontal: 'center', vertical: 'middle' }
    ws.mergeCells(rr, 9, rr, 10)
    const gbot = ws.getCell(rr, 9)
    gbot.value = c.expenseGrand
    gbot.numFmt = NUM
    gbot.font = font(11)
    gbot.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(rr).height = 25.5
    boxRow(rr, rr, 8, 10, [8])
    rr += 2

    // 末尾にもう一度ことわる（明細だけ渡ったときの取り違え防止）
    ws.mergeCells(rr, 1, rr, 10)
    const foot = ws.getCell(rr, 1)
    foot.value = '※ 上の合計は立替実費の合計です。ご請求額ではありません。'
    foot.font = { name: FONT, size: 10, bold: true, color: RED }
    foot.alignment = { horizontal: 'center', vertical: 'middle' }

    ws.pageSetup.printArea = `A1:J${rr + 2}`

    // 出力
    const outBuffer = await wb.xlsx.writeBuffer()
    const downloadFilename = `確定請求書_立替実費_${def.officeLabel}_${caseData.case_number ?? caseId}.xlsx`
    const storagePath = `${caseId}/${Date.now()}_${crypto.randomUUID()}.xlsx`
    // ExcelJS は <sheetPr> の子要素を規格と違う順に書き出すバグがあり、
    // そのままだと Excel がシートを丸ごと捨てて白紙で開く。書き出し後に直す。
    const uploadBuffer = repairXlsx(Buffer.from(outBuffer as ArrayBuffer))
    let savedPath: string | null = null
    {
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
      const today = new Date().toISOString().slice(0, 10)
      const { error: invErr } = await supabase.from('invoices').insert({
        case_id: caseId,
        invoice_type: '確定請求',
        firm_type: def.office,
        amount: c.billAmount,
        fee_amount: fee,
        expenses_amount: c.expenseGrand,
        advance_deduction: advanceReceived || 0,
        status: '作成済',
        issued_date: today,
        posted_date: today,   // 計上日=請求日（発行日）
        due_date: body.dueDate ?? null,
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
