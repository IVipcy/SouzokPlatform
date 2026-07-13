'use client'

// 実務タブの「1行=1明細」表で使う共通インライン編集セル。
// 戸籍・相続登記など、詳細をカードでなく表にマージした画面で共有する。

import { UserCheck, X } from 'lucide-react'

const cellInp = 'w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition'
const cellSel = 'w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'

export function TxtCell({ value, onCommit, placeholder }: { value: string | null; onCommit: (v: string) => void; placeholder?: string }) {
  return <input type="text" defaultValue={value ?? ''} onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }} placeholder={placeholder} className={cellInp} />
}

export function SelCell({ value, options, onChange }: { value: string | null; options: readonly string[]; onChange: (v: string) => void }) {
  return <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={cellSel}><option value="">—</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
}

export function DateCell({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  return <input type="date" defaultValue={value ?? ''} onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }} className={cellInp} />
}

export function MoneyCell({ value, onCommit }: { value: number | null; onCommit: (v: string) => void }) {
  return <input type="text" inputMode="numeric" defaultValue={value != null ? String(value) : ''} onBlur={e => onCommit(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" className={`${cellInp} text-right tabular-nums`} />
}

// ダブルチェック（自分以外）。押すと現在ユーザー名＋日時を記録、×で取消。
export function DcCell({ name, at, me, onSet }: { name: string | null; at: string | null; me: string; onSet: (n: string | null, a: string | null) => void }) {
  return name ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
      <UserCheck className="w-3 h-3" strokeWidth={2.25} />{name}{at ? `・${at.slice(5, 10).replace('-', '/')}` : ''}
      <button type="button" onClick={() => onSet(null, null)} title="確認を取消" className="text-emerald-400 hover:text-red-500"><X className="w-3 h-3" /></button>
    </span>
  ) : (
    <button type="button" onClick={() => onSet(me, new Date().toISOString())} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-gray-500 bg-white border border-gray-300 hover:border-emerald-400 hover:text-emerald-700"><UserCheck className="w-3 h-3" />未確認</button>
  )
}
