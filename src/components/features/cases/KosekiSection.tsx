'use client'

// 戸籍請求（実務）：TOP（進捗サマリー＋取得状況表＋相続相関図）＋左レール（請求単位タブ）。
// 各請求はカード形式。費用（予算/返金/確定）＋ダブルチェック（自分以外）。追加請求は管理担当の承認ゲート。

import { useState, useEffect } from 'react'
import { Plus, Table2, Lock, ShieldCheck, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useIsManager } from '@/components/providers/AuthProvider'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { FieldGrid, InlineSelect, InlineEdit, InlineDate, InlineTextarea, SectionHeading } from '@/components/ui/InlineFields'
import { KOSEKI_REQUEST_TYPES, KOSEKI_PURPOSES, KOSEKI_RANGES, KOSEKI_REQUEST_REASONS } from '@/lib/constants'
import ProgressSummary, { summaryStatusClass } from './ProgressSummary'
import { CostBlock, DoubleCheck } from './CostAndCheck'
import InheritanceDiagramV2 from './InheritanceDiagramV2'
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

  const addRequest = async (additional: boolean) => {
    let reason: string | null = null
    if (additional) {
      reason = window.prompt('追加請求の理由（必要な戸籍・転籍先など）')?.trim() || null
      if (!reason) return
    }
    const { data, error } = await supabase.from('koseki_requests')
      .insert({ case_id: caseId, sort_order: requests.length, is_additional: additional, additional_reason: reason })
      .select('id').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setSub((data as { id: string }).id)
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
  const jumpToPerson = (name: string) => { const r = requests.find(x => (x.target_person ?? '').trim() === name.trim()); if (r) setSub(r.id) }
  // 取得状況リスト：被相続人＋相続人（続柄付き）
  const peopleRows = [
    { name: deceasedName ?? '', rel: '被相続人' },
    ...heirs.map(h => ({ name: h.name, rel: (h.relationship_type || h.relationship || '').trim() || '相続人' })),
  ].filter(p => p.name.trim())

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
          return (
            <button key={t.id} type="button" onClick={() => setSub(t.id)}
              className={`text-left text-[12px] px-2.5 py-1.5 rounded-md flex items-center gap-1.5 ${sub === t.id ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t.id === 'top' ? <Table2 className="w-3.5 h-3.5 flex-none" /> : pending ? <Lock className="w-3 h-3 flex-none text-amber-500" /> : <span className={`w-1.5 h-1.5 rounded-full flex-none border ${summaryStatusClass(st)}`} />}
              <span className="truncate">{t.label}</span>
            </button>
          )
        })}
        <button type="button" onClick={() => addRequest(false)} className="mt-1 text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-brand-700 hover:border-brand-300 inline-flex items-center gap-1"><Plus className="w-3 h-3" />請求を追加</button>
        <button type="button" onClick={() => addRequest(true)} className="text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 inline-flex items-center gap-1"><Plus className="w-3 h-3" />追加請求（承認要）</button>
      </div>

      {/* 本文 */}
      <div className="flex-1 min-w-0">
        {sub === 'top' ? (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey="koseki" title="進捗サマリー（戸籍調査 全体）" />
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

            {/* 戸籍取得状況図：相続関係説明図（相続人タブと同じ図）＋人ごとの取得状況 */}
            <div>
              <SectionHeading title="戸籍の取得状況（相続関係説明図）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              {heirs.length === 0 ? (
                <p className="text-[12px] text-gray-400 text-center py-4">相続人が未登録です。「相続人」タブで登録すると、ここに相続関係説明図が表示されます。</p>
              ) : (
                <div className="overflow-x-auto"><InheritanceDiagramV2 deceased={caseData} heirs={heirs} /></div>
              )}
              <div className="mt-3 space-y-1.5">
                {peopleRows.map(p => {
                  const st = statusForName(p.name)
                  const body = bodyForName(p.name)
                  const hasReq = reqsForName(p.name).length > 0
                  return (
                    <button key={`${p.rel}-${p.name}`} type="button" onClick={() => jumpToPerson(p.name)} disabled={!hasReq}
                      className={`w-full flex items-start gap-2.5 text-left rounded-md border border-gray-200 px-3 py-2 ${hasReq ? 'hover:border-brand-300 cursor-pointer' : 'cursor-default'}`}>
                      <span className="text-[10.5px] text-gray-400 w-16 flex-none pt-0.5">{p.rel}</span>
                      <span className="text-[12.5px] font-medium text-gray-800 w-24 flex-none">{p.name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border flex-none ${summaryStatusClass(st)}`}>{st}</span>
                      <span className="text-[11.5px] text-gray-500 flex-1 min-w-0 truncate">{body || (hasReq ? '—' : '請求なし')}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] text-gray-400">図は相続人タブと同じ相続関係説明図。下の一覧で「誰の戸籍がどこまで取得済か」＋進捗サマリーを確認（行クリックでその人の請求タブへ）。</p>
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
    </div>
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

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <ProgressSummary caseId={caseId} scopeKey={`koseki_req_${r.id}`} title={`進捗サマリー（${reqLabel(r)}）`} />
      </div>

      <div>
        <SectionHeading title="請求内容" className="mb-2.5 pb-1.5 border-b border-gray-200" />
        <FieldGrid>
          <InlineEdit label="請求先" value={r.request_to} onSave={v => saveField(r.id, 'request_to', v)} />
          <InlineSelect label="対象者" value={r.target_person} options={targetOptions} onSave={v => saveField(r.id, 'target_person', v)} />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-400">続柄（相続人タブ参照）</span>
            <span className="px-2 py-1.5 text-[12.5px] bg-gray-50 border border-gray-200 rounded text-gray-700">{relLabel || '—'}</span>
          </div>
          <InlineSelect label="範囲" value={r.range_text} options={[...KOSEKI_RANGES]} onSave={v => saveField(r.id, 'range_text', v)} />
          <InlineSelect label="種別" value={r.doc_types} options={[...KOSEKI_REQUEST_TYPES]} onSave={v => saveField(r.id, 'doc_types', v)} />
          <InlineSelect label="取得目的" value={r.purpose} options={[...KOSEKI_PURPOSES]} onSave={v => saveField(r.id, 'purpose', v)} />
          <InlineSelect label="取得区分" value={r.acquirer} options={ACQUIRERS} onSave={v => saveField(r.id, 'acquirer', v)} />
          <InlineDate label="請求日" value={r.request_date} onSave={v => saveField(r.id, 'request_date', v)} />
          <InlineDate label="到着日" value={r.arrival_date} onSave={v => saveField(r.id, 'arrival_date', v)} />
          <InlineSelect label="戸籍請求理由" value={r.request_reason} options={[...KOSEKI_REQUEST_REASONS]} onSave={v => saveField(r.id, 'request_reason', v)} />
          <InlineTextarea label="特記事項" value={r.notes} onSave={v => saveField(r.id, 'notes', v)} fullWidth />
        </FieldGrid>
      </div>

      <CostBlock budget={r.cost_budget} refund={r.cost_refund} confirmed={effConfirmed(r)} mode="full"
        onSave={(field, v) => saveField(r.id, field, v === '' ? null : Number(v))} />

      <div className="flex gap-2.5 flex-wrap">
        <DoubleCheck label="請求時ダブルチェック（自分以外）" name={r.request_check_name} at={r.request_check_at}
          onSet={(name, at) => saveMany(r.id, { request_check_name: name, request_check_at: at })} />
        <DoubleCheck label="受信時ダブルチェック（自分以外）" name={r.receipt_check_name} at={r.receipt_check_at}
          onSet={(name, at) => saveMany(r.id, { receipt_check_name: name, receipt_check_at: at })} />
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" />この請求を削除</button>
      </div>
    </div>
  )
}
