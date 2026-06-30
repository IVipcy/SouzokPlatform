'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { REGISTRATION_TYPES, REGISTRATION_CAUSES, REGISTRATION_STATUSES } from '@/lib/constants'
import { Section } from '@/components/ui/InlineFields'
import ContractReceivedDocs from './ContractReceivedDocs'
import TabHeader from './TabHeader'
import RegistrationSection from './RegistrationSection'
import type { CaseRow, RealEstatePropertyRow, ContractDocumentRow } from '@/types'

type Props = {
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // 契約残手続きの書類（区分=登記 を「契約時受領」として表示）
  contractDocuments?: ContractDocumentRow[]
  /** オーダーシート埋め込み時は TabHeader を出さない */
  orderSheetMode?: boolean
}

/**
 * 相続登記タブ
 * 財産調査の不動産を物件ごとにプリセット表示し、物件単位で相続登記の手続き
 * （種別[複数]・登記原因・管轄法務局・ステータス・申請日・完了日・備考）を管理する。
 * 登記情報等の取得進捗は財産調査タブの不動産側で管理する。
 * 不動産の追加・削除は財産調査タブで行う。
 */
export default function RegistrationTab({ caseData, properties, onRefresh, patchCase, contractDocuments = [], orderSheetMode = false }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<RealEstatePropertyRow[]>(properties)
  useEffect(() => { setRows(properties) }, [properties])
  const columns = caseData.registration_columns ?? []

  const saveField = async (id: string, field: keyof RealEstatePropertyRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const saveCustom = async (row: RealEstatePropertyRow, col: string, value: string) => {
    const next = { ...(row.registration_data ?? {}), [col]: value }
    if (value === '') delete next[col]
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, registration_data: next } : r)))
    const { error } = await supabase.from('real_estate_properties').update({ registration_data: next }).eq('id', row.id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addColumn = async () => {
    const name = window.prompt('追加する列名を入力してください（例：登録免許税、立会日 など）')?.trim()
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

  // 案件詳細（実務）：市区町村単位の左レール＋カード（空でもTOPを表示）
  if (!orderSheetMode) {
    return (
      <div className="space-y-3.5">
        <TabHeader title="相続登記" description="物件ごとの登記種別・管轄法務局・申請日・登録免許税の管理" />
        <RegistrationSection caseId={caseData.id} properties={properties} onRefresh={onRefresh} />
        <ContractReceivedDocs documents={contractDocuments} category="登記" title="契約時にお客様から受領した登記関係書類" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-3.5">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-10 text-center text-[13px] text-gray-400">
          財産調査タブで不動産を登録すると、ここで物件ごとの相続登記手続きを管理できます。
        </div>
        <ContractReceivedDocs documents={contractDocuments} category="登記" title="契約時にお客様から受領した登記関係書類" />
      </div>
    )
  }

  return (
    <div className="space-y-3.5">
      <Section title="相続登記（物件ごとの手続き）">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 1580 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2.5 py-2 text-left font-semibold w-24">物件種別</th>
              <th className="px-2.5 py-2 text-left font-semibold w-48">所在地</th>
              <th className="px-2.5 py-2 text-left font-semibold w-56">相続登記の種別</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">登記原因</th>
              <th className="px-2.5 py-2 text-left font-semibold w-36">管轄法務局</th>
              {!orderSheetMode && <th className="px-2.5 py-2 text-left font-semibold w-32">ステータス</th>}
              {!orderSheetMode && <th className="px-2.5 py-2 text-left font-semibold w-32">申請日</th>}
              {!orderSheetMode && <th className="px-2.5 py-2 text-left font-semibold w-32">完了日</th>}
              <th className="px-2.5 py-2 text-left font-semibold w-40">備考</th>
              {!orderSheetMode && <th className="px-2.5 py-2 text-left font-semibold w-56">備考・結果</th>}
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
                  <MultiSelectCell value={r.registration_types ?? []} options={REGISTRATION_TYPES} onSave={v => saveField(r.id, 'registration_types', v.length ? v : null)} />
                </td>
                <td className="px-2.5 py-1.5">
                  <select value={r.registration_cause ?? ''} onChange={e => saveField(r.id, 'registration_cause', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                    <option value="">—</option>
                    {REGISTRATION_CAUSES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-2.5 py-1.5"><CustomCell value={r.registration_office ?? ''} onCommit={v => saveField(r.id, 'registration_office', v || null)} placeholder="例: 名古屋法務局" /></td>
                {!orderSheetMode && (
                  <td className="px-2.5 py-1.5">
                    <select value={r.registration_status ?? ''} onChange={e => saveField(r.id, 'registration_status', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {REGISTRATION_STATUSES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                )}
                {!orderSheetMode && <td className="px-2.5 py-1.5"><input type="date" defaultValue={r.registration_apply_date ?? ''} onBlur={e => { if (e.target.value !== (r.registration_apply_date ?? '')) saveField(r.id, 'registration_apply_date', e.target.value || null) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></td>}
                {!orderSheetMode && <td className="px-2.5 py-1.5"><input type="date" defaultValue={r.registration_complete_date ?? ''} onBlur={e => { if (e.target.value !== (r.registration_complete_date ?? '')) saveField(r.id, 'registration_complete_date', e.target.value || null) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></td>}
                <td className="px-2.5 py-1.5"><CustomCell value={r.registration_notes ?? ''} onCommit={v => saveField(r.id, 'registration_notes', v || null)} placeholder="特記事項" /></td>
                {!orderSheetMode && <td className="px-2.5 py-1.5"><CustomCell value={r.registration_result ?? ''} onCommit={v => saveField(r.id, 'registration_result', v || null)} placeholder="この登記で分かったこと・結果" /></td>}
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
      <p className="mt-2 text-[11px] text-gray-400">
        物件は財産調査タブの不動産から自動表示されます。登記情報・公図等の取得進捗は財産調査タブで管理します。
        「列を追加」で案件固有の項目（登録免許税・立会日 など）を追加できます。
      </p>
      </Section>
      <ContractReceivedDocs documents={contractDocuments} category="登記" title="契約時にお客様から受領した登記関係書類" />
    </div>
  )
}

// 相続登記の種別（複数選択）。表の overflow 枠でクリップされないよう、
// チェックリストは body へポータルして固定配置で表示する。
function MultiSelectCell({ value, options, onSave }: { value: string[]; options: readonly string[]; onSave: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const openPanel = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onMove = () => setOpen(false)  // スクロール/リサイズで閉じる（位置ズレ防止）
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  const toggle = (o: string) => {
    onSave(value.includes(o) ? value.filter(x => x !== o) : [...value, o])
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : openPanel())} className="w-full flex items-center gap-1 px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white text-left hover:border-brand-400">
        <span className="flex-1 truncate">
          {value.length === 0 ? <span className="text-gray-300">— 選択 —</span> : value.join('、')}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 60 }} className="max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg p-1.5">
          {options.map(o => (
            <label key={o} className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 rounded cursor-pointer">
              <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} className="w-3.5 h-3.5 accent-brand-600" />
              {o}
            </label>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

function CustomCell({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <input
      type="text"
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v) }}
      placeholder={placeholder}
      className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
    />
  )
}
