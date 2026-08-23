/**
 * 事件簿（業務事件簿）
 *
 *   POST /api/documents/jikenbo  { caseId }
 *
 * 職務上請求用紙を使ったときに備え付けが要る帳簿。案件ごとに1枚。
 * ひな型は 2列目に値を入れるだけの表なので、プレースホルダーではなく
 * 「1列目のラベルで行を探して2列目に書く」方式で埋める。
 *
 * （依頼内容・経緯）（業務経過、結果）（職務上請求書）の3つは枠だけ出す。
 * 手で書き込む欄なので、こちらで埋めない。
 */
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { readFile } from 'fs/promises'
import PizZip from 'pizzip'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const yen = (n: number | null | undefined) => (n && n > 0 ? `${n.toLocaleString('ja-JP')}円` : '')

/** XML用のエスケープ（氏名に & < > が入っても壊れないように） */
const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * 表の1列目が label の行を探し、2列目のセルにテキストを入れる。
 * ひな型の空セルは <w:p> が1つあるだけなので、その中に <w:r><w:t> を差し込む。
 */
function fillRow(xml: string, label: string, value: string): string {
  if (!value) return xml
  // 行（<w:tr>…</w:tr>）に分けて、1列目にラベルを含む行を探す
  const rows = xml.split('<w:tr ')
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const textOnly = row.replace(/<[^>]+>/g, '')
    if (!textOnly.startsWith(label) && !textOnly.replace(/\s/g, '').startsWith(label.replace(/\s/g, ''))) continue
    // 2つ目のセル（<w:tc>）の最初の <w:p> に流し込む
    const cells = row.split('<w:tc>')
    if (cells.length < 3) continue
    const target = cells[2]
    const pIdx = target.indexOf('<w:p ')
    const pEnd = target.indexOf('</w:p>', pIdx)
    if (pIdx === -1 || pEnd === -1) continue
    const run = `<w:r><w:t xml:space="preserve">${esc(value)}</w:t></w:r>`
    cells[2] = target.slice(0, pEnd) + run + target.slice(pEnd)
    rows[i] = cells.join('<w:tc>')
    return rows.join('<w:tr ')
  }
  return xml
}

export async function POST(req: NextRequest) {
  let body: { caseId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }
  const caseId = body.caseId
  if (!caseId) return NextResponse.json({ error: 'caseId は必須です' }, { status: 400 })

  const supabase = await createClient()
  const [{ data: caseData }, { data: clients }, { data: kosekiRows }] = await Promise.all([
    supabase.from('cases').select('*, clients(*)').eq('id', caseId).single(),
    supabase.from('case_clients').select('name, priority, phone, mobile_phone, email, sort_order').eq('case_id', caseId)
      .order('sort_order', { ascending: true }).order('created_at'),
    // 職務上請求で取った分の用紙番号（事件簿の「（職務上請求書）」欄の材料）
    supabase.from('koseki_requests').select('authority_form_no, acquisition_authority').eq('case_id', caseId),
  ])
  if (!caseData) return NextResponse.json({ error: '案件データの取得に失敗しました' }, { status: 404 })

  const rows = (clients ?? []) as Array<{ name?: string | null; priority?: string | null; phone?: string | null; mobile_phone?: string | null; email?: string | null }>
  const main = rows.find(c => c.priority === 'main') ?? rows[0]
  const cl = caseData.clients as { name?: string; address?: string; phone?: string; email?: string } | null

  const formNos = ((kosekiRows ?? []) as Array<{ authority_form_no: string | null; acquisition_authority: string | null }>)
    .filter(r => r.acquisition_authority === '職務上請求' && (r.authority_form_no ?? '').trim())
    .map(r => (r.authority_form_no ?? '').trim())
  const uniqueNos = [...new Set(formNos)]

  const templatePath = path.join(process.cwd(), 'public', 'templates', 'jikenbo', 'jikenbo.docx')
  const zip = new PizZip(await readFile(templatePath))
  let xml = zip.file('word/document.xml')?.asText() ?? ''
  if (!xml) return NextResponse.json({ error: 'ひな型を読み取れませんでした' }, { status: 500 })

  const procedures = (caseData.procedure_type ?? []).join('・')
  const fee = (caseData.fee_administrative ?? 0) + (caseData.fee_judicial ?? 0)

  xml = fillRow(xml, '受託番号', caseData.case_number ?? '')
  xml = fillRow(xml, '事件名', caseData.deal_name ?? '')
  xml = fillRow(xml, '依頼内容', procedures)
  xml = fillRow(xml, '報酬額', yen(fee))
  xml = fillRow(xml, '依頼者名', main?.name ?? cl?.name ?? '')
  xml = fillRow(xml, '電話・ＦＡＸ', main?.mobile_phone || main?.phone || cl?.phone || '')
  xml = fillRow(xml, 'メールアドレス', main?.email || cl?.email || '')
  xml = fillRow(xml, '住所', cl?.address ?? '')
  xml = fillRow(xml, '業務依頼日', caseData.order_received_date ?? '')
  xml = fillRow(xml, '業務完了日', caseData.completion_date ?? '')

  zip.file('word/document.xml', xml)
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })

  const name = `事件簿_${caseData.case_number ?? ''}_${caseData.deal_name ?? ''}.docx`
  return new NextResponse(new Uint8Array(out), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      // 職務上請求の用紙番号は帳簿に手書きする運用（枠だけ出す）。件数だけ返して画面で案内する。
      'X-Authority-Form-Count': String(uniqueNos.length),
    },
  })
}
