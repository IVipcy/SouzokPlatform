'use client'

import { useState } from 'react'
import { Trash2, Plus, ChevronRight, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { FieldGrid, InlineSelect, InlineEdit, InlineTextarea } from '@/components/ui/InlineFields'
import { KOSEKI_REQUEST_REASONS, KOSEKI_REQUEST_TYPES, KOSEKI_PURPOSES, KOSEKI_RANGES } from '@/lib/constants'
import { ACQUIRERS, acquirerLabel, acquirerFromRoles, ACQUIRER_GYOMU } from '@/lib/acquirer'
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
  heirs?: HeirRow[]
  // 受信簿＋タスク（受信トリガーで着手したタスクへの「関連タスク」リンク用）
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  // 契約時にお客様から受領した戸籍関係書類（区分=戸籍）。表の先頭に受領済として表示。
  contractDocs?: ContractDocumentRow[]
  // パート制：複数パート案件のとき、行に「取得パート」バッジを出す。新規行は現在パートで記録。
  multiPart?: boolean
  currentPartKey?: string | null
}

/**
 * 戸籍請求を「請求単位」でインライン編集・行追加する表。
 * 1行=1戸籍請求。請求先・対象者・種別・取得目的を主列に、請求理由・その他・特記は
 * 行展開で編集する。請求日・到着日は実務タブ（オーダーシート後）でのみ表示する。
 */
