'use client'

import { useState, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { ACQUIRERS, acquirerLabel, acquirerFromRoles, ACQUIRER_GYOMU } from '@/lib/acquirer'
import ContractReceivedDocs from './ContractReceivedDocs'
import type { CaseRow, RealEstatePropertyRow, ContractDocumentRow } from '@/types'

const TITLE_CHANGE_OPTIONS = ['要', '不要', '確認中']

type Props = {
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // 契約残手続きの書類（区分=登記 を「契約時受領」として表示）
  contractDocuments?: ContractDocumentRow[]
}

/**
 * 相続登記タブ
 * 財産調査の不動産を表示し、名義変更要否＋任意の可変列（案件単位で列を追加）を管理する。
 * 不動産の追加・削除は財産調査タブで行う。
 */
export default function RegistrationTab({ caseData, properties, onRefresh, patchCase, contractDocuments = [] }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<RealEstatePropertyRow[]>(properties)
  // 財産調査で不動産が追加/削除されたら（router.refresh で props 更新）一覧へ反映。
  // オーダーシート等で常時マウントされる場合に初期 props のまま固まるのを防ぐ。
  useEffect(() => { setRows(properties) }, [properties])
  const columns = caseData.registration_columns ?? []

  const saveField = async (id: string, field: keyof RealEstatePropertyRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const applyRolesAcquirer = async () => {
    if (rows.length === 0) { showToast('対象の不動産がありません', 'error'); return }
    const target = acquirerFromRoles(caseData.intake_roles ?? [], ACQUIRER_GYOMU.realEstate)
    if (!confirm(`全${rows.length}件の取得区分を「${acquirerLabel(target)}」に上書きします。よろしいですか？`)) return
    const ids = rows.map(r => r.id)
    const { error } = await supabase.from('real_estate_properties').update({ acquirer: target }).in('id', ids)
    if (error) { showToast(`反映に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.map(r => ({ ...r, acquirer: target })))
    showToast(`取得区分を「${acquirerLabel(target)}」に反映しました`, 'success')
  }

  const saveCustom = async (row: RealEstatePropertyRow, col: string, value: string) => {
    const next = { ...(row.registration_data ?? {}), [col]: value }
    if (value === '') delete next[col]
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, registration_data: next } : r)))
    const { error } = await supabase.from('real_estate_properties').update({ registration_data: next }).eq('id', row.id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addColumn = async () => {
    const name = window.prompt('追加する列名を入力してください（例：申請日、完了日、法務局 など）')?.trim()
    if (!name) return
    if (columns.includes(name)) { showToast('同じ列名が既にあります', 'error'); return }
    await patchCase({ registration_columns: [...columns, name] })
    onRefresh?.()
  }

  const removeColumn = async (name: string) => {
    if (!confirm(`列「${name}」を削除しますか？（各不動産の入力値も表示されなくなります）`)) return
    await patchCase({ registration_columns: columns.filter(c => c !== name) })
    onRefresh?.()
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-3.5">
        <ContractReceivedDocs documents={contractDocuments} category="登記" title="契約時にお客様から受領した登記関係書類" />
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-10 text-center text-[13px] text-gray-400">
          財産調査タブで不動産を登録すると、ここで名義変更要否などを管理できます。
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3.5">
      <ContractReceivedDocs documents={contractDocuments} category="登記" title="契約時にお客様から受領した登記関係書類" />
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 1360 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold w-24">物件種別</th>
              <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">名義変更要否</th>
              <th className="px-2.5 py-2 text-left font-semibold w-28">取得区分</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">実施日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">必要情報請求日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">到着予定日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">到着日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-20">受信</th>
              <th className="px-2.5 py-2 text-center font-semibold w-16">完了</th>
              {columns.map(col => (
                <th key={col} className="px-2.5 py-2 text-left font-semibold w-40">
                  <span className="inline-flex items-center gap-1">
                    {col}
                    <button type="button" onClick={() => removeColumn(col)} className="text-gray-300 hover:text-red-500" title="列を削除"><X className="w-3 h-3" /></button>
                  </span>
                </th>
              ))}
              <th className="px-2.5 py-2 text-right w-24">
                <button type="button" onClick={addColumn} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
                  <Plus className="w-3.5 h-3.5" /> 列を追加
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-2.5 py-2 text-gray-700">{r.property_type || <span className="text-gray-300">—</span>}</td>
                <td className="px-2.5 py-2 font-medium text-gray-800">{r.address || <span className="text-gray-300">—</span>}</td>
                <td className="px-2.5 py-1.5">
                  <select value={r.title_change_required ?? ''} onChange={e => saveField(r.id, 'title_change_required', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                    <option value="">—</option>
                    {TITLE_CHANGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-2.5 py-1.5">
                  <select value={r.acquirer ?? '自社'} onChange={e => saveField(r.id, 'acquirer', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                    {ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}
                  </select>
                </td>
                <td className="px-2.5 py-1.5"><input type="date" defaultValue={r.title_change_date ?? ''} onBlur={e => { if (e.target.value !== (r.title_change_date ?? '')) saveField(r.id, 'title_change_date', e.target.value || null) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></td>
                <td className="px-2.5 py-1.5"><input type="date" defaultValue={r.title_change_request_date ?? ''} onBlur={e => { if (e.target.value !== (r.title_change_request_date ?? '')) saveField(r.id, 'title_change_request_date', e.target.value || null) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></td>
                <td className="px-2.5 py-1.5"><input type="date" defaultValue={r.expected_arrival_date ?? ''} onBlur={e => { if (e.target.value !== (r.expected_arrival_date ?? '')) saveField(r.id, 'expected_arrival_date', e.target.value || null) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></td>
                <td className="px-2.5 py-1.5"><input type="date" defaultValue={r.title_change_arrival_date ?? ''} onBlur={e => { if (e.target.value !== (r.title_change_arrival_date ?? '')) saveField(r.id, 'title_change_arrival_date', e.target.value || null) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></td>
                <td className="px-2.5 py-1.5">
                  {r.title_change_arrival_date
                    ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">受信済</span>
                    : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受信</span>}
                </td>
                <td className="px-2.5 py-1.5 text-center"><input type="checkbox" checked={!!r.title_change_done} onChange={e => saveField(r.id, 'title_change_done', e.target.checked)} className="w-4 h-4 accent-brand-600 cursor-pointer" /></td>
                {columns.map(col => (
                  <td key={col} className="px-2.5 py-1.5">
                    <CustomCell value={r.registration_data?.[col] ?? ''} onCommit={v => saveCustom(r, col, v)} />
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={applyRolesAcquirer} className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-brand-700">
          役割分担から取得区分を反映
        </button>
      </div>
      {columns.length === 0 && (
        <p className="mt-2 text-[11px] text-gray-400">「列を追加」で、案件に必要な項目（申請日・完了日 など）を自由に追加できます。「取得区分=依頼者取得」は書類受信簿で受信すると到着日が入り受信済になります。</p>
      )}
    </div>
  )
}

function CustomCell({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value)
  return (
    <input
      type="text"
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v) }}
      className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
    />
  )
}
