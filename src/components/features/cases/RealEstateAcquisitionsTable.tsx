'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { ACQUISITION_ITEMS, ACQUISITION_ITEM_KEYS } from '@/lib/constants'
import type { RealEstateAcquisitionRow, RealEstatePropertyRow, TaskRow, ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'
import { relatedTasksFor, receiptFilesFor } from '@/lib/relatedTasks'
import RelatedTaskChips from './RelatedTaskChips'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'
import ContractReceivedBlock from './ContractReceivedBlock'

type Props = {
  caseId: string
  acquisitions: RealEstateAcquisitionRow[]
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
  // オーダーシート埋め込み時は請求日・到着日の進捗列を出さない
  orderSheetMode?: boolean
  // 受信簿＋タスク（受信トリガーで着手したタスクへの「関連タスク」リンク用）
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  // 契約時にお客様から受領した不動産関係書類（区分=財産のうち不動産分）。表の先頭に受領済として表示。
  contractDocs?: ContractDocumentRow[]
}

const itemMeta = (key: string | null) => ACQUISITION_ITEMS.find(i => i.key === key)
const propLabel = (p: RealEstatePropertyRow) => p.address || p.lot_number || p.property_type || '未入力の物件'

/**
 * 不動産の取得資料管理（戸籍請求一覧と同じ思想）。1行＝1取得物。
 * 何を（取得物）・どこに（請求先）・いつ請求し・受け取れたか（到着日/取得済）を管理。
 * 路線価は「参照」なので請求先・日付はグレーアウトし、取得済のみ管理。
 * 物件単位（登記情報/公図/地積/路線価）は対象物件を選択、市区町村単位（評価証明/名寄帳）は市区町村を入力。
 */
export default function RealEstateAcquisitionsTable({ caseId, acquisitions, properties, onRefresh, orderSheetMode = false, receipts = [], contractDocs = [] }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<RealEstateAcquisitionRow[]>(acquisitions)
  useEffect(() => { setRows(acquisitions) }, [acquisitions])
  const progressMode = !orderSheetMode

  const save = async (id: string, field: keyof RealEstateAcquisitionRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstateAcquisitionRow : r)))
    const { error } = await supabase.from('real_estate_acquisitions').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  // 取得物を変更したら、請求先の既定値（法務局/市区町村役所）も自動セット
  const changeItem = async (id: string, key: string) => {
    const meta = itemMeta(key)
    setRows(prev => prev.map(r => (r.id === id ? { ...r, item_type: key, request_to: r.request_to || (meta?.office ?? '') } : r)))
    await supabase.from('real_estate_acquisitions').update({ item_type: key || null, request_to: undefined }).eq('id', id)
    if (meta?.office) await supabase.from('real_estate_acquisitions').update({ request_to: meta.office }).eq('id', id).is('request_to', null)
  }

  const addRow = async () => {
    const { error } = await supabase.from('real_estate_acquisitions').insert({ case_id: caseId, sort_order: rows.length })
    if (error) { showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  const delRow = async (id: string) => {
    if (!confirm('この取得資料を削除しますか？')) return
    const { error } = await supabase.from('real_estate_acquisitions').delete().eq('id', id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const dateCls = 'w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white'
  const selCls = 'w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'

  return (
    <div>
      {/* 契約時に受領済の不動産関係書類（依頼者取得分）は別ブロックで上に表示。新規請求の表とは分ける。 */}
      <ContractReceivedBlock docs={contractDocs} caseId={caseId} onRefresh={onRefresh} />
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: progressMode ? 1100 : 720 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
              <th className="px-2.5 py-2 text-left font-semibold w-32">取得物</th>
              <th className="px-2.5 py-2 text-left font-semibold w-48">対象</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">請求先</th>
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-32">請求日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-32">到着予定日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-32">到着日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-36">関連タスク</th>}
              <th className="px-2.5 py-2 text-center font-semibold w-16">取得済</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={progressMode ? 9 : 5} className="px-3 py-6 text-center text-[13px] text-gray-400">取得資料が登録されていません</td></tr>
            ) : rows.map((r, i) => {
              const meta = itemMeta(r.item_type)
              const isRef = meta?.method === '参照'   // 路線価など参照は請求先・日付なし
              const isProp = meta?.target === '物件'
              return (
                <tr key={r.id} className={`border-b border-gray-100 [&>td]:align-top ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-2.5 py-1.5">
                    <select value={r.item_type ?? ''} onChange={e => changeItem(r.id, e.target.value)} className={selCls}>
                      <option value="">—</option>
                      {ACQUISITION_ITEM_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                    {meta && <div className="text-[10px] text-gray-400 mt-0.5">{meta.method}</div>}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {isProp ? (
                      <select value={r.target_property_id ?? ''} onChange={e => save(r.id, 'target_property_id', e.target.value || null)} className={selCls}>
                        <option value="">— 物件を選択 —</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{propLabel(p)}</option>)}
                      </select>
                    ) : (
                      <input type="text" defaultValue={r.target_municipality ?? ''} onBlur={e => { if (e.target.value !== (r.target_municipality ?? '')) save(r.id, 'target_municipality', e.target.value || null) }} placeholder="例: 名古屋市中区" className={dateCls} />
                    )}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {isRef ? <span className="text-[11px] text-gray-300">— 参照（路線価図）—</span>
                      : <input type="text" defaultValue={r.request_to ?? ''} onBlur={e => { if (e.target.value !== (r.request_to ?? '')) save(r.id, 'request_to', e.target.value || null) }} placeholder={meta?.office || '請求先'} className={dateCls} />}
                  </td>
                  {progressMode && <td className="px-2.5 py-1.5">{isRef ? <span className="text-gray-300 text-[11px]">—</span> : <input type="date" defaultValue={r.request_date ?? ''} onBlur={e => { if (e.target.value !== (r.request_date ?? '')) save(r.id, 'request_date', e.target.value || null) }} className={dateCls} />}</td>}
                  {progressMode && <td className="px-2.5 py-1.5">{isRef ? <span className="text-gray-300 text-[11px]">—</span> : <input type="date" defaultValue={r.expected_arrival_date ?? ''} onBlur={e => { if (e.target.value !== (r.expected_arrival_date ?? '')) save(r.id, 'expected_arrival_date', e.target.value || null) }} className={dateCls} />}</td>}
                  {progressMode && <td className="px-2.5 py-1.5">{isRef ? <span className="text-gray-300 text-[11px]">—</span> : <input type="date" defaultValue={r.arrival_date ?? ''} onBlur={e => { if (e.target.value !== (r.arrival_date ?? '')) save(r.id, 'arrival_date', e.target.value || null) }} className={dateCls} />}</td>}
                  {progressMode && (
                    <td className="px-2.5 py-1.5">
                      <div className="flex flex-col gap-1 items-start">
                        <RelatedTaskChips tasks={relatedTasksFor(receipts, 'real_estate_acquisition', r.id)} />
                        {receiptFilesFor(receipts, 'real_estate_acquisition', r.id).map((f, i) => <OpenStorageFile key={i} bucket={f.bucket} path={f.path} name={f.name} label="受領ファイル" />)}
                      </div>
                    </td>
                  )}
                  {/* 取得済＝到着日があるか（受信簿で受領すると arrival_date が入り自動で受信済に）。戸籍・金融と統一。 */}
                  <td className="px-2.5 py-1.5 text-center">
                    {isRef
                      ? <span className="text-gray-300 text-[11px]">—</span>
                      : r.arrival_date
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">受信済</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受信</span>}
                  </td>
                  <td className="px-2.5 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
        <Plus className="w-3.5 h-3.5" /> 取得資料を追加
      </button>
      <p className="mt-1 text-[11px] text-gray-400">登記情報・公図・地積測量図は法務局へ（物件単位）、評価証明・名寄帳は市区町村へ（市区町村単位）、路線価は参照（路線価図）です。</p>
    </div>
  )
}
