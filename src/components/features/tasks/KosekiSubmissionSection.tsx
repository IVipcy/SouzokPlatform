'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Section } from '@/components/ui/InlineFields'
import type { TaskRow } from '@/types'

type SubmissionEntry = {
  id: string              // クライアント側で採番（timestamp+rand）
  city: string            // 市区町村名
  method: '郵送' | '持込' | ''
  sent_date: string | null  // 提出日
  memo: string
}

type Props = {
  task: TaskRow
  onRefresh: () => void
}

function DateCell({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  if (editing) {
    return (
      <input
        type="date"
        value={draft}
        autoFocus
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onChange(draft || null) }}
        className="w-full text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none"
      />
    )
  }
  return (
    <button
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className={`w-full text-left text-xs px-1 py-0.5 rounded hover:bg-gray-100 transition-colors ${value ? 'text-gray-800' : 'text-gray-400'}`}
    >
      {value ?? '—'}
    </button>
  )
}

function TextCell({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (editing) {
    return (
      <input
        type="text"
        value={draft}
        autoFocus
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onChange(draft) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-full text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none"
      />
    )
  }
  return (
    <button
      onClick={() => { setDraft(value); setEditing(true) }}
      className={`w-full text-left text-xs px-1 py-0.5 rounded hover:bg-gray-100 transition-colors ${value ? 'text-gray-800' : 'text-gray-400'}`}
    >
      {value || (placeholder ?? '—')}
    </button>
  )
}

export default function KosekiSubmissionSection({ task, onRefresh }: Props) {
  const ext = (task.ext_data ?? {}) as Record<string, unknown>
  const submissions: SubmissionEntry[] = Array.isArray(ext.submissions)
    ? (ext.submissions as SubmissionEntry[])
    : []

  const totalCount = submissions.length
  const doneCount = submissions.filter(s => !!s.sent_date).length
  const allDone = totalCount > 0 && doneCount === totalCount
  const mailCount = submissions.filter(s => s.method === '郵送').length
  const visitCount = submissions.filter(s => s.method === '持込').length

  const saveSubmissions = async (updated: SubmissionEntry[]) => {
    const supabase = createClient()
    const newExt = { ...ext, submissions: updated }
    await supabase.from('tasks').update({ ext_data: newExt }).eq('id', task.id)
    onRefresh()
  }

  const addRow = () => {
    const newRow: SubmissionEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      city: '',
      method: '',
      sent_date: null,
      memo: '',
    }
    saveSubmissions([...submissions, newRow])
  }

  const updateRow = (id: string, updates: Partial<SubmissionEntry>) => {
    saveSubmissions(submissions.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const deleteRow = (id: string) => {
    saveSubmissions(submissions.filter(s => s.id !== id))
  }

  return (
    <Section title="提出先（市区町村ごとに記録）" icon="📮">
      {/* サマリー */}
      {totalCount > 0 && (
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-3 ${
          allDone ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
        }`}>
          <span className="text-xl">{allDone ? '✅' : '⏳'}</span>
          <div className="flex-1">
            <p className={`text-sm font-semibold ${allDone ? 'text-green-700' : 'text-amber-700'}`}>
              {allDone ? '全市区町村への提出が完了しました' : `提出待ち ${totalCount - doneCount} 件`}
            </p>
            <p className="text-xs text-gray-500">
              {doneCount} / {totalCount} 件 提出済
              {(mailCount > 0 || visitCount > 0) && (
                <span className="ml-2 text-gray-400">
                  （郵送 {mailCount} / 持込 {visitCount}）
                </span>
              )}
            </p>
          </div>
          <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-amber-400'}`}
              style={{ width: totalCount > 0 ? `${(doneCount / totalCount) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* テーブル */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[25%]">市区町村</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[15%]">提出方法</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[18%]">提出日</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[35%]">メモ</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[7%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {submissions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-gray-400 text-xs">
                  提出先がありません。下の「＋ 提出先を追加」から登録してください
                </td>
              </tr>
            ) : submissions.map(row => {
              const isDone = !!row.sent_date
              return (
                <tr key={row.id} className={`transition-colors ${isDone ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}>
                  <td className="px-2 py-1.5">
                    <TextCell
                      value={row.city}
                      onChange={v => updateRow(row.id, { city: v })}
                      placeholder="例: 横浜市"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={row.method}
                      onChange={e => updateRow(row.id, { method: e.target.value as SubmissionEntry['method'] })}
                      className="w-full text-xs border border-gray-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:border-blue-400"
                    >
                      <option value="">—</option>
                      <option value="郵送">📮 郵送</option>
                      <option value="持込">🚶 持込</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <DateCell
                      value={row.sent_date}
                      onChange={v => updateRow(row.id, { sent_date: v })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <TextCell
                      value={row.memo}
                      onChange={v => updateRow(row.id, { memo: v })}
                      placeholder="定額小為替額など"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => deleteRow(row.id)}
                      className="text-gray-300 hover:text-red-500 text-xs"
                      title="削除"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-2 px-1">
        <p className="text-[10px] text-gray-400">
          ※ 市区町村ごとに1行。提出方法（郵送/持込）と提出日を記録してください。
        </p>
        <button
          onClick={addRow}
          className="text-[11px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md transition-colors whitespace-nowrap"
        >
          ＋ 提出先を追加
        </button>
      </div>
    </Section>
  )
}
