'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { FinancialAssetRow } from '@/types'

const CANCEL = ['有', '無', '確認中']

const SUBTABS: { key: string; kind: string; label: string }[] = [
  { key: 'deposit', kind: '預貯金', label: '預金' },
  { key: 'securities', kind: '証券', label: '証券' },
  { key: 'trust', kind: '信託銀行', label: '信託' },
]

type Props = {
  financialAssets: FinancialAssetRow[]
  onRefresh?: () => void
}

/**
 * 解約手続タブ
 * 財産調査で登録した金融機関を 預金/証券/信託 の子タブで表示し、機関ごとに
 * 解約有無・解約予定日・解約書類請求日・到着日・解約完了 を管理する。
 */
export default function CancellationTab({ financialAssets, onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<FinancialAssetRow[]>(financialAssets)
  const [sub, setSub] = useState('deposit')
  const kind = SUBTABS.find(t => t.key === sub)?.kind ?? '預貯金'
  const list = rows.filter(r => r.asset_type === kind)

  const save = async (id: string, field: keyof FinancialAssetRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as FinancialAssetRow : r)))
    const { error } = await supabase.from('financial_assets').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-gray-200 mb-3 flex-wrap">
        {SUBTABS.map(t => (
          <button key={t.key} type="button" onClick={() => setSub(t.key)} className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${sub === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center text-[13px] text-gray-400">
          財産調査タブで{SUBTABS.find(t => t.key === sub)?.label}を登録すると、ここで解約手続を管理できます。
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-[13px] border-collapse" style={{ minWidth: 1000 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
                <th className="px-2.5 py-2 text-left font-semibold">{kind === '預貯金' ? '金融機関名' : kind === '証券' ? '証券会社' : '信託銀行名'}</th>
                <th className="px-2.5 py-2 text-left font-semibold w-24">解約有無</th>
                <th className="px-2.5 py-2 text-left font-semibold w-32">解約予定日</th>
                <th className="px-2.5 py-2 text-left font-semibold w-32">書類請求日</th>
                <th className="px-2.5 py-2 text-left font-semibold w-32">到着日</th>
                <th className="px-2.5 py-2 text-center font-semibold w-20">解約完了</th>
                <th className="px-2.5 py-2 text-left font-semibold">禁止事項</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-2.5 py-2 font-semibold text-gray-800">{r.institution_name || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2.5 py-1.5">
                    <select value={r.cancellation_required ?? ''} onChange={e => save(r.id, 'cancellation_required', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {CANCEL.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <DateCell value={r.cancellation_date} onSave={v => save(r.id, 'cancellation_date', v || null)} />
                  <DateCell value={r.cancellation_request_date} onSave={v => save(r.id, 'cancellation_request_date', v || null)} />
                  <DateCell value={r.cancellation_arrival_date} onSave={v => save(r.id, 'cancellation_arrival_date', v || null)} />
                  <td className="px-2.5 py-1.5 text-center">
                    <input type="checkbox" checked={!!r.cancellation_done} onChange={e => save(r.id, 'cancellation_done', e.target.checked)} className="w-4 h-4 accent-brand-600 cursor-pointer" />
                  </td>
                  <TextCell value={r.cancellation_restrictions} onSave={v => save(r.id, 'cancellation_restrictions', v)} placeholder="例：相続人全員の同意が必要 等" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DateCell({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <input type="date" defaultValue={value ?? ''} onBlur={e => { if (e.target.value !== (value ?? '')) onSave(e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
    </td>
  )
}

function TextCell({ value, onSave, placeholder }: { value: string | null; onSave: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input type="text" defaultValue={value ?? ''} onBlur={e => { if (e.target.value !== (value ?? '')) onSave(e.target.value) }} placeholder={placeholder} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
    </td>
  )
}
