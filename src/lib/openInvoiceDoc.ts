// 請求書・領収書は公式Excel（事務所の正式様式）に一本化。旧HTMLプレビューは廃止。
// 生成済み(generated_file_path)があればそれを開き、無い旧データは公式Excelを生成して開く。

import { createClient } from '@/lib/supabase/client'
import { invoiceVariantKey } from '@/lib/invoiceVariants'
import { showToast } from '@/components/ui/Toast'

type InvForDoc = {
  id: string
  case_id: string
  invoice_type: '前受金' | '確定請求'
  firm_type: string | null
  amount: number
  fee_amount: number
  advance_deduction: number
  generated_file_path: string | null
  cases: { deceased_name: string | null } | null
}

async function openSignedDoc(path: string) {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 120)
  if (error || !data) { showToast('ファイルを開けませんでした', 'error'); return }
  window.open(data.signedUrl, '_blank')
}

function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function kenmeiOf(inv: { invoice_type: string; cases: { deceased_name: string | null } | null }) {
  const dec = inv.cases?.deceased_name ? `${inv.cases.deceased_name}様 ` : ''
  return `${dec}相続手続き ${inv.invoice_type}`
}

/** 公式請求書(Excel)を開く。生成済みならそれを、無い旧データは生成してから開く。 */
export async function openOfficialInvoice(invoiceId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('invoices')
    .select('id, case_id, invoice_type, firm_type, amount, fee_amount, advance_deduction, generated_file_path, cases(deceased_name)')
    .eq('id', invoiceId)
    .single()
  const inv = data as InvForDoc | null
  if (!inv) { showToast('請求書が見つかりません', 'error'); return }
  if (inv.generated_file_path) { await openSignedDoc(inv.generated_file_path); return }

  // 未生成（旧データ）→ 公式Excelを生成して開く（invoiceId を渡すので generated_file_path に追記される）
  const firm = inv.firm_type === 'shiho' ? 'shiho' : 'gyosei'
  const kenmei = kenmeiOf(inv)
  let res: Response
  if (inv.invoice_type === '前受金') {
    res = await fetch('/api/documents/invoice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: inv.case_id, variant: invoiceVariantKey('請求書', firm), kenmei, amount: inv.amount, invoiceId: inv.id }),
    })
  } else {
    const { data: exp } = await supabase.from('expenses').select('item_name, amount, taxable').eq('billed_invoice_id', inv.id)
    const expenses = ((exp ?? []) as Array<{ item_name: string | null; amount: number | null; taxable: boolean | null }>)
      .map(e => ({ name: e.item_name ?? '', amount: e.amount ?? 0, taxable: e.taxable !== false }))
    res = await fetch('/api/documents/kakutei', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: inv.case_id, variant: `kakutei_${firm}`, kenmei, fee: inv.fee_amount, advanceReceived: inv.advance_deduction, expenses, invoiceId: inv.id }),
    })
  }
  if (!res.ok) { showToast('公式請求書の生成に失敗しました', 'error'); return }
  openBlob(await res.blob())
}

/** 公式領収書(Excel)を生成して開く。領収書は請求実体ではないため invoices には紐付けない。 */
export async function openOfficialReceipt(invoiceId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('invoices')
    .select('id, case_id, invoice_type, firm_type, amount, cases(deceased_name)')
    .eq('id', invoiceId)
    .single()
  const inv = data as Pick<InvForDoc, 'id' | 'case_id' | 'invoice_type' | 'firm_type' | 'amount' | 'cases'> | null
  if (!inv) { showToast('請求書が見つかりません', 'error'); return }
  const firm = inv.firm_type === 'shiho' ? 'shiho' : 'gyosei'
  // 領収書は前受金・確定で「区分」と金額が変わる（テンプレ体裁は共通）。確定請求は確定総額を領収。
  const res = await fetch('/api/documents/invoice', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: inv.case_id, variant: invoiceVariantKey('領収書', firm), kenmei: kenmeiOf(inv), amount: inv.amount, kubun: inv.invoice_type }),
  })
  if (!res.ok) { showToast('領収書の生成に失敗しました', 'error'); return }
  openBlob(await res.blob())
  // 発行日を記録（請求一覧の領収書列に表示）
  await supabase.from('invoices').update({ receipt_issued_date: new Date().toISOString().slice(0, 10) }).eq('id', invoiceId)
}
