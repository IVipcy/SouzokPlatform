// 請求書・領収書は公式Excel（事務所の正式様式）に一本化。旧HTMLプレビューは廃止。
// 生成済み(generated_file_path)があればそれを開き、無い旧データは公式Excelを生成して開く。

import { createClient } from '@/lib/supabase/client'
import { invoiceVariantKey } from '@/lib/invoiceVariants'
import { showToast } from '@/components/ui/Toast'
import { todayJstYmd } from '@/lib/today'

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

type ExpenseForDoc = { name: string; amount: number; taxable: boolean }

/**
 * 確定請求書を作り直すときの立替実費。請求タブの立替（billing_expense_items.billed_invoice_id）が正。
 * 旧データ（/billing が expenses を見ていた頃）は expenses.billed_invoice_id で拾う。
 */
async function expensesForInvoice(invoiceId: string): Promise<ExpenseForDoc[]> {
  const supabase = createClient()
  const { data: items } = await supabase.from('billing_expense_items').select('label, amount, taxable').eq('billed_invoice_id', invoiceId).order('sort_order')
  const fromItems = ((items ?? []) as Array<{ label: string | null; amount: number | null; taxable: boolean | null }>)
    .map(e => ({ name: e.label ?? '', amount: e.amount ?? 0, taxable: e.taxable === true }))
  if (fromItems.length > 0) return fromItems
  const { data: exp } = await supabase.from('expenses').select('item_name, amount, taxable').eq('billed_invoice_id', invoiceId)
  return ((exp ?? []) as Array<{ item_name: string | null; amount: number | null; taxable: boolean | null }>)
    .map(e => ({ name: e.item_name ?? '', amount: e.amount ?? 0, taxable: e.taxable !== false }))
}

/** 生成APIを呼ぶ。失敗（ファイル保存失敗＝非200 を含む）は null を返し、呼び出し側でトーストする。 */
async function generateInvoiceDoc(inv: InvForDoc): Promise<Response> {
  const firm = inv.firm_type === 'shiho' ? 'shiho' : 'gyosei'
  const kenmei = kenmeiOf(inv)
  if (inv.invoice_type === '前受金') {
    return fetch('/api/documents/invoice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: inv.case_id, variant: invoiceVariantKey('請求書', firm), kenmei, amount: inv.amount, invoiceId: inv.id }),
    })
  }
  const expenses = await expensesForInvoice(inv.id)
  return fetch('/api/documents/kakutei', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: inv.case_id, variant: `kakutei_${firm}`, kenmei, fee: inv.fee_amount, advanceReceived: inv.advance_deduction, expenses, invoiceId: inv.id }),
  })
}

async function toastGenerateError(res: Response, fallback: string) {
  const err = await res.json().catch(() => null) as { error?: string } | null
  showToast(err?.error ? `${fallback}：${err.error}` : fallback, 'error')
}

/** ブラウザでファイル/URLをダウンロードさせる（<a download> クリック）。 */
function triggerDownload(url: string, filename?: string) {
  const a = document.createElement('a')
  a.href = url
  if (filename) a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 公式請求書(Excel)をダウンロードする。生成済みなら署名URL(download付)で、無い旧データは生成してblobで落とす。 */
export async function downloadOfficialInvoice(invoiceId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('invoices')
    .select('id, case_id, invoice_type, firm_type, amount, fee_amount, advance_deduction, generated_file_path, cases(deceased_name)')
    .eq('id', invoiceId)
    .single()
  const inv = data as InvForDoc | null
  if (!inv) { showToast('請求書が見つかりません', 'error'); return }
  const decName = inv.cases?.deceased_name ? `${inv.cases.deceased_name}様_` : ''
  const fileName = `請求書_${decName}${inv.invoice_type}.xlsx`
  // 生成済み：署名URLに download 指定を付けてダウンロード
  if (inv.generated_file_path) {
    const { data: signed, error } = await supabase.storage.from('documents').createSignedUrl(inv.generated_file_path, 120, { download: fileName })
    if (error || !signed) { showToast('ファイルをダウンロードできませんでした', 'error'); return }
    triggerDownload(signed.signedUrl)
    return
  }
  // 未生成（旧データ）→ 公式Excelを生成して blob をダウンロード（invoiceId を渡すので generated_file_path に追記される）
  const res = await generateInvoiceDoc(inv)
  if (!res.ok) { await toastGenerateError(res, '公式請求書の生成に失敗しました'); return }
  const url = URL.createObjectURL(await res.blob())
  triggerDownload(url, fileName)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
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
  const res = await generateInvoiceDoc(inv)
  if (!res.ok) { await toastGenerateError(res, '公式請求書の生成に失敗しました'); return }
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
  if (!res.ok) { await toastGenerateError(res, '領収書の生成に失敗しました'); return }
  openBlob(await res.blob())
  // 発行日を記録（請求一覧の領収書列に表示）。日本時間の今日
  await supabase.from('invoices').update({ receipt_issued_date: todayJstYmd() }).eq('id', invoiceId)
}
