'use client'

import { useState, useEffect } from 'react'
import { StickyNote } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import type { CaseRow, CaseActivityRow, MemberRow, ProgressReportRow } from '@/types'

// 進捗報告の確認ステータス表示色
const PR_STATUS_BADGE: Record<string, string> = {
  '依頼中': 'bg-amber-50 text-amber-700 border-amber-200',
  '確認済': 'bg-green-50 text-green-700 border-green-200',
}

type Props = {
  caseData: CaseRow
  allMembers: MemberRow[]
  currentMemberId: string | null
  /** 確認者の既定値（受注担当）。 */
  defaultConfirmerId?: string | null
}

/**
 * 進捗報告・メモ（案件進捗タブの子タブ）。
 * 進捗報告と進捗メモを縦に並べて両方表示する（旧・内部タブ分けは解消）。
 * 進捗確認の依頼は管理担当マイページだけでなく、ここからも出せる。
 */
export default function HistoryTab({ caseData, allMembers, currentMemberId: serverMemberId, defaultConfirmerId }: Props) {
  const currentMemberId = useCurrentMember(serverMemberId)
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [activities, setActivities] = useState<CaseActivityRow[]>([])
  const [progressReports, setProgressReports] = useState<ProgressReportRow[]>([])
  const [loading, setLoading] = useState(true)
  // 進捗確認の依頼（確認者の選択＋依頼）
  const [confirmerId, setConfirmerId] = useState<string>(defaultConfirmerId ?? '')
  const [requesting, setRequesting] = useState(false)

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
      description: newNote.trim(),
      activity_date: new Date().toISOString().split('T')[0],
    })
    setNewNote('')
    setSaving(false)
    fetchActivities()
  }

  // 進捗確認を依頼（管理担当マイページと同じ：progress_reports へ依頼中で登録＋確認者へ通知）
  const handleRequestReview = async () => {
    if (!confirmerId) { showToast('確認者を選択してください', 'error'); return }
    if (!currentMemberId) { showToast('ログイン情報が取得できません', 'error'); return }
    setRequesting(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('progress_reports').insert({
      case_id: caseData.id,
      requester_id: currentMemberId,
      confirmer_id: confirmerId,
      status: '依頼中',
      requested_date: today,
    })
    if (!error) {
      await supabase.from('notifications').insert({
        member_id: confirmerId,
        type: 'progress_review_requested',
        case_id: caseData.id,
        title: '進捗確認の依頼',
        body: `${caseData.case_number} ${caseData.deal_name} の進捗確認を依頼されました`,
      })
    }
    setRequesting(false)
    if (error) { showToast('依頼に失敗しました', 'error'); return }
    showToast('進捗確認を依頼しました', 'success')
    fetchActivities()
  }

  // メモ一覧（活動履歴のうち手入力メモのみ。タスク着手/完了・ステータス変更は
  // タイムラインに統合したため、ここでは表示しない）
  const notes = activities
    .filter(a => a.activity_type === 'note')
    .sort((a, b) => b.activity_date.localeCompare(a.activity_date))

  return (
    <div className="space-y-5">
      {/* 進捗報告 */}
      <div>
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-bold text-gray-700">進捗報告</span>
          <div className="ml-auto flex items-center gap-1.5">
            <select
              value={confirmerId}
              onChange={e => setConfirmerId(e.target.value)}
              className="px-2 py-1 text-[12px] border border-gray-200 rounded-md bg-white outline-none focus:border-brand-400 max-w-[160px]"
            >
              <option value="">確認者を選択</option>
              {allMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button
              type="button"
              onClick={handleRequestReview}
              disabled={requesting || !confirmerId}
              className="inline-flex items-center gap-1 px-3 py-1 text-[12px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50"
            >
              {requesting ? '依頼中...' : '進捗確認を依頼'}
            </button>
          </div>
        </div>
        {progressReports.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-6 text-center text-[13px] text-gray-400">進捗確認依頼はまだありません</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">確認者</th>
                  <th className="px-3 py-2 text-left font-bold">進捗確認依頼日</th>
                  <th className="px-3 py-2 text-left font-bold">確認ステータス</th>
                  <th className="px-3 py-2 text-left font-bold">確認日付</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {progressReports.map(pr => (
                  <tr key={pr.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5 text-[13px] text-gray-700">{memberName(pr.confirmer_id)}</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{pr.requested_date}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${PR_STATUS_BADGE[pr.status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {pr.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{pr.confirmed_date ?? <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 進捗メモ */}
      <div>
        <div className="mb-2 text-[13px] font-bold text-gray-700">進捗メモ</div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddNote()}
              placeholder="例：Aさんが戸籍請求中（□□市）"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
            />
            <button
              onClick={handleAddNote}
              disabled={saving || !newNote.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '追加中...' : '追加'}
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            {loading ? (
              <div className="text-center text-sm text-gray-400 py-4">読み込み中...</div>
            ) : notes.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-4">メモはまだありません</div>
            ) : (
              <div className="space-y-2.5">
                {notes.map(n => (
                  <div key={n.id} className="flex gap-2.5">
                    <StickyNote className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" strokeWidth={2} />
                    <div className="flex-1">
                      <div className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{n.description}</div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                        {n.activity_date}{n.members?.name ? ` · ${n.members.name}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
