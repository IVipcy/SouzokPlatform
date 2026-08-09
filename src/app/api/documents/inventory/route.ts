// 財産目録（財産・債務一覧表）の Excel 出力。
//
// 実際に使っているエクセル「★財産目録」の〈分割案4名まで【日付2つ】〉シートと同じ体裁で組む。
// テンプレは使わず ExcelJS で新規構築する（明細件数が案件ごとに変わり、
// 固定テンプレだと行の挿入でレイアウトが崩れるため。請求書・原本受領証と同じ作り）。
//
// シートの構成（実物どおり）：
//   1行目           被相続人　◯◯　◯◯　様            右上に作成日
//   3行目           財産・債務一覧表
//   （土地）        番号/所在/地番/地目/地積/持分/固定資産評価額/備考/根拠資料 …小計
//   （建物）        番号/所在(2段目=家屋番号)/種類/構造・床面積/持分/評価額/備考/根拠資料 …小計
//   （預貯金）      番号/金融機関/種別/口座番号等/金額/備考/根拠資料 …小計
//   （有価証券）    番号/金融機関/種別/銘柄等/金額/備考/根拠資料 …小計
//   （その他財産）  番号/品目/金額/備考/根拠資料 …小計   ※実物には無いが、データを落とさないため
//   （債務）        番号/品目/金額/備考/根拠資料 …小計
//   末尾            取得合計 ／ 参考：法定相続割合・法定相続分
//
// 実物は金額欄が「相続開始日」「調査日」の2列だが、いまは残高を1つしか持たないため
// 金額は1列（G:H を結合）で出す。2時点で持つようになったら列を分ける。

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { buildInventorySections, buildEvidence, inventoryNet } from '@/lib/inventorySheet'

type Property = {
  id: string
  property_type: string | null; address: string | null; lot_number: string | null; kaoku_bango: string | null
  land_category: string | null; land_area: number | null
  building_kind: string | null; building_structure: string | null
  share_numerator: number | null; share_denominator: number | null
  appraisal_value: number | null; notes: string | null
}
type FinAsset = {
  id: string
  asset_type: string | null; institution_name: string | null; branch_name: string | null
  account_type: string | null; account_number: string | null; balance_amount: number | null
  notes: string | null; evidence_docs: string[] | null
}
type OtherAsset = { id: string; kind: string | null; label: string | null; amount: number | null; note: string | null }
type Heir = { name: string; is_legal_heir: boolean; legal_share_num: number | null; legal_share_den: number | null }

const F = 'ＭＳ Ｐゴシック'

