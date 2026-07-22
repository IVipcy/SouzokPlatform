'use client'

import { useState, useEffect } from 'react'
import { Trash2, Plus, ChevronRight, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'
import CheckRequestControl from './CheckRequestControl'
import { showToast } from '@/components/ui/Toast'
import { FieldGrid, InlineSelect, InlineEdit, InlineTextarea } from '@/components/ui/InlineFields'
import { KOSEKI_REQUEST_REASONS, KOSEKI_REQUEST_TYPES, KOSEKI_PURPOSES, KOSEKI_RANGES } from '@/lib/constants'
import { ACQUIRERS, acquirerLabel } from '@/lib/acquirer'
import { kosekiOfficeFromAddress } from '@/lib/address'
import SelectOrTextField from './SelectOrTextField'
import type { KosekiRequestRow, CaseRow, HeirRow, TaskRow, ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'
import { relatedTasksFor, receiptFilesFor, type RelatedTask, type ReceiptFile } from '@/lib/relatedTasks'
import RelatedTaskChips from './RelatedTaskChips'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'
import ContractReceivedBlock from './ContractReceivedBlock'

type Props = {
  caseId: string
  requests: KosekiRequestRow[]
  onRefresh?: () => void
  // オーダーシート埋め込み時は進捗列（請求日・到着日）を出さない
  orderSheetMode?: boolean
  // 役割分担（取得区分の一括反映用）
  roles?: CaseRow['intake_roles']
  // 対象者の選択肢（被相続人＋相続人一覧）
  deceasedName?: string | null
  // 被相続人の本籍・住所（請求先の自動入力に使う。自社取得=本籍地／依頼者取得=住所地）
  deceasedRegisteredAddress?: string | null
  deceasedAddress?: string | null
  heirs?: HeirRow[]
  // 受信簿＋タスク（受信トリガーで着手したタスクへの「関連タスク」リンク用）
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  // 契約時にお客様から受領した戸籍関係書類（区分=戸籍）。表の先頭に受領済として表示。
  contractDocs?: ContractDocumentRow[]
}

/**
 * 戸籍請求を「請求単位」でインライン編集・行追加する表。
 * 1行=1戸籍請求。請求先・対象者・種別・取得目的を主列に、請求理由・その他・特記は
 * 行展開で編集する。請求日・到着日は実務タブ（オーダーシート後）でのみ表示する。
 */
export default function KosekiRequestsTable({ caseId, requests, onRefresh, orderSheetMode = false, deceasedName, deceasedRegisteredAddress, deceasedAddress, heirs = [], receipts = [], contractDocs = [] }: Props) {
  const supabase = createClient()
  const meId = useCurrentMember(null)
  const [rows, setRows] = useState<KosekiRequestRow[]>(requests)
  const [busy, setBusy] = useState(false)
  // requests（DB再取得）と行集合を同期する。行の追加・削除はpropsに合わせつつ、
  // 既存行は編集中のローカル値を保持する（onBlur前の入力やセル即時保存値を消さない）。
  // これが無いと、行追加後の再取得などでローカルstateとDBが乖離し、最後に追加した行の
  // 入力が画面/保存と食い違う原因になる。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(prev => {
      const prevById = new Map(prev.map(r => [r.id, r]))
      return requests.map(r => prevById.get(r.id) ?? r)
    })
  }, [requests])
  const [expanded, setExpanded] = useState<string | null>(null)
  const progressMode = !orderSheetMode
  // 対象者の選択肢（被相続人＋相続人一覧の氏名）
  const targetOptions = [deceasedName, ...heirs.map(h => h.name)].filter((v): v is string => !!v && v.trim() !== '')

  const setLocal = (id: string, field: keyof KosekiRequestRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as KosekiRequestRow : r)))

  const commit = async (id: string, field: keyof KosekiRequestRow, value: string) => {
    const { error } = await supabase.from('koseki_requests').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const saveField = async (id: string, field: keyof KosekiRequestRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as KosekiRequestRow : r)))
    const { error } = await supabase.from('koseki_requests').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  // 請求先の元になる住所：自社取得＝本籍地に職務上請求／依頼者取得＝広域交付で住所地の役所に請求。
  const addrForOffice = (name: string, acquirer: string | null | undefined): string | null => {
    if (!name) return null
    const isClient = acquirer === '依頼者'
    if (name === deceasedName) return (isClient ? deceasedAddress : deceasedRegisteredAddress) ?? null
    const h = heirs.find(x => x.name === name)
    return (isClient ? h?.address : h?.registered_address) ?? null
  }
  const officeOf = (name: string, acquirer: string | null | undefined): string | null => kosekiOfficeFromAddress(addrForOffice(name, acquirer))
  // 現在の請求先が「自動入力された値」か（空、またはその対象者の本籍/住所いずれかの役所と一致）。手入力は上書きしない判定に使う。
  const isAutoRequestTo = (cur: string | null | undefined, name: string | null | undefined): boolean => {
    const c = (cur ?? '').trim()
    if (c === '') return true
    if (!name) return false
    return c === officeOf(name, '自社') || c === officeOf(name, '依頼者')
  }
  const applyPatch = async (r: KosekiRequestRow, patch: Partial<KosekiRequestRow>) => {
    setRows(prev => prev.map(x => (x.id === r.id ? { ...x, ...patch } as KosekiRequestRow : x)))
    const { error } = await supabase.from('koseki_requests').update(patch).eq('id', r.id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }
  // 対象者を選んだら、取得区分に応じた市区町村役所を請求先へ自動入力（空 or 自動入力済みのときだけ。手入力は上書きしない）。
  const pickTarget = async (r: KosekiRequestRow, name: string) => {
    const auto = isAutoRequestTo(r.request_to, r.target_person)
    const office = name ? officeOf(name, r.acquirer ?? '自社') : null
    await applyPatch(r, { target_person: (name || null) as KosekiRequestRow['target_person'], ...(auto && office ? { request_to: office } : {}) })
  }
  // 取得区分を変えたら請求先の元（本籍⇄住所）が変わるので、自動入力済みなら請求先も入れ替える。
  const pickAcquirer = async (r: KosekiRequestRow, acquirer: string) => {
    const auto = isAutoRequestTo(r.request_to, r.target_person)
    const office = r.target_person ? officeOf(r.target_person, acquirer) : null
    await applyPatch(r, { acquirer, ...(auto && office ? { request_to: office } : {}) })
  }

  // 確認依頼を出す／取り消す（発送＝request・着＝receipt）。確認簿の受信箱に上げる/下ろす。
  const reqCheck = (r: KosekiRequestRow, kind: 'request' | 'receipt') => {
    const at = new Date().toISOString()
    const patch = kind === 'request'
      ? { request_check_requested_at: at, request_check_requested_by: meId }
      : { receipt_check_requested_at: at, receipt_check_requested_by: meId }
    void applyPatch(r, patch as Partial<KosekiRequestRow>)
  }
  const cancelCheck = (r: KosekiRequestRow, kind: 'request' | 'receipt') => {
    const patch = kind === 'request'
      ? { request_check_requested_at: null, request_check_requested_by: null }
      : { receipt_check_requested_at: null, receipt_check_requested_by: null }
    void applyPatch(r, patch as Partial<KosekiRequestRow>)
  }

  const addRow = async () => {
    setBusy(true)
    // 取得区分の既定は常に「自社取得」。役割分担（面談時の戸籍担当）には引っ張られない。
    const { data, error } = await supabase
      .from('koseki_requests')
      .insert({ case_id: caseId, sort_order: rows.length, acquirer: '自社' })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as KosekiRequestRow])
    onRefresh?.()
  }

  const delRow = async (row: KosekiRequestRow) => {
    if (!confirm(`「${row.request_to || '未入力の戸籍請求'}」を削除しますか？`)) return
    const { error } = await supabase.from('koseki_requests').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  const colCount = progressMode ? 12 : 8

  return (
    <div>
      {/* 契約時に受領済の戸籍（依頼者取得分）は別ブロックで上に表示。新規請求の表とは分ける。 */}
      <ContractReceivedBlock docs={contractDocs} caseId={caseId} onRefresh={onRefresh} />
      {/* PC(sm以上)は表・スマホはカード。オーダーシート・案件詳細とも同じ（表に統一）。 */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: progressMode ? 1240 : 820 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-1 py-2 w-7" />
              <th className="px-2.5 py-2 text-left font-semibold w-32">対象者</th>
              <th className="px-2.5 py-2 text-left font-semibold w-44">請求先</th>
              <th className="px-2.5 py-2 text-left font-semibold w-36">範囲</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">種別</th>
              <th className="px-2.5 py-2 text-left font-semibold">取得目的</th>
              <th className="px-2.5 py-2 text-left font-semibold w-28">取得区分</th>
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-28">請求日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-28">到着日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-20">受信</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-36">関連タスク</th>}
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((r, i) => (
                <Row key={r.id} r={r} odd={i % 2 === 1} progressMode={progressMode}
                  open={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  setLocal={setLocal} commit={commit} saveField={saveField} onPickTarget={v => pickTarget(r, v)} onPickAcquirer={v => pickAcquirer(r, v)}
                  onReqCheck={kind => reqCheck(r, kind)} onCancelCheck={kind => cancelCheck(r, kind)}
                  onDelete={() => delRow(r)} colCount={colCount} targetOptions={targetOptions} relatedTasks={relatedTasksFor(receipts, 'koseki', r.id)} receiptFiles={receiptFilesFor(receipts, 'koseki', r.id)} />
              ))
            ) : (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-[13px] text-gray-400">戸籍請求が登録されていません</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* スマホのみ: カード表示（1請求＝1カード）。PCは上の表。 */}
      <div className="sm:hidden space-y-2.5">
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-gray-400">戸籍請求が登録されていません</div>
        ) : (
          rows.map(r => (
            <KosekiCard key={r.id} r={r} progressMode={progressMode} setLocal={setLocal} commit={commit} saveField={saveField} onPickTarget={v => pickTarget(r, v)} onPickAcquirer={v => pickAcquirer(r, v)} onReqCheck={kind => reqCheck(r, kind)} onCancelCheck={kind => cancelCheck(r, kind)} onDelete={() => delRow(r)} targetOptions={targetOptions} />
          ))
        )}
      </div>

      <div className="mt-2">
        <button type="button" onClick={addRow} disabled={busy} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> 戸籍請求を追加
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        請求先は対象者を選ぶと自動入力します（自社取得＝本籍地に職務上請求／依頼者取得＝広域交付で住所地の役所）。手入力で上書きも可能です。
      </p>
      <p className="mt-1 text-[11px] text-gray-400">
        取得区分「依頼者取得」は、依頼者が取得して送付→「書類受信簿」で受信すると到着日が入り受信済になります。
        {progressMode ? '自社取得は請求日→到着日で管理します。' : ''}
      </p>
    </div>
  )
}

