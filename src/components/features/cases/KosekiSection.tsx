'use client'

// 戸籍請求（実務）：TOP（進捗サマリー＋取得状況表＋相続相関図）＋左レール（請求単位タブ）。
// 各請求はカード形式。費用（予算/返金/確定）＋ダブルチェック（自分以外）。追加請求は管理担当の承認ゲート。

import { useState, useEffect } from 'react'
import { Plus, Table2, Lock, ShieldCheck, Trash2, Inbox } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useIsManager } from '@/components/providers/AuthProvider'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { FieldGrid, InlineSelect, InlineEdit, InlineDate, InlineTextarea, SectionHeading } from '@/components/ui/InlineFields'
import { KOSEKI_REQUEST_TYPES, KOSEKI_RANGES, KOSEKI_REQUEST_REASONS } from '@/lib/constants'
import ProgressSummary, { summaryStatusClass } from './ProgressSummary'
import { CostBlock, DoubleCheck } from './CostAndCheck'
import InheritanceDiagramV2 from './InheritanceDiagramV2'
import Modal from '@/components/ui/Modal'
import type { KosekiRequestRow, HeirRow, CaseRow } from '@/types'

const yen = (n: number | null) => (n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`)
const ACQUIRERS = ['自社', '依頼者']
// 確定費用（戸籍は予算−返金）
const effConfirmed = (r: KosekiRequestRow) => (r.cost_budget != null ? r.cost_budget - (r.cost_refund ?? 0) : null)
const reqLabel = (r: KosekiRequestRow) => [r.request_to, r.target_person].filter(Boolean).join('・') || '新規請求'

export default function KosekiSection({ caseId, caseData, requests, heirs = [], onRefresh }: {
  caseId: string
  caseData: CaseRow
  requests: KosekiRequestRow[]
  heirs?: HeirRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const isManager = useIsManager()
  const memberId = useCurrentMember(null)
  const [sub, setSub] = useState('top')
  const [addOpen, setAddOpen] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, { status: string; body: string }>>({})
  const deceasedName = caseData.deceased_name

  const targetOptions = [deceasedName, ...heirs.map(h => h.name)].filter((v): v is string => !!v && v.trim() !== '')
  // 氏名→続柄（相続人タブの relationship_type を参照）
  const relForName = (name: string) => {
    const h = heirs.find(x => x.name.trim() === name.trim())
    return (h?.relationship_type || h?.relationship || '').trim()
  }

  // 各請求の状態＋サマリー本文（scope=koseki_req_<id>）を読み込み、TOP表・取得状況図に反映
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('progress_summaries').select('scope_key, status, body').eq('case_id', caseId).like('scope_key', 'koseki_req_%')
      if (!alive || !data) return
      const map: Record<string, { status: string; body: string }> = {}
      for (const d of data as { scope_key: string; status: string | null; body: string | null }[]) map[d.scope_key.replace('koseki_req_', '')] = { status: d.status ?? '未着手', body: d.body ?? '' }
      setStatuses(map)
    })()
    return () => { alive = false }
  }, [caseId, supabase, requests.length])

  const saveField = async (id: string, field: keyof KosekiRequestRow, value: unknown) => {
    const { error } = await supabase.from('koseki_requests').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }
  const saveMany = async (id: string, patch: Partial<KosekiRequestRow>) => {
    const { error } = await supabase.from('koseki_requests').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }

  // 通常請求は即作成。追加請求は専用モーダル（理由必須）→管理担当へ通知。
  const addRequest = async () => {
    const { data, error } = await supabase.from('koseki_requests')
      .insert({ case_id: caseId, sort_order: requests.length, is_additional: false })
      .select('id').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setSub((data as { id: string }).id)
    onRefresh?.()
  }

  const submitAdditional = async (form: { target_person: string; request_to: string; reason: string }) => {
    const { data, error } = await supabase.from('koseki_requests')
      .insert({ case_id: caseId, sort_order: requests.length, is_additional: true, additional_reason: form.reason, target_person: form.target_person || null, request_to: form.request_to || null })
      .select('id').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    // 管理担当へ通知（承認依頼）
    const { data: mgrs } = await supabase.from('members').select('id').eq('primary_role', 'manager').eq('is_active', true)
    const rows = (mgrs ?? []).map(m => ({ member_id: (m as { id: string }).id, type: 'koseki_additional', case_id: caseId, title: '追加戸籍請求の承認依頼', body: `${form.target_person || '対象者未定'}／${form.request_to || '請求先未定'}：${form.reason}` }))
    if (rows.length) await supabase.from('notifications').insert(rows)
    setAddOpen(false)
    setSub((data as { id: string }).id)
    showToast('追加請求を申請しました（管理担当へ通知）', 'success')
    onRefresh?.()
  }

  const approveAdditional = async (r: KosekiRequestRow) => {
    await saveMany(r.id, { additional_approved_by: memberId, additional_approved_at: new Date().toISOString() })
  }

  const delRequest = async (r: KosekiRequestRow) => {
    if (!confirm(`「${reqLabel(r)}」の戸籍請求を削除しますか？`)) return
    const { error } = await supabase.from('koseki_requests').delete().eq('id', r.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    if (sub === r.id) setSub('top')
    onRefresh?.()
  }

  const confirmedTotal = requests.reduce((s, r) => s + (effConfirmed(r) ?? 0), 0)

  // 人（被相続人＋相続人）ごとの戸籍取得状況。請求が無ければ未着手。
  const reqsForName = (name: string) => requests.filter(r => (r.target_person ?? '').trim() === name.trim())
  const statusForName = (name: string) => {
    const sts = reqsForName(name).map(r => statuses[r.id]?.status ?? '未着手')
    if (!sts.length) return '未着手'
    if (sts.some(s => s === '追加調査中')) return '追加調査中'
    if (sts.every(s => s === '完了')) return '完了'
    if (sts.some(s => s === '対応中')) return '対応中'
    return '未着手'
  }
  const bodyForName = (name: string) => {
    for (const r of reqsForName(name)) { const b = statuses[r.id]?.body; if (b && b.trim()) return b.trim() }
    return ''
  }
  // 取得状況リスト：被相続人＋相続人（続柄付き）
  const peopleRows = [
    { name: deceasedName ?? '', rel: '被相続人' },
    ...heirs.map(h => ({ name: h.name, rel: (h.relationship_type || h.relationship || '').trim() || '相続人' })),
  ].filter(p => p.name.trim())
  // 相続関係説明図の枠色＋ホバー用（氏名→状態＋進捗/結果）
  const statusByName = Object.fromEntries(peopleRows.map(p => [p.name.trim(), { status: statusForName(p.name), body: bodyForName(p.name) }]))

  const tabs = [{ id: 'top', label: '一覧（TOP）' }, ...requests.map(r => ({ id: r.id, label: reqLabel(r) }))]
  const active = requests.find(r => r.id === sub)

  return (
    <div className="flex gap-3 items-start">
      {/* 左レール */}
      <div className="flex-none w-40 flex flex-col gap-0.5 border-r border-gray-200 pr-2">
        {tabs.map(t => {
          const r = requests.find(x => x.id === t.id)
          const st = r ? (statuses[r.id]?.status ?? '未着手') : null
          const pending = r?.is_additional && !r.additional_approved_at
          const received = !!r?.arrival_date
          const isClient = r?.acquirer === '依頼者'
          return (
            <button key={t.id} type="button" onClick={() => setSub(t.id)}
              className={`text-left text-[12px] px-2.5 py-1.5 rounded-md flex items-center gap-1.5 ${sub === t.id ? 'bg-brand-50 text-brand-700 font-semibold' : `text-gray-600 hover:bg-gray-50 ${r && !received ? 'opacity-70' : ''}`}`}>
              {t.id === 'top' ? <Table2 className="w-3.5 h-3.5 flex-none" /> : pending ? <Lock className="w-3 h-3 flex-none text-amber-500" /> : <span className={`w-1.5 h-1.5 rounded-full flex-none border ${summaryStatusClass(st)}`} />}
              <span className="truncate flex-1">{t.label}</span>
              {r && <span className={`text-[9px] font-semibold px-1 rounded flex-none ${isClient ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'}`}>{isClient ? '依' : '自'}</span>}
              {r?.is_additional && <span className="text-[9px] font-semibold px-1 rounded flex-none bg-amber-500 text-white">追</span>}
              {received && <Inbox className="w-3 h-3 flex-none text-emerald-600" aria-label="受信済" />}
            </button>
          )
        })}
        <button type="button" onClick={addRequest} className="mt-1 text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-brand-700 hover:border-brand-300 inline-flex items-center gap-1"><Plus className="w-3 h-3" />請求を追加</button>
        <button type="button" onClick={() => setAddOpen(true)} className="text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 inline-flex items-center gap-1"><Plus className="w-3 h-3" />追加請求（承認要）</button>
      </div>

      {/* 本文 */}
      <div className="flex-1 min-w-0">
        {sub === 'top' ? (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey="koseki" title="進捗/結果（戸籍調査 全体）" />
            <div>
              <SectionHeading title="戸籍の取得状況" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse" style={{ minWidth: 680 }}>
                  <thead>
                    <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
                      <th className="px-2.5 py-2 text-left font-semibold w-28">対象者</th>
                      <th className="px-2.5 py-2 text-left font-semibold">請求先</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-20">請求日</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-20">到着日</th>
                      <th className="px-2.5 py-2 text-right font-semibold w-28">確定費用</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-24">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">戸籍請求がありません。左の「請求を追加」から登録してください。</td></tr>
                    ) : requests.map((r, i) => (
                      <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-brand-50/30 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`} onClick={() => setSub(r.id)}>
                        <td className="px-2.5 py-2 font-medium text-gray-800">{r.target_person || <span className="text-gray-300">—</span>}{r.is_additional && <span className="ml-1 text-[10px] text-amber-600">追加</span>}</td>
                        <td className="px-2.5 py-2 text-gray-700">{r.request_to || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2.5 py-2">{r.request_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2">{r.arrival_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2 text-right">{yen(effConfirmed(r))}</td>
                        <td className="px-2.5 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${summaryStatusClass(statuses[r.id]?.status)}`}>{statuses[r.id]?.status ?? '未着手'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-gray-700">
                      <td className="px-2.5 py-2 text-right" colSpan={4}>確定費用 合計（立替実費の実績）</td>
                      <td className="px-2.5 py-2 text-right text-emerald-700">{yen(confirmedTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 戸籍取得状況図：相続関係説明図に状態を枠色で反映＋ホバーで進捗/結果 */}
            <div>
              <SectionHeading title="戸籍の取得状況（相続関係説明図）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              {heirs.length === 0 ? (
                <p className="text-[12px] text-gray-400 text-center py-4">相続人が未登録です。「相続人」タブで登録すると、ここに相続関係説明図が表示されます。</p>
              ) : (
                <div className="overflow-x-auto"><InheritanceDiagramV2 deceased={caseData} heirs={heirs} statusByName={statusByName} /></div>
              )}
              <p className="mt-2 text-[11px] text-gray-400">枠色＝戸籍の取得状況（<span className="text-emerald-700">緑=完了</span>／<span className="text-blue-600">青=対応中</span>／<span className="text-amber-600">橙=追加調査中</span>／灰=未着手）。ノードにマウスを乗せると進捗/結果を表示。</p>
            </div>
          </div>
        ) : active ? (
          <RequestDetail
            key={active.id}
            r={active}
            caseId={caseId}
            isManager={isManager}
            targetOptions={targetOptions}
            relLabel={relForName(active.target_person ?? '')}
            saveField={saveField}
            saveMany={saveMany}
            approveAdditional={() => approveAdditional(active)}
            onDelete={() => delRequest(active)}
          />
        ) : null}
      </div>
      {addOpen && <AdditionalRequestModal targetOptions={targetOptions} onClose={() => setAddOpen(false)} onSubmit={submitAdditional} />}
    </div>
  )
}

