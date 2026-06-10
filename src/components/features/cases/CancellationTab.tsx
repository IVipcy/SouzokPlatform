'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { FinancialAssetRow } from '@/types'

// asset_type → カテゴリ表示
const CAT_LABEL: Record<string, string> = { '預貯金': '預金', '証券': '証券', '信託銀行': '信託' }
const REQUIRED_OPTIONS = ['要', '不要', '確認中']

type Props = {
  financialAssets: FinancialAssetRow[]
  onRefresh?: () => void
}

/**
 * 解約手続タブ
 * 財産調査で登録した金融機関を表形式で表示し、機関ごとに解約要否・解約日・禁止事項を入力する。
 * （金融機関の追加・削除は財産調査タブで行う）
 */
export default function CancellationTab({ financialAssets, onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<FinancialAssetRow[]>(financialAssets)

  const setLocal = (id: string, field: keyof FinancialAssetRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as FinancialAssetRow : r)))

  const commit = async (id: string, field: keyof FinancialAssetRow, value: string) => {
    const { error } = await supabase.from('financial_assets').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-10 text-center text-[13px] text-gray-400">
        財産調査タブで金融機関（預金・証券・信託）を登録すると、ここで解約要否を入力できます。
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <table className="w-full text-[13px] border-collapse" style={{ minWidth: 900 }}>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
            <th className="px-2.5 py-2 text-left font-semibold w-20">カテゴリ</th>
            <th className="px-2.5 py-2 text-left font-semibold">金融機関名</th>
            <th className="px-2.5 py-2 text-left font-semibold w-28">支店</th>
            <th className="px-2.5 py-2 text-left font-semibold w-28">解約要否</th>
            <th className="px-2.5 py-2 text-left font-semibold w-36">解約日</th>
            <th className="px-2.5 py-2 text-left font-semibold">解約時の禁止事項</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
              <td className="px-2.5 py-2">
                <span className="inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                  {CAT_LABEL[r.asset_type] ?? r.asset_type}
                </span>
              </td>
              <td className="px-2.5 py-2 font-semibold text-gray-800">{r.institution_name || <span className="text-gray-300">—</span>}</td>
              <td className="px-2.5 py-2 text-gray-600">{r.branch_name || <span className="text-gray-300">—</span>}</td>
              <td className="px-2.5 py-2">
                <select
                  value={r.cancellation_required ?? ''}
                  onChange={e => { setLocal(r.id, 'cancellation_required', e.target.value); commit(r.id, 'cancellation_required', e.target.value) }}
                  className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500"
                >
                  <option value="">—</option>
                  {REQUIRED_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
              <td className="px-2.5 py-2">
                <input
                  type="date"
                  value={r.cancellation_date ?? ''}
                  onChange={e => setLocal(r.id, 'cancellation_date', e.target.value)}
                  onBlur={e => commit(r.id, 'cancellation_date', e.target.value)}
                  className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
                />
              </td>
              <td className="px-2.5 py-2">
                <input
                  type="text"
                  value={r.cancellation_restrictions ?? ''}
                  onChange={e => setLocal(r.id, 'cancellation_restrictions', e.target.value)}
                  onBlur={e => commit(r.id, 'cancellation_restrictions', e.target.value)}
                  placeholder="例：相続人全員の同意が必要 等"
                  className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
