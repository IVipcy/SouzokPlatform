'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CaseRow, CaseActivityRow, MemberRow } from '@/types'

type Props = {
  caseData: CaseRow
  activities: CaseActivityRow[]
  allMembers: MemberRow[]
  currentMemberId: string | null
}

const ACTIVITY_ICONS: Record<string, string> = {
  'task_started': '▶',
  'task_completed': '✅',
  'status_change': '🔄',
  'note': '📝',
}

const ACTIVITY_COLORS: Record<string, string> = {
  'task_started': '#16A34A',
  'task_completed': '#2563EB',
  'status_change': '#D97706',
  'note': '#6B7280',
}

export default function HistoryTab({ caseData, activities, allMembers, currentMemberId }: Props) {
  const router = useRouter()
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

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
    router.refresh()
  }

  // 全タイムラインイベント: 活動履歴 + 案件の基本イベント
  const allEvents: { date: string; icon: string; color: string; title: string; note?: string; memberName?: string }[] = []

  // 案件作成
  if (caseData.created_at) {
    allEvents.push({
      date: new Date(caseData.created_at).toISOString().split('T')[0],
      icon: '📋',
      color: '#2563EB',
      title: '案件作成',
      note: `${caseData.case_number} ${caseData.deal_name}`,
    })
  }

  // 受注
  if (caseData.order_date) {
    allEvents.push({
      date: caseData.order_date,
      icon: '✅',
      color: '#16A34A',
      title: '受注',
    })
  }

  // 活動履歴
  activities.forEach(act => {
    allEvents.push({
      date: act.activity_date,
      icon: ACTIVITY_ICONS[act.activity_type] ?? '📝',
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
      {/* メモ入力 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)] mb-4">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <span className="text-sm">📝</span>
          <h3 className="text-[13px] font-semibold text-gray-900">メモを追加</h3>
        </div>
        <div className="px-4 py-3 flex gap-2">
          <input
            type="text"
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddNote()}
            placeholder="例：Aさんが戸籍請求中（□□市）"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleAddNote}
            disabled={saving || !newNote.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '追加中...' : '追加'}
          </button>
        </div>
      </div>

      {/* タイムライン */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <span className="text-sm">📅</span>
          <h3 className="text-[13px] font-semibold text-gray-900">活動履歴</h3>
          <span className="text-[10px] font-mono text-gray-400 ml-auto">{allEvents.length}件</span>
        </div>
        <div className="px-4 py-3">
          {allEvents.length === 0 ? (
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
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] z-10 flex-shrink-0"
                      style={{ backgroundColor: `${ev.color}20`, color: ev.color }}
                    >
                      <span>{ev.icon}</span>
                    </div>
                    {i < allEvents.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                  </div>
                  {/* Content */}
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-semibold text-gray-700">{ev.title}</div>
                      {ev.memberName && (
                        <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                          {ev.memberName}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">{ev.date}</div>
                    {ev.note && <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{ev.note}</div>}
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
