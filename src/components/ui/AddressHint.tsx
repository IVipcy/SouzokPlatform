'use client'

// 住所・本籍の欄の下に出す注意文。都道府県から始まっていないときだけ出る。
// 止めはしない（番地だけの補足入力など、例外がありうるため）。

import { addressHint } from '@/lib/address'

export default function AddressHint({ value }: { value: string | null | undefined }) {
  const hint = addressHint(value)
  if (!hint) return null
  return <p className="mt-0.5 text-[11px] text-amber-700">{hint}</p>
}
