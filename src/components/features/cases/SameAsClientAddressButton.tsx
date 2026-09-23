'use client'

// 「依頼者と同じ」ボタン。被相続人の住所1・住所2に、依頼者（メイン依頼者）の住所1・住所2をそのまま入れる。
//   ・依頼者の住所1が空なら押せない（何を写すのか分からない状態で押させない）
//   ・被相続人に既に住所が入っていれば、上書きしてよいか確認してから入れる（黙って消さない）
//   ・本籍・郵便番号は対象外（本籍は住所と別物。被相続人の郵便番号は使う場面が無く廃止済み）
// 置く場所：面談シート／面談結果登録／オーダーシート・実務の被相続人情報。どこでも同じ見た目・同じ動き。

import { Copy } from 'lucide-react'

export default function SameAsClientAddressButton({ clientAddress, clientAddress2, currentAddress, currentAddress2, onApply, className }: {
  clientAddress: string | null | undefined
  clientAddress2?: string | null
  currentAddress?: string | null
  currentAddress2?: string | null
  /** 住所1・住所2 を同時に入れる */
  onApply: (address: string, address2: string | null) => void | Promise<void>
  className?: string
}) {
  const a1 = (clientAddress ?? '').trim()
  const a2 = (clientAddress2 ?? '').trim() || null
  const disabled = !a1
  const run = () => {
    const has = (currentAddress ?? '').trim() || (currentAddress2 ?? '').trim()
    if (has && !window.confirm('被相続人の住所に既に入っている値を、依頼者の住所で上書きします。よろしいですか？')) return
    void onApply(a1, a2)
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled}
      title={disabled ? '依頼者の住所1が未入力です' : '依頼者の住所1・住所2をそのまま入れる'}
      className={className ?? 'inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-brand-600 hover:text-brand-700 px-1.5 py-0.5 rounded border border-brand-200 bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed'}
    >
      <Copy className="w-3 h-3" />依頼者と同じ
    </button>
  )
}
