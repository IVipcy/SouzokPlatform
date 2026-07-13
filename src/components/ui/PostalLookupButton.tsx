'use client'

// 郵便番号→住所を「取得」ボタン押下で反映する共通ボタン。
// 以前は入力途中(onChange/onBlur)で自動補完していたが、スマホで入力中に上書きされる等の不具合があったため
// 明示ボタン方式に統一。7桁になるまでは無効。

import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { lookupPostalAddress } from '@/lib/postal'
import { showToast } from '@/components/ui/Toast'

export default function PostalLookupButton({ zip, onResolved, className }: {
  zip: string | null | undefined
  onResolved: (address: string) => void
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const z = (zip ?? '').replace(/[^0-9]/g, '')
  const disabled = busy || z.length !== 7

  const run = async () => {
    setBusy(true)
    const addr = await lookupPostalAddress(z)
    setBusy(false)
    if (addr) { onResolved(addr); showToast('住所を反映しました（番地・建物は追記してください）', 'success') }
    else showToast('住所が見つかりませんでした。郵便番号をご確認ください', 'error')
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled}
      title={z.length !== 7 ? '7桁の郵便番号を入力すると押せます' : '郵便番号から住所を取得'}
      className={className ?? 'mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 px-2.5 py-1.5 rounded-md border border-brand-200 bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed'}
    >
      <MapPin className="w-3.5 h-3.5" />{busy ? '取得中…' : '住所を取得'}
    </button>
  )
}
