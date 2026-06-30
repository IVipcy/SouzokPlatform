'use client'

import { useState, useEffect, Fragment } from 'react'
import { Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react'
import { CostBlock, DoubleCheck } from './CostAndCheck'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { ACQUISITION_ITEMS, ACQUISITION_ITEM_KEYS } from '@/lib/constants'
import type { RealEstateAcquisitionRow, RealEstatePropertyRow, TaskRow, ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'
import { relatedTasksFor, receiptFilesFor } from '@/lib/relatedTasks'
import RelatedTaskChips from './RelatedTaskChips'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'
import ContractReceivedBlock from './ContractReceivedBlock'
import SelectOrTextField from './SelectOrTextField'
import { municipalityOf } from './RealEstateSection'

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
  // 業務順に表を分割：'municipality'=市区町村単位の請求(名寄帳/評価証明)、'property'=物件単位の取得(登記情報/公図 等)
  scope?: 'all' | 'municipality' | 'property'
  // 市区町村タブで使用：この市区町村に紐づく行だけ表示し、新規行もこの市区町村にする
  municipalityFilter?: string
}

const itemMeta = (key: string | null) => ACQUISITION_ITEMS.find(i => i.key === key)
const propLabel = (p: RealEstatePropertyRow) => p.address || p.lot_number || p.property_type || '未入力の物件'

/**
 * 不動産の取得資料管理（戸籍請求一覧と同じ思想）。1行＝1取得物。
 * 何を（取得物）・どこに（請求先）・いつ請求し・受け取れたか（到着日/取得済）を管理。
 * 路線価は「参照」なので請求先・日付はグレーアウトし、取得済のみ管理。
 * 物件単位（登記情報/公図/地積/路線価）は対象物件を選択、市区町村単位（評価証明/名寄帳）は市区町村を入力。
 */
export default function RealEstateAcquisitionsTable({ caseId, acquisitions, properties, onRefresh, orderSheetMode = false, receipts = [], contractDocs = [], scope = 'all', municipalityFilter }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<RealEstateAcquisitionRow[]>(acquisitions)
  useEffect(() => { setRows(acquisitions) }, [acquisitions])
  const progressMode = !orderSheetMode
  const [expanded, setExpanded] = useState<string | null>(null)
  const costMode = scope === 'property' ? 'confirmedOnly' : 'full'  // 物件取得=印紙(確定のみ)、市区町村請求=小為替(予算/返金/確定)

  const saveMany = async (id: string, patch: Partial<RealEstateAcquisitionRow>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } as RealEstateAcquisitionRow : r)))
    const { error } = await supabase.from('real_estate_acquisitions').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }

  // scope に応じて取得物の選択肢を絞る（市区町村単位＝評価証明/名寄帳、物件単位＝登記情報 等）
  const scopeTarget = scope === 'municipality' ? '市区町村' : scope === 'property' ? '物件' : null
  const itemKeys = scopeTarget ? ACQUISITION_ITEMS.filter(i => i.target === scopeTarget).map(i => i.key) : ACQUISITION_ITEM_KEYS
  // この市区町村に属する物件（物件単位の対象を絞る）。タブキーは municipalityOf（住所からの派生）なので揃える。
  const muniProps = municipalityFilter != null ? properties.filter(p => municipalityOf(p) === municipalityFilter) : properties
  const muniPropIds = new Set(muniProps.map(p => p.id))
  // 表示行：scope列（①市区町村/②物件）＋市区町村でフィルタ。
  // scope列が未設定のレガシー行は取得物(item_type)の対象種別から推定。
  const rowScopeOf = (r: RealEstateAcquisitionRow): 'municipality' | 'property' | null => {
    if (r.scope) return r.scope
    const meta = itemMeta(r.item_type)
    return meta ? (meta.target === '物件' ? 'property' : 'municipality') : null
  }
  const visibleRows = rows.filter(r => {
    if (scopeTarget) {
      const rs = rowScopeOf(r)
      if (rs == null || rs !== scope) return false   // scope不明 or 別scope行は出さない（①②の混在を防ぐ）
    }
    if (municipalityFilter == null) return true
    if (scope === 'municipality') return (r.target_municipality ?? '') === municipalityFilter
    if (scope === 'property') return (r.target_property_id != null && muniPropIds.has(r.target_property_id)) || (r.target_property_id == null && (r.target_municipality ?? '') === municipalityFilter)
    return true
  })

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
    const init: Partial<RealEstateAcquisitionRow> = { case_id: caseId, sort_order: rows.length }
    if (scope === 'municipality' || scope === 'property') init.scope = scope
    // 新規行をこの市区町村タブに固定（②物件はあとで物件を選ぶ）
    if (municipalityFilter != null) init.target_municipality = municipalityFilter
    const { error } = await supabase.from('real_estate_acquisitions').insert(init)
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
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: progressMode ? 1100 : 720 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              {progressMode && <th className="px-1 py-2 w-7" />}
              <th className="px-2.5 py-2 text-left font-semibold w-32">取得物</th>
              <th className="px-2.5 py-2 text-left font-semibold w-48">対象</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">請求先</th>
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-32">請求日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-32">到着日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-36">関連タスク</th>}
              {progressMode && <th className="px-2.5 py-2 text-center font-semibold w-16">受領</th>}
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={progressMode ? 9 : 4} className="px-3 py-6 text-center text-[13px] text-gray-400">取得資料が登録されていません</td></tr>
            ) : visibleRows.map((r, i) => {
              const meta = itemMeta(r.item_type)
              const isRef = meta?.method === '参照'   // 路線価など参照は請求先・日付なし
              const isProp = meta?.target === '物件'
              return (
                <Fragment key={r.id}>
                <tr className={`border-b border-gray-100 [&>td]:align-top ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  {progressMode && (
                    <td className="px-1 py-1.5 text-center">
                      <button type="button" onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-gray-400 hover:text-brand-600" title="費用・ダブルチェック">
                        {expanded === r.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                  )}
                  <td className="px-2.5 py-1.5">
                    {/* プリセットから選択／自由入力に切替（所有者事項以外の任意書類など） */}
                    <SelectOrTextField value={r.item_type} options={itemKeys} onSave={v => changeItem(r.id, v)} placeholder="取得物" />
                    {meta && <div className="text-[10px] text-gray-400 mt-0.5">{meta.method}</div>}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {(scope === 'property' || (scope === 'all' && isProp)) ? (
                      <select value={r.target_property_id ?? ''} onChange={e => save(r.id, 'target_property_id', e.target.value || null)} className={selCls}>
                        <option value="">— 物件を選択 —</option>
                        {muniProps.map(p => <option key={p.id} value={p.id}>{propLabel(p)}</option>)}
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
                  {progressMode && <td className="px-2.5 py-1.5">{isRef ? <span className="text-gray-300 text-[11px]">—</span> : <input type="date" defaultValue={r.arrival_date ?? ''} onBlur={e => { if (e.target.value !== (r.arrival_date ?? '')) save(r.id, 'arrival_date', e.target.value || null) }} className={dateCls} />}</td>}
                  {progressMode && (
                    <td className="px-2.5 py-1.5">
                      <div className="flex flex-col gap-1 items-start">
                        <RelatedTaskChips tasks={relatedTasksFor(receipts, 'real_estate_acquisition', r.id)} />
                        {receiptFilesFor(receipts, 'real_estate_acquisition', r.id).map((f, i) => <OpenStorageFile key={i} bucket={f.bucket} path={f.path} name={f.name} label="受領ファイル" />)}
                      </div>
                    </td>
                  )}
                  {/* 受領＝到着日があるか（受信簿で受領すると arrival_date が入り自動で受領済に）。オーダーシートでは非表示。 */}
                  {progressMode && (
                    <td className="px-2.5 py-1.5 text-center">
                      {isRef
                        ? <span className="text-gray-300 text-[11px]">—</span>
                        : r.arrival_date
                          ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">受領済</span>
                          : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受領</span>}
                    </td>
                  )}
                  <td className="px-2.5 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
                {progressMode && expanded === r.id && (
                  <tr className="border-b border-gray-100 bg-gray-50/40">
                    <td colSpan={9} className="px-4 py-3 space-y-2.5">
                      <CostBlock budget={r.cost_budget} refund={r.cost_refund} confirmed={r.cost_confirmed} mode={costMode}
                        onSave={(field, v) => saveMany(r.id, { [field]: v === '' ? null : Number(v) })} />
                      <div className="flex gap-2.5 flex-wrap">
                        <DoubleCheck label="請求時ダブルチェック（自分以外）" name={r.request_check_name} at={r.request_check_at}
                          onSet={(name, at) => saveMany(r.id, { request_check_name: name, request_check_at: at })} />
                        <DoubleCheck label="受信時ダブルチェック（自分以外）" name={r.receipt_check_name} at={r.receipt_check_at}
                          onSet={(name, at) => saveMany(r.id, { receipt_check_name: name, receipt_check_at: at })} />
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
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
