'use client'

import { useState, useEffect } from 'react'
import { Play, CheckCircle2, RefreshCw, StickyNote, ClipboardList, ClipboardCheck, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  'task_started':   Play,
  'task_completed': CheckCircle2,
  'status_change':  RefreshCw,
  'note':           StickyNote,
}

const ACTIVITY_COLORS: Record<string, string> = {
  'task_started': '#16A34A',
  'task_completed': '#2563EB',
  'status_change': '#D97706',
  'note': '#6B7280',
}

export default function HistoryTab({ caseData, allMembers, currentMemberId: serverMemberId }: Props) {
  const currentMemberId = useCurrentMember(serverMemberId)
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

  // 全タイムラインイベント: 活動履歴 + 案件の基本イベント
  const allEvents: { date: string; Icon: LucideIcon; color: string; title: string; note?: string; memberName?: string }[] = []

  // 案件作成
  if (caseData.created_at) {
    allEvents.push({
      date: new Date(caseData.created_at).toISOString().split('T')[0],
      Icon: ClipboardList,
      color: '#2563EB',
      title: '案件作成',
      note: `${caseData.case_number} ${caseData.deal_name}`,
    })
  }

  // 受注
  if (caseData.order_date) {
    allEvents.push({
      date: caseData.order_date,
      Icon: CheckCircle2,
      color: '#16A34A',
      title: '受注',
    })
  }

  // 活動履歴
  activities.forEach(act => {
    allEvents.push({
      date: act.activity_date,
      Icon: ACTIVITY_ICONS[act.activity_type] ?? StickyNote,
      color: ACTIVITY_COLORS[act.activity_type] ?? '#6B7280',
      title: act.description,
      memberName: act.members?.name,
      note: act.tasks?.title ? `タスク: ${act.tasks.title}` : undefined,
    })
  })

  // 日付でソート（新しい順）
  allEvents.sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div style={{ maxWidth: 700 }}>
      {/* 進捗報告履歴 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-4">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
          <h3 className="text-[13px] font-semibold text-gray-900">進捗報告履歴</h3>
          <span className="text-[12px] font-mono text-gray-400 ml-auto">{progressReports.length}件</span>
        </div>
        {progressReports.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-gray-400">進捗確認依頼はまだありません</div>
        ) : (
          <div className="overflow-x-auto">
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

      {/* メモ入力 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-4">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
          <h3 className="text-[13px] font-semibold text-gray-900">メモを追加</h3>
        </div>
        <div className="px-4 py-3 flex gap-2">
          <input
            type="text"
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddNote()}
            placeholder="例：Aさんが戸籍請求中（□□市）"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
          />
          <button
            onClick={handleAddNote}
            disabled={saving || !newNote.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '追加中...' : '追加'}
          </button>
        </div>
      </div>

      {/* タイムライン */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
          <h3 className="text-[13px] font-semibold text-gray-900">活動履歴</h3>
          <span className="text-[12px] font-mono text-gray-400 ml-auto">{allEvents.length}件</span>
        </div>
        <div className="px-4 py-3">
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-6">
              読み込み中...
            </div>
          ) : allEvents.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-6">
              まだ活動履歴がありません
            </div>
          ) : (
            <div className="space-y-0">
              {allEvents.map((ev, i) => (
                <div key={i} className="flex gap-3 pb-4 relative">
                  {/* Line */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] z-10 flex-shrink-0"
                      style={{ backgroundColor: `${ev.color}20`, color: ev.color }}
                    >
                      <ev.Icon className="w-4 h-4" strokeWidth={2} />
                    </div>
                    {i < allEvents.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                  </div>
                  {/* Content */}
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-semibold text-gray-700">{ev.title}</div>
                      {ev.memberName && (
                        <span className="text-[12px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                          {ev.memberName}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-gray-400 font-mono mt-0.5">{ev.date}</div>
                    {ev.note && <div className="text-[13px] text-gray-500 mt-0.5 leading-relaxed">{ev.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
