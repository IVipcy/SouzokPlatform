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

// 宛先どうしの間に空行を1つ入れる（テンプレどおり）
const BLANK_LINE = '\n\n'

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

    // 住所は2行に分けて差し込む（テンプレが2行分用意されている）。
    // 全角約20文字で折り返し、区切りが良ければ番地の手前で切る。
    const splitAddress = (addr: string): [string, string] => {
      const a = (addr ?? '').trim()
      if (a.length <= 20) return [a, '']
      const head = a.slice(0, 20)
      const cut = Math.max(head.lastIndexOf('　'), head.lastIndexOf(' '))
      const at = cut >= 12 ? cut : 20
      return [a.slice(0, at).trim(), a.slice(at).trim()]
    }
    const [addressLine1, addressLine2] = splitAddress(recipientAddress)

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
      // テンプレの字送り（法人名のあと全角3つ＋半角空白、肩書のあと全角2つ）に合わせる
      return `${o.legalName}　　　 ${o.representativeTitle}　　${o.representativeName}　殿`
    })

    // ─────────── Excel 構築 ───────────
    // 実際に使っている「原本受領書.xlsx」と同じ体裁で組む。
    // 24列の細かいグリッド（A〜X）に文字を置いていく作りなので、テンプレの
    // 列幅・行高・セル位置をそのまま再現する。テンプレ結合ではなく新規構築なのは、
    // 明細行数が案件ごとに変わり、固定テンプレだと行の挿入でズレるため。
    //
    //   1行目      案件管理番号（左上・外枠の中）
    //   4〜5行     宛先（契約形態で1〜3事務所）
    //   7行        表題「原本受領証」（均等割り付け）
    //   10行       「下記書類について、すべて返還を受け、正に受領致しました。」
    //   12行       令和　年　月　日（お客様手書き）
    //   15〜16行   住所（2行）
    //   18〜20行   氏名（手書き・20行に下線）＋ 印
    //   22行       記
    //   24行〜     明細（No／書類名／通数）
    //   最終行     以上
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('原本受領証', {
      pageSetup: {
        paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { top: 0.7, bottom: 0.7, left: 0.7, right: 0.7, header: 0.3, footer: 0.3 },
      },
    })
    // 列幅（テンプレ準拠）: A〜J=3.63 / K=4.63 / L〜W=3.63 / X=3.36
    for (let i = 1; i <= 24; i++) ws.getColumn(i).width = i === 11 ? 4.63 : i === 24 ? 3.36 : 3.63
    const F = 'ＭＳ Ｐ明朝'
    const f11 = { name: F, size: 11 }
    const f105 = { name: F, size: 10.5 }
    const f12 = { name: F, size: 12 }
    const f95 = { name: F, size: 9.5 }
    const fTitle = { name: F, size: 20 }
    const put = (row: number, col: number, value: string | number, font: object, align?: Partial<ExcelJS.Alignment>) => {
      const c = ws.getCell(row, col)
      c.value = value
      c.font = font
      if (align) c.alignment = align as ExcelJS.Alignment
      return c
    }

    // 案件管理番号（外枠の中・左上）
    ws.mergeCells(1, 1, 1, 8)
    put(1, 1, caseData.case_number ?? '', f12, { horizontal: 'center', vertical: 'middle' })

    // 宛先（契約形態で1〜3事務所。1行空けて並べる）
    ws.mergeCells(4, 1, 5, 15)
    put(4, 1, addressees.join(BLANK_LINE), f105, { horizontal: 'left', vertical: 'middle', wrapText: true })

    // 表題（均等割り付け＝テンプレと同じ「原 本 受 領 証」の見え方）
    ws.mergeCells(7, 6, 7, 19)
    put(7, 6, '原本受領証', fTitle, { horizontal: 'distributed', vertical: 'middle' })

    ws.mergeCells(10, 3, 10, 19)
    put(10, 3, '下記書類について、すべて返還を受け、正に受領致しました。', f105, { horizontal: 'left', vertical: 'middle' })

    // 日付（お客様が手書きするので枠だけ）
    put(12, 15, '令和', f11); put(12, 17, '年', f11); put(12, 19, '月', f11); put(12, 21, '日', f11)

    // 住所（2行に分けて差し込む。1行に収まらない住所を折り返すため）
    put(15, 9, '住所：', f11)
    ws.mergeCells(15, 11, 15, 21)
    put(15, 11, addressLine1, f11, { horizontal: 'left', vertical: 'middle' })
    ws.mergeCells(16, 11, 16, 21)
    put(16, 11, addressLine2, f11, { horizontal: 'left', vertical: 'middle' })

    // 氏名（手書き）。20行の I〜V に下線、V に「印」
    put(18, 9, '氏名：', f105)
    for (let c = 9; c <= 22; c++) ws.getCell(20, c).border = { bottom: { style: 'thin' } }
    const inkan = put(20, 22, '印', f105, { horizontal: 'center', vertical: 'middle' })
    inkan.border = { bottom: { style: 'thin' } }

    ws.mergeCells(22, 1, 22, 24)
    put(22, 1, '記', f105, { horizontal: 'center', vertical: 'middle' })

    // 明細。テンプレは24行目から No=D列 / 書類名=E列 / 通数=T列 / 単位=U列。
    let row = 24
    lines.forEach((ln, i) => {
      put(row, 4, i + 1, f105, { horizontal: 'left', vertical: 'middle' })
      ws.mergeCells(row, 5, row, 19)
      put(row, 5, ln.name, f11, { horizontal: 'left', vertical: 'middle', wrapText: true })
      if (isKenriRow(ln.name)) {
        // 権利証は通数ではなく「一式」で数える運用
        ws.mergeCells(row, 20, row, 21)
        put(row, 20, '一式', f105, { horizontal: 'center', vertical: 'middle' })
      } else {
        put(row, 20, ln.quantity, f105, { horizontal: 'right', vertical: 'middle' })
        put(row, 21, '通', f105, { horizontal: 'left', vertical: 'middle' })
      }
      row++
      if (ln.sub) {
        // 権利証の通知日・通知番号は書類名の次の行に小さく添える
        ws.mergeCells(row, 5, row, 19)
        put(row, 5, `　${ln.sub}`, f95, { horizontal: 'left', vertical: 'middle' })
        row++
      }
    })

    // 「以上」はテンプレどおり40行目。明細が多いときはその下へ送る。
    const endRow = Math.max(40, row + 1)
    put(endRow, 22, '以上', f105, { horizontal: 'left', vertical: 'middle' })
    const lastRow = endRow + 1

    // 行の高さ（テンプレ準拠）。明細行は25、表題行は43.5。
    for (let r = 1; r <= lastRow; r++) {
      ws.getRow(r).height = r === 7 ? 43.5 : r === 5 ? 24 : r >= 23 && r < endRow ? 25 : r === lastRow - 1 ? 13 : 18
    }

    // 外枠（1行目の上、最終行の下、A列の左、X列の右）
    for (let c = 1; c <= 24; c++) {
      const top = ws.getCell(1, c)
      top.border = { ...top.border, top: { style: 'thin' } }
      const bottom = ws.getCell(lastRow, c)
      bottom.border = { ...bottom.border, bottom: { style: 'thin' } }
    }
    for (let r = 1; r <= lastRow; r++) {
      const left = ws.getCell(r, 1)
      left.border = { ...left.border, left: { style: 'thin' } }
      const right = ws.getCell(r, 24)
      right.border = { ...right.border, right: { style: 'thin' } }
    }
    ws.pageSetup.printArea = `A1:X${lastRow}`

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
