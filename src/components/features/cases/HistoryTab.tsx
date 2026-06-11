'use client'

import { useState, useEffect } from 'react'
import { StickyNote } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SubTabs } from '@/components/ui/SubTabs'
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
}

export default function HistoryTab({ caseData, allMembers, currentMemberId: serverMemberId }: Props) {
  const currentMemberId = useCurrentMember(serverMemberId)
  const [sub, setSub] = useState<'report' | 'memo'>('report')
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [activities, setActivities] = useState<CaseActivityRow[]>([])
  const [progressReports, setProgressReports] = useState<ProgressReportRow[]>([])
  const [loading, setLoading] = useState(true)

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

  // メモ一覧（活動履歴のうち手入力メモのみ。タスク着手/完了・ステータス変更は
  // タイムラインに統合したため、ここでは表示しない）
  const notes = activities
    .filter(a => a.activity_type === 'note')
    .sort((a, b) => b.activity_date.localeCompare(a.activity_date))

  const SUBTABS = [{ key: 'report', label: '進捗報告' }, { key: 'memo', label: '進捗メモ' }]

  return (
    <div>
      <SubTabs tabs={SUBTABS} active={sub} onChange={k => setSub(k as 'report' | 'memo')} className="mb-3" />

      {/* 進捗報告（表は白枠・見出しは子タブ） */}
      {sub === 'report' && (
        progressReports.length === 0 ? (
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
        )
      )}

      {/* 進捗メモ（入力＋一覧） */}
      {sub === 'memo' && (
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
      )}
    </div>
  )
}
