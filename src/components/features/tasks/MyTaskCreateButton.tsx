'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { DB_PHASES, getPhaseLabel } from '@/lib/phases'
import { TASK_PRIORITIES } from '@/lib/constants'

type CaseOpt = { id: string; case_number: string; deal_name: string }
type MemberOpt = { id: string; name: string }
type TeamOpt = { id: string; name: string }

const EMPTY_FORM = {
  caseId: '',
  title: '',
  phase: '' as string,   // '' = フェーズなし（システムタスク）
  assigneeId: '',
  teamId: '' as string,
  dueDate: '',
  priority: '通常' as string,
}

/**
 * マイページから新規タスクを作成するボタン＋モーダル。
 * 案件詳細のタスクタブとは別に、自分の案件に対してタスクを起票できる。
 * 担当者（個人）と担当チーム（チームタスク欄の基盤）を指定可能。
 */
export default function MyTaskCreateButton({ currentMemberId }: { currentMemberId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM, assigneeId: currentMemberId })
  const [cases, setCases] = useState<CaseOpt[]>([])
  const [members, setMembers] = useState<MemberOpt[]>([])
  const [teams, setTeams] = useState<TeamOpt[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // モーダルを開いた時に選択肢を読み込む
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    ;(async () => {
      const [caseRes, memberRes, teamRes] = await Promise.all([
        supabase.from('case_members').select('cases(id, case_number, deal_name)').eq('member_id', currentMemberId),
        supabase.from('members').select('id, name').eq('is_active', true).order('name'),
        supabase.from('teams').select('id, name').eq('is_active', true).order('name'),
      ])
      // 自分の案件（重複排除）。埋め込み cases は環境により単体/配列で返るため両対応。
      const seen = new Set<string>()
      const myCases: CaseOpt[] = []
      for (const row of (caseRes.data ?? []) as unknown as Array<{ cases: CaseOpt | CaseOpt[] | null }>) {
        const c = Array.isArray(row.cases) ? row.cases[0] : row.cases
        if (c && !seen.has(c.id)) { seen.add(c.id); myCases.push(c) }
      }
      myCases.sort((a, b) => a.case_number.localeCompare(b.case_number))
      setCases(myCases)
      setMembers((memberRes.data ?? []) as MemberOpt[])
      setTeams((teamRes.data ?? []) as TeamOpt[])
    })()
  }, [open, currentMemberId])

  const close = () => {
    setOpen(false)
    setForm({ ...EMPTY_FORM, assigneeId: currentMemberId })
    setError('')
  }

  const handleSubmit = async () => {
    if (!form.caseId) { setError('案件を選択してください'); return }
    if (!form.title.trim()) { setError('タスク名は必須です'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()

    // フェーズ未選択 = システムタスク（Phaseなし）、選択時 = 案件タスク
    const isSystem = !form.phase
    const { data: inserted, error: taskErr } = await supabase
      .from('tasks')
      .insert({
        case_id: form.caseId,
        task_kind: isSystem ? 'system' : 'case',
        title: form.title.trim(),
        phase: isSystem ? 'system' : form.phase,
        status: '着手前',
        priority: form.priority,
        due_date: form.dueDate || null,
        team_id: form.teamId || null,
        sort_order: 99,
      })
      .select('id')
      .single()

    if (taskErr || !inserted) {
      setError(`作成に失敗しました: ${taskErr?.message ?? '不明なエラー'}`)
      setSaving(false)
      return
    }

    // 担当者（個人）を task_assignees に紐付け
    if (form.assigneeId) {
      const { error: aErr } = await supabase
        .from('task_assignees')
        .insert({ task_id: inserted.id, member_id: form.assigneeId, role: 'primary' })
      if (aErr) {
        setError(`担当者の割当に失敗しました: ${aErr.message}`)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    showToast('タスクを作成しました', 'success')
    close()
    startTransition(() => router.refresh())
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
        タスク作成
      </button>

      <Modal
        isOpen={open}
        onClose={close}
        title="＋ タスク作成"
        footer={
          <>
            <Button variant="secondary" onClick={close}>キャンセル</Button>
            <Button variant="primary" onClick={handleSubmit} loading={saving}>
              {saving ? '作成中...' : '作成する'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}

          {/* 案件 */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-500 mb-1">案件 *</label>
            <select
              value={form.caseId}
              onChange={e => setForm(p => ({ ...p, caseId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            >
              <option value="">案件を選択</option>
              {cases.map(c => (
                <option key={c.id} value={c.id}>{c.case_number}　{c.deal_name}</option>
              ))}
            </select>
          </div>

          {/* タスク名 */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-500 mb-1">タスク名 *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="例：残高証明の取得依頼"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* フェーズ（任意） */}
            <div>
              <label className="block text-[13px] font-semibold text-gray-500 mb-1">フェーズ</label>
              <select
                value={form.phase}
                onChange={e => setForm(p => ({ ...p, phase: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                <option value="">（なし＝受注担当/管理担当タスク）</option>
                {DB_PHASES.map(p => (
                  <option key={p} value={p}>{getPhaseLabel(p)}</option>
                ))}
              </select>
            </div>

            {/* 期限（任意） */}
            <div>
              <label className="block text-[13px] font-semibold text-gray-500 mb-1">期限</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>

            {/* 担当者（個人） */}
            <div>
              <label className="block text-[13px] font-semibold text-gray-500 mb-1">担当者</label>
              <select
                value={form.assigneeId}
                onChange={e => setForm(p => ({ ...p, assigneeId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                <option value="">（未割当）</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* 担当チーム（任意） */}
            <div>
              <label className="block text-[13px] font-semibold text-gray-500 mb-1">担当チーム</label>
              <select
                value={form.teamId}
                onChange={e => setForm(p => ({ ...p, teamId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                <option value="">（なし）</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 優先度 */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-500 mb-1">優先度</label>
            <div className="flex gap-1.5">
              {TASK_PRIORITIES.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, priority: p.key }))}
                  className={`flex-1 px-3 py-1.5 text-[13px] font-medium rounded-lg border transition-colors ${
                    form.priority === p.key ? 'ring-2 ring-brand-400 ring-offset-1' : ''
                  } ${p.style}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
