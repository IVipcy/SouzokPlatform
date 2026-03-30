'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import EventFormModal from './EventFormModal'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import type { EventRow, EventType, MemberRow } from '@/types'

type EventWithRelations = EventRow & {
  members?: Pick<MemberRow, 'id' | 'name' | 'avatar_color'> | null
  cases?: { id: string; case_number: string; deal_name: string } | null
}

type CaseOption = { id: string; case_number: string; deal_name: string }

type Props = {
  events: EventWithRelations[]
  members: MemberRow[]
  cases: CaseOption[]
}

const TYPE_CONFIG: Record<EventType, { icon: string; label: string; bg: string; color: string }> = {
  interview: { icon: '👤', label: '面談', bg: '#EFF4FF', color: '#2563EB' },
  task: { icon: '✅', label: 'タスク期限', bg: '#F5F3FF', color: '#7C3AED' },
  deadline: { icon: '⚠️', label: '申告期限', bg: '#FEF2F2', color: '#DC2626' },
  other: { icon: '📌', label: 'その他', bg: '#ECFDF5', color: '#059669' },
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export function ScheduleClient({ events, members, cases }: Props) {
  const router = useRouter()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [view, setView] = useState<'month' | 'list'>('month')
  const [selectedEvent, setSelectedEvent] = useState<EventWithRelations | null>(null)
  const [memberFilter, setMemberFilter] = useState<string>('all')

  // Modal state
  const [formOpen, setFormOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<EventRow | null>(null)
  const [defaultDate, setDefaultDate] = useState<string>('')
  const [deleteEvent, setDeleteEvent] = useState<EventWithRelations | null>(null)

  const filteredEvents = useMemo(() => {
    if (memberFilter === 'all') return events
    return events.filter(e => e.member_id === memberFilter)
  }, [events, memberFilter])

  const changeMonth = useCallback((delta: number) => {
    let m = month + delta
    let y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m)
    setYear(y)
  }, [month, year])

  const goToday = useCallback(() => {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
  }, [])

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)
  const prevMonthDays = getDaysInMonth(year, month === 0 ? 11 : month - 1)

  const calendarCells = useMemo(() => {
    const cells: { day: number; isCurrentMonth: boolean; dateStr: string }[] = []
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i
      const m = month === 0 ? 11 : month - 1
      const y = month === 0 ? year - 1 : year
      cells.push({ day: d, isCurrentMonth: false, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, isCurrentMonth: true, dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 0 : month + 1
      const y = month === 11 ? year + 1 : year
      cells.push({ day: d, isCurrentMonth: false, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
    return cells
  }, [year, month, daysInMonth, firstDay, prevMonthDays])

  const todayStr = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  const eventsForMonth = useMemo(() => {
    return filteredEvents.filter(e => {
      const d = new Date(e.event_date)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [filteredEvents, year, month])

  const getMemberName = (ev: EventWithRelations) => ev.members?.name ?? '—'
  const getMemberColor = (ev: EventWithRelations) => ev.members?.avatar_color ?? '#9CA3AF'
  const getCaseName = (ev: EventWithRelations) => ev.cases?.deal_name ?? ''
  const getCaseNumber = (ev: EventWithRelations) => ev.cases?.case_number ?? ''

  const openCreateModal = (date?: string) => {
    setEditEvent(null)
    setDefaultDate(date ?? '')
    setFormOpen(true)
  }

  const openEditModal = (ev: EventWithRelations) => {
    setEditEvent(ev)
    setDefaultDate('')
    setFormOpen(true)
    setSelectedEvent(null)
  }

  const handleDelete = async () => {
    if (!deleteEvent) return
    const supabase = createClient()
    const { error } = await supabase.from('events').delete().eq('id', deleteEvent.id)
    if (error) throw new Error(error.message)
    setDeleteEvent(null)
    setSelectedEvent(null)
    router.refresh()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">スケジュール</h1>
          <p className="text-xs text-gray-400">面談・期限・イベントの管理</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Member filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400 font-semibold">担当者:</span>
            <button
              onClick={() => setMemberFilter('all')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${memberFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
            >
              全員
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => setMemberFilter(memberFilter === m.id ? 'all' : m.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition flex items-center gap-1 ${
                  memberFilter === m.id ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
                style={memberFilter === m.id ? { background: m.avatar_color, borderColor: m.avatar_color } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.avatar_color }} />
                {m.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => openCreateModal()}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            ＋ 予定追加
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => changeMonth(-1)} className="w-7 h-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-sm text-gray-400 hover:bg-gray-50 transition">‹</button>
          <div className="text-base font-bold tracking-tight min-w-[120px] text-center">{year}年{month + 1}月</div>
          <button onClick={() => changeMonth(1)} className="w-7 h-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-sm text-gray-400 hover:bg-gray-50 transition">›</button>
        </div>
        <button onClick={goToday} className="px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-gray-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition">
          今日
        </button>
        <div className="ml-auto flex gap-0.5 bg-white border border-gray-200 rounded-md p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <button onClick={() => setView('month')} className={`px-3 py-1 rounded text-[11px] font-semibold transition ${view === 'month' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>月</button>
          <button onClick={() => setView('list')} className={`px-3 py-1 rounded text-[11px] font-semibold transition ${view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>リスト</button>
        </div>
      </div>

      {view === 'month' ? (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Calendar Grid */}
          <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col">
            <div className="grid grid-cols-7 border-b border-gray-200">
              {DOW.map((d, i) => (
                <div key={d} className={`text-center py-2 text-[10px] font-bold tracking-wider ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 flex-1">
              {calendarCells.map((cell, idx) => {
                const dayEvents = filteredEvents.filter(e => e.event_date === cell.dateStr)
                const isToday = cell.dateStr === todayStr
                return (
                  <div
                    key={idx}
                    className={`border-r border-b border-gray-100 min-h-[90px] p-1 cursor-pointer transition hover:bg-gray-50/50 ${!cell.isCurrentMonth ? 'bg-gray-50/30' : ''} ${isToday ? 'bg-blue-50/30' : ''}`}
                    onClick={() => openCreateModal(cell.dateStr)}
                  >
                    <div className={`w-6 h-6 flex items-center justify-center text-[11px] font-mono rounded-full mb-0.5 ${
                      isToday ? 'bg-blue-600 text-white font-bold' :
                      !cell.isCurrentMonth ? 'text-gray-300' :
                      idx % 7 === 0 ? 'text-red-400' :
                      idx % 7 === 6 ? 'text-blue-400' : 'text-gray-600'
                    }`}>
                      {cell.day}
                    </div>
                    {dayEvents.slice(0, 3).map(ev => {
                      const tc = TYPE_CONFIG[ev.event_type]
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev) }}
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer hover:opacity-80 transition"
                          style={{ background: tc.bg, color: tc.color }}
                        >
                          {tc.icon} {ev.title}
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[9px] text-gray-400 px-1">+{dayEvents.length - 3}件</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Side list */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-2.5">今月の予定</div>
              <div className="space-y-0">
                {eventsForMonth.sort((a, b) => a.event_date.localeCompare(b.event_date)).map(ev => {
                  const tc = TYPE_CONFIG[ev.event_type]
                  return (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="flex gap-2.5 py-2 border-b border-gray-100 last:border-b-0 cursor-pointer hover:opacity-70 transition"
                    >
                      <div className="w-0.5 rounded self-stretch flex-shrink-0" style={{ background: tc.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-mono text-gray-400 mb-0.5">
                          {ev.event_date.split('-')[2]}日 {ev.start_time && `${ev.start_time}〜${ev.end_time}`}
                        </div>
                        <div className="text-xs font-semibold text-gray-900 truncate">{ev.title}</div>
                        {getCaseName(ev) && <div className="text-[10px] text-gray-400 truncate">{getCaseName(ev)}</div>}
                      </div>
                    </div>
                  )
                })}
                {eventsForMonth.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-4">予定なし</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* List View */
        <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden flex-1">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 tracking-wider uppercase">日時</th>
                <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 tracking-wider uppercase">種類</th>
                <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 tracking-wider uppercase">タイトル</th>
                <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 tracking-wider uppercase">案件</th>
                <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 tracking-wider uppercase">担当</th>
                <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[10px] font-bold text-gray-400 tracking-wider uppercase w-16">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.sort((a, b) => a.event_date.localeCompare(b.event_date)).map(ev => {
                const tc = TYPE_CONFIG[ev.event_type]
                return (
                  <tr
                    key={ev.id}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 cursor-pointer transition"
                    onClick={() => setSelectedEvent(ev)}
                  >
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-600">
                      {ev.event_date} {ev.start_time && `${ev.start_time}〜${ev.end_time}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: tc.bg, color: tc.color }}>
                        {tc.icon} {tc.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-gray-900">{ev.title}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{getCaseName(ev) || '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: getMemberColor(ev) }}>
                          {getMemberName(ev)?.[0]}
                        </div>
                        <span className="text-xs text-gray-600">{getMemberName(ev)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(ev) }}
                          className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition"
                          title="編集"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteEvent(ev) }}
                          className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
                          title="削除"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Event Detail Panel */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setSelectedEvent(null)} />
          <div className="absolute top-0 right-0 bottom-0 w-96 bg-white border-l border-gray-200 shadow-xl overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: TYPE_CONFIG[selectedEvent.event_type].bg, color: TYPE_CONFIG[selectedEvent.event_type].color }}>
                    {TYPE_CONFIG[selectedEvent.event_type].icon} {TYPE_CONFIG[selectedEvent.event_type].label}
                  </span>
                  <div className="text-base font-bold text-gray-900 mt-2">{selectedEvent.title}</div>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="w-6 h-6 rounded flex items-center justify-center text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition border border-gray-200">✕</button>
              </div>
            </div>
            <div className="px-5 py-4 space-y-5">
              <PanelSection title="日時">
                <PanelRow label="日付" value={selectedEvent.event_date} />
                {selectedEvent.start_time && <PanelRow label="時間" value={`${selectedEvent.start_time} 〜 ${selectedEvent.end_time}`} />}
              </PanelSection>
              <PanelSection title="担当">
                <PanelRow label="担当者" value={getMemberName(selectedEvent)} />
              </PanelSection>
              {getCaseName(selectedEvent) && (
                <PanelSection title="案件">
                  <PanelRow label="案件名" value={getCaseName(selectedEvent)} />
                  <PanelRow label="案件番号" value={getCaseNumber(selectedEvent)} />
                </PanelSection>
              )}
              {selectedEvent.notes && (
                <PanelSection title="メモ">
                  <p className="text-xs text-gray-600 leading-relaxed">{selectedEvent.notes}</p>
                </PanelSection>
              )}
              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => openEditModal(selectedEvent)}
                  className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                >
                  ✏️ 編集
                </button>
                <button
                  onClick={() => setDeleteEvent(selectedEvent)}
                  className="flex-1 px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                >
                  🗑 削除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Form Modal */}
      <EventFormModal
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditEvent(null) }}
        event={editEvent}
        defaultDate={defaultDate}
        members={members}
        cases={cases}
        onSaved={() => { setFormOpen(false); setEditEvent(null); router.refresh() }}
      />

      {/* Delete Confirm */}
      <DeleteConfirmModal
        isOpen={!!deleteEvent}
        onClose={() => setDeleteEvent(null)}
        title="予定削除"
        message={`「${deleteEvent?.title}」を削除しますか？`}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mb-2 pb-1.5 border-b border-gray-100">{title}</div>
      {children}
    </div>
  )
}

function PanelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold text-gray-700">{value}</span>
    </div>
  )
}
