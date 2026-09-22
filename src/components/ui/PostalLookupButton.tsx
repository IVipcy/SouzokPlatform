'use client'

// 住所1（都道府県〜番地）から郵便番号を「取得」ボタン押下で反映する共通ボタン。
// 以前は郵便番号→住所だったが、住所は戸籍・住民票から転記するので郵便番号を先に打つ場面が無く、
// 逆（住所から郵便番号）が要るため向きを変えた。町名まで入っていれば引ける。

import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { lookupZipFromAddress } from '@/lib/postal'
import { showToast } from '@/components/ui/Toast'

export default function PostalLookupButton({ address, onResolved, className }: {
  /** 住所1（都道府県〜番地） */
  address: string | null | undefined
  /** 引けた郵便番号（7桁・ハイフンなし） */
  onResolved: (zip: string) => void
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const a = (address ?? '').trim()
  const disabled = busy || a.length < 4

  const run = async () => {
    setBusy(true)
    const zip = await lookupZipFromAddress(a)
    setBusy(false)
    if (zip) { onResolved(zip); showToast(`郵便番号 ${zip.slice(0, 3)}-${zip.slice(3)} を入れました`, 'success') }
    else showToast('郵便番号が見つかりませんでした。住所1に町名まで入っているか確認してください', 'error')
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled}
      title={a.length < 4 ? '住所1（都道府県〜町名）を入れると押せます' : '住所1から郵便番号を取得'}
      className={className ?? 'inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11.5px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'}
    >
      <MapPin className="w-3.5 h-3.5" />{busy ? '取得中…' : '住所1から郵便番号を取得'}
    </button>
  )
}
