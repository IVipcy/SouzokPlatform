'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import type { EventRow, EventType, MemberRow } from '@/types'

type CaseOption = { id: string; case_number: string; deal_name: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  event?: EventRow | null
  defaultDate?: string
  members: MemberRow[]
  cases: CaseOption[]
  onSaved: () => void
}

const EVENT_TYPES: { key: EventType; label: string; icon: string }[] = [
  { key: 'interview', label: '面談', icon: '👤' },
  { key: 'task', label: 'タスク期限', icon: '✅' },
  { key: 'deadline', label: '申告期限', icon: '⚠️' },
  { key: 'other', label: 'その他', icon: '📌' },
]

export default function EventFormModal({ isOpen, onClose, event, defaultDate, members, cases, onSaved }: Props) {
  const isEdit = !!event

  const [form, setForm] = useState({
    title: '',
    event_type: 'interview' as EventType,
    event_date: '',
    start_time: '',
    end_time: '',
    member_id: '',
    case_id: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      if (event) {
        setForm({
          title: event.title,
          event_type: event.event_type,
          event_date: event.event_date,
          start_time: event.start_time ?? '',
          end_time: event.end_time ?? '',
          member_id: event.member_id ?? '',
          case_id: event.case_id ?? '',
          notes: event.notes ?? '',
        })
      } else {
        setForm({
          title: '',
          event_type: 'interview',
          event_date: defaultDate ?? '',
          start_time: '',
          end_time: '',
          member_id: '',
          case_id: '',
          notes: '',
        })
      }
      setError('')
    }
  }, [isOpen, event, defaultDate])

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('タイトルは必須です'); return }
    if (!form.event_date) { setError('日付は必須です'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()

    const payload = {
      title: form.title.trim(),
      event_type: form.event_type,
      event_date: form.event_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      member_id: form.member_id || null,
      case_id: form.case_id || null,
      notes: form.notes || null,
    }

    let err
    if (isEdit) {
      const result = await supabase.from('events').update(payload).eq('id', event!.id)
      err = result.error
    } else {
      const result = await supabase.from('events').insert(payload)
      err = result.error
    }

    if (err) {
      setError(`保存に失敗しました: ${err.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? '予定を編集' : '＋ 予定追加'}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '保存中...' : isEdit ? '更新する' : '追加する'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* Title */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">タイトル *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="例：田中様 初回面談"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Event type */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">種類</label>
          <div className="flex gap-1.5">
            {EVENT_TYPES.map(t => (
              <button
                key={t.key}
                onClick={() => setForm(p => ({ ...p, event_type: t.key }))}
                className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                  form.event_type === t.key ? 'ring-2 ring-blue-400 ring-offset-1 border-blue-200 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">日付 *</label>
          <input
            type="date"
            value={form.event_date}
            onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">開始時間</label>
            <input
              type="time"
              value={form.start_time}
              onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">終了時間</label>
            <input
              type="time"
              value={form.end_time}
              onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Member */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">担当者</label>
          <select
            value={form.member_id}
            onChange={e => setForm(p => ({ ...p, member_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">未設定</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {/* Case */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">関連案件</label>
          <select
            value={form.case_id}
            onChange={e => setForm(p => ({ ...p, case_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">なし</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.case_number} {c.deal_name}</option>)}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">メモ</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          />
        </div>
      </div>
    </Modal>
  )
}
