/**
 * 原本預かり証 (Excel) 生成API
 *
 *   POST /api/documents/genpon-azukari
 *
 * お客様から原本（印鑑証明書・本人確認書類・権利証 など）をお預かりしたときに、
 * その場でお渡しする控え。原本受領証（genpon-juryosho）とは向きが逆で、
 *   原本預かり証 … 当社がお預かりした    → お客様へ渡す
 *   原本受領証   … お客様が返還を受けた  → お客様に署名してもらって回収
 *
 * ひな型（public/templates/genpon-azukari/genpon-azukari.xlsx）は
 * 元の大きなブックから1シートだけ抜いたもの。外部ブックへのリンク数式と
 * 差出人プルダウン用の隠し表は取り除いてあり、値はここから直接書き込む。
 */
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { readFile } from 'fs/promises'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { OFFICE_PROFILES, type OfficeKind } from '@/lib/officeProfiles'

export const maxDuration = 60

/** ひな型の「記」の行は7行ぶんしかない。1枚に載る上限。 */
export const AZUKARI_MAX_ITEMS = 7

/** 差出人。ひな型のプルダウン（行政／司法／連名／いきいき）と同じ4択。 */
export type AzukariSender = 'gyosei' | 'shiho' | 'both' | 'ikiiki'

type Body = {
  caseId: string
  receivedDate?: string                       // 預かった日（yyyy-mm-dd）。既定=今日
  addressee?: string                          // 宛名。「様」はこちらで付ける
  sender?: AzukariSender
  items?: { name: string; quantity?: number }[]
  notes?: string[]                            // 備考（2行まで）
  taskId?: string | null
}

const zen = (s: string) => s.replace(/[0-9]/g, d => String.fromCharCode(d.charCodeAt(0) + 0xFEE0))

/** 2026-08-23 → 令和８年８月２３日 */
function reiwa(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ''
  return `令和${zen(String(y - 2018))}年${zen(String(m))}月${zen(String(d))}日`
}

/** 差出人1つぶんの表記（法人名＋代表者／住所）。事務所マスタから組む。 */
function line(kind: OfficeKind): { name: string; address: string } {
  const p = OFFICE_PROFILES[kind]
  return {
    name: `${p.legalName}　　${p.representativeTitle}　　${p.representativeName}`,
    address: `神奈川県${p.mainOfficeAddress}`,
  }
}

/** 差出人4択 → 名前と住所（連名は2行） */
function senderOf(sender: AzukariSender): { name: string; address: string } {
  if (sender === 'both') {
    const g = line('gyosei')
    const s = line('shiho')
    return { name: `${g.name}\n\n${s.name}`, address: `${g.address}\n${s.address}` }
  }
  return line(sender === 'ikiiki' ? 'ikiiki' : sender === 'shiho' ? 'shiho' : 'gyosei')
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }
  const { caseId, taskId = null } = body
  if (!caseId) return NextResponse.json({ error: 'caseId は必須です' }, { status: 400 })

  const items = (body.items ?? [])
    .map(i => ({ name: (i.name ?? '').trim(), quantity: i.quantity ?? 1 }))
    .filter(i => i.name)
    .slice(0, AZUKARI_MAX_ITEMS)
  if (items.length === 0) {
    return NextResponse.json({ error: 'お預かりする書類を1件以上選んでください' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: caseData } = await supabase
    .from('cases').select('case_number, deal_name, contract_type, clients(name)').eq('id', caseId).single()
  if (!caseData) return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })

  const receivedDate = body.receivedDate || new Date().toISOString().slice(0, 10)
  const client = caseData.clients as { name?: string } | null
  const addressee = (body.addressee ?? '').trim() || (client?.name ?? '')
  const sender = senderOf(body.sender ?? 'gyosei')

  const templatePath = path.join(process.cwd(), 'public', 'templates', 'genpon-azukari', 'genpon-azukari.xlsx')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(new Uint8Array(await readFile(templatePath)).buffer as ArrayBuffer)
  const ws = wb.getWorksheet('原本預かり証') ?? wb.worksheets[0]
  if (!ws) return NextResponse.json({ error: 'ひな型のシートが見つかりません' }, { status: 500 })

  // 宛名（お客様）。ひな型では14ptの中央寄せ
  ws.getCell('A4').value = addressee ? `${addressee}　様` : ''
  // お預かりした日
  ws.getCell('O15').value = reiwa(receivedDate)
  // 差出人（住所が上、法人名＋代表者が下）
  ws.getCell('J18').value = sender.address
  ws.getCell('I21').value = sender.name

  // 「記」の7行。書類名は F列（F:R結合）、通数は T列、「通」はひな型に印字済み
  items.forEach((it, i) => {
    const r = 27 + i
    ws.getCell(`F${r}`).value = it.name
    ws.getCell(`T${r}`).value = it.quantity
    ws.getCell(`T${r}`).alignment = { horizontal: 'center', vertical: 'bottom' }
  })

  // 備考（「以上」の左の2行）
  const notes = (body.notes ?? []).map(n => (n ?? '').trim()).filter(Boolean)
  if (notes[0]) ws.getCell('F35').value = notes[0]
  if (notes[1]) ws.getCell('F36').value = notes[1]

  const out = await wb.xlsx.writeBuffer()
  const buf = Buffer.from(out as ArrayBuffer)
  const downloadFilename = `原本預かり証_${caseData.case_number ?? caseId}_${receivedDate}.xlsx`

  // 案件の書類として残す（アップロードに失敗してもダウンロードは続ける）
  const storagePath = `${caseId}/${Date.now()}_${crypto.randomUUID()}.xlsx`
  const { error: uploadErr } = await supabase.storage.from('documents').upload(storagePath, buf, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  if (!uploadErr) {
    await supabase.from('documents').insert({
      case_id: caseId,
      task_id: taskId,
      name: `原本預かり証_${receivedDate}（${addressee || '宛名なし'}）`,
      file_path: storagePath,
      file_type: 'Excel',
      status: '作成済',
      generated_by: 'manual',
    })
  } else {
    console.error('[genpon-azukari] storage upload failed:', uploadErr.message)
  }

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
    },
  })
}