function AdditionalRequestModal({ targetOptions, onClose, onSubmit }: {
  targetOptions: string[]
  onClose: () => void
  onSubmit: (form: { target_person: string; request_to: string; reason: string }) => void
}) {
  const [target, setTarget] = useState('')
  const [reqTo, setReqTo] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const inp = 'w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand-400 bg-white'
  return (
    <Modal isOpen onClose={onClose} title="追加戸籍請求の申請">
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
          <ShieldCheck className="w-4 h-4 flex-none mt-0.5" />
          <span>追加請求は<strong>管理担当の承認（追加OK）後</strong>に請求内容を入力できます。申請すると管理担当へ通知が飛びます。</span>
        </div>
        <div><label className="block text-[11px] text-gray-500 mb-1">対象者</label>
          <select value={target} onChange={e => setTarget(e.target.value)} className={inp}><option value="">選択…</option>{targetOptions.map(o => <option key={o} value={o}>{o}</option>)}</select>
          <p className="text-[10.5px] text-gray-400 mt-1">一覧にない場合は「相続人」タブで追加してください。</p>
        </div>
        <div><label className="block text-[11px] text-gray-500 mb-1">請求先（役所）</label><input value={reqTo} onChange={e => setReqTo(e.target.value)} placeholder="例: 江東区役所" className={inp} /></div>
        <div><label className="block text-[11px] text-gray-500 mb-1">追加が必要な理由 <span className="text-red-500">*</span></label><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="転籍・除籍など追加が必要な戸籍と理由" className={`${inp} resize-none`} /></div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] text-gray-600 hover:text-gray-800">キャンセル</button>
          <button type="button" disabled={busy || !reason.trim()} onClick={() => { setBusy(true); onSubmit({ target_person: target, request_to: reqTo, reason: reason.trim() }) }} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold text-white bg-amber-500 rounded-md hover:bg-amber-600 disabled:opacity-50"><ShieldCheck className="w-3.5 h-3.5" />申請する（管理担当へ通知）</button>
        </div>
      </div>
    </Modal>
  )
}

