'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { Trash2, Plus, Check, CloudOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { REQUIRED_CONTRACT_DOCS, REQUIRED_CONTRACT_DOC_CATEGORY } from '@/lib/constants'
import type { ContractDocumentRow, CaseRow } from '@/types'
import { sealCertificateStatus } from '@/lib/financialWorkflow'
import type { TimelineReceipt } from './CaseTimeline'

const DOC_STATUS = ['その場で受領', '後日郵送', '依頼者が取得', '不要']
// 区分。書類の性質(戸籍/財産/登記など) と 案件完了時の返却フラグ「お客様預かり書類」の混在。
//   - 戸籍/不動産/金融/登記 → 各調査タブに「契約時にお客様から受領した書類」として横断表示 (受領済/未受領)
//   - お客様預かり書類 → 納品タブに候補として自動で載る (原本返却が基本)
// migration209 で 3値→7値 に拡張し直し。
const DOC_CATEGORIES = ['契約', '戸籍', '金融', '不動産', '登記', 'お客様預かり書類', 'その他']

// 契約時に必ずもらう5点（契約書/料金表/委任状/本人確認書類/印鑑証明書）。
// 初回表示時にデフォルトで自動作成し、受領状況を入力できるようにする（書類名の候補にも使う）。
const DEFAULT_DOCS = [...REQUIRED_CONTRACT_DOCS]

type Props = {
  caseId: string
  documents: ContractDocumentRow[]
  documentReceipts?: TimelineReceipt[]
  onRefresh?: () => void
  /** 印鑑登録証明書の行に発行日・有効期間・通数を出すため（cases の列）。渡さなければ出ない */
  caseData?: Pick<CaseRow, 'seal_cert_oldest_issue_date' | 'seal_cert_validity_months' | 'seal_cert_custom_expiry' | 'seal_cert_copies'>
  patchCase?: (patch: Partial<CaseRow>) => Promise<void>
}

/**
 * 契約手続きの「契約関連書類の受け取り」表（行＝1書類）。
 * 受領状況・到着予定日を管理し、書類受信簿で受信すると到着日が入り「受信済」になる。
 * （JSONBではなくテーブルなので、受信簿から linked_kind='contract_doc' で各行に紐づく）
 */
