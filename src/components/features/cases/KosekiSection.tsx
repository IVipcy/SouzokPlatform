'use client'

// 戸籍請求（実務）：TOP（進捗サマリー＋取得状況表＋相続相関図）＋左レール（請求単位タブ）。
// 各請求はカード形式。費用（予算/返金/確定）＋ダブルチェック（自分以外）。追加請求は管理担当の承認ゲート。

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Table2, Lock, ShieldCheck, Trash2, Inbox } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useIsManager, useAuth } from '@/components/providers/AuthProvider'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { SectionHeading } from '@/components/ui/InlineFields'
import { KOSEKI_REQUEST_TYPES, KOSEKI_RANGES, KOSEKI_REQUEST_REASONS } from '@/lib/constants'
import ProgressSummary from './ProgressSummary'
import { TxtCell, SelCell, DateCell, MoneyCell, DcCell } from './PracticeTableCells'
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
  const authUser = useAuth()
  const me = authUser?.memberName ?? authUser?.email ?? '担当者'  // ダブルチェック記録者
  const memberId = useCurrentMember(null)
  // タスク詳細からの着地：?focus=戸籍請求ID。該当行の対象者レールを開き、行をハイライト。
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')
  const focusReq = focusId ? requests.find(r => r.id === focusId) : undefined
  const [sub, setSub] = useState<string>(focusReq ? ((focusReq.target_person ?? '').trim() || '__unset__') : 'top')
  const [addOpen, setAddOpen] = useState(false)
  const [memoByName, setMemoByName] = useState<Record<string, string>>({})  // 人ごとの進捗/結果メモ（相関図ホバー用）
  const deceasedName = caseData.deceased_name

  const targetOptions = [deceasedName, ...heirs.map(h => h.name)].filter((v): v is string => !!v && v.trim() !== '')

  // 人ごとの進捗/結果メモ（scope=koseki_person_<name>）を読み込み、相関図ホバーに反映。
  // 状態は廃止し請求日/到着日から自動判定。②カードはメモ専用。
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('progress_summaries').select('scope_key, body').eq('case_id', caseId).like('scope_key', 'koseki_person_%')
      if (!alive || !data) return
      const map: Record<string, string> = {}
      for (const d of data as { scope_key: string; body: string | null }[]) {
        const key = d.scope_key.replace('koseki_person_', '')
        map[key === 'unset' ? '' : key] = d.body ?? ''
      }
      setMemoByName(map)
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

  // 戸籍の追加は1本に統一。needsApproval=true（予定外の追加）なら管理担当の承認待ち＋通知。
  const submitAdd = async (form: { target_person: string; request_to: string; reason: string; needsApproval: boolean }) => {
    const { data, error } = await supabase.from('koseki_requests')
      .insert({ case_id: caseId, sort_order: requests.length, is_additional: form.needsApproval, additional_reason: form.needsApproval ? (form.reason || null) : null, target_person: form.target_person || null, request_to: form.request_to || null })
      .select('id').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    if (form.needsApproval) {
      // 管理担当へ通知（承認依頼）
      const { data: mgrs } = await supabase.from('members').select('id').eq('primary_role', 'manager').eq('is_active', true)
      const rows = (mgrs ?? []).map(m => ({ member_id: (m as { id: string }).id, type: 'koseki_additional', case_id: caseId, title: '追加戸籍請求の承認依頼', body: `${form.target_person || '対象者未定'}／${form.request_to || '請求先未定'}：${form.reason}` }))
      if (rows.length) await supabase.from('notifications').insert(rows)
    }
    setAddOpen(false)
    setSub((form.target_person || '').trim() || '__unset__')
    showToast(form.needsApproval ? '戸籍を追加しました（要承認・管理担当へ通知）' : '戸籍を追加しました', 'success')
    onRefresh?.()
  }

  const approveAdditional = async (r: KosekiRequestRow) => {
    await saveMany(r.id, { additional_approved_by: memberId, additional_approved_at: new Date().toISOString() })
    // 承認された追加戸籍請求に、通常の戸籍と同じく紐づきタスクを自動生成（source_rid付き・既存はスキップ）。
    // これでタスク詳細から「実務タブで作業」→ 該当行にハイライト着地できる。
    const dest = (r.request_to ?? '').trim() || '請求先未設定'
    const person = (r.target_person ?? '').trim()
    const label = `${dest}${person ? `（${person}）` : ''}`
    const isOwn = (r.acquirer ?? '自社') !== '依頼者'  // 自社取得＝請求＋読込／依頼者取得＝読込のみ
    const plan: { source_rid: string; title: string; ext_data: Record<string, unknown> }[] = []
    if (isOwn) plan.push({ source_rid: `koseki:${r.id}`, title: `戸籍請求：${label}`, ext_data: { ready: true, ready_reason: '起点タスク（前提なし・すぐ着手可）' } })
    plan.push({ source_rid: `koseki-read:${r.id}`, title: `戸籍読込：${label}`, ext_data: { ready_on_receipt: true } })
    const { data: existing } = await supabase.from('tasks').select('source_rid').eq('case_id', caseId).in('source_rid', plan.map(p => p.source_rid))
    const have = new Set(((existing ?? []) as { source_rid: string }[]).map(x => x.source_rid))
    const toInsert = plan.filter(p => !have.has(p.source_rid)).map((p, i) => ({
      case_id: caseId, task_kind: 'case', title: p.title, phase: '戸籍', category: '戸籍',
      status: '着手前', priority: '通常', source_rid: p.source_rid, work_role: 'assistant', ext_data: p.ext_data, sort_order: 90 + i,
    }))
    if (toInsert.length > 0) await supabase.from('tasks').insert(toInsert)
    onRefresh?.()
  }

  const delRequest = async (r: KosekiRequestRow) => {
    if (!confirm(`「${reqLabel(r)}」の戸籍請求を削除しますか？`)) return
    const { error } = await supabase.from('koseki_requests').delete().eq('id', r.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  // グループ一括削除：その人の戸籍請求をまとめて削除
  const deletePersonGroup = async (personId: string) => {
    const person = personId === '__unset__' ? '' : personId
    const targets = requests.filter(r => (r.target_person ?? '').trim() === person)
    const label = personId === '__unset__' ? '対象者 未設定' : personId
    if (targets.length === 0) return
    if (!confirm(`「${label}」の戸籍請求${targets.length}件をすべて削除しますか？`)) return
    const { error } = await supabase.from('koseki_requests').delete().in('id', targets.map(r => r.id))
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    if (sub === personId) setSub('top')
    showToast(`「${label}」の戸籍請求を削除しました`, 'success')
    onRefresh?.()
  }

  const confirmedTotal = requests.reduce((s, r) => s + (effConfirmed(r) ?? 0), 0)

  // 人ごとの状態は戸籍請求の実績（請求日/到着日）から自動判定。②はメモ専用（手動状態は廃止）。
  // 全て到着＝完了 / 1件でも請求or到着あり＝対応中 / それ以外＝未着手（依頼者取得のみの人は依頼者取得分で判定）。
  const statusForName = (name: string) => {
    const reqs = requests.filter(r => (r.target_person ?? '').trim() === name.trim())
    if (!reqs.length) return '未着手'
    const rel = reqs.filter(r => r.acquirer !== '依頼者')
    const use = rel.length ? rel : reqs
    if (use.every(r => !!r.arrival_date)) return '完了'
    if (use.some(r => !!r.request_date || !!r.arrival_date)) return '対応中'
    return '未着手'
  }
  // 相関図ホバー用のメモは②進捗/結果カード（koseki_person_<name>）から取得。
  const bodyForName = (name: string) => memoByName[name.trim()] ?? ''
  // 取得状況リスト：被相続人＋相続人（続柄付き）
  const peopleRows = [
    { name: deceasedName ?? '', rel: '被相続人' },
    ...heirs.map(h => ({ name: h.name, rel: (h.relationship_type || h.relationship || '').trim() || '相続人' })),
  ].filter(p => p.name.trim())
  // 相続関係説明図の枠色＋ホバー用（氏名→状態＋進捗/結果）
  const statusByName = Object.fromEntries(peopleRows.map(p => [p.name.trim(), { status: statusForName(p.name), body: bodyForName(p.name) }]))

  // 人（被相続人・相続人＝対象者）ごとにグループ化。1人の戸籍チェーン（複数役所）を1タブにまとめる。
  const personKey = (r: KosekiRequestRow) => (r.target_person ?? '').trim()
  const knownPeople = peopleRows.map(p => p.name.trim())
  // requests にあるが人リストに無い対象者も拾う（自由入力対応）
  const extraPeople = [...new Set(requests.map(personKey).filter(n => n && !knownPeople.includes(n)))]
  const people = [...peopleRows.map(p => ({ name: p.name.trim(), rel: p.rel })), ...extraPeople.map(n => ({ name: n, rel: '' }))]
  const hasUnsetPerson = requests.some(r => !personKey(r))
  const railTabs = [
    { id: 'top', label: '一覧（TOP）' },
    ...people.map(p => ({ id: p.name, label: p.rel ? `${p.name}（${p.rel}）` : p.name })),
    ...(hasUnsetPerson ? [{ id: '__unset__', label: '対象者 未設定' }] : []),
  ]
  const activePerson = sub === '__unset__' ? '' : sub
  const personRequests = requests.filter(r => personKey(r) === activePerson)
  // 承認待ちの追加戸籍請求（案件全体）。戸籍請求タブ上部にパネルで出し、横スクロール無しで承認できる。
  const pendingApprovals = requests.filter(r => r.is_additional && !r.additional_approved_at)

  return (
    <div>
      {pendingApprovals.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800 mb-2">
            <Lock className="w-3.5 h-3.5" />承認待ちの追加戸籍請求　{pendingApprovals.length}件
          </div>
          <div className="space-y-2">
            {pendingApprovals.map(r => (
              <div key={r.id} className="bg-white border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <button type="button" onClick={() => setSub((r.target_person ?? '').trim() || '__unset__')} className="text-[12.5px] font-semibold text-gray-800 hover:text-brand-700 hover:underline">
                    {r.target_person || '対象者未定'} ／ {r.request_to || '役所未定'}
                  </button>
                  <div className="text-[12px] text-gray-600 mt-0.5">理由：{r.additional_reason || <span className="text-gray-400">（未記入）</span>}</div>
                </div>
                {isManager ? (
                  <button type="button" onClick={() => approveAdditional(r)} className="flex-none inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700">
                    <ShieldCheck className="w-3.5 h-3.5" />追加OK（承認）
                  </button>
                ) : (
                  <span className="flex-none text-[11px] text-amber-700 self-center">管理担当の承認待ち</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    <div className="flex gap-3 items-start">
      {/* 左レール（対象者＝人ごと） */}
      <div className="flex-none w-52 flex flex-col gap-0.5 border-r border-gray-200 pr-2">
        {railTabs.map(t => {
          const isTop = t.id === 'top'
          const person = t.id === '__unset__' ? '' : t.id
          const reqs = isTop ? [] : requests.filter(r => personKey(r) === person)
          const received = reqs.some(r => !!r.arrival_date)
          const pending = reqs.some(r => r.is_additional && !r.additional_approved_at)
          return (
            <div key={t.id} className="group/rail relative flex items-center">
              <button type="button" onClick={() => setSub(t.id)}
                className={`flex-1 min-w-0 text-left text-[12px] px-2.5 py-1.5 rounded-md flex items-center gap-1.5 ${sub === t.id ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
                {isTop ? <Table2 className="w-3.5 h-3.5 flex-none" /> : pending ? <Lock className="w-3 h-3 flex-none text-amber-500" /> : <span className="w-3.5 h-3.5 flex-none" />}
                <span className="flex-1 break-words leading-tight">{t.label}</span>
                {!isTop && <span className="text-[9px] font-semibold px-1 rounded flex-none bg-gray-100 text-gray-600">{reqs.length}</span>}
                {received && <Inbox className="w-3 h-3 flex-none text-emerald-600" aria-label="受信済あり" />}
              </button>
              {!isTop && reqs.length > 0 && (
                <button type="button" onClick={() => deletePersonGroup(t.id)} title="この人の戸籍請求を一括削除"
                  className="flex-none ml-0.5 p-1 rounded text-gray-300 opacity-0 group-hover/rail:opacity-100 hover:text-red-500 hover:bg-red-50 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        })}
        {sub !== 'top' && (
          <button type="button" onClick={() => setAddOpen(true)} className="mt-1 text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-brand-700 hover:border-brand-300 inline-flex items-center gap-1"><Plus className="w-3 h-3" />戸籍を追加</button>
        )}
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
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">戸籍請求がありません。左で人を選び「戸籍を追加」から登録してください。</td></tr>
                    ) : requests.map((r, i) => (
                      <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-brand-50/30 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`} onClick={() => setSub((r.target_person ?? '').trim() || '__unset__')}>
                        <td className="px-2.5 py-2 font-medium text-gray-800">{r.target_person || <span className="text-gray-300">—</span>}{r.is_additional && <span className="ml-1 text-[10px] text-amber-600">追加</span>}</td>
                        <td className="px-2.5 py-2 text-gray-700">{r.request_to || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2.5 py-2">{r.request_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2">{r.arrival_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2 text-right">{yen(effConfirmed(r))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-gray-700">
                      <td className="px-2.5 py-2 text-right" colSpan={4}>確定費用 合計（立替実費の実績）</td>
                      <td className="px-2.5 py-2 text-right text-emerald-700">{yen(confirmedTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 戸籍取得状況図：相続関係説明図に状態を枠色で反映＋ホバーで進捗/結果 */}
            <div>
              <SectionHeading title="戸籍の取得状況（相続関係説明図）" hint="枠色＝戸籍の取得状況（緑=完了／青=対応中／橙=追加調査中／灰=未着手）。ノードにマウスを乗せると進捗/結果を表示します。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              {heirs.length === 0 ? (
                <p className="text-[12px] text-gray-400 text-center py-4">相続人が未登録です。「相続人」タブで登録すると、ここに相続関係説明図が表示されます。</p>
              ) : (
                <div className="overflow-x-auto"><InheritanceDiagramV2 deceased={caseData} heirs={heirs} statusByName={statusByName} /></div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey={`koseki_person_${activePerson || 'unset'}`} title={`進捗/結果（${sub === '__unset__' ? '対象者 未設定' : activePerson}の戸籍）`}
              onSaved={v => setMemoByName(prev => ({ ...prev, [activePerson.trim()]: v.body }))} />
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <SectionHeading title={`${sub === '__unset__' ? '対象者 未設定' : activePerson}の戸籍（役所ごと・1行=1戸籍）`} hint="取得区分＝依頼者の行は、請求日・費用・ダブルチェックが「依頼者負担」になり入力不可です。追加戸籍請求（要承認）は管理担当の承認後に編集できます。全項目はその場で直接編集できます。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              {personRequests.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-gray-400">この人の戸籍請求がありません。「戸籍を追加」から登録してください（転籍が判明したら役所を足していきます）。</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-[12px] border-collapse" style={{ minWidth: 1660, width: 'max-content' }}>
                    <thead>
                      <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
                        <th className="px-2 py-2 text-left font-semibold w-40">請求先（役所）</th>
                        <th className="px-2 py-2 text-left font-semibold w-20">取得区分</th>
                        <th className="px-2 py-2 text-left font-semibold w-32">範囲</th>
                        <th className="px-2 py-2 text-left font-semibold w-24">種別</th>
                        <th className="px-2 py-2 text-left font-semibold w-36">戸籍請求理由</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">請求日</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">到着日</th>
                        <th className="px-2 py-2 text-right font-semibold w-24">費用予算</th>
                        <th className="px-2 py-2 text-right font-semibold w-20">返金</th>
                        <th className="px-2 py-2 text-right font-semibold w-24">確定費用</th>
                        <th className="px-2 py-2 text-left font-semibold w-32">請求時W-Check</th>
                        <th className="px-2 py-2 text-left font-semibold w-32">受信時W-Check</th>
                        <th className="px-2 py-2 text-left font-semibold w-36">特記</th>
                        <th className="px-2 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {personRequests.map((r, i) => (
                        <KosekiRow key={r.id} r={r} i={i} me={me} meId={memberId} isManager={isManager}
                          highlight={r.id === focusId}
                          saveField={saveField} saveMany={saveMany}
                          onDelete={() => delRequest(r)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {addOpen && <AddKosekiModal targetOptions={targetOptions} defaultPerson={activePerson} onClose={() => setAddOpen(false)} onSubmit={submitAdd} />}
    </div>
    </div>
  )
}

function AddKosekiModal({ targetOptions, defaultPerson, onClose, onSubmit }: {
  targetOptions: string[]
  defaultPerson: string
  onClose: () => void
  onSubmit: (form: { target_person: string; request_to: string; reason: string; needsApproval: boolean }) => void
}) {
  const [target, setTarget] = useState(defaultPerson || '')
  const [reqTo, setReqTo] = useState('')
  const [reason, setReason] = useState('')
  const [needsApproval, setNeedsApproval] = useState(false)
  const [busy, setBusy] = useState(false)
  const inp = 'w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand-400 bg-white'
  const canSubmit = !!target.trim() && (!needsApproval || !!reason.trim())
  return (
    <Modal isOpen onClose={onClose} title="戸籍を追加">
      <div className="space-y-3">
        <div><label className="block text-[11px] text-gray-500 mb-1">対象者（誰の戸籍か）</label>
          <select value={target} onChange={e => setTarget(e.target.value)} className={inp}><option value="">選択…</option>{targetOptions.map(o => <option key={o} value={o}>{o}</option>)}</select>
          <p className="text-[10.5px] text-gray-400 mt-1">一覧にない場合は「相続人」タブで追加してください。</p>
        </div>
        <div><label className="block text-[11px] text-gray-500 mb-1">請求先（役所）</label><input value={reqTo} onChange={e => setReqTo(e.target.value)} placeholder="例: 江東区役所（転籍先など。後で入力も可）" className={inp} /></div>
        <label className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800 cursor-pointer">
          <input type="checkbox" checked={needsApproval} onChange={e => setNeedsApproval(e.target.checked)} className="w-4 h-4 accent-amber-500 mt-0.5" />
          <span className="flex-1"><strong>追加戸籍請求（要承認）</strong>にする — 当初の想定を超える追加の戸籍請求です。追加費用が発生するため、管理担当の承認（追加OK）を得てから請求します。</span>
        </label>
        {needsApproval && (
          <div><label className="block text-[11px] text-gray-500 mb-1">追加請求の理由（承認者に伝わるように） <span className="text-red-500">*</span></label><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="例：手続二子の戸籍が◯◯町で転籍。さらに前の本籍地へ遡って請求が必要。" className={`${inp} resize-none`} /></div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] text-gray-600 hover:text-gray-800">キャンセル</button>
          <button type="button" disabled={busy || !canSubmit} onClick={() => { setBusy(true); onSubmit({ target_person: target, request_to: reqTo, reason: reason.trim(), needsApproval }) }}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold text-white rounded-md disabled:opacity-50 ${needsApproval ? 'bg-amber-500 hover:bg-amber-600' : 'bg-brand-600 hover:bg-brand-700'}`}>
            {needsApproval ? <><ShieldCheck className="w-3.5 h-3.5" />申請する（要承認）</> : <><Plus className="w-3.5 h-3.5" />追加する</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// 戸籍1件＝1行。全項目をインライン編集（横スクロール）。要承認は行を帯にして承認ボタンを出す。
function KosekiRow({ r, i, me, meId, isManager, highlight = false, saveField, saveMany, onDelete }: {
  r: KosekiRequestRow
  i: number
  me: string
  meId: string | null
  isManager: boolean
  highlight?: boolean
  saveField: (id: string, field: keyof KosekiRequestRow, value: unknown) => Promise<void>
  saveMany: (id: string, patch: Partial<KosekiRequestRow>) => Promise<void>
  onDelete: () => void
}) {
  const rowRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => { if (highlight && rowRef.current) rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [highlight])
  // 予定外の追加（要承認・未承認）は行を帯にして承認まで編集不可。
  if (r.is_additional && !r.additional_approved_at) {
    return (
      <tr className="border-b border-gray-100 last:border-b-0">
        <td colSpan={14} className="p-0">
          <div className="flex items-center gap-2.5 px-3 py-2 bg-amber-50 border-l-[3px] border-amber-400">
            <Lock className="w-4 h-4 flex-none text-amber-600" />
            <span className="flex-1 text-[12px] text-amber-800"><strong className="font-semibold">{r.request_to || '役所未定'}（追加・要承認）</strong> — 上部の「承認待ちの追加戸籍請求」で管理担当が承認すると、この行で各項目を編集できます。</span>
            <button type="button" onClick={onDelete} title="削除" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>
    )
  }

  const isClient = r.acquirer === '依頼者'  // 依頼者取得＝請求日・費用・DCは依頼者負担
  const muted = <span className="text-[11px] text-gray-400">—</span>
  return (
    <tr ref={rowRef} className={`border-b border-gray-100 last:border-b-0 ${highlight ? 'bg-brand-50 ring-2 ring-brand-300 ring-inset' : i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
      <td className="px-2 py-1.5"><TxtCell value={r.request_to} onCommit={v => saveField(r.id, 'request_to', v)} placeholder="役所名" /></td>
      <td className="px-2 py-1.5"><SelCell value={r.acquirer} options={ACQUIRERS} onChange={v => saveField(r.id, 'acquirer', v)} /></td>
      <td className="px-2 py-1.5"><SelCell value={r.range_text} options={[...KOSEKI_RANGES]} onChange={v => saveField(r.id, 'range_text', v)} /></td>
      <td className="px-2 py-1.5"><SelCell value={r.doc_types} options={[...KOSEKI_REQUEST_TYPES]} onChange={v => saveField(r.id, 'doc_types', v)} /></td>
      <td className="px-2 py-1.5"><SelCell value={r.request_reason} options={[...KOSEKI_REQUEST_REASONS]} onChange={v => saveField(r.id, 'request_reason', v)} /></td>
      <td className="px-2 py-1.5">{isClient ? <span className="text-[11px] text-gray-400">依頼者取得</span> : <DateCell value={r.request_date} onCommit={v => saveMany(r.id, { request_date: v || null, ...(v && !r.request_done_by ? { request_done_by: meId } : {}) })} />}</td>
      <td className="px-2 py-1.5"><DateCell value={r.arrival_date} onCommit={v => saveMany(r.id, { arrival_date: v || null, ...(v && !r.receipt_done_by ? { receipt_done_by: meId } : {}) })} /></td>
      {isClient ? (
        <>
          <td className="px-2 py-1.5 text-center"><span className="text-[11px] text-gray-400">依頼者負担</span></td>
          <td className="px-2 py-1.5 text-center">{muted}</td>
          <td className="px-2 py-1.5 text-center">{muted}</td>
          <td className="px-2 py-1.5 text-center">{muted}</td>
          <td className="px-2 py-1.5 text-center">{muted}</td>
        </>
      ) : (
        <>
          <td className="px-2 py-1.5"><MoneyCell value={r.cost_budget} onCommit={v => saveField(r.id, 'cost_budget', v === '' ? null : Number(v))} /></td>
          <td className="px-2 py-1.5"><MoneyCell value={r.cost_refund} onCommit={v => saveField(r.id, 'cost_refund', v === '' ? null : Number(v))} /></td>
          <td className="px-2 py-1.5 text-right"><span className="inline-block px-2 py-1 rounded text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">{yen(effConfirmed(r))}</span></td>
          <td className="px-2 py-1.5"><DcCell name={r.request_check_name} at={r.request_check_at} me={me} meId={meId} workerId={r.request_done_by} isManager={isManager} onSet={(n, a, id) => saveMany(r.id, { request_check_name: n, request_check_at: a, request_check_by: id ?? null })} /></td>
          <td className="px-2 py-1.5"><DcCell name={r.receipt_check_name} at={r.receipt_check_at} me={me} meId={meId} workerId={r.receipt_done_by} isManager={isManager} onSet={(n, a, id) => saveMany(r.id, { receipt_check_name: n, receipt_check_at: a, receipt_check_by: id ?? null })} /></td>
        </>
      )}
      <td className="px-2 py-1.5"><TxtCell value={r.notes} onCommit={v => saveField(r.id, 'notes', v)} placeholder="特記" /></td>
      <td className="px-2 py-1.5 text-center"><button type="button" onClick={onDelete} title="削除" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></td>
    </tr>
  )
}
