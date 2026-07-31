/**
 * 原本受領証 (Excel) 生成API
 *
 * お客様に返却する納品物一覧を書面化して、お客様にサイン・押印して返送してもらう書類。
 * 契約形態(cases.contract_type)で宛先を出し分け、選択された相続人の住所を差し込む。
 * 納品物一覧は 納品タブで「対象」に選ばれた 受信簿アイテム + お客様預かり書類 を集約して並べる。
 * 権利証補足(delivery_touki_notice_date/number) と 印鑑証明書相続人紐付(delivery_inkan_client_names)
 * の追加入力があれば 該当行に反映する。
 *
 * テンプレートは使わず、ExcelJS で新規ワークブックを構築する
 * (既存の他書類のような固定書式テンプレとの結合ズレを避けるため)。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import { OFFICE_PROFILES, officesForContractType } from '@/lib/officeProfiles'

type Body = {
  caseId: string
  recipientHeirId?: string | null   // 郵送先=相続人ID。null 時は主たる依頼者(cases.clients)を使う
  taskId?: string | null
}

type DocLine = {
  name: string
  quantity: number
  sub?: string | null   // 権利証補足など、次の行に続けて出す注記
}

// 権利証行 = 名前に権利証/権利書を含む
const isKenriRow = (name: string) => /権利証|権利書/.test(name)
// 印鑑証明書行 = 名前に印鑑を含む
const isInkanRow = (name: string) => /印鑑/.test(name)

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const { caseId, recipientHeirId = null, taskId = null } = body
    if (!caseId) return NextResponse.json({ error: 'caseId は必須です' }, { status: 400 })

    const supabase = await createClient()
    const { data: caseData, error: caseErr } = await supabase
      .from('cases').select('*, clients(*)').eq('id', caseId).single()
    if (caseErr || !caseData) {
      return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })
    }

    // 郵送先住所・氏名の決定
    let recipientAddress = ''
    if (recipientHeirId) {
      const { data: heir } = await supabase.from('heirs').select('name, address').eq('id', recipientHeirId).single()
      if (heir) recipientAddress = heir.address ?? ''
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = caseData.clients as any
      recipientAddress = client?.address ?? ''
    }

    // 納品対象の書類: 受信簿(delivery_target=true) + 契約手続き(お客様預かり書類 & delivery_target=true)
    const [{ data: receiptItems }, { data: contractDocs }] = await Promise.all([
      supabase.from('document_receipt_items')
        .select('id, item_name, quantity, delivery_display_name, delivery_touki_notice_date, delivery_touki_notice_number, delivery_inkan_client_names, document_receipts!inner(case_id)')
        .eq('document_receipts.case_id', caseId)
        .eq('delivery_target', true),
      supabase.from('contract_documents')
        .select('id, name, delivery_display_name, delivery_touki_notice_date, delivery_touki_notice_number, delivery_inkan_client_names')
        .eq('case_id', caseId)
        .eq('category', 'お客様預かり書類')
        .eq('delivery_target', true),
    ])

    // 集約: 同名(displayName優先)は 通数合算+補足マージ
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (receiptItems ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = (contractDocs ?? []) as any[]

    type AggRow = { name: string; quantity: number; toukiDate: string | null; toukiNumber: string | null; inkanNames: string[] }
    const bucket = new Map<string, AggRow>()
    const push = (nameRaw: string | null, displayName: string | null, qty: number, toukiDate: string | null, toukiNumber: string | null, inkanNames: string[] | null) => {
      const name = (displayName?.trim() || nameRaw?.trim() || '（無題）')
      const cur = bucket.get(name)
      if (cur) {
        cur.quantity += qty
        if (!cur.toukiDate && toukiDate) cur.toukiDate = toukiDate
        if (!cur.toukiNumber && toukiNumber) cur.toukiNumber = toukiNumber
        if (cur.inkanNames.length === 0 && inkanNames && inkanNames.length > 0) cur.inkanNames = inkanNames
      } else {
        bucket.set(name, { name, quantity: qty, toukiDate, toukiNumber, inkanNames: inkanNames ?? [] })
      }
    }
    for (const it of items) push(it.item_name, it.delivery_display_name, it.quantity ?? 1, it.delivery_touki_notice_date, it.delivery_touki_notice_number, it.delivery_inkan_client_names)
    for (const d of docs) push(d.name, d.delivery_display_name, 1, d.delivery_touki_notice_date, d.delivery_touki_notice_number, d.delivery_inkan_client_names)

    // 各集約行 → DocLine (印鑑証明書は 相続人列挙で name を書き換え、権利証は sub に通知日+番号)
    const lines: DocLine[] = [...bucket.values()].map(a => {
      if (isKenriRow(a.name)) {
        const parts: string[] = []
        if (a.toukiDate) parts.push(a.toukiDate)
        if (a.toukiNumber) parts.push(a.toukiNumber)
        return { name: a.name, quantity: a.quantity, sub: parts.length > 0 ? parts.join(' ') : null }
      }
      if (isInkanRow(a.name) && a.inkanNames.length > 0) {
        const nameList = a.inkanNames.map(n => `${n}様`).join('、')
        return { name: `${a.name}（${nameList}　各1通）`, quantity: a.quantity, sub: null }
      }
      return { name: a.name, quantity: a.quantity, sub: null }
    })

    // 契約形態→宛先事務所リスト
    const officeKinds = officesForContractType(caseData.contract_type)
    const addressees = officeKinds.map(k => {
      const o = OFFICE_PROFILES[k]
      return `${o.legalName}　　　　${o.representativeTitle}　${o.representativeName}　殿`
    })

    // ─────────── Excel 構築 ───────────
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('原本受領証', { pageSetup: { paperSize: 9, orientation: 'portrait', margins: { top: 0.7, bottom: 0.7, left: 0.7, right: 0.7, header: 0.3, footer: 0.3 } } })
    // 列幅 (A4縦想定): A=No, B=書類名, C=個数
    ws.getColumn(1).width = 5
    ws.getColumn(2).width = 60
    ws.getColumn(3).width = 12
    const jpFont = { name: 'ＭＳ 明朝', size: 11 }
    const jpFontSm = { name: 'ＭＳ 明朝', size: 10 }
    const titleFont = { name: 'ＭＳ 明朝', size: 22, bold: true }

    let row = 1
    // 案件管理番号 (左上ボックス)
    ws.mergeCells(row, 1, row, 3)
    const cn = ws.getCell(row, 1)
    cn.value = caseData.case_number ?? ''
    cn.font = { name: 'Consolas', size: 10 }
    cn.alignment = { horizontal: 'left', vertical: 'middle' }
    cn.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    row += 2

    // 宛先
    for (const line of addressees) {
      ws.mergeCells(row, 1, row, 3)
      const c = ws.getCell(row, 1)
      c.value = line
      c.font = jpFont
      c.alignment = { horizontal: 'left' }
      row++
    }
    row++

    // タイトル
    ws.mergeCells(row, 1, row, 3)
    const t = ws.getCell(row, 1)
    t.value = '原　本　受　領　証'
    t.font = titleFont
    t.alignment = { horizontal: 'center' }
    ws.getRow(row).height = 32
    row += 2

    // 定型文
    ws.mergeCells(row, 1, row, 3)
    const bd = ws.getCell(row, 1)
    bd.value = '下記書類について、すべて返還を受け、正に受領致しました。'
    bd.font = jpFont
    bd.alignment = { horizontal: 'left' }
    row += 2

    // 令和年月日 (右寄せ・お客様手書き)
    ws.mergeCells(row, 1, row, 3)
    const dt = ws.getCell(row, 1)
    dt.value = '令和　　年　　月　　日'
    dt.font = jpFont
    dt.alignment = { horizontal: 'right' }
    row += 2

    // 住所 (郵送先住所を差し込み)
    ws.mergeCells(row, 1, row, 3)
    const ad = ws.getCell(row, 1)
    ad.value = `住所：${recipientAddress}`
    ad.font = jpFont
    ad.alignment = { horizontal: 'left' }
    row++

    // 氏名 (お客様手書き) + 印
    ws.getCell(row, 1).value = '氏名：'
    ws.getCell(row, 1).font = jpFont
    ws.mergeCells(row, 2, row, 2)
    ws.getCell(row, 2).border = { bottom: { style: 'thin' } }
    ws.getCell(row, 3).value = '印'
    ws.getCell(row, 3).font = jpFont
    ws.getCell(row, 3).alignment = { horizontal: 'center' }
    ws.getCell(row, 3).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    ws.getRow(row).height = 28
    row += 2

    // 「記」
    ws.mergeCells(row, 1, row, 3)
    const kirokuMark = ws.getCell(row, 1)
    kirokuMark.value = '記'
    kirokuMark.font = { ...jpFont, bold: true }
    kirokuMark.alignment = { horizontal: 'center' }
    row++

    // 納品物一覧
    lines.forEach((ln, i) => {
      ws.getCell(row, 1).value = i + 1
      ws.getCell(row, 1).font = jpFont
      ws.getCell(row, 1).alignment = { horizontal: 'center' }
      ws.getCell(row, 2).value = ln.name
      ws.getCell(row, 2).font = jpFont
      ws.getCell(row, 2).alignment = { horizontal: 'left', wrapText: true }
      ws.getCell(row, 3).value = isKenriRow(ln.name) ? '一式' : `${ln.quantity} 通`
      ws.getCell(row, 3).font = jpFont
      ws.getCell(row, 3).alignment = { horizontal: 'right' }
      row++
      if (ln.sub) {
        ws.getCell(row, 2).value = `　${ln.sub}`
        ws.getCell(row, 2).font = jpFontSm
        ws.getCell(row, 2).alignment = { horizontal: 'left' }
        row++
      }
    })
    row++

    // 以上
    ws.mergeCells(row, 1, row, 3)
    const end = ws.getCell(row, 1)
    end.value = '以上'
    end.font = jpFont
    end.alignment = { horizontal: 'right' }

    const outBuffer = await wb.xlsx.writeBuffer()
    const uploadBuffer = Buffer.from(outBuffer as ArrayBuffer)
    const storagePath = `${caseId}/${Date.now()}_${crypto.randomUUID()}.xlsx`
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, uploadBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    if (!uploadErr) {
      await supabase.from('documents').insert({
        case_id: caseId,
        task_id: taskId ?? null,
        name: '原本受領証',
        file_path: storagePath,
        file_type: 'Excel',
        status: '作成済',
        generated_by: 'ai',
      })
    } else {
      console.error('[genpon-juryosho] storage upload failed:', uploadErr.message)
    }

    const downloadFilename = `原本受領証_${caseData.case_number ?? caseId}.xlsx`
    return new NextResponse(uploadBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '不明なエラー'
    console.error('[genpon-juryosho] error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
