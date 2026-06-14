'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import BirthdayPicker from '@/components/ui/BirthdayPicker'
import type { CaseClientRow } from '@/types'

// 生年月日から年齢を算出
function calcAge(birth: string | null): number | null {
  if (!birth) return null
  const b = new Date(birth)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 ? age : null
}

type Props = {
  caseId: string
  clients: CaseClientRow[]
  onRefresh?: () => void
}

/** 依頼者一覧（同行者含む）。表形式で複数人をインライン編集・追加・削除する。 */
export default function CaseClientsTable({ caseId, clients, onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<CaseClientRow[]>(clients)
  const [busy, setBusy] = useState(false)

  const setLocal = (id: string, field: keyof CaseClientRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as CaseClientRow : r)))

  const commit = async (id: string, field: keyof CaseClientRow, value: string) => {
    const { error } = await supabase.from('case_clients').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async () => {
    setBusy(true)
    const { data, error } = await supabase
      .from('case_clients')
      .insert({ case_id: caseId, name: '', priority: 'companion', sort_order: rows.length })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as CaseClientRow])
    onRefresh?.()
  }

  const delRow = async (row: CaseClientRow) => {
    if (!confirm(`「${row.name || '未入力の依頼者'}」を削除しますか？`)) return
    const { error } = await supabase.from('case_clients').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 880 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2 py-2 text-left font-semibold w-28">優先度</th>
              <th className="px-2 py-2 text-left font-semibold">氏名</th>
              <th className="px-2 py-2 text-left font-semibold">ふりがな</th>
              <th className="px-2 py-2 text-left font-semibold w-24">続柄</th>
              <th className="px-2 py-2 text-left font-semibold">TEL</th>
              <th className="px-2 py-2 text-left font-semibold">メール</th>
              <th className="px-2 py-2 text-left font-semibold w-36">生年月日</th>
              <th className="px-2 py-2 text-center font-semibold w-12">年齢</th>
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-[13px] text-gray-400">依頼者が登録されていません</td></tr>
            ) : (
              rows.map(r => {
                const age = calcAge(r.birth_date)
                return (
                  <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-2 py-1.5">
                      <select
                        value={r.priority}
                        onChange={e => { setLocal(r.id, 'priority', e.target.value); commit(r.id, 'priority', e.target.value) }}
                        className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500"
                      >
                        <option value="main">メイン依頼人</option>
                        <option value="companion">同行者</option>
                      </select>
                    </td>
                    <Cell value={r.name} onChange={v => setLocal(r.id, 'name', v)} onCommit={v => commit(r.id, 'name', v)} placeholder="山田 太郎" />
                    <Cell value={r.furigana} onChange={v => setLocal(r.id, 'furigana', v)} onCommit={v => commit(r.id, 'furigana', v)} placeholder="やまだ たろう" />
                    <Cell value={r.relationship} onChange={v => setLocal(r.id, 'relationship', v)} onCommit={v => commit(r.id, 'relationship', v)} placeholder="長男 等" />
                    <Cell value={r.phone} type="tel" onChange={v => setLocal(r.id, 'phone', v)} onCommit={v => commit(r.id, 'phone', v)} placeholder="090-..." />
                    <Cell value={r.email} type="email" onChange={v => setLocal(r.id, 'email', v)} onCommit={v => commit(r.id, 'email', v)} placeholder="mail@..." />
                    <td className="px-2 py-1.5">
                      <BirthdayPicker value={r.birth_date} onChange={v => { setLocal(r.id, 'birth_date', v); commit(r.id, 'birth_date', v) }} />
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono text-gray-700">{age != null ? age : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button type="button" onClick={() => delRow(r)} className="text-gray-300 hover:text-red-500 transition-colors" title="削除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        disabled={busy}
        className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
      >
        <Plus className="w-3.5 h-3.5" /> 依頼者を追加
      </button>
    </div>
  )
}

function Cell({ value, onChange, onCommit, placeholder, type = 'text' }: {
  value: string | null
  onChange: (v: string) => void
  onCommit: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <td className="px-2 py-1.5">
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onCommit(e.target.value)}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
      />
    </td>
  )
}
