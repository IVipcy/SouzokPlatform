'use client'

import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { openOfficialReceipt } from '@/lib/openInvoiceDoc'

// 領収書(Excel)を開く/発行するボタン。発行済(issuedDate)なら開く、未発行なら生成して発行日を記録。
export default function OpenReceiptButton({ invoiceId, issuedDate, className }: {
  invoiceId: string
  issuedDate?: string | null
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => { setBusy(true); try { await openOfficialReceipt(invoiceId) } finally { setBusy(false) } }}
      className={className ?? `inline-flex items-center gap-1 px-2 py-1 text-[12px] font-semibold rounded disabled:opacity-50 ${issuedDate ? 'text-brand-700 hover:bg-brand-50' : 'text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
      title={issuedDate ? `領収書（発行日 ${issuedDate}）を開く` : '領収書を発行（Excel生成）'}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" strokeWidth={2.25} />}{issuedDate ? '領収書' : '発行'}
    </button>
  )
}
