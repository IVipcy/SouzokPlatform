'use client'

import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { openOfficialInvoice } from '@/lib/openInvoiceDoc'

// 公式請求書(Excel)を開くボタン。旧HTMLプレビューの置き換え（サーバーComponentからも使える）。
export default function OpenInvoiceButton({ invoiceId, label = '請求書(Excel)', className }: {
  invoiceId: string
  label?: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => { setBusy(true); try { await openOfficialInvoice(invoiceId) } finally { setBusy(false) } }}
      className={className ?? 'inline-flex items-center gap-1 px-2 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 rounded disabled:opacity-50'}
      title="公式請求書（Excel）を開く"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" strokeWidth={2.25} />}{label}
    </button>
  )
}
