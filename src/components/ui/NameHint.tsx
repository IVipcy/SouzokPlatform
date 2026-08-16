'use client'

// 氏名欄の下に出す注意文。姓と名のあいだに区切りが無いときだけ出る。
// 止めはしない（法人名など、姓名に割れないものが入るため）。

import { personNameHint } from '@/lib/personName'

export default function NameHint({ value }: { value: string | null | undefined }) {
  const hint = personNameHint(value)
  if (!hint) return null
  return <p className="mt-0.5 text-[11px] text-amber-700">{hint}</p>
}
