'use client'

// 実務タブの「1行=1明細」表で使う共通インライン編集セル。
// 戸籍・相続登記など、詳細をカードでなく表にマージした画面で共有する。

import { UserCheck, X } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'

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
// meId/workerId/isManager を渡すと「作業者＝自分」の自己チェックを弾く（管理担当は例外）。
// onSet の第3引数でチェック者の member_id を返す（*_check_by 記録用）。
export function DcCell({ name, at, me, onSet, meId, workerId, isManager, disabled, disabledLabel = '到着待ち', disabledTitle }: {
  name: string | null
  at: string | null
  me: string
  onSet: (n: string | null, a: string | null, byId?: string | null) => void
  meId?: string | null
  workerId?: string | null
  isManager?: boolean
  disabled?: boolean          // 前提未達（例: 到着日が未入力）でチェック不可
  disabledLabel?: string      // 未達時のボタン表記
  disabledTitle?: string      // 未達時のツールチップ
}) {
  const selfBlocked = !!workerId && !!meId && workerId === meId && !isManager
  const press = () => {
    if (disabled) { showToast(disabledTitle || 'まだW-Checkできません。', 'error'); return }
    if (selfBlocked) { showToast('自分の作業は自分でW-Checkできません。別の担当者が確認してください。', 'error'); return }
    onSet(me, new Date().toISOString(), meId ?? null)
  }
  // 確認済みなら（前提未達でも）取消は可能にしておく
  if (name) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
      <UserCheck className="w-3 h-3" strokeWidth={2.25} />{name}{at ? `・${at.slice(5, 10).replace('-', '/')}` : ''}
      <button type="button" onClick={() => onSet(null, null, null)} title="確認を取消" className="text-emerald-400 hover:text-red-500"><X className="w-3 h-3" /></button>
    </span>
  )
  if (disabled) return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-gray-300 bg-gray-50 border border-gray-200 cursor-not-allowed" title={disabledTitle || disabledLabel}><UserCheck className="w-3 h-3" />{disabledLabel}</span>
  )
  if (selfBlocked) return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-gray-300 bg-gray-50 border border-gray-200 cursor-not-allowed" title="自分の作業は自分でW-Checkできません（別の担当者が確認）"><UserCheck className="w-3 h-3" />別者確認待ち</span>
  )
  return (
    <button type="button" onClick={press} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-gray-500 bg-white border border-gray-300 hover:border-emerald-400 hover:text-emerald-700"><UserCheck className="w-3 h-3" />未確認</button>
  )
}