function Row({ r, odd, progressMode, open, onToggle, setLocal, commit, saveField, onPickTarget, onPickAcquirer, onReqCheck, onCancelCheck, onDelete, colCount, targetOptions, relatedTasks, receiptFiles }: {
  r: KosekiRequestRow
  odd: boolean
  progressMode: boolean
  open: boolean
  onToggle: () => void
  setLocal: (id: string, field: keyof KosekiRequestRow, value: string) => void
  commit: (id: string, field: keyof KosekiRequestRow, value: string) => void
  saveField: (id: string, field: keyof KosekiRequestRow, value: unknown) => Promise<void>
  onPickTarget: (value: string) => void
  onPickAcquirer: (value: string) => void
  onReqCheck: (kind: 'request' | 'receipt') => void
  onCancelCheck: (kind: 'request' | 'receipt') => void
  onDelete: () => void
  colCount: number
  targetOptions: string[]
  relatedTasks: RelatedTask[]
  receiptFiles: ReceiptFile[]
}) {
  // 依頼者取得は自社のW-checkが無い（確認簿にも上げない）ので依頼ボタンも出さない。
  const isSelf = (r.acquirer ?? '自社') !== '依頼者'
  return (
    <>
      <tr className={`border-b border-gray-100 ${odd ? 'bg-gray-50/40' : ''}`}>
        <td className="px-1 py-1.5 text-center">
          <button type="button" onClick={onToggle} className="text-gray-400 hover:text-brand-600" title="請求理由・特記">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <TargetCell value={r.target_person} options={targetOptions} onPick={onPickTarget} />
        <Cell value={r.request_to} onChange={v => setLocal(r.id, 'request_to', v)} onCommit={v => commit(r.id, 'request_to', v)} placeholder="対象者を選ぶと自動入力" />
        <td className="px-2.5 py-1.5"><SelectOrTextField value={r.range_text} options={KOSEKI_RANGES} onSave={v => saveField(r.id, 'range_text', v)} placeholder="出生から死亡まで 等" /></td>
        <SelectCell value={r.doc_types} options={KOSEKI_REQUEST_TYPES} onSave={v => saveField(r.id, 'doc_types', v)} />
        <SelectCell value={r.purpose} options={KOSEKI_PURPOSES} onSave={v => saveField(r.id, 'purpose', v)} />
        <AcquirerCell value={r.acquirer} onSave={onPickAcquirer} />
        {progressMode && (
          <DateReqCell value={r.request_date} onCommit={v => commit(r.id, 'request_date', v)}
            show={isSelf && !!r.request_date} label="発送チェックを依頼"
            requestedAt={r.request_check_requested_at} checkedAt={r.request_check_at} checkedName={r.request_check_name}
            onRequest={() => onReqCheck('request')} onCancel={() => onCancelCheck('request')} />
        )}
        {progressMode && (
          <DateReqCell value={r.arrival_date} onCommit={v => commit(r.id, 'arrival_date', v)}
            show={isSelf && !!r.arrival_date} label="到着チェックを依頼"
            requestedAt={r.receipt_check_requested_at} checkedAt={r.receipt_check_at} checkedName={r.receipt_check_name}
            onRequest={() => onReqCheck('receipt')} onCancel={() => onCancelCheck('receipt')} />
        )}
        {progressMode && <ReceivedCell received={!!r.arrival_date} />}
        {progressMode && (
          <td className="px-2.5 py-1.5">
            <div className="flex flex-col gap-1 items-start">
              <RelatedTaskChips tasks={relatedTasks} />
              {receiptFiles.map((f, i) => <OpenStorageFile key={i} bucket={f.bucket} path={f.path} name={f.name} label="受領ファイル" />)}
            </div>
          </td>
        )}
        <td className="px-2.5 py-1.5 text-center">
          <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-100 bg-gray-50/40">
          <td colSpan={colCount} className="px-4 py-3">
            <FieldGrid>
              {/* 戸籍請求理由は取得目的（メイン列）と用途が重複するため、オーダーシート(progressMode=false)では非表示。案件詳細でのみ表示。 */}
              {progressMode && (
                <>
                  <InlineSelect label="戸籍請求理由" value={r.request_reason} options={[...KOSEKI_REQUEST_REASONS]} onSave={v => saveField(r.id, 'request_reason', v)} fullWidth />
                  <InlineEdit label="戸籍請求理由（その他）" value={r.request_reason_other} onSave={v => saveField(r.id, 'request_reason_other', v)} fullWidth />
                </>
              )}
              <InlineTextarea label="備考・結果（この戸籍で分かったこと）" value={r.read_result} onSave={v => saveField(r.id, 'read_result', v)} fullWidth />
              <InlineTextarea label="戸籍特記事項" value={r.notes} onSave={v => saveField(r.id, 'notes', v)} fullWidth />
            </FieldGrid>
          </td>
        </tr>
      )}
    </>
  )
}

