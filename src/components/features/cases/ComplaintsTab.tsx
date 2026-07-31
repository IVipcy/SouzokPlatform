'use client'

// 不満・クレーム。案件報告と同じフォーマット(報告→確認)。
// 「クレーム・不満を記録」ボタン → モーダル(状況/報告内容/対応内容) → 送信で 依頼中(=報告中) で挿入。
// 受注担当は「確認する」→ 報告内容表示 + 確認した内容 を入力して 確認済 に。
// severity∈{クレーム,大クレーム}で cases.has_complaint=true を自動セット(migration 197 のトリガー)。

import { useState, useEffect } from 'react'
import { Plus, MessageSquare, Send, Check, AlertTriangle } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import HourenSouModal from './HourenSouModal'
import AddTaskModal from './AddTaskModal'
import type { CaseRow, MemberRow, CaseComplaintRow, ComplaintSeverity, ComplaintAction } from '@/types'

const SEVERITY_OPTIONS: ComplaintSeverity[] = ['少し不満', '不満', 'クレーム', '大クレーム']
const ACTION_OPTIONS: ComplaintAction[] = ['謝罪・即対応（完結）', '謝罪・受注相談']

const SEVERITY_CHIP: Record<ComplaintSeverity, string> = {
  '少し不満': 'bg-amber-50 text-amber-800 border border-amber-200',
  '不満':     'bg-red-50 text-red-700 border border-red-200',
  'クレーム':  'bg-red-100 text-red-800 border border-red-300 font-semibold',
  '大クレーム': 'bg-red-600 text-white font-semibold',
}
const ACTION_CHIP: Record<ComplaintAction, string> = {
  '謝罪・即対応（完結）': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  '謝罪・受注相談':       'bg-amber-50 text-amber-700 border border-amber-200',
}

type Props = {
  caseData: CaseRow
  currentMemberId: string | null
  salesMemberId?: string | null
  allMembers: MemberRow[]
}

