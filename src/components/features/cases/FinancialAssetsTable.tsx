'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { FinancialAssetRow } from '@/types'

const REQ = ['要', '不要', '確認中']
const CANCEL = ['有', '無', '確認中']

type Kind = '預貯金' | '証券' | '信託銀行'
type ColType = 'text' | 'req' | 'cancel'
type Col = { key: keyof FinancialAssetRow; label: string; type: ColType; width?: string }

// 種別ごとの列定義（調査期間・備考・進捗列は共通で末尾に付与）
const COLUMNS: Record<Kind, Col[]> = {
  '預貯金': [
    { key: 'institution_name', label: '金融機関名', type: 'text' },
    { key: 'branch_name', label: '支店', type: 'text', width: 'w-28' },
    { key: 'all_branch_survey', label: '全店調査', type: 'req', width: 'w-24' },
    { key: 'balance_cert_required', label: '残高証明', type: 'req', width: 'w-24' },
    { key: 'accrued_interest_required', label: '経過利息', type: 'req', width: 'w-24' },
  ],
  '証券': [
    { key: 'institution_name', label: '証券会社', type: 'text' },
    { key: 'branch_name', label: '支店名', type: 'text', width: 'w-28' },
    { key: 'stock_name', label: '銘柄名', type: 'text' },
    { key: 'cancellation_required', label: '解約有無', type: 'cancel', width: 'w-24' },
    { key: 'balance_cert_required', label: '残高証明', type: 'req', width: 'w-24' },
  ],
  '信託銀行': [
    { key: 'institution_name', label: '信託銀行名', type: 'text' },
    { key: 'stock_name', label: '銘柄名', type: 'text' },
    { key: 'cancellation_required', label: '解約有無', type: 'cancel', width: 'w-24' },
    { key: 'share_cert_required', label: '所有株式数証明', type: 'req', width: 'w-28' },
    { key: 'unclaimed_dividend_required', label: '未受領配当金', type: 'req', width: 'w-28' },
  ],
}

type Props = {
  caseId: string
  kind: Kind
  assets: FinancialAssetRow[]
  onRefresh?: () => void
  /** 対応中タブ（進捗管理）で「請求日・到着日」列を表示。オーダーシートでは false */
  progressMode?: boolean
}

/** 金融機関の表（預金/証券/信託で列が変わる）。インライン編集・行追加。 */
export default function FinancialAssetsTable({ caseId, kind, assets, onRefresh, progressMode = false }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<FinancialAssetRow[]>(() => assets.filter(a => a.asset_type === kind))
  const [busy, setBusy] = useState(false)
  const cols = COLUMNS[kind]

  const setLocal = (id: string, field: keyof FinancialAssetRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as FinancialAssetRow : r)))

  const commit = async (id: string, field: keyof FinancialAssetRow, value: string) => {
    const { error } = await supabase.from('financial_assets').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }
  const save = (id: string, field: keyof FinancialAssetRow, value: string) => { setLocal(id, field, value); commit(id, field, value) }

  const addRow = async () => {
    setBusy(true)
    const { data, error } = await supabase.from('financial_assets').insert({ case_id: caseId, asset_type: kind, institution_name: '' }).select('*').single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as FinancialAssetRow])
    onRefresh?.()
  }

  const delRow = async (row: FinancialAssetRow) => {
    if (!confirm(`「${row.institution_name || '未入力'}」を削除しますか？`)) return
    const { error } = await supabase.from('financial_assets').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  const colCount = cols.length + 2 + (progressMode ? 2 : 0) + 1 // +調査期間 +備考 (+請求/到着) +削除

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: progressMode ? 1100 : 880 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              {cols.map(c => <th key={c.key} className={`px-2 py-2 text-left font-semibold ${c.width ?? ''}`}>{c.label}</th>)}
              <th className="px-2 py-2 text-left font-semibold w-44">調査期間</th>
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-32">請求日</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-32">到着日</th>}
              <th className="px-2 py-2 text-left font-semibold">備考</th>
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-[13px] text-gray-400">登録されていません</td></tr>
            ) : (
              rows.map(r => (
                <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                  {cols.map(c => (
                    <td key={c.key} className="px-2 py-1.5">
                      {c.type === 'text' ? (
                        <TextInput value={(r[c.key] as string) ?? null} onChange={v => setLocal(r.id, c.key, v)} onCommit={v => commit(r.id, c.key, v)} />
                      ) : (
                        <SmallSelect value={(r[c.key] as string) ?? ''} options={c.type === 'cancel' ? CANCEL : REQ} onChange={v => save(r.id, c.key, v)} />
                      )}
                    </td>
                  ))}
                  {/* 調査期間 */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <SmallSelect value={r.survey_period_type ?? ''} options={['相続開始日', '任意指定']} onChange={v => save(r.id, 'survey_period_type', v)} placeholder="—" />
                      {r.survey_period_type === '任意指定' && (
                        <input type="date" value={r.survey_date ?? ''} onChange={e => setLocal(r.id, 'survey_date', e.target.value)} onBlur={e => commit(r.id, 'survey_date', e.target.value)} className="px-1 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" />
                      )}
                    </div>
                  </td>
                  {progressMode && (
                    <td className="px-2 py-1.5"><input type="date" value={r.request_date ?? ''} onChange={e => setLocal(r.id, 'request_date', e.target.value)} onBlur={e => commit(r.id, 'request_date', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" /></td>
                  )}
                  {progressMode && (
                    <td className="px-2 py-1.5"><input type="date" value={r.arrival_date ?? ''} onChange={e => setLocal(r.id, 'arrival_date', e.target.value)} onBlur={e => commit(r.id, 'arrival_date', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" /></td>
                  )}
                  <td className="px-2 py-1.5"><TextInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="特記事項" /></td>
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r)} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} disabled={busy} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" /> 追加
      </button>
    </div>
  )
}

function TextInput({ value, onChange, onCommit, placeholder }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      placeholder={placeholder}
      className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
    />
  )
}

function SmallSelect({ value, options, onChange, placeholder }: { value: string; options: readonly string[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
      <option value="">{placeholder ?? '—'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