export async function GET(req: NextRequest) {
  const caseId = req.nextUrl.searchParams.get('caseId')
  if (!caseId) return NextResponse.json({ error: 'caseId がありません' }, { status: 400 })

  const supabase = await createClient()
  const [caseRes, propRes, finRes, otherRes, heirRes] = await Promise.all([
    supabase.from('cases').select('case_number, deal_name, deceased_name').eq('id', caseId).single(),
    supabase.from('real_estate_properties').select('*').eq('case_id', caseId).order('sort_order', { ascending: true }),
    supabase.from('financial_assets').select('*').eq('case_id', caseId).order('sort_order', { ascending: true }),
    supabase.from('case_other_assets').select('*').eq('case_id', caseId).order('sort_order', { ascending: true }),
    supabase.from('heirs').select('name, is_legal_heir, legal_share_num, legal_share_den').eq('case_id', caseId).order('sort_order', { ascending: true }),
  ])
  const c = caseRes.data as { case_number: string; deal_name: string; deceased_name: string | null } | null
  if (!c) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  const props = (propRes.data ?? []) as unknown as Property[]
  const fins = (finRes.data ?? []) as unknown as FinAsset[]
  const others = (otherRes.data ?? []) as unknown as OtherAsset[]
  const heirs = ((heirRes.data ?? []) as unknown as Heir[]).filter(h => h.is_legal_heir)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('財産・債務一覧表', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  // 列幅は実物どおり（A=番号 … J=根拠資料）
  const WIDTHS = [4.1, 26.0, 11.8, 14.1, 18.0, 12.8, 17.8, 17.6, 27.4, 40.0]
  WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const f9 = { name: F, size: 9 }
  const f10 = { name: F, size: 10 }
  const f11b = { name: F, size: 11, bold: true }
  const f14b = { name: F, size: 14, bold: true }
  const thin = { style: 'thin' as const, color: { argb: 'FF808080' } }
  const box = { top: thin, left: thin, bottom: thin, right: thin }
  const put = (r: number, col: number, v: string | number | null, font = f10, align?: Partial<ExcelJS.Alignment>) => {
    const cell = ws.getCell(r, col)
    if (v !== null && v !== '') cell.value = v
    cell.font = font
    cell.alignment = { vertical: 'middle', wrapText: true, ...(align ?? {}) } as ExcelJS.Alignment
    return cell
  }
  const bordered = (r: number, from: number, to: number) => {
    for (let col = from; col <= to; col++) ws.getCell(r, col).border = box
  }
  const money = (r: number, col: number, v: number | null) => {
    const cell = put(r, col, v ?? null, f10, { horizontal: 'right' })
    cell.numFmt = '#,##0'
    return cell
  }

  // ヘッダー
  ws.mergeCells(1, 1, 1, 7)
  put(1, 1, `被相続人　　${c.deceased_name ?? ''}　　様`, f11b)
  put(1, 10, new Date().toLocaleDateString('ja-JP'), f10, { horizontal: 'right' })
  ws.mergeCells(3, 1, 3, 10)
  put(3, 1, '財産・債務一覧表', f14b, { horizontal: 'left' })

  let r = 4
  /** 1区分ぶんを書く。最低8行（実物と同じ）まで空行で埋める。 */
  const section = (
    title: string,
    headers: Array<[col: number, label: string, span?: number]>,
    items: Array<{ cells: Array<[col: number, value: string | number | null, span?: number]>; amount: number | null; extraRow?: Array<[col: number, value: string | number | null, span?: number]> }>,
  ): number => {
    put(r, 1, title, f11b); r++
    for (const [col, label, span] of headers) {
      if (span && span > 1) ws.mergeCells(r, col, r, col + span - 1)
      const cell = put(r, col, label, f9, { horizontal: 'center' })
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
    }
    bordered(r, 1, 10); r++

    const n = Math.max(items.length, 8)
    for (let i = 0; i < n; i++) {
      const it = items[i]
      put(r, 1, i + 1, f10, { horizontal: 'center' })
      if (it) {
        for (const [col, value, span] of it.cells) {
          if (span && span > 1) ws.mergeCells(r, col, r, col + span - 1)
          put(r, col, value, f10)
        }
        money(r, 7, it.amount)
        ws.mergeCells(r, 7, r, 8)
      } else {
        ws.mergeCells(r, 7, r, 8)
      }
      bordered(r, 1, 10); r++
      if (it?.extraRow) {
        for (const [col, value, span] of it.extraRow) {
          if (span && span > 1) ws.mergeCells(r, col, r, col + span - 1)
          put(r, col, value, f10)
        }
        bordered(r, 1, 10); r++
      }
    }
    const total = items.reduce((s, it) => s + (it.amount ?? 0), 0)
    ws.mergeCells(r, 1, r, 6)
    put(r, 1, '小計', f11b, { horizontal: 'center' })
    ws.mergeCells(r, 7, r, 8)
    money(r, 7, total)
    bordered(r, 1, 10); r += 2
    return total
  }

  const built = buildInventorySections(props, fins, others)
  const evidence = buildEvidence(fins)
  for (const b of built) {
    // その他財産は実物のシートに無い区分。登録が無いときは出さない。
    if (b.key === 'other' && b.rows.length === 0) continue
    const ev = evidence[b.key] ?? []
    section(
      `（${b.title}）`,
      [[1, '番号'], ...b.headers.map((h, i2) => [2 + i2, h] as [number, string]), [7, b.amountHeader, 2], [9, '備考'], [10, '根拠資料']],
      b.rows.map((row, i2) => ({
        cells: [
          ...row.cells.map((cl, ci) => [2 + ci, cl.value] as [number, string | number | null]),
          [9, row.note] as [number, string],
          [10, ev[i2] ?? ''] as [number, string],
        ],
        amount: row.amount,
        extraRow: row.subLine ? ([[2, row.subLine, 2]] as Array<[number, string | number | null, number?]>) : undefined,
      })),
    )
  }

  // 取得合計（プラス財産 − 債務）
  const net = inventoryNet(built)
  r += 1
  ws.mergeCells(r, 5, r, 6)
  put(r, 5, '取得合計', f11b, { horizontal: 'center' })
  ws.mergeCells(r, 7, r, 8)
  money(r, 7, net)
  bordered(r, 5, 8)
  r += 2

  // 参考：法定相続割合・法定相続分
  ws.mergeCells(r, 5, r, 6)
  put(r, 5, '参　　考', f11b, { horizontal: 'center' })
  put(r, 7, '法定相続割合', f9, { horizontal: 'center' })
  put(r, 8, '法定相続分', f9, { horizontal: 'center' })
  bordered(r, 5, 8); r++
  for (const h of heirs) {
    ws.mergeCells(r, 5, r, 6)
    put(r, 5, h.name, f10)
    const frac = h.legal_share_num && h.legal_share_den ? `${h.legal_share_num}/${h.legal_share_den}` : ''
    put(r, 7, frac, f10, { horizontal: 'center' })
    money(r, 8, h.legal_share_num && h.legal_share_den ? Math.round(net * (h.legal_share_num / h.legal_share_den)) : null)
    bordered(r, 5, 8); r++
  }

  const buf = await wb.xlsx.writeBuffer()
  const name = encodeURIComponent(`財産目録_${c.case_number}_${c.deal_name}.xlsx`)
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${name}`,
    },
  })
}