function RequestDetail({ r, caseId, isManager, targetOptions, relLabel, saveField, saveMany, approveAdditional, onDelete }: {
  r: KosekiRequestRow
  caseId: string
  isManager: boolean
  targetOptions: string[]
  relLabel: string
  saveField: (id: string, field: keyof KosekiRequestRow, value: unknown) => Promise<void>
  saveMany: (id: string, patch: Partial<KosekiRequestRow>) => Promise<void>
  approveAdditional: () => void
  onDelete: () => void
}) {
  const locked = r.is_additional && !r.additional_approved_at

  if (locked) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
          <Lock className="w-4 h-4 flex-none" />
          <span className="flex-1">追加請求：管理担当の承認待ち — 理由「{r.additional_reason || '—'}」</span>
          {isManager && (
            <button type="button" onClick={approveAdditional} className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700"><ShieldCheck className="w-3.5 h-3.5" />追加OK（管理担当）</button>
          )}
        </div>
        <div className="rounded-md border border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-[12px] text-gray-400">
          承認されると請求内容（請求先・対象者・費用・ダブルチェック）を入力できます。
        </div>
      </div>
    )
  }

  const isClient = r.acquirer === '依頼者'  // 依頼者取得＝請求日/費用/ダブルチェックなし
  return (
    <div className="space-y-3.5">
      <ProgressSummary caseId={caseId} scopeKey={`koseki_req_${r.id}`} title={`進捗/結果（${reqLabel(r)}）`} />

      <div>
        <SectionHeading title="請求内容" className="mb-2.5 pb-1.5 border-b border-gray-200" />
        <FieldGrid>
          <InlineSelect label="取得区分" value={r.acquirer} options={ACQUIRERS} onSave={v => saveField(r.id, 'acquirer', v)} />
          <InlineEdit label="請求先" value={r.request_to} onSave={v => saveField(r.id, 'request_to', v)} />
          <InlineSelect label="対象者" value={r.target_person} options={targetOptions} onSave={v => saveField(r.id, 'target_person', v)} />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-400">続柄（相続人タブ参照）</span>
            <span className="px-2 py-1.5 text-[12.5px] bg-gray-50 border border-gray-200 rounded text-gray-700">{relLabel || '—'}</span>
          </div>
          <InlineSelect label="範囲" value={r.range_text} options={[...KOSEKI_RANGES]} onSave={v => saveField(r.id, 'range_text', v)} />
          <InlineSelect label="種別" value={r.doc_types} options={[...KOSEKI_REQUEST_TYPES]} onSave={v => saveField(r.id, 'doc_types', v)} />
          {/* 依頼者取得は依頼者が請求するため請求日は持たない */}
          {!isClient && <InlineDate label="請求日" value={r.request_date} onSave={v => saveField(r.id, 'request_date', v)} />}
          <InlineDate label={isClient ? '到着日（受信簿で依頼者から受領）' : '到着日'} value={r.arrival_date} onSave={v => saveField(r.id, 'arrival_date', v)} />
          <InlineSelect label="戸籍請求理由" value={r.request_reason} options={[...KOSEKI_REQUEST_REASONS]} onSave={v => saveField(r.id, 'request_reason', v)} />
          <InlineTextarea label="特記事項" value={r.notes} onSave={v => saveField(r.id, 'notes', v)} fullWidth />
        </FieldGrid>
      </div>

      {/* 費用・ダブルチェックは自社取得（＝自社が小為替を立替）のときのみ。依頼者取得は依頼者負担。 */}
      {isClient ? (
        <div className="rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-[12px] text-gray-500">費用・ダブルチェックは依頼者負担のため表示しません（小為替＝依頼者）。</div>
      ) : (
        <>
          <CostBlock budget={r.cost_budget} refund={r.cost_refund} confirmed={effConfirmed(r)} mode="full"
            onSave={(field, v) => saveField(r.id, field, v === '' ? null : Number(v))} />
          <div className="flex gap-2.5 flex-wrap">
            <DoubleCheck label="請求時ダブルチェック（同梱額・自分以外）" name={r.request_check_name} at={r.request_check_at}
              onSet={(name, at) => saveMany(r.id, { request_check_name: name, request_check_at: at })} />
            <DoubleCheck label="受信時ダブルチェック（返金額・自分以外）" name={r.receipt_check_name} at={r.receipt_check_at}
              onSet={(name, at) => saveMany(r.id, { receipt_check_name: name, receipt_check_at: at })} />
          </div>
        </>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" />この請求を削除</button>
      </div>
    </div>
  )
}
