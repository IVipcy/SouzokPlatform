'use client'

// マニュアルの2本立て切替。
//   操作方法     … 画面をどう操作するか（キャプチャ＋赤枠＋番号）
//   業務運用ルール … なぜそうするか（アラートの定義・案件の色・請求の型など）
// 手順を探しに来た人がルールにも辿り着けるよう、どちらの画面でも同じ位置に出す。

import Link from 'next/link'
import { MousePointerClick, Scale } from 'lucide-react'

const TABS = [
  { key: 'steps', href: '/manual/steps', label: '操作方法', note: 'どこを押すか', Icon: MousePointerClick },
  { key: 'rules', href: '/manual/rules', label: '業務運用ルール', note: 'なぜそうするか', Icon: Scale },
] as const

export default function ManualNav({ active }: { active: 'steps' | 'rules' }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {TABS.map(t => {
        const on = t.key === active
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border transition-colors ${
              on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-700'}`}
          >
            <t.Icon className="w-4 h-4" strokeWidth={2} />
            <span className="text-[13px] font-semibold">{t.label}</span>
            <span className={`text-[11px] ${on ? 'text-white/75' : 'text-gray-400'}`}>{t.note}</span>
          </Link>
        )
      })}
    </div>
  )
}