// スマホ用：戸籍請求1件＝1カード
function KFieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[13px] font-medium text-slate-600 mb-1">{label}</div>{children}</div>
}

function KosekiCard({ r, progressMode, setLocal, commit, saveField, onPickTarget, onPickAcquirer, onReqCheck, onCancelCheck, onDelete, targetOptions }: {
  r: KosekiRequestRow
  progressMode: boolean
  setLocal: (id: string, field: keyof KosekiRequestRow, value: string) => void
  commit: (id: string, field: keyof KosekiRequestRow, value: string) => void
  saveField: (id: string, field: keyof KosekiRequestRow, value: unknown) => Promise<void>
  onPickTarget: (value: string) => void
  onPickAcquirer: (value: string) => void
  onReqCheck: (kind: 'request' | 'receipt') => void
  onCancelCheck: (kind: 'request' | 'receipt') => void
  onDelete: () => void
  targetOptions: string[]
}) {
  const inputCls = 'w-full h-12 px-3 text-[15px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-brand-500 focus:bg-white transition'
  const selectCls = 'w-full h-12 px-3 text-[15px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-500'
  // オーダーシート(progressMode=false)は1項目=1行。案件詳細のスマホは従来どおり2列。
  const gridCls = progressMode ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-1 gap-2.5'
  const targetOpts = r.target_person && !targetOptions.includes(r.target_person) ? [...targetOptions, r.target_person] : targetOptions
  const isSelf = (r.acquirer ?? '自社') !== '依頼者'
  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white">
      <div className="flex items-center justify-end -mt-1 mb-1">
        <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 p-1" title="削除"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2.5">
        <div className={gridCls}>
          <KFieldBlock label="対象者">
            <select value={r.target_person ?? ''} onChange={e => onPickTarget(e.target.value)} className={selectCls}>
              <option value="">— 選択 —</option>
              {targetOpts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </KFieldBlock>
          <KFieldBlock label="取得区分">
            <select value={r.acquirer ?? '自社'} onChange={e => onPickAcquirer(e.target.value)} className={selectCls}>
              {ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}
            </select>
          </KFieldBlock>
        </div>
        <KFieldBlock label="請求先"><input type="text" value={r.request_to ?? ''} onChange={e => setLocal(r.id, 'request_to', e.target.value)} onBlur={e => commit(r.id, 'request_to', e.target.value)} placeholder="対象者を選ぶと自動入力" className={inputCls} /></KFieldBlock>
        <KFieldBlock label="範囲"><SelectOrTextField value={r.range_text} options={KOSEKI_RANGES} onSave={v => saveField(r.id, 'range_text', v)} placeholder="出生から死亡まで 等" className="h-12 px-3 text-[15px] border border-gray-200 rounded-lg" /></KFieldBlock>
        <div className={gridCls}>
          <KFieldBlock label="種別">
            <select value={r.doc_types ?? ''} onChange={e => saveField(r.id, 'doc_types', e.target.value)} className={selectCls}>
              <option value="">—</option>
              {KOSEKI_REQUEST_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </KFieldBlock>
          <KFieldBlock label="取得目的">
            <select value={r.purpose ?? ''} onChange={e => saveField(r.id, 'purpose', e.target.value)} className={selectCls}>
              <option value="">—</option>
              {KOSEKI_PURPOSES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </KFieldBlock>
        </div>
        {progressMode && (
          <div className="grid grid-cols-2 gap-2.5">
            <KFieldBlock label="請求日">
              <input type="date" defaultValue={r.request_date ?? ''} onBlur={e => { if (e.target.value !== (r.request_date ?? '')) commit(r.id, 'request_date', e.target.value) }} className={inputCls} />
              {isSelf && r.request_date && (
                <div className="mt-1.5"><CheckRequestControl label="発送チェックを依頼" requestedAt={r.request_check_requested_at} checkedAt={r.request_check_at} checkedName={r.request_check_name} onRequest={() => onReqCheck('request')} onCancel={() => onCancelCheck('request')} /></div>
              )}
            </KFieldBlock>
            <KFieldBlock label="到着日">
              <input type="date" defaultValue={r.arrival_date ?? ''} onBlur={e => { if (e.target.value !== (r.arrival_date ?? '')) commit(r.id, 'arrival_date', e.target.value) }} className={inputCls} />
              {isSelf && r.arrival_date && (
                <div className="mt-1.5"><CheckRequestControl label="到着チェックを依頼" requestedAt={r.receipt_check_requested_at} checkedAt={r.receipt_check_at} checkedName={r.receipt_check_name} onRequest={() => onReqCheck('receipt')} onCancel={() => onCancelCheck('receipt')} /></div>
              )}
            </KFieldBlock>
          </div>
        )}
        <FieldGrid cols={1}>
          {progressMode && (
            <>
              <InlineSelect label="戸籍請求理由" value={r.request_reason} options={[...KOSEKI_REQUEST_REASONS]} onSave={v => saveField(r.id, 'request_reason', v)} />
              <InlineEdit label="戸籍請求理由（その他）" value={r.request_reason_other} onSave={v => saveField(r.id, 'request_reason_other', v)} />
            </>
          )}
          {/* 備考・結果は調査後の結果欄。オーダーシート(progressMode=false)では出さない。 */}
          {progressMode && <InlineTextarea label="備考・結果（この戸籍で分かったこと）" value={r.read_result} onSave={v => saveField(r.id, 'read_result', v)} />}
          <InlineTextarea label="戸籍特記事項" value={r.notes} onSave={v => saveField(r.id, 'notes', v)} />
        </FieldGrid>
      </div>
    </div>
  )
}

function SelectCell({ value, options, onSave }: { value: string | null; options: readonly string[]; onSave: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <select value={value ?? ''} onChange={e => onSave(e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  )
}


// 対象者（誰の戸籍か）。被相続人＋相続人一覧から選択。選ぶと請求先が自動入力される（onPick）。既存の自由入力値があれば末尾に保持。
function TargetCell({ value, options, onPick }: { value: string | null; options: string[]; onPick: (v: string) => void }) {
  const opts = value && !options.includes(value) ? [...options, value] : options
  return (
    <td className="px-2.5 py-1.5">
      <select value={value ?? ''} onChange={e => onPick(e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        <option value="">— 選択 —</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </td>
  )
}

function Cell({ value, onChange, onCommit, placeholder }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onCommit(e.target.value)}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
      />
    </td>
  )
}

// 日付セル＋その下に確認依頼コントロール（発送＝請求日／着＝到着日の真下に同居）。
function DateReqCell({ value, onCommit, show, label, requestedAt, checkedAt, checkedName, onRequest, onCancel }: {
  value: string | null
  onCommit: (v: string) => void
  show: boolean
  label: string
  requestedAt: string | null
  checkedAt: string | null
  checkedName: string | null
  onRequest: () => void
  onCancel: () => void
}) {
  return (
    <td className="px-2.5 py-1.5 align-top">
      <input
        type="date"
        defaultValue={value ?? ''}
        onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
      />
      {show && (
        <div className="mt-1">
          <CheckRequestControl label={label} requestedAt={requestedAt} checkedAt={checkedAt} checkedName={checkedName} onRequest={onRequest} onCancel={onCancel} />
        </div>
      )}
    </td>
  )
}

function AcquirerCell({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <select value={value ?? '自社'} onChange={e => onSave(e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
        {ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}
      </select>
    </td>
  )
}

function ReceivedCell({ received }: { received: boolean }) {
  return (
    <td className="px-2.5 py-1.5">
      {received
        ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">受信済</span>
        : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受信</span>}
    </td>
  )
}
