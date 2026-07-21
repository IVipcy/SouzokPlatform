'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useAuth } from '@/components/providers/AuthProvider'
import { ACQUISITION_ITEMS, ACQUISITION_ITEM_KEYS } from '@/lib/constants'
import type { RealEstateAcquisitionRow, RealEstatePropertyRow, TaskRow, ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'
import { receiptFilesFor } from '@/lib/relatedTasks'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'
import ContractReceivedBlock from './ContractReceivedBlock'
import SelectOrTextField from './SelectOrTextField'
import CheckRequestControl from './CheckRequestControl'
import { MoneyCell } from './PracticeTableCells'
import HintTip from '@/components/ui/HintTip'
import { municipalityOf } from './RealEstateSection'

const yen = (n: number | null | undefined) => (n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`)

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
  // 取得資料を1行足した後に呼ぶ（親が「この系統のタスク無ければ作成しますか？」を出す）
  onAfterAddRow?: () => void
  // 初期生成後に事務が足す取得資料は承認ゲート対象（is_additional=true・タスクは承認後）
  additionsNeedApproval?: boolean
  // 承認待ちの取得資料を足したとき（親が管理担当へ通知を出す）
  onAdditionalPending?: () => void
}

const itemMeta = (key: string | null) => ACQUISITION_ITEMS.find(i => i.key === key)
const propLabel = (p: RealEstatePropertyRow) => p.address || p.lot_number || p.property_type || '未入力の物件'

/**
 * 不動産の取得資料管理（戸籍請求一覧と同じ思想）。1行＝1取得物。
 * 何を（取得物）・どこに（請求先）・いつ請求し・受け取れたか（到着日/取得済）を管理。
 * 路線価は「参照」なので請求先・日付はグレーアウトし、取得済のみ管理。
 * 物件単位（登記情報/公図/地積/路線価）は対象物件を選択、市区町村単位（評価証明/名寄帳）は市区町村を入力。
 */
export default function RealEstateAcquisitionsTable({ caseId, acquisitions, properties, onRefresh, orderSheetMode = false, receipts = [], contractDocs = [], scope = 'all', municipalityFilter, onAfterAddRow, additionsNeedApproval = false, onAdditionalPending }: Props) {
  const supabase = createClient()
  const authUser = useAuth()
  const meId = authUser?.memberId ?? null
  const [rows, setRows] = useState<RealEstateAcquisitionRow[]>(acquisitions)
  useEffect(() => { setRows(acquisitions) }, [acquisitions])
  const progressMode = !orderSheetMode
  const costMode = scope === 'property' ? 'confirmedOnly' : 'full'  // 物件取得=印紙(確定のみ)、市区町村請求=小為替(予算/返金/確定)
  const fullCost = costMode === 'full'
  const confirmedOf = (r: RealEstateAcquisitionRow) => fullCost ? (r.cost_budget != null ? r.cost_budget - (r.cost_refund ?? 0) : r.cost_confirmed) : r.cost_confirmed

  // 請求先の既定値：①市区町村役場＝「{市区町村}役所」（都道府県プレフィックスは省く）、②法務局＝物件の管轄法務局（registration_office）。
  const stripPref = (m: string) => m.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, '')
  const officeDefault = (muni?: string | null, propId?: string | null) => {
    if (scope === 'municipality') { const m = stripPref((muni ?? municipalityFilter ?? '').trim()); return m ? `${m}役所` : '市区町村役所' }
    if (scope === 'property') {
      // 対象物件の管轄法務局があればそれ、無ければ同市区町村の物件から拾う（A案：局名を表示・請求先に）。
      if (propId) { const p = properties.find(x => x.id === propId); const o = (p?.registration_office ?? '').trim(); if (o) return o }
      const pool = muni ? properties.filter(x => municipalityOf(x) === muni) : properties
      const o2 = (pool.find(x => (x.registration_office ?? '').trim())?.registration_office ?? '').trim()
      return o2 || '法務局'
    }
    return ''
  }
  // ①市区町村役場タブ：請求先が空／汎用（「市区町村役所」）の行を、この市区町村の「◯◯役所」に自動補完。
  useEffect(() => {
    if (scope !== 'municipality' || !municipalityFilter) return
    const want = officeDefault(municipalityFilter)
    const ids = acquisitions.filter(r => {
      if ((r.target_municipality ?? '') !== municipalityFilter) return false
      if (r.scope && r.scope !== 'municipality') return false
      if (!r.scope && itemMeta(r.item_type)?.target !== '市区町村') return false
      const cur = (r.request_to ?? '').trim()
      return cur === '' || cur === '市区町村役所' || cur === '市区町村役場'
    }).map(r => r.id)
    if (ids.length === 0) return
    supabase.from('real_estate_acquisitions').update({ request_to: want }).in('id', ids).then(({ error }) => {
      if (!error) setRows(prev => prev.map(r => (ids.includes(r.id) ? { ...r, request_to: want } : r)))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acquisitions, municipalityFilter, scope])

  const saveMany = async (id: string, patch: Partial<RealEstateAcquisitionRow>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } as RealEstateAcquisitionRow : r)))
    const { error } = await supabase.from('real_estate_acquisitions').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }

  // 確認依頼を出す／取り消す（発送＝request・着＝receipt）。確認簿の受信箱に上げる/下ろす。
  const reqCheck = (r: RealEstateAcquisitionRow, kind: 'request' | 'receipt') => {
    const at = new Date().toISOString()
    void saveMany(r.id, kind === 'request'
      ? { request_check_requested_at: at, request_check_requested_by: meId }
      : { receipt_check_requested_at: at, receipt_check_requested_by: meId })
  }
  const cancelCheck = (r: RealEstateAcquisitionRow, kind: 'request' | 'receipt') => {
    void saveMany(r.id, kind === 'request'
      ? { request_check_requested_at: null, request_check_requested_by: null }
      : { receipt_check_requested_at: null, receipt_check_requested_by: null })
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
  // 確定費用の合計（＝この表の立替実費の実績）。戸籍タブと表示を揃える。
  const confirmedTotal = visibleRows.reduce((s, r) => s + (confirmedOf(r) ?? 0), 0)

  const save = async (id: string, field: keyof RealEstateAcquisitionRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstateAcquisitionRow : r)))
    const { error } = await supabase.from('real_estate_acquisitions').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  // 取得物を変更したら、請求先の既定値（①「◯◯役所」／②「法務局」／単体はitemの既定office）も自動セット
  const changeItem = async (id: string, key: string) => {
    const meta = itemMeta(key)
    const row = rows.find(r => r.id === id)
    const fallbackOffice = (scope === 'municipality' || scope === 'property') ? officeDefault(row?.target_municipality, row?.target_property_id) : (meta?.office ?? '')
    setRows(prev => prev.map(r => (r.id === id ? { ...r, item_type: key, request_to: r.request_to || fallbackOffice } : r)))
    await supabase.from('real_estate_acquisitions').update({ item_type: key || null, request_to: undefined }).eq('id', id)
    if (fallbackOffice) await supabase.from('real_estate_acquisitions').update({ request_to: fallbackOffice }).eq('id', id).is('request_to', null)
  }

  const addRow = async () => {
    const init: Partial<RealEstateAcquisitionRow> = { case_id: caseId, sort_order: rows.length }
    if (scope === 'municipality' || scope === 'property') init.scope = scope
    // 新規行をこの市区町村タブに固定（②物件はあとで物件を選ぶ）＋請求先の既定値をセット
    if (municipalityFilter != null) { init.target_municipality = municipalityFilter; const o = officeDefault(municipalityFilter); if (o) init.request_to = o }
    // 初期生成後に事務が足す＝承認ゲート対象（承認までタスクは作らない）
    if (additionsNeedApproval) init.is_additional = true
    const { error } = await supabase.from('real_estate_acquisitions').insert(init)
    if (error) { showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    onRefresh?.()
    if (additionsNeedApproval) { onAdditionalPending?.(); showToast('追加取得資料を登録しました（要承認・管理担当へ通知）。取得物を選ぶと承認できます。', 'success'); return }
    // この系統のタスクが無ければ親が作成ポップアップを出す（承認要のときはパネル経由なので出さない）
    if (municipalityFilter) onAfterAddRow?.()
  }

  const delRow = async (id: string) => {
    if (!confirm('この取得資料を削除しますか？')) return
    const { error } = await supabase.from('real_estate_acquisitions').delete().eq('id', id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const dateCls = 'w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white'
  const selCls = 'w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'

  // 行の状態を 請求日・到着日・依頼→確認モデル から自動判定して1つのチップに。
  // 「請求日ありで請求済」ではなく、発送チェック✓が付いて初めて「請求済」。到着後は到着チェック✓で「確認済」。
  const statusChip = (r: RealEstateAcquisitionRow, isRef: boolean) => {
    if (isRef) return { label: r.arrival_date ? '取得済' : '参照', cls: 'bg-gray-50 text-gray-400 border-gray-200' }
    if (r.receipt_check_at) return { label: '確認済', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    if (r.arrival_date) return { label: '到着チェック待ち', cls: 'bg-amber-50 text-amber-800 border-amber-200' }
    if (r.request_check_at) return { label: '請求済', cls: 'bg-brand-50 text-brand-700 border-brand-200' }
    if (r.request_date) return { label: '発送チェック待ち', cls: 'bg-amber-50 text-amber-800 border-amber-200' }
    return { label: '未請求', cls: 'bg-gray-50 text-gray-500 border-gray-200' }
  }

  const colCount = progressMode ? (fullCost ? 13 : 11) : 4  // 取得物/対象/請求先(+状態/日付/費用/W-Check/受領)/削除

  return (
    <div>
      {/* 契約時に受領済の不動産関係書類（依頼者取得分）は別ブロックで上に表示。新規請求の表とは分ける。 */}
      <ContractReceivedBlock docs={contractDocs} caseId={caseId} onRefresh={onRefresh} />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: progressMode ? (fullCost ? 1260 : 1040) : 640 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2 py-2 text-left font-semibold w-44">取得物</th>
              <th className="px-2 py-2 text-left font-semibold w-40">対象</th>
              <th className="px-2 py-2 text-left font-semibold w-36"><span className="inline-flex items-center gap-1">請求先<HintTip text={scope === 'municipality' ? '請求する市区町村役所。物件の所在地から自動で入ります（編集可）。' : scope === 'property' ? '請求する法務局。必要なら管轄の法務局名に修正してください。' : 'どこに請求するか（役所・法務局など）。'} /></span></th>
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-[72px]">状態</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-24">請求日</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-24">到着日</th>}
              {progressMode && fullCost && <th className="px-2 py-2 text-right font-semibold w-24"><span className="inline-flex items-center gap-1">費用予算<HintTip text="請求時に用意した小為替等の金額（例: 定額小為替の合計）。" /></span></th>}
              {progressMode && fullCost && <th className="px-2 py-2 text-right font-semibold w-20">返金</th>}
              {progressMode && <th className="px-2 py-2 text-right font-semibold w-24"><span className="inline-flex items-center gap-1">確定費用<HintTip text={fullCost ? '実費＝予算−返金（お釣り）。自動計算されます。' : '実際にかかった額（印紙代など）を入力します。'} /></span></th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-28"><span className="inline-flex items-center gap-1">発送チェック<HintTip text="請求（発送）が正しいか、確認簿で別の担当者に確認してもらう依頼を出します。請求日を入れると押せます。" /></span></th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-28"><span className="inline-flex items-center gap-1">到着チェック<HintTip text="届いた物が正しいか、確認簿で別の担当者に確認してもらう依頼を出します。到着日を入れると押せます。" /></span></th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-28">受領ファイル</th>}
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-[13px] text-gray-400">取得資料が登録されていません</td></tr>
            ) : visibleRows.map((r, i) => {
              const meta = itemMeta(r.item_type)
              const isRef = meta?.method === '参照'   // 路線価など参照は請求先・日付なし
              const isProp = meta?.target === '物件'
              const dash = <span className="text-gray-300 text-[11px]">—</span>
              return (
                <tr key={r.id} className={`border-b border-gray-100 [&>td]:align-top ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  {/* 取得物 */}
                  <td className="px-2 py-1.5">
                    <SelectOrTextField value={r.item_type} options={itemKeys} onSave={v => changeItem(r.id, v)} placeholder="取得物" />
                    {r.is_additional && !r.additional_approved_at && <div className="mt-0.5"><span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">追加・承認待ち</span></div>}
                    {isRef
                      ? <div className="text-[10px] text-gray-400 mt-0.5">参照（路線価図）</div>
                      : (!progressMode && meta && <div className="text-[10px] text-gray-400 mt-0.5">{meta.method}</div>)}
                  </td>
                  {/* 対象 */}
                  <td className="px-2 py-1.5">
                    {(scope === 'property' || (scope === 'all' && isProp)) ? (
                      <select value={r.target_property_id ?? ''} onChange={e => save(r.id, 'target_property_id', e.target.value || null)} className={selCls}>
                        <option value="">— 物件を選択 —</option>
                        {muniProps.map(p => <option key={p.id} value={p.id}>{propLabel(p)}</option>)}
                      </select>
                    ) : (
                      <input type="text" defaultValue={r.target_municipality ?? ''} onBlur={e => { if (e.target.value !== (r.target_municipality ?? '')) save(r.id, 'target_municipality', e.target.value || null) }} placeholder="例: 名古屋市中区" className={dateCls} />
                    )}
                  </td>
                  {/* 請求先（独立列。①は「◯◯役所」、②は「法務局」を既定でセット） */}
                  <td className="px-2 py-1.5">
                    {isRef ? <span className="text-[11px] text-gray-300">— 参照 —</span>
                      : <input key={r.request_to ?? ''} type="text" defaultValue={r.request_to ?? ''} onBlur={e => { if (e.target.value !== (r.request_to ?? '')) save(r.id, 'request_to', e.target.value || null) }} placeholder={officeDefault(r.target_municipality, r.target_property_id) || meta?.office || '請求先'} className={dateCls} />}
                  </td>
                  {/* 状態チップ */}
                  {progressMode && (() => { const s = statusChip(r, isRef); return (
                    <td className="px-2 py-1.5"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${s.cls}`}>{s.label}</span></td>
                  ) })()}
                  {/* 請求日（入力者を請求作業者として記録） */}
                  {progressMode && <td className="px-2 py-1.5">{isRef ? dash : <input type="date" defaultValue={r.request_date ?? ''} onBlur={e => { const v = e.target.value; if (v !== (r.request_date ?? '')) saveMany(r.id, { request_date: v || null, ...(v && !r.request_done_by ? { request_done_by: meId } : {}) }) }} className={dateCls} />}</td>}
                  {/* 到着日（入力者を受信作業者として記録） */}
                  {progressMode && <td className="px-2 py-1.5">{isRef ? dash : <input type="date" defaultValue={r.arrival_date ?? ''} onBlur={e => { const v = e.target.value; if (v !== (r.arrival_date ?? '')) saveMany(r.id, { arrival_date: v || null, ...(v && !r.receipt_done_by ? { receipt_done_by: meId } : {}) }) }} className={dateCls} />}</td>}
                  {/* 費用予算（fullCostのみ） */}
                  {progressMode && fullCost && <td className="px-2 py-1.5 text-right">{isRef ? dash : <MoneyCell value={r.cost_budget} onCommit={v => saveMany(r.id, { cost_budget: v === '' ? null : Number(v) })} />}</td>}
                  {/* 返金（fullCostのみ） */}
                  {progressMode && fullCost && <td className="px-2 py-1.5 text-right">{isRef ? dash : <MoneyCell value={r.cost_refund} onCommit={v => saveMany(r.id, { cost_refund: v === '' ? null : Number(v) })} />}</td>}
                  {/* 確定費用（fullCost=予算−返金の自動計算／confirmedOnly=直接入力） */}
                  {progressMode && (
                    <td className="px-2 py-1.5 text-right">
                      {isRef ? dash : fullCost
                        ? <span className="font-semibold text-emerald-700 tabular-nums">{yen(confirmedOf(r))}</span>
                        : <MoneyCell value={r.cost_confirmed} onCommit={v => saveMany(r.id, { cost_confirmed: v === '' ? null : Number(v) })} />}
                    </td>
                  )}
                  {/* 発送チェック依頼（請求日を入れると押せる。確認は確認簿で別の担当者が行う） */}
                  {progressMode && <td className="px-2 py-1.5">{isRef ? dash : (r.request_date
                    ? <CheckRequestControl label="発送チェックを依頼" requestedAt={r.request_check_requested_at} checkedAt={r.request_check_at} checkedName={r.request_check_name} onRequest={() => reqCheck(r, 'request')} onCancel={() => cancelCheck(r, 'request')} />
                    : <span className="text-[11px] text-gray-300">請求日待ち</span>)}</td>}
                  {/* 着チェック依頼（到着日を入れると押せる） */}
                  {progressMode && <td className="px-2 py-1.5">{isRef ? dash : (r.arrival_date
                    ? <CheckRequestControl label="到着チェックを依頼" requestedAt={r.receipt_check_requested_at} checkedAt={r.receipt_check_at} checkedName={r.receipt_check_name} onRequest={() => reqCheck(r, 'receipt')} onCancel={() => cancelCheck(r, 'receipt')} />
                    : <span className="text-[11px] text-gray-300">到着待ち</span>)}</td>}
                  {/* 受領ファイル */}
                  {progressMode && (
                    <td className="px-2 py-1.5">
                      {(() => {
                        const files = receiptFilesFor(receipts, 'real_estate_acquisition', r.id)
                        return files.length > 0
                          ? <div className="flex flex-col gap-1 items-start">{files.map((f, k) => <OpenStorageFile key={k} bucket={f.bucket} path={f.path} name={f.name} label="受領ファイル" />)}</div>
                          : <span className="text-[11px] text-gray-300">—</span>
                      })()}
                    </td>
                  )}
                  {/* 削除 */}
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {progressMode && visibleRows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-gray-700">
                <td className="px-2 py-2 text-right" colSpan={fullCost ? 8 : 6}>確定費用 合計（立替実費の実績）</td>
                <td className="px-2 py-2 text-right text-emerald-700 tabular-nums">{yen(confirmedTotal)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button type="button" onClick={addRow} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
        <Plus className="w-3.5 h-3.5" /> 取得資料を追加
      </button>
    </div>
  )
}