export default function ComplaintsTab({ caseData, currentMemberId: serverMemberId, salesMemberId = null, allMembers }: Props) {
  const currentMemberId = useCurrentMember(serverMemberId)
  const [rows, setRows] = useState<CaseComplaintRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reportOpen, setReportOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<CaseComplaintRow | null>(null)
  const [confirmComment, setConfirmComment] = useState('')
  const [confirmSaving, setConfirmSaving] = useState(false)
  const [hourenSouOpen, setHourenSouOpen] = useState(false)
  const [addTaskOpen, setAddTaskOpen] = useState(false)

  // 「クレーム・不満を記録」モーダルの入力
  const [mSeverity, setMSeverity] = useState<ComplaintSeverity>('少し不満')
  const [mDetail, setMDetail] = useState('')
  const [mAction, setMAction] = useState<ComplaintAction | ''>('')

  const memberName = (id: string | null) => (id ? allMembers.find(m => m.id === id)?.name ?? '—' : '—')

  const fetchRows = async () => {
    const supabase = createClient()
    try {
      const { data } = await supabase.from('case_complaints').select('*').eq('case_id', caseData.id).order('requested_date', { ascending: false, nullsFirst: false })
      setRows((data ?? []) as CaseComplaintRow[])
    } catch { /* migration 未適用時は空扱い */ }
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchRows() }, [caseData.id])

  const openReport = () => {
    setMSeverity('少し不満')
    setMDetail('')
    setMAction('')
    setReportOpen(true)
  }

  const submitReport = async () => {
    if (submitting) return
    setSubmitting(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    // migration 201 未適用環境では status/requested_date/requester_id 列が無いためフォールバック挿入。
    let { data, error } = await supabase.from('case_complaints').insert({
      case_id: caseData.id,
      occurred_at: today,
      requested_date: today,
      requester_id: currentMemberId || null,
      created_by: currentMemberId || null,
      status: '依頼中',
      severity: mSeverity,
      contact_method: null,
      detail: mDetail.trim() || null,
      action: (mAction || null) as ComplaintAction | null,
    }).select('*').single()
    if (error && /(requested_date|requester_id|status|confirmer_id|confirmed_date|confirm_comment)/i.test(error.message ?? '')) {
      // migration 201 未適用時のフォールバック: 旧スキーマの必須列のみで作成
      const retry = await supabase.from('case_complaints').insert({
        case_id: caseData.id,
        occurred_at: today,
        created_by: currentMemberId || null,
        severity: mSeverity,
        contact_method: null,
        detail: mDetail.trim() || null,
        action: (mAction || null) as ComplaintAction | null,
      }).select('*').single()
      data = retry.data
      error = retry.error
    }
    setSubmitting(false)
    if (error || !data) {
      console.error('case_complaints insert failed:', error)
      showToast(`報告に失敗しました: ${error?.message ?? ''}`, 'error')
      return
    }
    setRows(prev => [data as CaseComplaintRow, ...prev])
    setReportOpen(false)
    // 受注担当へ通知
    if (salesMemberId && salesMemberId !== currentMemberId) {
      const isSevere = mSeverity === 'クレーム' || mSeverity === '大クレーム'
      await supabase.from('notifications').insert({
        member_id: salesMemberId,
        type: 'case_complaint',
        case_id: caseData.id,
        title: isSevere ? `【重要】${mSeverity}が記録されました` : '不満・クレームが記録されました',
        body: `${caseData.case_number} ${caseData.deal_name}：${mDetail.trim() || '内容を確認してください'}`,
      })
    }
    showToast('クレーム報告を送信しました', 'success')
  }

  const openConfirmModal = (r: CaseComplaintRow) => {
    setConfirmTarget(r)
    setConfirmComment('')
  }

  const submitConfirm = async () => {
    if (!confirmTarget || !currentMemberId) return
    if (confirmTarget.requester_id === currentMemberId) { showToast('報告した本人は確認できません', 'error'); return }
    setConfirmSaving(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('case_complaints')
      .update({ status: '確認済', confirmed_date: today, confirmer_id: currentMemberId, confirm_comment: confirmComment.trim() || null })
      .eq('id', confirmTarget.id)
    setConfirmSaving(false)
    if (error) { showToast(`確認に失敗しました: ${error.message}`, 'error'); return }
    // 報告者へ通知
    if (confirmTarget.requester_id) {
      await supabase.from('notifications').insert({
        member_id: confirmTarget.requester_id,
        type: 'case_complaint_confirmed',
        case_id: caseData.id,
        title: 'クレーム報告が確認されました',
        body: `${caseData.case_number} ${caseData.deal_name}：${memberName(currentMemberId)} さんが確認しました`,
      })
    }
    setRows(prev => prev.map(x => x.id === confirmTarget.id ? { ...x, status: '確認済', confirmed_date: today, confirmer_id: currentMemberId, confirm_comment: confirmComment.trim() || null } : x))
    setConfirmTarget(null)
    setConfirmComment('')
    showToast('確認済にしました', 'success')
  }

  return (
    <div className="space-y-3.5">
      {/* アクションボタンはセクション外（上部）に配置（他タブと統一） */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" leftIcon={<AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />} onClick={openReport}>
          クレーム・不満を記録
        </Button>
        <Button variant="secondary" size="sm" leftIcon={<MessageSquare className="w-3.5 h-3.5" strokeWidth={2} />} onClick={() => setHourenSouOpen(true)}>
          報連相
        </Button>
        <Button variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" strokeWidth={2.25} />} onClick={() => setAddTaskOpen(true)}>
          タスク化
        </Button>
      </div>
      <Section title="クレーム報告">
        <p className="text-[11px] text-gray-400 mb-2.5">「クレーム・不満を記録」→ 受注担当へ通知 →<span className="font-medium text-gray-500"> 報告した本人以外が「確認する」</span>を押します。クレーム／大クレームは案件のクレームフラグ（紫）が自動で立ちます。</p>

        {loading ? (
          <div className="px-4 py-6 text-center text-[13px] text-gray-400">読み込み中...</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-gray-400">クレーム報告はまだありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 1000 }}>
              <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">報告者</th>
                  <th className="px-3 py-2 text-left font-medium">報告日</th>
                  <th className="px-3 py-2 text-left font-medium">状況</th>
                  <th className="px-3 py-2 text-left font-medium">報告内容</th>
                  <th className="px-3 py-2 text-left font-medium">対応内容</th>
                  <th className="px-3 py-2 text-left font-medium">確認コメント</th>
                  <th className="px-3 py-2 text-left font-medium">確認者</th>
                  <th className="px-3 py-2 text-left font-medium">ステータス</th>
                  <th className="px-3 py-2 text-left font-medium">確認日</th>
                  <th className="px-3 py-2 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => {
                  const isRequester = !!currentMemberId && r.requester_id === currentMemberId
                  const canConfirm = r.status === '依頼中' && !!currentMemberId && !isRequester
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2.5 text-[12px] text-gray-700">{memberName(r.requester_id)}</td>
                      <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{r.requested_date ?? r.occurred_at}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-[5px] text-[11px] whitespace-nowrap ${SEVERITY_CHIP[r.severity]}`}>{r.severity}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700 max-w-[240px] whitespace-pre-wrap">{r.detail || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5">
                        {r.action ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-[5px] text-[11px] whitespace-nowrap ${ACTION_CHIP[r.action]}`}>{r.action}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700 max-w-[220px] whitespace-pre-wrap">{r.confirm_comment || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700">{memberName(r.confirmer_id)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${r.status === '確認済' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{r.status === '依頼中' ? '報告中' : '確認済'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{r.confirmed_date ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-right">
                        {canConfirm && (
                          <button type="button" onClick={() => openConfirmModal(r)} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap">
                            <Check className="w-3 h-3" strokeWidth={2.25} />確認する
                          </button>
                        )}
                        {r.status === '依頼中' && isRequester && <span className="text-[11px] text-gray-400">本人は確認不可</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* クレーム報告モーダル: 重要度/連絡方法/報告内容/対応内容 */}
      <Modal
        isOpen={reportOpen}
        onClose={() => !submitting && setReportOpen(false)}
        title="クレーム報告"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportOpen(false)} disabled={submitting}>キャンセル</Button>
            <Button variant="primary" onClick={submitReport} loading={submitting} leftIcon={<Send className="w-3.5 h-3.5" strokeWidth={2} />}>報告する</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-[13px] font-semibold text-gray-600">状況</label>
            <select value={mSeverity} onChange={e => setMSeverity(e.target.value as ComplaintSeverity)}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400">
              {SEVERITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[13px] font-semibold text-gray-600">報告内容 <span className="font-normal text-gray-400">（任意）</span></label>
            <textarea value={mDetail} onChange={e => setMDetail(e.target.value)}
              placeholder="例：〇〇のご連絡が遅かったとお叱り／進捗の見えなさに不満"
              rows={4}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 resize-y" />
          </div>
          <div className="space-y-1">
            <label className="block text-[13px] font-semibold text-gray-600">対応内容 <span className="font-normal text-gray-400">（任意）</span></label>
            <select value={mAction} onChange={e => setMAction(e.target.value as ComplaintAction | '')}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400">
              <option value="">未選択</option>
              {ACTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-gray-400">送信後、受注担当が確認します。クレーム／大クレームは案件のクレームフラグ（紫）が自動で立ちます。</p>
        </div>
      </Modal>

      {/* 確認モーダル(案件報告と同じテイスト) */}
      <Modal
        isOpen={!!confirmTarget}
        onClose={() => { if (!confirmSaving) { setConfirmTarget(null); setConfirmComment('') } }}
        title="クレーム報告"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setConfirmTarget(null); setConfirmComment('') }} disabled={confirmSaving}>キャンセル</Button>
            <Button variant="primary" onClick={submitConfirm} loading={confirmSaving} leftIcon={<Check className="w-3.5 h-3.5" strokeWidth={2.25} />}>確認した</Button>
          </>
        }
      >
        {confirmTarget && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex px-2 py-0.5 rounded-[5px] text-[11px] whitespace-nowrap ${SEVERITY_CHIP[confirmTarget.severity]}`}>{confirmTarget.severity}</span>
              {confirmTarget.action && <span className={`inline-flex px-2 py-0.5 rounded-[5px] text-[11px] whitespace-nowrap ${ACTION_CHIP[confirmTarget.action]}`}>{confirmTarget.action}</span>}
            </div>
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-gray-600">報告内容</label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <div className="text-[13px] text-gray-700 whitespace-pre-wrap">{confirmTarget.detail || <span className="text-gray-400">（指定なし）</span>}</div>
                <div className="text-[11px] text-gray-400 mt-1">{memberName(confirmTarget.requester_id)} ・ {confirmTarget.requested_date ?? confirmTarget.occurred_at} 報告</div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-gray-600">確認した内容 <span className="font-normal text-gray-400">（任意）</span></label>
              <textarea value={confirmComment} onChange={e => setConfirmComment(e.target.value)}
                placeholder="例：お客様へ電話し謝罪。今後の進捗共有ルールを説明"
                rows={4}
                className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 resize-y" />
            </div>
          </div>
        )}
      </Modal>

      <HourenSouModal
        isOpen={hourenSouOpen}
        onClose={() => setHourenSouOpen(false)}
        caseData={caseData}
        currentMemberId={currentMemberId}
        salesMemberId={salesMemberId}
        allMembers={allMembers}
      />
      <AddTaskModal
        isOpen={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        caseId={caseData.id}
        allMembers={allMembers}
        onSaved={fetchRows}
      />
    </div>
  )
}
