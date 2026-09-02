'use client'

// タスク完了ゲート。事務管理タスク(task_kind!=='system')を完了するとき必ず通す。
//
// 上から「決まっている → 自分で決める → 決まらない」の順に並べる。上で済めば下は読まなくていい。
//   1) 実施結果（必須）
//   2) 次に着手できるかもしれないタスク … 戸籍の完了に依存していて、いま実際に始められるものだけ。
//      無ければセクションごと出さない（空のリストを見せない）。名前はその場で直せる。
//   3) タスクを作成 … 畳んである。押すとタスク追加モーダルと同じ入力欄が開く。
//   4) 次に進められるタスクはない … 何も作らないと言い切るチェック
//   5) 管理担当に相談する … 完了とは別に報連相で送る
//
// 以前は「案件にある着手前タスク」を候補として全部並べていたが、
// タスクを先にまとめて作る運用をやめたので、そこは構造的にほぼ空になった。
// 空のリストと「＋他の工程も表示（0）」だけが残るので、まるごと外した。

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, ArrowRight, Plus, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'
import FloatingWindow from '@/components/ui/FloatingWindow'
import Button from '@/components/ui/Button'
import NewTaskFields, { emptyNewTask, type NewTaskValue } from '@/components/features/tasks/NewTaskFields'
import TaskTargetPicker, { emptyTarget, resolveTargetRid, type TaskTarget } from './TaskTargetPicker'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'
import TaskHourenSouModal from '@/components/features/tasks/TaskHourenSouModal'
import { notifyTasksReady, type ReadyTaskLite } from '@/lib/taskReadyNotify'
import { loadNextCandidates, type NextCandidate } from '@/lib/nextTaskCandidates'
import type { TaskRow } from '@/types'

// 着手OKの ext_data を作る。
// タスクは作った時点で着手OKという運用なので、理由も受領待ちも聞かない。
function extReady(base: Record<string, unknown>, fromTaskId: string, why?: string): Record<string, unknown> {
  return { ...base, ready_reason: why || '着手OK', ready_on_receipt: false, ready_wait_note: null, ready_from_task_id: fromTaskId }
}

/** 画面で持つ候補。title は入力欄なのでその場で書き換わる。 */
type PickedCandidate = NextCandidate & { on: boolean }

