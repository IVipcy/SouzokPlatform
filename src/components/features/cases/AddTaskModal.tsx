'use client'

import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { gyomuForCategories } from '@/lib/serviceMaster'
import { koteiOf, koteiRank } from '@/lib/kotei'
import { partsForCase, activePartKeys } from '@/lib/serviceParts'
import type { MemberRow } from '@/types'

// 担当区分。事務管理＝業務ひもづきの通常タスク。管理担当/受注担当＝systemタスクで、その担当へ割当＋通知。
type RoleKind = 'assistant' | 'manager' | 'sales'
const ROLE_KINDS: { key: RoleKind; label: string; desc: string }[] = [
  { key: 'assistant', label: '事務管理タスク', desc: '業務にひもづく通常タスク（既定）' },
  { key: 'manager', label: '管理担当タスク', desc: '案件の管理担当へ割当・通知' },
  { key: 'sales', label: '受注担当タスク', desc: '案件の受注担当へ割当・通知' },
]

type Props = {
  isOpen: boolean
  onClose: () => void
  caseId: string
  allMembers: MemberRow[]
  onSaved: () => void
  /** 調査タブ等から開く際の初期業務（例: 戸籍 / 金融資産）。 */
  defaultPhase?: string
}

const PRIORITIES = [
  { key: '通常', label: '通常', style: 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50' },
  { key: '急ぎ', label: '急ぎ', style: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
] as const

export default function AddTaskModal({ isOpen, onClose, caseId, onSaved, defaultPhase }: Props) {
  const [form, setForm] = useState({
    title: '',
    roleKind: 'assistant' as RoleKind,
    kotei: defaultPhase ? koteiOf(defaultPhase) : '',
    gyomu: defaultPhase ?? '',
    dueDate: '',
    priority: '通常' as string,
  })
  const [gyomuOptions, setGyomuOptions] = useState<string[]>([])
  // 工程の選択肢（この案件の業務から導出）／選択中工程の業務
  const koteiOptions = [...new Set(gyomuOptions.map(koteiOf))].sort((a, b) => koteiRank(a) - koteiRank(b))
  const gyomusInKotei = gyomuOptions.filter(g => koteiOf(g) === form.kotei)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 開いたら案件の受注区分から「業務」リストを用意（一括生成と同じ。役割分担の業務を優先）。
  useEffect(() => {
    if (!isOpen) return
    let active = true
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase.from('cases').select('service_category, service_category_2, service_parts, intake_roles').eq('id', caseId).single()
      if (!active || !data) return
      const roles = (data.intake_roles ?? []) as Array<{ gyomu?: string | null }>
      let gyomus = [...new Set(roles.map(r => r.gyomu).filter((g): g is string => !!g))]
      if (gyomus.length === 0) gyomus = gyomuForCategories(activePartKeys(partsForCase(data)))
      setGyomuOptions(gyomus)
      const g0 = (defaultPhase && gyomus.includes(defaultPhase)) ? defaultPhase : (gyomus[0] ?? '')
      setForm(p => ({ ...p, gyomu: g0, kotei: koteiOf(g0) }))
    })()
    return () => { active = false }
  }, [isOpen, caseId, defaultPhase])

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('タスク名は必須です')
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()

    if (form.roleKind === 'assistant') {
      // 事務管理タスク（業務にひもづく通常タスク）
      const { error: taskErr } = await supabase
        .from('tasks')
        .insert({
          case_id: caseId,
          task_kind: 'case',
          title: form.title.trim(),
          phase: form.gyomu,
          category: form.gyomu,
          status: '着手前',
          priority: form.priority,
          due_date: form.dueDate || null,
          sort_order: 99,
        })
      if (taskErr) { setError(`追加に失敗しました: ${taskErr.message}`); setSaving(false); return }
    } else {
      // 管理担当/受注担当タスク（systemタスク）→ 案件のその担当へ割当＋通知
      const role = form.roleKind  // 'manager' | 'sales'
      const { data: nt, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          case_id: caseId,
          task_kind: 'system',
          assign_role: role,
          title: form.title.trim(),
          status: '未着手',
          priority: form.priority,
          due_date: form.dueDate || null,
          sort_order: 99,
        })
        .select('id')
        .single()
      if (taskErr || !nt) { setError(`追加に失敗しました: ${taskErr?.message ?? ''}`); setSaving(false); return }
      const taskId = (nt as { id: string }).id
      const { data: cm } = await supabase.from('case_members').select('member_id').eq('case_id', caseId).eq('role', role).limit(1)
      const assignee = ((cm ?? []) as Array<{ member_id: string }>)[0]?.member_id
      if (assignee) {
        await supabase.from('task_assignees').insert({ task_id: taskId, member_id: assignee, role: 'primary' })
        await supabase.from('notifications').insert({
          member_id: assignee,
          type: 'task_assigned',
          case_id: caseId,
          title: role === 'manager' ? '管理担当タスクが追加されました' : '受注担当タスクが追加されました',
          body: form.title.trim(),
        })
      }
    }

    setSaving(false)
    setForm({ title: '', roleKind: 'assistant', kotei: koteiOf(gyomuOptions[0] ?? ''), gyomu: gyomuOptions[0] ?? '', dueDate: '', priority: '通常' })
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="＋ タスク追加"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving}>
            {saving ? '追加中...' : '追加する'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
        )}

        {/* 担当区分（事務管理／管理担当／受注担当） */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">担当区分</label>
          <div className="flex flex-col gap-1.5">
            {ROLE_KINDS.map(rk => {
              const on = form.roleKind === rk.key
              return (
                <button
                  key={rk.key}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, roleKind: rk.key }))}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${on ? 'border-2 border-brand-400 bg-brand-50' : 'border border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-semibold ${on ? 'text-brand-700' : 'text-gray-800'}`}>{rk.label}</div>
                    <div className="text-[11px] text-gray-500">{rk.desc}</div>
                  </div>
                  {on && <Check className="w-4 h-4 text-brand-600 flex-shrink-0" strokeWidth={2.25} />}
                </button>
              )
            })}
          </div>
        </div>

        {/* 工程 → 業務（事務管理タスクのときだけ。先に分類を選ぶ） */}
        {form.roleKind === 'assistant' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-semibold text-gray-500 mb-1">工程</label>
            <select
              value={form.kotei}
              onChange={e => { const k = e.target.value; const first = gyomuOptions.find(g => koteiOf(g) === k) ?? ''; setForm(p => ({ ...p, kotei: k, gyomu: first })) }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            >
              {koteiOptions.length === 0 && <option value="">（工程なし）</option>}
              {koteiOptions.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-gray-500 mb-1">業務区分</label>
            <select
              value={form.gyomu}
              onChange={e => setForm(p => ({ ...p, gyomu: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            >
              {gyomusInKotei.length === 0 && <option value="">（業務なし）</option>}
              {gyomusInKotei.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>
        ) : (
          <div className="text-[12px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
            業務区分は不要です。案件の{form.roleKind === 'manager' ? '管理担当' : '受注担当'}へ自動で割り当て・通知します。
          </div>
        )}

        {/* Task name（分類のあとに入力） */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">タスク名 *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="例：三菱UFJ銀行 残高証明取得"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>

        {/* Due date */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">期限</label>
          <input
            type="date"
            value={form.dueDate}
            onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">優先度</label>
          <div className="flex gap-1.5">
            {PRIORITIES.map(p => (
              <button
                key={p.key}
                onClick={() => setForm(prev => ({ ...prev, priority: p.key }))}
                className={`flex-1 px-3 py-1.5 text-[13px] font-medium rounded-lg border transition-colors ${
                  form.priority === p.key
                    ? 'ring-2 ring-brand-400 ring-offset-1'
                    : ''
                } ${p.style}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {form.roleKind === 'assistant' && (
          <div className="text-[13px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
            💡 タスクの担当は事前に割り振りません。パートタイマーが出勤時にタスク一覧から「着手する」で開始します。
          </div>
        )}
      </div>
    </Modal>
  )
}