export default function KosekiRequestsTable({ caseId, requests, onRefresh, orderSheetMode = false, roles, deceasedName, heirs = [], receipts = [], contractDocs = [], multiPart = false, currentPartKey = null }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<KosekiRequestRow[]>(requests)
  const [busy, setBusy] = useState(false)
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

  const addRow = async () => {
    setBusy(true)
    // 取得区分は役割分担（戸籍の担当）から自動既定（依頼者担当があれば依頼者取得）
    const { data, error } = await supabase
      .from('koseki_requests')
      .insert({ case_id: caseId, sort_order: rows.length, acquirer: acquirerFromRoles(roles, ACQUIRER_GYOMU.koseki), acquired_part: multiPart ? currentPartKey : null })
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

  const colCount = (progressMode ? 13 : 8) + (multiPart ? 1 : 0)

  return (
    <div>
      {/* 契約時に受領済の戸籍（依頼者取得分）は別ブロックで上に表示。新規請求の表とは分ける。 */}
      <ContractReceivedBlock docs={contractDocs} caseId={caseId} onRefresh={onRefresh} />
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: progressMode ? 1240 : 820 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-1 py-2 w-7" />
              <th className="px-2.5 py-2 text-left font-semibold w-44">請求先</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">対象者</th>
              <th className="px-2.5 py-2 text-left font-semibold w-36">範囲</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">種別</th>
              <th className="px-2.5 py-2 text-left font-semibold">取得目的</th>
              <th className="px-2.5 py-2 text-left font-semibold w-28">取得区分</th>
              {multiPart && <th className="px-2.5 py-2 text-left font-semibold w-24">取得パート</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-28">請求日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-28">到着予定日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-28">到着日</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-20">受信</th>}
              {progressMode && <th className="px-2.5 py-2 text-left font-semibold w-36">関連タスク</th>}
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((r, i) => (
                <Row key={r.id} r={r} odd={i % 2 === 1} progressMode={progressMode} multiPart={multiPart}
                  open={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  setLocal={setLocal} commit={commit} saveField={saveField}
                  onDelete={() => delRow(r)} colCount={colCount} targetOptions={targetOptions} relatedTasks={relatedTasksFor(receipts, 'koseki', r.id)} receiptFiles={receiptFilesFor(receipts, 'koseki', r.id)} />
              ))
            ) : (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-[13px] text-gray-400">戸籍請求が登録されていません</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2">
        <button type="button" onClick={addRow} disabled={busy} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> 戸籍請求を追加
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        取得区分「依頼者取得」は、依頼者が取得して送付→「書類受信簿」で受信すると到着日が入り受信済になります。
        {progressMode ? '自社取得は請求日→到着日で管理します。' : ''}
      </p>
    </div>
  )
}

function Row({ r, odd, progressMode, multiPart, open, onToggle, setLocal, commit, saveField, onDelete, colCount, targetOptions, relatedTasks, receiptFiles }: {
  r: KosekiRequestRow
  odd: boolean
  progressMode: boolean
  multiPart: boolean
  open: boolean
  onToggle: () => void
  setLocal: (id: string, field: keyof KosekiRequestRow, value: string) => void
  commit: (id: string, field: keyof KosekiRequestRow, value: string) => void
  saveField: (id: string, field: keyof KosekiRequestRow, value: unknown) => Promise<void>
  onDelete: () => void
  colCount: number
  targetOptions: string[]
  relatedTasks: RelatedTask[]
  receiptFiles: ReceiptFile[]
}) {
  return (
    <>
      <tr className={`border-b border-gray-100 ${odd ? 'bg-gray-50/40' : ''}`}>
        <td className="px-1 py-1.5 text-center">
          <button type="button" onClick={onToggle} className="text-gray-400 hover:text-brand-600" title="請求理由・特記">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <Cell value={r.request_to} onChange={v => setLocal(r.id, 'request_to', v)} onCommit={v => commit(r.id, 'request_to', v)} placeholder="例: 名古屋市中区役所" />
        <TargetCell value={r.target_person} options={targetOptions} onSave={v => saveField(r.id, 'target_person', v)} />
        <SelectCell value={r.range_text} options={KOSEKI_RANGES} onSave={v => saveField(r.id, 'range_text', v)} />
        <SelectCell value={r.doc_types} options={KOSEKI_REQUEST_TYPES} onSave={v => saveField(r.id, 'doc_types', v)} />
        <SelectCell value={r.purpose} options={KOSEKI_PURPOSES} onSave={v => saveField(r.id, 'purpose', v)} />
        <AcquirerCell value={r.acquirer} onSave={v => saveField(r.id, 'acquirer', v)} />
        {multiPart && (
          <td className="px-2.5 py-1.5">
            {r.acquired_part
              ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200">{r.acquired_part}</span>
              : <span className="text-[11px] text-gray-300">—</span>}
          </td>
        )}
        {progressMode && <DateCell value={r.request_date} onCommit={v => commit(r.id, 'request_date', v)} />}
        {progressMode && <DateCell value={r.expected_arrival_date} onCommit={v => commit(r.id, 'expected_arrival_date', v)} />}
        {progressMode && <DateCell value={r.arrival_date} onCommit={v => commit(r.id, 'arrival_date', v)} />}
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
              <InlineSelect label="戸籍請求理由" value={r.request_reason} options={[...KOSEKI_REQUEST_REASONS]} onSave={v => saveField(r.id, 'request_reason', v)} fullWidth />
              <InlineEdit label="戸籍請求理由（その他）" value={r.request_reason_other} onSave={v => saveField(r.id, 'request_reason_other', v)} fullWidth />
              <InlineTextarea label="戸籍特記事項" value={r.notes} onSave={v => saveField(r.id, 'notes', v)} fullWidth />
            </FieldGrid>
          </td>
        </tr>
      )}
    </>
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

// 対象者（誰の戸籍か）。被相続人＋相続人一覧から選択。既存の自由入力値があれば末尾に保持。
function TargetCell({ value, options, onSave }: { value: string | null; options: string[]; onSave: (v: string) => void }) {
  const opts = value && !options.includes(value) ? [...options, value] : options
  return (
    <td className="px-2.5 py-1.5">
      <select value={value ?? ''} onChange={e => onSave(e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
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

function DateCell({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="date"
        defaultValue={value ?? ''}
        onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
      />
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