export default function CompleteTaskModal({ task, onClose, onCompleted }: {
  task: TaskRow
  onClose: () => void
  onCompleted: () => void
}) {
  const memberId = useCurrentMember(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cands, setCands] = useState<PickedCandidate[]>([])

  const initialResult = (() => {
    const ext = (task.ext_data ?? {}) as Record<string, unknown>
    return typeof ext.execution_result === 'string' ? ext.execution_result : ''
  })()
  const [result, setResult] = useState(initialResult)
  const [noNext, setNoNext] = useState(false)

  // 新規追加タスク。入力欄は「タスク追加」モーダルの新規作成タブと同じ部品を使う。
  // 畳んでおく（ふだんの入口だが、開きっぱなしだと縦に長くなり実施結果が押し出される）。
  const [addOpen, setAddOpen] = useState(false)
  const [newTask, setNewTask] = useState<NewTaskValue>(emptyNewTask)
  // 実務タブのどこの作業か（任意）。入れると新しいタスクからその場所へ直接飛べる
  const [newTarget, setNewTarget] = useState<TaskTarget>(emptyTarget)
  const newTitle = newTask.title

  // 相談は報連相で送る（ヘルプタスクの起票はやめた）。
  // 送ったら「次の扱いを決めた」ものとして数える。
  // 以前はここが数えられておらず、相談しても完了ボタンが押せないままだった。
  const [hourenSouOpen, setHourenSouOpen] = useState(false)
  const [consulted, setConsulted] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const list = await loadNextCandidates(task.case_id)
      if (!alive) return
      setCands(list.map(c => ({ ...c, on: false })))
      setLoading(false)
    })()
    return () => { alive = false }
  }, [task.case_id])

  const picked = cands.filter(c => c.on && c.title.trim())
  const hasAction = noNext || picked.length > 0 || newTitle.trim().length > 0 || consulted
  const canSubmit = result.trim().length > 0 && hasAction
  // 押せないときは、何が足りないのかを footer に出す（黙って灰色にしない）。
  const blockedBy = !result.trim() ? '実施結果を書くと押せます'
    : !hasAction ? '次の扱いを1つ選ぶと押せます'
    : ''

  const patchCand = (rid: string, p: Partial<PickedCandidate>) =>
    setCands(prev => prev.map(c => (c.rid === rid ? { ...c, ...p } : c)))

  const submit = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    const supabase = createClient()

    // 1) 完了本体（実施結果・完了者・完了日時を merge。関連タスク一覧の実施ログ表示に使う）
    let meName: string | null = null
    if (memberId) { const { data: m } = await supabase.from('members').select('name').eq('id', memberId).maybeSingle(); meName = (m as { name?: string } | null)?.name ?? null }
    const ext = { ...((task.ext_data ?? {}) as Record<string, unknown>), execution_result: result.trim(), completed_at: new Date().toISOString(), completed_by_name: meName }
    const { error } = await supabase.from('tasks').update({ status: '完了', ext_data: ext }).eq('id', task.id)
    if (error) { setSaving(false); showToast(`完了に失敗しました: ${error.message}`, 'error'); return }

    // 着手OKにしたタスク。あとで担当者への通知＆割り当てに使う。
    const readied: ReadyTaskLite[] = []

    // 2) 選んだ「次に着手できるかもしれないタスク」を作る。
    //    source_rid を付けるので、実務タブの該当行へ直接飛べる（＝二重に作られない）。
    if (picked.length > 0) {
      const rows = picked.map((c, i) => ({
        case_id: task.case_id,
        title: c.title.trim(),
        task_kind: 'case',
        work_role: 'assistant',
        phase: c.gyomu,
        category: c.gyomu,
        status: '着手前',
        priority: '通常',
        source_rid: c.rid,
        ext_data: extReady({}, task.id, c.why),
        sort_order: 95 + i,
      }))
      const { data: created, error: ce } = await supabase.from('tasks').insert(rows).select('id, title, case_id')
      if (ce) showToast(`次のタスクの作成に失敗しました: ${ce.message}`, 'error')
      for (const c of ((created ?? []) as Array<{ id: string; title: string; case_id: string }>)) {
        readied.push({ id: c.id, title: c.title, case_id: c.case_id, task_kind: 'case', assign_role: null, work_role: 'assistant', mode: 'now', note: '' })
      }
    }

    // 3) 新規タスクを追加して着手OK
    //    区分によって作り分ける（タスク追加モーダルと同じ扱い）：
    //      事務管理 → task_kind='case'（業務にひもづく通常タスク）
    //      管理担当/受注担当 → task_kind='system' で、その担当へ割当・通知
    if (newTitle.trim()) {
      const newExt = { ...extReady({}, task.id), ...(newTask.outing ? { outing: true } : {}) }
      const newRid = await resolveTargetRid(task.case_id, newTarget)
      const isAssistant = newTask.roleKind === 'assistant'
      const gyomu = newTask.gyomu || task.phase || 'その他'
      const { data: created } = await supabase.from('tasks').insert({
        case_id: task.case_id,
        title: newTitle.trim(),
        task_kind: isAssistant ? 'case' : 'system',
        work_role: newTask.roleKind,
        assign_role: isAssistant ? null : newTask.roleKind,
        phase: gyomu,
        category: isAssistant ? gyomu : '',
        status: '着手前',
        priority: newTask.priority,
        due_date: newTask.dueDate || null,
        procedure_text: newTask.work.trim() || null,
        source_rid: newRid,
        ext_data: newExt,
        sort_order: 99,
      }).select('id').single()
      if (created) {
        readied.push({
          id: (created as { id: string }).id, title: newTitle.trim(), case_id: task.case_id,
          task_kind: isAssistant ? 'case' : 'system',
          assign_role: isAssistant ? null : newTask.roleKind,
          work_role: newTask.roleKind,
          mode: 'now', note: '',
        })
      }
    }

    // 2') 3') 着手OKにしたタスクを担当者へ届ける。
    // 管理担当/受注担当のタスクは、担当者が付いていなければ案件の担当者を付けたうえで通知する
    // （マイページのタスクタブに出ないと本人が気づけないため）。
    await notifyTasksReady(readied, task.title)

    // 4) 活動履歴
    if (memberId) {
      await supabase.from('case_activities').insert({
        case_id: task.case_id, task_id: task.id, member_id: memberId,
        activity_type: 'task_completed',
        description: `${task.title} を完了`,
        activity_date: new Date().toISOString().split('T')[0],
      })
    }

    setSaving(false)
    showToast(readied.length > 0
      ? `「${task.title}」を完了し、次のタスクを${readied.length}件作りました`
      : `「${task.title}」を完了しました`, 'success')
    onCompleted()
  }

  // 選択肢の見た目。閉じているときは1行、押すと開く。
  // 迷わないよう縦に同じ形で並べ、色だけで役割を言う（青＝これから作る／灰＝作らない／琥珀＝相談）。
  const optionCls = (tone: 'brand' | 'gray' | 'amber', on: boolean) => {
    const base = 'w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px] text-left transition-colors'
    if (!on) return `${base} border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300`
    if (tone === 'amber') return `${base} border-amber-300 bg-amber-50 text-amber-800`
    if (tone === 'gray') return `${base} border-gray-400 bg-gray-100 text-gray-800`
    return `${base} border-brand-400 bg-brand-50 text-brand-800`
  }
  const iconCls = (tone: 'brand' | 'gray' | 'amber', on: boolean) =>
    `w-6 h-6 rounded-md flex items-center justify-center flex-none ${
      !on ? 'bg-gray-100 text-gray-500'
        : tone === 'amber' ? 'bg-amber-100 text-amber-700'
        : tone === 'gray' ? 'bg-gray-200 text-gray-700'
        : 'bg-brand-100 text-brand-700'}`
  // いま押したら何が起きるか。footer に出して、押す前に結果が読めるようにする。
  const willCreate = picked.length + (newTitle.trim() ? 1 : 0)

  return (
    <>
    <FloatingWindow
      isOpen
      onClose={onClose}
      title="タスクを完了する"
      width={560}
      // 中身は「候補なし＝約300px／候補3件＋作成欄を開く＝約700px」と幅がある。
      // fitContent で短いときは縮ませ、長いときはこの高さで止めてスクロールにする。
      height={560}
      resizable
      fitContent
      footer={
        <div className="flex items-center gap-3 w-full">
          {/* 押せない理由・押したら何が起きるかを黙らせない */}
          <span className="text-[11px] text-gray-500 flex-1 min-w-0 truncate">
            {blockedBy || (willCreate > 0
              ? `完了して、次のタスクを${willCreate}件つくります`
              : consulted ? '完了します（相談は送信済み）' : '完了します')}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!canSubmit}>
            <CheckCircle2 className="w-4 h-4" /> 完了する
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {/* 1) 実施結果。ここだけ必須。 */}
        <div>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-brand-600 text-white text-[10.5px] font-bold flex-none">1</span>
            <span className="text-[12.5px] font-semibold text-gray-700">実施結果</span>
            <span className="text-[10.5px] text-red-500 font-semibold">必須</span>
            <span className="text-[10.5px] text-gray-400 truncate min-w-0">{task.title}</span>
          </div>
          <textarea
            value={result}
            onChange={e => setResult(e.target.value)}
            rows={3}
            placeholder="何をして、どうなったか。次の担当への引継ぎ事項も。"
            className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
          />
        </div>

        {/* 2) 次の扱い。上から「決まっている → 自分で決める → 決まらない」。 */}
        <div>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10.5px] font-bold flex-none ${hasAction ? 'bg-brand-600 text-white' : 'bg-gray-300 text-white'}`}>2</span>
            <span className="text-[12.5px] font-semibold text-gray-700">次はどうしますか</span>
            <span className="text-[10.5px] text-gray-400">1つ選んでください</span>
          </div>

          <div className="space-y-2">
            {/* 戸籍の完了に依存していて、いま始められるもの。無ければ枠ごと出さない。 */}
            {loading ? (
              <div className="py-2 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />次に進めるものを確認中…</div>
            ) : cands.length > 0 && (
              <div className="rounded-lg border border-brand-200 bg-brand-50/40 overflow-hidden">
                <div className="px-3 py-1.5 bg-brand-50 border-b border-brand-200 text-[11.5px] font-semibold text-brand-800 flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5" />
                  次に着手できるかもしれないタスク
                  <span className="font-normal text-brand-600">選ぶと作られます</span>
                </div>
                <div className="p-2 space-y-1.5">
                  {cands.map(c => (
                    <div key={c.rid} className={`rounded-lg border transition-colors ${c.on ? 'border-brand-400 bg-white' : 'border-gray-200 bg-white/70 hover:border-gray-300'}`}>
                      <label className="flex items-start gap-2.5 px-2.5 py-2 cursor-pointer">
                        <input type="checkbox" checked={c.on}
                          onChange={e => { patchCand(c.rid, { on: e.target.checked }); if (e.target.checked) setNoNext(false) }}
                          className="w-4 h-4 accent-brand-600 mt-[3px] flex-none" />
                        <span className="min-w-0 flex-1">
                          {c.on ? (
                            /* 選んだあとは名前を直せる。「名寄帳・評価証明を請求：横浜市」を
                               「名寄帳請求（都筑区分）」のように、その案件の言い方へ直せるようにする。 */
                            <input type="text" value={c.title}
                              onChange={e => patchCand(c.rid, { title: e.target.value })}
                              onClick={e => e.preventDefault()}
                              className="w-full px-2 py-1 text-[12.5px] font-semibold border border-brand-300 rounded bg-white outline-none focus:border-brand-500" />
                          ) : (
                            <span className="text-[12.5px] text-gray-800 block truncate">{c.title}</span>
                          )}
                          <span className="block text-[10.5px] text-gray-400 mt-1">
                            <span className="inline-block px-1.5 rounded bg-gray-100 text-gray-500 mr-1.5">{c.gyomu}</span>
                            {c.why}
                          </span>
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ふだんの入口。畳んであり、押すとタスク追加モーダルと同じ入力欄が開く。 */}
            <div>
              <button type="button" onClick={() => setAddOpen(v => !v)} className={optionCls('brand', addOpen || !!newTitle.trim())}>
                <span className={iconCls('brand', addOpen || !!newTitle.trim())}><Plus className="w-4 h-4" strokeWidth={2.25} /></span>
                <span className="flex-1 font-semibold">タスクを作成</span>
                {newTitle.trim() && !addOpen && <span className="text-[11px] text-brand-700 truncate max-w-[180px]">{newTitle}</span>}
                {addOpen ? <ChevronUp className="w-4 h-4 flex-none" /> : <ChevronDown className="w-4 h-4 flex-none" />}
              </button>
              {addOpen && (
                <div className="mt-1.5 rounded-lg border border-brand-200 bg-brand-50/30 px-2.5 py-2.5">
                  <NewTaskFields
                    caseId={task.case_id}
                    value={newTask}
                    onChange={p => { setNewTask(prev => ({ ...prev, ...p })); setNoNext(false) }}
                    defaultGyomu={task.phase ?? undefined}
                    compact
                  />
                  <div className="mt-2">
                    <TaskTargetPicker caseId={task.case_id} gyomu={newTask.gyomu} value={newTarget} onChange={setNewTarget} compact />
                  </div>
                </div>
              )}
            </div>

            {/* 何も作らないと言い切る。押すと上の選択を全部外す。 */}
            <label className={`${optionCls('gray', noNext)} cursor-pointer`}>
              <span className={iconCls('gray', noNext)}>
                <input type="checkbox" checked={noNext}
                  onChange={e => {
                    setNoNext(e.target.checked)
                    if (e.target.checked) { setCands(prev => prev.map(c => ({ ...c, on: false }))); setAddOpen(false) }
                  }}
                  className="w-4 h-4 accent-gray-600" />
              </span>
              <span className="flex-1">次に進められるタスクはない</span>
            </label>

            {/* 決まらないとき。完了とは別に送れる。送ったら「決めた」ものとして数える。 */}
            <button type="button" onClick={() => setHourenSouOpen(true)} className={optionCls('amber', consulted)}>
              <span className={iconCls('amber', consulted)}><HelpCircle className="w-4 h-4" strokeWidth={2} /></span>
              <span className="flex-1">{consulted ? '管理担当に相談しました' : '管理担当に相談する'}</span>
              <span className="text-[10.5px] flex-none">{consulted ? '送信済み・もう一度送れます' : '次が分からない・難しいとき'}</span>
            </button>
          </div>
        </div>
      </div>
    </FloatingWindow>

    {/* 相談用の報連相ウィンドウ（完了とは別に送れる）。
        完了ウィンドウの中に入れると、そのスクロール枠の中で開くことになるので外に出す。 */}
    <TaskHourenSouModal
      isOpen={hourenSouOpen}
      onClose={() => setHourenSouOpen(false)}
      caseId={task.case_id}
      currentMemberId={memberId}
      taskTitle={task.title}
      onSent={() => { setHourenSouOpen(false); setConsulted(true) }}
    />
    </>
  )
}
