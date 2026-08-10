'use client'

import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import TaskKeywordNudge from '@/components/features/tasks/TaskKeywordNudge'
import { gyomuForCategories, GYOMU_ALL } from '@/lib/serviceMaster'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { koteiOf } from '@/lib/kotei'
import { partsForCase, activePartKeys } from '@/lib/serviceParts'
import type { MemberRow } from '@/types'

// 担当区分。事務管理＝業務ひもづきの通常タスク。管理担当/受注担当＝systemタスクで、その担当へ割当＋通知。
type RoleKind = 'assistant' | 'manager' | 'sales'
const ROLE_KINDS: { key: RoleKind; label: string; desc: string }[] = [
  { key: 'assistant', label: '事務管理担当タスク', desc: '業務にひもづく通常タスク（既定）' },
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
  { key: '急ぎ', label: '急ぎ', style: 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100' },
  { key: '超急ぎ', label: '超急ぎ', style: 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100' },
] as const

// 生成時の着手フラグ。設定しない＝前のタスクが終わってから着手OKにする通常運用。
const READY_OPTIONS = [
  { key: 'none', label: '設定しない', hint: '前のタスクの完了時に設定する' },
  { key: 'now', label: '着手OK', hint: 'すぐ取りかかれる' },
  { key: 'receipt', label: '受領次第OK', hint: '書類が届いたら着手' },
] as const
type ReadyKey = typeof READY_OPTIONS[number]['key']

export default function AddTaskModal({ isOpen, onClose, caseId, onSaved, defaultPhase }: Props) {
  const currentMemberId = useCurrentMember(null)
  const [form, setForm] = useState({
    title: '',
    roleKind: 'assistant' as RoleKind,
    kotei: defaultPhase ? koteiOf(defaultPhase) : '',
    gyomu: defaultPhase ?? '',
    dueDate: '',
    priority: '通常' as string,
    ready: 'none' as ReadyKey,
    readyNote: '',
    work: '',
  })
  const [gyomuOptions, setGyomuOptions] = useState<string[]>([])
  // 工程の選択肢（この案件の業務から導出）／選択中工程の業務
  // 選べる業務区分＝この案件の実施業務 ＋ 常に選べる「納品」「その他」。
  // その他＝どの業務にも属さない任意タスクの置き場（事務管理タスク一覧の「その他」タブに出る）。
  const ALWAYS_SELECTABLE = ['納品', 'その他']
  const gyomuChoices = [...gyomuOptions, ...ALWAYS_SELECTABLE.filter(g => !gyomuOptions.includes(g))]
  // 管理担当/受注担当タスクは、案件の実施業務にかかわらず全業務から選べるようにする。
  // 精算書作成のように受注区分に出てこない業務でも、あとから足したくなるため。
  const managerGyomuChoices = [...GYOMU_ALL.filter(g => g !== 'その他'), 'その他']
  const choices = form.roleKind === 'assistant' ? gyomuChoices : managerGyomuChoices
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
      // 実施業務の「その他（自由入力）」は業務名が自由文なので、業務区分の選択肢には入れない。
      let gyomus = [...new Set(roles.map(r => r.gyomu).filter((g): g is string => !!g && GYOMU_ALL.includes(g)))]
      if (gyomus.length === 0) gyomus = gyomuForCategories(activePartKeys(partsForCase(data)))
      setGyomuOptions(gyomus)
      const g0 = (defaultPhase && gyomus.includes(defaultPhase)) ? defaultPhase : (gyomus[0] ?? '')
      setForm(p => ({ ...p, gyomu: p.roleKind === 'assistant' ? g0 : 'その他', kotei: koteiOf(g0) }))
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

    // 着手フラグ（着手OK＝ready_reason／受領次第OK＝ready_on_receipt）。設定しないなら何も入れない。
    const readyExt: Record<string, unknown> | null =
      form.ready === 'now' ? { ready_reason: form.readyNote.trim() || '着手OK', ready_on_receipt: false }
      : form.ready === 'receipt' ? { ready_on_receipt: true, ready_wait_note: form.readyNote.trim() || null }
      : null

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
          created_by: currentMemberId,
          procedure_text: form.work.trim() || null,
          ...(readyExt ? { ext_data: readyExt } : {}),
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
          work_role: role,   // work_role と assign_role を両方セット（/manager-tasks・区分ラベルの両方で正しく出す）
          title: form.title.trim(),
          // 業務区分を入れる。「その他」＝本流と関係ない随時タスクで、一覧のサブタブが分かれる。
          phase: form.gyomu || 'その他',
          category: '',
          status: '着手前',
          priority: form.priority,
          due_date: form.dueDate || null,
          sort_order: 99,
          created_by: currentMemberId,
          procedure_text: form.work.trim() || null,
          ...(readyExt ? { ext_data: readyExt } : {}),
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
    setForm({ title: '', roleKind: 'assistant', kotei: koteiOf(gyomuOptions[0] ?? ''), gyomu: gyomuOptions[0] ?? '', dueDate: '', priority: '通常', ready: 'none', readyNote: '', work: '' })
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
                  onClick={() => setForm(p => ({
                    ...p,
                    roleKind: rk.key,
                    // 事務管理＝案件の業務、管理担当/受注担当＝その他（随時）を既定にする
                    gyomu: rk.key === 'assistant' ? (gyomuOptions[0] ?? 'その他') : 'その他',
                  }))}
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

        {/* 業務区分。工程の2段選択は廃止し、業務を直接選ぶ。
            管理担当/受注担当タスクでも選べる。「その他」を選ぶと一覧の「その他」サブタブに入り、
            案件を進める本流のタスクと混ざらない。 */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">業務区分</label>
          <select
            value={form.gyomu}
            onChange={e => setForm(p => ({ ...p, gyomu: e.target.value, kotei: koteiOf(e.target.value) }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          >
            {choices.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-400">
            {form.roleKind === 'assistant'
              ? 'どの業務にも当てはまらないときは「その他」。事務管理タスク一覧の同じ名前のタブに入ります。'
              : 'お客様とのやりとりなど、案件を進める工程と関係ないものは「その他」。一覧の「その他」サブタブに入ります。'}
          </p>
        </div>

        {/* Task name（分類のあとに入力） */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">タスク名 *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="例：相続人へ電話連絡、督促 など"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
          <TaskKeywordNudge title={form.title} caseId={caseId} />
        </div>

        {/* 作業内容。手順や伝えたいことを書いておくと、担当が開いたときにそのまま読める。 */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">作業内容</label>
          <textarea
            value={form.work}
            onChange={e => setForm(p => ({ ...p, work: e.target.value }))}
            rows={3}
            placeholder="何をするか・気をつけることを書いておく（任意）"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-y"
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

        {/* 着手フラグ */}
        <div>
          <label className="block text-[13px] font-semibold text-gray-500 mb-1">着手</label>
          <div className="flex gap-1.5">
            {READY_OPTIONS.map(o => (
              <button
                key={o.key}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, ready: o.key }))}
                className={`flex-1 px-2.5 py-1.5 text-[12.5px] font-medium rounded-lg border transition-colors ${form.ready === o.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                title={o.hint}
              >
                {o.label}
              </button>
            ))}
          </div>
          {form.ready !== 'none' && (
            <input
              type="text"
              value={form.readyNote}
              onChange={e => setForm(p => ({ ...p, readyNote: e.target.value }))}
              placeholder={form.ready === 'receipt' ? '何の受領待ちか（例：戸籍の到着）' : '着手OKの理由（任意）'}
              className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          )}
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
