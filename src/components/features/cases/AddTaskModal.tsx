'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import NewTaskFields, { emptyNewTask, type NewTaskValue } from '@/components/features/tasks/NewTaskFields'
import TaskTargetPicker, { emptyTarget, resolveTargetRid, type TaskTarget } from '@/components/features/tasks/TaskTargetPicker'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { showToast } from '@/components/ui/Toast'
import type { MemberRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseId: string
  allMembers: MemberRow[]
  onSaved: () => void
  /** 調査タブ等から開く際の初期業務（例: 戸籍 / 金融資産）。 */
  defaultPhase?: string
  /** 「候補から選択」タブの中身。渡すとタブが出る（案件詳細から開いたときだけ）。 */
  candidates?: React.ReactNode
}

export default function AddTaskModal({ isOpen, onClose, caseId, onSaved, defaultPhase, candidates }: Props) {
  const currentMemberId = useCurrentMember(null)
  const [form, setForm] = useState<NewTaskValue>(emptyNewTask)
  // 実務タブのどこの作業か。入れておくとタスクからその場所へ直接飛べる（任意）
  const [target, setTarget] = useState<TaskTarget>(emptyTarget)
  // 候補を渡されたときだけ2タブ。左＝新規作成／右＝候補から選択。
  const [tab, setTab] = useState<'manual' | 'candidate'>('manual')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const patch = (p: Partial<NewTaskValue>) => setForm(prev => ({ ...prev, ...p }))
  const close = () => { setTab('manual'); onClose() }

  const handleSubmit = async (keepOpen = false) => {
    if (!form.title.trim()) {
      setError('タスク名は必須です')
      return
    }
    if (!form.work.trim()) {
      setError('作業内容は必須です')
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()

    // 対象（実務タブのどこの作業か）。戸籍は選んだ内容で新しい請求行を作ってから紐づける。
    const sourceRid = await resolveTargetRid(caseId, target)

    // タスクは作った時点で常に着手OK（着手前で寝かせる運用はやめた）。
    // 外出タスクの印もここで ext_data に入れる。
    const readyExt: Record<string, unknown> = {
      ready_reason: '着手OK', ready_on_receipt: false,
      ...(form.outing ? { outing: true } : {}),
    }

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
          source_rid: sourceRid,
          ext_data: readyExt,
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
          source_rid: sourceRid,
          ext_data: readyExt,
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
    onSaved()
    if (keepOpen) {
      // 続けて同じ業務のタスクを足すことが多いので、業務区分・担当区分は残す
      showToast('タスクを追加しました', 'success')
      setForm({ ...emptyNewTask(), roleKind: form.roleKind, gyomu: form.gyomu })
      // 対象は毎回ちがう（別の役所・別の銀行）ので引き継がない
      setTarget(emptyTarget())
    } else {
      setForm(emptyNewTask())
      setTarget(emptyTarget())
      close()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="＋ タスク追加"
      maxWidth="max-w-2xl"
      footer={
        tab === 'candidate' ? (
          <>
            <span className="text-[12px] text-gray-400 mr-auto">チェックしたものが追加されます</span>
            <Button variant="secondary" onClick={close}>閉じる</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>キャンセル</Button>
            <Button variant="secondary" onClick={() => handleSubmit(true)} loading={saving}>
              追加して続ける
            </Button>
            <Button variant="primary" onClick={() => handleSubmit(false)} loading={saving}>
              {saving ? '追加中...' : '追加する'}
            </Button>
          </>
        )
      }
    >
      {candidates && (
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden mb-3.5">
          {([['manual', '新規作成'], ['candidate', '候補から選択']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`px-3.5 py-1.5 text-[13px] font-semibold transition ${tab === k ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'candidate' && candidates}

      <div className={tab === 'candidate' ? 'hidden' : ''}>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">{error}</div>
        )}

        <NewTaskFields
          caseId={caseId}
          value={form}
          onChange={patch}
          defaultGyomu={defaultPhase}
          workRequired
        />

        {/* 実務タブのどこの作業か（戸籍・不動産・金融資産・解約のみ）。
            一括生成をやめて随時タスクを足す運用でも、実務タブへの導線を残すために置く。 */}
        <div className="mt-3">
          <TaskTargetPicker caseId={caseId} gyomu={form.gyomu} value={target} onChange={setTarget} />
        </div>
      </div>
    </Modal>
  )
}