export default function ContractDocumentsTable({ caseId, documents, documentReceipts = [], onRefresh, caseData, patchCase }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<ContractDocumentRow[]>(documents)
  // 契約書類→受信簿アイテムの「アップ済」状況。linked_kind='contract_doc' で各契約書類行に紐づく。
  const uploadedByContractDoc = new Map<string, boolean>()
  for (const r of documentReceipts) {
    for (const it of (r.items ?? [])) {
      if (it.linked_kind === 'contract_doc' && it.linked_id && it.uploaded_at) uploadedByContractDoc.set(it.linked_id, true)
    }
  }
  const [busy, setBusy] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [recvFilter, setRecvFilter] = useState<'all' | 'received' | 'pending'>('all')
  // 受信簿で受領→到着日が入った等、props 更新を反映（常時マウントされる画面対策）
  useEffect(() => { setRows(documents) }, [documents])

  // 初回表示時：区分=契約 の書類が1件も無ければ、必須5点をデフォルトで自動作成する。
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    if (documents.some(d => d.category === '契約')) return
    ;(async () => {
      const payload = DEFAULT_DOCS.map((name, i) => ({
        case_id: caseId, name, category: REQUIRED_CONTRACT_DOC_CATEGORY[name] ?? '契約', sort_order: i,
      }))
      const { data, error } = await supabase.from('contract_documents').insert(payload).select('*')
      if (!error && data) { setRows(prev => [...prev, ...(data as ContractDocumentRow[])]); onRefresh?.() }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 「不要」（受け取らない書類）は既定で非表示。トグルで表示できる。
  const hiddenCount = rows.filter(r => r.status === '不要').length
  const baseRows = showHidden ? rows : rows.filter(r => r.status !== '不要')
  // 受領済(到着日あり) / 未受領 フィルタ
  const visibleRows = recvFilter === 'all' ? baseRows
    : recvFilter === 'received' ? baseRows.filter(r => r.arrival_date)
    : baseRows.filter(r => !r.arrival_date)

  const setLocal = (id: string, field: keyof ContractDocumentRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as ContractDocumentRow : r)))

  const commit = async (id: string, field: keyof ContractDocumentRow, value: string) => {
    const { error } = await supabase.from('contract_documents').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    // 受領判定（status / arrival_date）に関わる変更は、受託フロー・ナビをその場で更新させるため親に通知。
    if (field === 'status' || field === 'arrival_date') onRefresh?.()
  }
  const saveNow = (id: string, field: keyof ContractDocumentRow, value: string) => { setLocal(id, field, value); commit(id, field, value) }

  // 受領状況を「その場で受領」にしたら、到着日が未入力なら当日で埋めて受領済にする。
  // 逆に「その場で受領」から他（後日郵送 等）に戻したら、その場で入れた到着日をクリアして未受信に戻す。
  const onStatusChange = async (row: ContractDocumentRow, value: string) => {
    setLocal(row.id, 'status', value)
    if (value === 'その場で受領' && !row.arrival_date) {
      const today = new Date().toISOString().slice(0, 10)
      setLocal(row.id, 'arrival_date', today)
      const { error } = await supabase.from('contract_documents').update({ status: value, arrival_date: today }).eq('id', row.id)
      if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
      onRefresh?.()
    } else if (value !== 'その場で受領' && row.status === 'その場で受領' && row.arrival_date) {
      // 「その場で受領」→ 別ステータス：到着日をクリアして受信済→未受信に戻す
      setLocal(row.id, 'arrival_date', '')
      const { error } = await supabase.from('contract_documents').update({ status: value, arrival_date: null }).eq('id', row.id)
      if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
      onRefresh?.()
    } else {
      commit(row.id, 'status', value)
    }
  }

  const addRow = async (name = '') => {
    setBusy(true)
    const { data, error } = await supabase
      .from('contract_documents')
      .insert({ case_id: caseId, name: name || null, sort_order: rows.length })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as ContractDocumentRow])
    onRefresh?.()
  }

  const delRow = async (row: ContractDocumentRow) => {
    const { error } = await supabase.from('contract_documents').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      {/* 受領済 / 未受領 フィルタ */}
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[12px] font-semibold text-gray-500 mr-0.5">表示</span>
        {([['all', 'すべて'], ['pending', '未受領'], ['received', '受領済']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setRecvFilter(key)}
            className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${recvFilter === key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 960 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600 tracking-[0.04em]">
              <th className="px-2.5 py-2 text-left font-semibold w-56">書類</th>
              <th className="px-2.5 py-2 text-left font-semibold w-28">区分</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">受領状況</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">到着日</th>
              <th className="px-2.5 py-2 text-left font-semibold w-20">受信</th>
              <th className="px-2.5 py-2 text-left font-semibold w-24">アップ状況</th>
              <th className="px-2.5 py-2 text-left font-semibold">備考</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[13px] text-gray-400">契約関連の書類が登録されていません</td></tr>
            ) : (
              visibleRows.map((r, i) => (
                <Fragment key={r.id}>
                <tr className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <DocNameCell value={r.name} onCommit={v => saveNow(r.id, 'name', v)} />
                  <td className="px-2.5 py-1.5">
                    <select value={r.category ?? ''} onChange={e => saveNow(r.id, 'category', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {DOC_CATEGORIES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <select value={r.status ?? ''} onChange={e => onStatusChange(r, e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {DOC_STATUS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <DateCell value={r.arrival_date} onCommit={v => commit(r.id, 'arrival_date', v)} />
                  <td className="px-2.5 py-1.5">
                    {r.arrival_date
                      ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">受信済</span>
                      : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受信</span>}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {!r.arrival_date
                      ? <span className="text-[11px] text-gray-300">—</span>
                      : (uploadedByContractDoc.get(r.id) || r.file_path)
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><Check className="w-3 h-3" strokeWidth={2.5} />アップ済</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"><CloudOff className="w-3 h-3" strokeWidth={2} />未アップ</span>}
                  </td>
                  <Cell value={r.notes} onCommit={v => saveNow(r.id, 'notes', v)} placeholder="例：実印分は後日、料金 等" />
                  <td className="px-2.5 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
                {/* 依頼者の印鑑登録証明書だけ、書類の中身（発行日・有効期間・通数）をこの行の下に持つ。
                    金融調査の請求で使い、期限（発行後3〜6か月）が切れると出し直しになるため。
                    原本がいまどこにあるかは金融の請求から出す（ここでは選ばせない）。 */}
                {caseData && patchCase && (r.name ?? '').includes('印鑑登録証明書') && (
                  <SealCertificateRow caseData={caseData} patchCase={patchCase} />
                )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => addRow()} disabled={busy} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> 書類を追加
        </button>
        {hiddenCount > 0 && (
          <button type="button" onClick={() => setShowHidden(v => !v)} className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-400 hover:text-gray-600">
            {showHidden ? `不要 ${hiddenCount}件を隠す` : `不要 ${hiddenCount}件を表示`}
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        受領状況「不要」にした書類は非表示になります。「後日郵送 / 依頼者が取得」は案件進捗の「契約処理の残」に表示。届いたら「到着物受信簿」から各行に紐づけて登録すると到着日が入り受信済になります。<br />
        区分「戸籍 / 不動産 / 金融 / 登記」にすると、相続人調査・財産調査・相続登記の各タブに「契約時にお客様から受領した書類」として受領済/未受領が横断表示されます。<br />
        区分「<span className="font-semibold text-brand-700">お客様預かり書類</span>」にすると、案件完了時の <span className="font-semibold text-brand-700">納品タブ</span> に候補として自動で載ります（既定は<span className="font-semibold">未選択</span>。納品タブで 対象／対象外 を選びます）。
      </p>
    </div>
  )
}

function Cell({ value, onCommit, placeholder }: { value: string | null; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        defaultValue={value ?? ''}
        onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
      />
    </td>
  )
}

// 書類名セル。契約書/委任状/本人確認書類/印鑑証明書 を候補に出しつつ フリー入力も可（datalist）。
function DocNameCell({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        list="contract-doc-names"
        defaultValue={value ?? ''}
        onBlur={e => { if (e.target.value !== (value ?? '')) onCommit(e.target.value) }}
        placeholder="書類名（選択 or 入力）"
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
      />
      <datalist id="contract-doc-names">
        {DEFAULT_DOCS.map(d => <option key={d} value={d} />)}
      </datalist>
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


// ラベル付きの1欄（描画中に部品を作らないよう、外に出しておく）
function SealField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-0.5 text-[10.5px] text-gray-500">{label}<span>{children}</span></label>
}

// 印鑑登録証明書の行の下に出す、書類の中身。cases の列に書く。
function SealCertificateRow({ caseData, patchCase }: {
  caseData: Pick<CaseRow, 'seal_cert_oldest_issue_date' | 'seal_cert_validity_months' | 'seal_cert_custom_expiry' | 'seal_cert_copies'>
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}) {
  const st = sealCertificateStatus(caseData, new Date().toLocaleDateString('sv-SE'))
  const inp = 'px-2 py-1 text-[12px] border border-gray-300 rounded bg-white outline-none focus:border-brand-500'
  return (
    <tr className="bg-brand-50/40 border-b border-gray-100">
      <td colSpan={8} className="px-3 py-2 pl-6 border-l-2 border-brand-400">
        <div className="flex items-end gap-4 flex-wrap">
          <span className="text-[11px] text-gray-500 self-center">依頼者の印鑑登録証明書。金融調査の請求で使う</span>
          <SealField label="最古の発行日">
            <input type="date" defaultValue={caseData.seal_cert_oldest_issue_date ?? ''} key={`si-${caseData.seal_cert_oldest_issue_date ?? ''}`}
              onBlur={e => { if (e.target.value !== (caseData.seal_cert_oldest_issue_date ?? '')) void patchCase({ seal_cert_oldest_issue_date: e.target.value || null }) }} className={inp} />
          </SealField>
          <SealField label="有効期間">
            <select value={caseData.seal_cert_validity_months == null ? 'custom' : String(caseData.seal_cert_validity_months)}
              onChange={e => void patchCase({ seal_cert_validity_months: e.target.value === 'custom' ? null : Number(e.target.value) })}
              style={{ fontFamily: 'inherit' }} className={inp}>
              <option value="6">発行後6か月</option><option value="3">発行後3か月</option><option value="custom">個別指定</option>
            </select>
          </SealField>
          {caseData.seal_cert_validity_months == null
            ? <SealField label="使用期限">
                <input type="date" defaultValue={caseData.seal_cert_custom_expiry ?? ''} key={`se-${caseData.seal_cert_custom_expiry ?? ''}`}
                  onBlur={e => { if (e.target.value !== (caseData.seal_cert_custom_expiry ?? '')) void patchCase({ seal_cert_custom_expiry: e.target.value || null }) }} className={inp} />
              </SealField>
            : <SealField label="使用期限（自動）"><span className="inline-block px-2 py-1 text-[12px] font-mono text-gray-700 bg-gray-100 rounded">{st.expiry ? st.expiry.replace(/-/g, '/') : '—'}</span></SealField>}
          <SealField label="受領通数">
            <input type="number" min={0} defaultValue={caseData.seal_cert_copies ?? ''} key={`sc-${caseData.seal_cert_copies ?? ''}`}
              onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (caseData.seal_cert_copies ?? null)) void patchCase({ seal_cert_copies: v }) }} className={`${inp} w-20`} />
          </SealField>
          {st.status === '期限間近' && <span className="self-center text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">期限まであと{st.daysLeft}日</span>}
          {st.status === '期限切れ' && <span className="self-center text-[11px] font-semibold px-2 py-0.5 rounded bg-red-100 text-red-800">期限切れ</span>}
        </div>
      </td>
    </tr>
  )
}
