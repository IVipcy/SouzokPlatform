import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import InvoicePreviewClient from './InvoicePreviewClient'
import type { InvoiceRow, CaseRow, ClientRow, ExpenseRow } from '@/types'

type Props = {
  params: Promise<{ id: string }>
}

export default async function InvoicePreviewPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: invoiceRaw } = await supabase
    .from('invoices')
    .select('*, cases(*, clients(*))')
    .eq('id', id)
    .single()

  if (!invoiceRaw) notFound()

  const invoice = invoiceRaw as InvoiceRow & { cases: CaseRow & { clients: ClientRow | null } }

  // この請求書に含まれる立替実費
  const { data: expRows } = await supabase
    .from('expenses')
    .select('*')
    .eq('billed_invoice_id', id)
    .order('expense_date', { nullsFirst: false })

  return (
    <InvoicePreviewClient
      invoice={invoice}
      expenses={(expRows ?? []) as ExpenseRow[]}
    />
  )
}
