'use client'

import { useState, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { StickyNote, ExternalLink, CheckCircle2 as CheckIcon } from 'lucide-react'
import UserAvatar from '@/components/ui/UserAvatar'
import { Section } from '@/components/ui/InlineFields'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import type { CaseRow, CaseActivityRow, MemberRow, ProgressReportRow } from '@/types'

type Props = {
  caseData: CaseRow
  allMembers: MemberRow[]
  currentMemberId: string | null
  /** 確認者＝この案件の受注担当（依頼先に固定）。 */
  salesMemberId?: string | null
  /** 進捗確認を依頼できるか（この案件の管理担当のときのみ true）。 */
  canRequestReview?: boolean
  /** 進捗メモのタスクリンクで「完了」判定するために渡す（任意） */
  tasks?: { id: string; status: string }[]
}

/**
 * 進捗報告・メモ（案件進捗タブの子タブ）。
 * 進捗報告と進捗メモを縦に並べて両方表示する（旧・内部タブ分けは解消）。
 * 進捗確認の依頼は「この案件の管理担当」だけが、確認者＝受注担当に対して出せる。
 */
export default function HistoryTab({ caseData, allMembers, currentMemberId: serverMemberId, salesMemberId, canRequestReview = false, tasks = [] }: Props) {
  const taskStatusMap = new Map(tasks.map(t => [t.id, t.status]))
  const currentMemberId = useCurrentMember(serverMemberId)
  const [newNote, setNewNote] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [activities, setActivities] = useState<CaseActivityRow[]>([])
  const [progressReports, setProgressReports] = useState<ProgressReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [reviewPointInput, setReviewPointInput] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [confirmComment, setConfirmComment] = useState('')
  const [confirmSaving, setConfirmSaving] = useState(false)

  const memberName = (id: string | null) => (id ? allMembers.find(m => m.id === id)?.name ?? '—' : '—')

  const fetchActivities = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('case_activities')
      .select('*, members(*), tasks(id, title)')
      .eq('case_id', caseData.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setActivities((data ?? []) as CaseActivityRow[])
    try {
      const { data: prData } = await supabase
        .from('progress_reports')
        .select('*')
        .eq('case_id', caseData.id)
        .order('requested_date', { ascending: false })
      setProgressReports((prData ?? []) as ProgressReportRow[])
    } catch { /* migration 未適用環境では空扱い */ }
    setLoading(false)
  }

  // 案件IDが変わったらサーバーから再取得（マウント時フェッチ）
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchActivities() }, [caseData.id])

  const handleAddNote = async () => {
    if (!newNote.trim() || !currentMemberId) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('case_activities').insert({
      case_id: caseData.id,
      member_id: currentMemberId,
      activity_type: 'note',
      title: newTitle.trim() || null,
      description: newNote.trim(),
      activity_date: new Date().toISOString().split('T')[0],
    })
    setNewNote('')
    setNewTitle('')
    setSaving(false)
    fetchActivities()
  }

  // 進捗確認を開始（管理担当のみ）。確認者は事前指定せず、確認ポイントを添えて確認待ちにする。
  const handleRequestReview = async () => {
    if (!canRequestReview) { showToast('進捗確認の依頼は管理担当のみ可能です', 'error'); return }
    if (!currentMemberId) { showToast('ログイン情報が取得できません', 'error'); return }
    setRequesting(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('progress_reports').insert({
      case_id: caseData.id,
      requester_id: currentMemberId,
      confirmer_id: null,
      status: '依頼中',
      requested_date: today,
      review_point: reviewPointInput.trim() || null,
    })
    setRequesting(false)
    if (error) { showToast('依頼に失敗しました', 'error'); return }
    setReviewPointInput('')
    showToast('進捗確認を依頼しました。その場で確認してもらいましょう', 'success')
    fetchActivities()
  }

  // 確認済にする（依頼者“以外”がログイン中の自分として確認）。確認コメントを添えて確認者＝自分で確定。
  const handleConfirm = async (pr: ProgressReportRow) => {
    if (!currentMemberId) return
    if (pr.requester_id === currentMemberId) { showToast('依頼した本人は確認できません', 'error'); return }
    setConfirmSaving(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('progress_reports')
      .update({ status: '確認済', confirmed_date: today, confirmer_id: currentMemberId, confirm_comment: confirmComment.trim() || null })
      .eq('id', pr.id)
    setConfirmSaving(false)
    if (error) { showToast('確認に失敗しました', 'error'); return }
    await supabase.from('notifications').insert({
      member_id: pr.requester_id,
      type: 'progress_review_confirmed',
      case_id: caseData.id,
      title: '進捗確認が完了しました',
      body: `${caseData.case_number} ${caseData.deal_name} の進捗を ${memberName(currentMemberId)} さんが確認しました`,
    })
    setConfirmingId(null); setConfirmComment('')
    showToast('確認済にしました', 'success')
    fetchActivities()
  }

  // メモ一覧（活動履歴のうち手入力メモのみ。タスク着手/完了・ステータス変更は
  // タイムラインに統合したため、ここでは表示しない）
  const notes = activities
    .filter(a => a.activity_type === 'note')
    .sort((a, b) => b.activity_date.localeCompare(a.activity_date))

  return (
    <div className="space-y-3.5">
      {/* 進捗報告 */}
      <Section
        title="進捗報告"
        actionLabel={canRequestReview ? undefined : undefined}
      >
        {canRequestReview && (
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <input
              type="text"
              value={reviewPointInput}
              onChange={e => setReviewPointInput(e.target.value)}
              placeholder="確認ポイント（確認してほしい内容・任意）"
              className="flex-1 min-w-[200px] text-[12px] border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
            />
            <button
              type="button"
              onClick={handleRequestReview}
              disabled={requesting}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
            >
              {requesting ? '依頼中...' : '進捗確認を依頼'}
            </button>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mb-2.5">確認ポイントを書いて依頼→相手の席で一緒に確認→<span className="font-medium text-gray-500">確認した本人が自分のPCで「確認済」</span>を押します（依頼者本人は押せません）。</p>
        {progressReports.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-gray-400">進捗確認依頼はまだありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 880 }}>
              <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">依頼者</th>
                  <th className="px-3 py-2 text-left font-medium">進捗確認依頼日</th>
                  <th className="px-3 py-2 text-left font-medium">確認ポイント</th>
                  <th className="px-3 py-2 text-left font-medium">確認コメント</th>
                  <th className="px-3 py-2 text-left font-medium">確認者</th>
                  <th className="px-3 py-2 text-left font-medium">ステータス</th>
                  <th className="px-3 py-2 text-left font-medium">確認日付</th>
                  <th className="px-3 py-2 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {progressReports.map(pr => {
                  const confirmer = allMembers.find(m => m.id === pr.confirmer_id)
                  const isRequester = !!currentMemberId && pr.requester_id === currentMemberId
                  const canConfirm = pr.status === '依頼中' && !!currentMemberId && !isRequester
                  return (
                    <Fragment key={pr.id}>
                      <tr className="hover:bg-gray-50/60">
                        <td className="px-3 py-2.5 text-[12px] text-gray-700">{memberName(pr.requester_id)}</td>
                        <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{pr.requested_date}</td>
                        <td className="px-3 py-2.5 text-[12px] text-gray-700 max-w-[220px] whitespace-pre-wrap">{pr.review_point || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-[12px] text-gray-700 max-w-[220px] whitespace-pre-wrap">{pr.confirm_comment || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5">
                          {confirmer ? (
                            <span className="inline-flex items-center gap-1.5"><UserAvatar name={confirmer.name} url={confirmer.avatar_url} size="sm" /><span className="text-[12px] text-gray-700">{confirmer.name}</span></span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${pr.status === '確認済' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{pr.status}</span>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{pr.confirmed_date ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-right">
                          {canConfirm && confirmingId !== pr.id && (
                            <button type="button" onClick={() => { setConfirmingId(pr.id); setConfirmComment('') }} className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 whitespace-nowrap">確認済にする</button>
                          )}
                          {pr.status === '依頼中' && isRequester && <span className="text-[11px] text-gray-400">本人は確認不可</span>}
                        </td>
                      </tr>
                      {confirmingId === pr.id && (
                        <tr className="bg-brand-50/40">
                          <td colSpan={8} className="px-3 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <input type="text" value={confirmComment} onChange={e => setConfirmComment(e.target.value)} placeholder="確認コメント（任意）" className="flex-1 min-w-[200px] text-[12px] border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400" />
                              <button type="button" onClick={() => handleConfirm(pr)} disabled={confirmSaving} className="inline-flex items-center px-3 py-1.5 text-[12px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50">{confirmSaving ? '確認中...' : '確認して完了'}</button>
                              <button type="button" onClick={() => { setConfirmingId(null); setConfirmComment('') }} className="text-[12px] text-gray-400 hover:text-gray-600 px-1">キャンセル</button>
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
        )}
      </Section>

      {/* 進捗メモ */}
      <Section title="進捗メモ">
        <div className="flex gap-2 items-start mb-3">
          <div className="flex-1 space-y-2">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="タイトル（任意）"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
            />
            <input
              type="text"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddNote()}
              placeholder="例：Aさんが戸籍請求中（□□市）"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
            />
          </div>
          <button
            onClick={handleAddNote}
            disabled={saving || !newNote.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '追加中...' : '追加'}
          </button>
        </div>
        {loading ? (
          <div className="text-center text-sm text-gray-400 py-4">読み込み中...</div>
        ) : notes.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-4">メモはまだありません</div>
        ) : (
          <div className="space-y-2.5">
            {notes.map(n => {
              // タイトル＝任意文字 or タスク名（リンク）。タスクに紐づく場合は飛べる。
              const titleText = n.title?.trim() || n.tasks?.title || null
              const linkedTaskStatus = n.task_id ? taskStatusMap.get(n.task_id) : undefined
              const isCompleted = linkedTaskStatus === '完了'
              return (
                <div key={n.id} className="flex gap-2.5 border-b border-gray-50 last:border-b-0 pb-2.5 last:pb-0">
                  {isCompleted
                    ? <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                    : <StickyNote className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" strokeWidth={2} />}
                  <div className="flex-1 min-w-0">
                    {titleText && (
                      n.task_id ? (
                        <Link href={`/tasks/${n.task_id}`} className={`inline-flex items-center gap-1 text-[13px] font-semibold hover:underline ${isCompleted ? 'text-emerald-700' : 'text-brand-700'}`}>
                          {titleText}<ExternalLink className="w-3 h-3 opacity-60" />
                          {isCompleted && <span className="ml-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 rounded">完了</span>}
                        </Link>
                      ) : (
                        <div className="text-[13px] font-semibold text-gray-800">{titleText}</div>
                      )
                    )}
                    <div className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{n.description}</div>
                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                      {n.activity_date}{n.members?.name ? ` · ${n.members.name}` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}
