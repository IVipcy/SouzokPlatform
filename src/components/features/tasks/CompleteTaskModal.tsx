'use client'

// タスク完了ゲート（v3）。事務管理タスク(task_kind!=='system')を完了するとき必ず通す。
//   1) 実施結果・引継ぎ事項（必須）
//   2) 次に着手できるタスクを指定（無ければ「該当なし」）。各タスクは経路を選ぶ:
//        ・今すぐ着手OK   → ext_data.ready_reason（着手OK理由）
//        ・受領次第OK     → ext_data.ready_on_receipt=true + ready_wait_note（何の受領待ちか）
//      候補に無ければその場で新規タスクを追加（入力欄はタスク追加モーダルと同じ）。
//   3) 次が判断できないときは「管理担当に確認」→ 管理担当確認タスクを起票し通知。
//   いずれの次タスクにも ext_data.ready_from_task_id（このタスク）を記録し前段表示に使う。

import { useEffect, useMemo, useState } from 'react'
import { Loader2, CheckCircle2, ArrowRight, Plus, HelpCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import NewTaskFields, { emptyNewTask, type NewTaskValue } from '@/components/features/tasks/NewTaskFields'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { normalizeTaskStatus } from '@/lib/taskReadiness'
import { koteiOf, koteiRank } from '@/lib/kotei'
import { KoteiBadge, GyomuBadge } from '@/components/ui/KoteiBadge'
import { TantoKubunBadge } from '@/components/ui/TantoKubunBadge'
import TaskHourenSouModal from '@/components/features/tasks/TaskHourenSouModal'
import { notifyTasksReady, type ReadyTaskLite } from '@/lib/taskReadyNotify'
import type { TaskRow } from '@/types'

type Cand = { id: string; title: string; phase: string | null; sort_order: number | null; status: string; ext_data?: Record<string, unknown> | null; source_rid?: string | null; task_kind?: string | null }

// 戸籍のタスクか（請求 koseki: / 読込 koseki-read:）。
// 1通の戸籍で他の人の分まで判明したとき、いらなくなった戸籍タスクをまとめて完了できるようにする。
const isKosekiRid = (rid: string | null | undefined): boolean => !!rid && /^koseki(-read)?:/.test(rid)


// 着手OKの ext_data を作る。
// 以前は「今すぐ着手OK（理由付き）／受領次第OK」の2経路だったが、
// タスクは作った時点で着手OKという運用に一本化したため、理由も受領待ちも聞かない。
function extReady(base: Record<string, unknown>, fromTaskId: string): Record<string, unknown> {
  return { ...base, ready_reason: '着手OK', ready_on_receipt: false, ready_wait_note: null, ready_from_task_id: fromTaskId }
}

export default function CompleteTaskModal({ task, onClose, onCompleted }: {
  task: TaskRow
  onClose: () => void
  onCompleted: () => void
}) {
  const memberId = useCurrentMember(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cands, setCands] = useState<Cand[]>([])

  const initialResult = (() => {
    const ext = (task.ext_data ?? {}) as Record<string, unknown>
    return typeof ext.execution_result === 'string' ? ext.execution_result : ''
  })()
  const [result, setResult] = useState(initialResult)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [work, setWork] = useState<Record<string, string>>({})  // 次タスクの作業内容（任意・先に記入）
  const [noNext, setNoNext] = useState(false)
  const [showOthers, setShowOthers] = useState(false)

  // 新規追加タスク。入力欄は「タスク追加」モーダルの新規作成タブと同じ部品を使う。
  const [newTask, setNewTask] = useState<NewTaskValue>(emptyNewTask)
  const newTitle = newTask.title

  // 管理担当ヘルプ（完了時は①次を教えて／②巻き取り）
  // 相談は報連相で送る（ヘルプタスクの起票はやめた）
  const [hourenSouOpen, setHourenSouOpen] = useState(false)
  // この戸籍で不要になった他の戸籍タスク（まとめて完了する分）
  const [dropIds, setDropIds] = useState<Record<string, boolean>>({})
  const [dropAll, setDropAll] = useState<Cand[]>([])

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: tsData } = await supabase
        .from('tasks').select('id,title,phase,sort_order,status,task_kind,ext_data,case_id,source_rid')
        .eq('case_id', task.case_id).order('sort_order').order('created_at')
      // 全担当区分（事務管理/受注管理/相続登記チーム）を次タスク候補に出す。区分はバッジで判別。
      const rows = ((tsData ?? []) as Array<Cand & { task_kind: string | null }>)
        .filter(t => {
          if (t.id === task.id) return false
          // 着手前のタスクを全部出す。いまはタスクを作った時点で着手OKになるので、
          // 「まだ着手OKでないもの」で絞ると候補が空になる。ここで選ぶ意味は
          // 担当への通知と、作業内容の事前記入。
          return normalizeTaskStatus(t.status) === '着手前'
        })
      setCands(rows)
      // この戸籍で不要になる可能性がある他の戸籍タスク（着手前・対応中の両方）。
      // 「次に着手」の候補とは別物なので、着手OK済みのものも対象に含める。
      if (isKosekiRid(task.source_rid)) {
        setDropAll(((tsData ?? []) as Array<Cand & { task_kind: string | null }>).filter(t =>
          t.id !== task.id && isKosekiRid(t.source_rid) && normalizeTaskStatus(t.status) !== '完了'))
      }
      setLoading(false)
    })()
  }, [task.case_id, task.id])

  const curRank = koteiRank(koteiOf(task.phase))
  const { recommend, others } = useMemo(() => {
    const rec: Cand[] = [], oth: Cand[] = []
    for (const c of cands) {
      const r = koteiRank(koteiOf(c.phase))
      if (r === curRank || r === curRank + 1) rec.push(c); else oth.push(c)
    }
    const bySort = (a: Cand, b: Cand) => koteiRank(koteiOf(a.phase)) - koteiRank(koteiOf(b.phase)) || (a.sort_order ?? 0) - (b.sort_order ?? 0)
    return { recommend: rec.sort(bySort), others: oth.sort(bySort) }
  }, [cands, curRank])

  const selectedIds = Object.keys(sel).filter(id => sel[id])
  const hasAction = noNext || selectedIds.length > 0 || newTitle.trim().length > 0
  const canSubmit = result.trim().length > 0 && hasAction

  const toggle = (id: string) => { setNoNext(false); setSel(prev => ({ ...prev, [id]: !prev[id] })) }

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

    // 2) 選んだ既存タスクに着手OK / 受領次第OK を付与（着手前のものだけ）
    if (selectedIds.length > 0) {
      const { data: rows } = await supabase.from('tasks').select('id, title, case_id, ext_data, status, task_kind, assign_role, work_role').in('id', selectedIds)
      for (const row of (rows ?? []) as Array<{ id: string; title: string; case_id: string; ext_data: Record<string, unknown> | null; status: string; task_kind: string | null; assign_role: string | null; work_role: string | null }>) {
        if (normalizeTaskStatus(row.status) !== '着手前') continue
        const next = extReady(row.ext_data ?? {}, task.id)
        const patch: Record<string, unknown> = { ext_data: next }
        const wc = (work[row.id] ?? '').trim()
        if (wc) patch.procedure_text = wc  // 先に記入した作業内容を次タスクへ反映
        await supabase.from('tasks').update(patch).eq('id', row.id)
        readied.push({
          id: row.id, title: row.title, case_id: row.case_id,
          task_kind: row.task_kind, assign_role: row.assign_role, work_role: row.work_role,
          mode: 'now', note: '',
        })
      }
    }

    // 3) 新規タスクを追加して着手OK / 受領次第OK
    //    区分によって作り分ける（タスク追加モーダルと同じ扱い）：
    //      事務管理 → task_kind='case'（業務にひもづく通常タスク）
    //      管理担当/受注担当 → task_kind='system' で、その担当へ割当・通知
    if (newTitle.trim()) {
      const newExt = { ...extReady({}, task.id), ...(newTask.outing ? { outing: true } : {}) }
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

    // 4) この戸籍で不要になった戸籍タスクをまとめて完了
    const dropTargets = Object.entries(dropIds).filter(([, on]) => on).map(([id]) => id)
    if (dropTargets.length > 0) {
      const { data: rows } = await supabase.from('tasks').select('id, ext_data').in('id', dropTargets)
      for (const row of (rows ?? []) as Array<{ id: string; ext_data: Record<string, unknown> | null }>) {
        const next = {
          ...(row.ext_data ?? {}),
          execution_result: `「${task.title}」の読込で内容が判明したため不要（まとめて完了）`,
          completed_at: new Date().toISOString(), completed_by_name: meName,
        }
        await supabase.from('tasks').update({ status: '完了', ext_data: next }).eq('id', row.id)
      }
    }

    // 5) 活動履歴
    if (memberId) {
      await supabase.from('case_activities').insert({
        case_id: task.case_id, task_id: task.id, member_id: memberId,
        activity_type: 'task_completed',
        description: `${task.title} を完了`,
        activity_date: new Date().toISOString().split('T')[0],
      })
    }

    setSaving(false)
    showToast(dropTargets.length > 0
      ? `「${task.title}」と、不要になった${dropTargets.length}件を完了しました`
      : `「${task.title}」を完了しました`, 'success')
    onCompleted()
  }

  const renderCand = (c: Cand) => {
    const on = !!sel[c.id]
    return (
      <div key={c.id} className={`rounded-lg border transition-colors ${on ? 'border-brand-300 bg-brand-50/60' : 'border-gray-200'}`}>
        <label className="flex items-center gap-2 px-2.5 py-2 cursor-pointer flex-wrap">
          <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="w-4 h-4 accent-brand-600" />
          <TantoKubunBadge task={c} size="xs" />
          <KoteiBadge phase={c.phase} width={92} />
          <GyomuBadge phase={c.phase} width={52} />
          <span className="text-[13px] text-gray-800 truncate">{c.title}</span>
        </label>
        {on && (
          <div className="px-2.5 pb-2 space-y-1.5">
            <div>
              <div className="text-[10.5px] text-gray-400 mb-0.5">作業内容（任意・先に書いておける）</div>
              <textarea
                value={work[c.id] ?? ''}
                onChange={e => setWork(prev => ({ ...prev, [c.id]: e.target.value }))}
                rows={2}
                placeholder="例：墨田区分の戸籍を読み込み、相関図に反映。転籍先を確認。"
                className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-brand-500 bg-gray-50/60 focus:bg-white resize-none"
                data-key={`work-${c.id}`}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="タスクを完了する"
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!canSubmit}>
            <CheckCircle2 className="w-4 h-4" /> 完了する
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="text-[13px] font-semibold text-gray-700 mb-1">「{task.title}」</div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">実施結果・引継ぎ事項 <span className="text-red-500">*</span></label>
          <textarea
            value={result}
            onChange={e => setResult(e.target.value)}
            rows={3}
            placeholder="何をして、どうなったか。次の担当への引継ぎ事項も。"
            className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">
            <ArrowRight className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />次に着手できるタスク
            <span className="ml-1 font-normal text-gray-400">（複数選択できます / 無ければ「該当なし」）</span>
          </label>
          {loading ? (
            <div className="py-5 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />読み込み中…</div>
          ) : (
            <div className="space-y-1.5">
              {recommend.length > 0 && <div className="text-[10.5px] text-gray-400">同じ工程・次の工程</div>}
              {recommend.map(renderCand)}
              {others.length > 0 && (showOthers
                ? <><div className="text-[10.5px] text-gray-400 mt-1">その他の工程</div>{others.map(renderCand)}</>
                : <button type="button" onClick={() => setShowOthers(true)} className="text-[12px] text-brand-600 hover:text-brand-700 font-semibold">＋ 他の工程のタスクも表示（{others.length}）</button>
              )}
            </div>
          )}

          {/* 該当なし（次に進められるタスクはまだ無い）→ 候補選択のすぐ下に配置（多いケースを上に） */}
          <label className={`mt-2 flex items-center gap-2 text-[12.5px] rounded-lg px-2.5 py-1.5 cursor-pointer border transition-colors ${noNext ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-dashed border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            <input type="checkbox" checked={noNext} onChange={e => { setNoNext(e.target.checked); if (e.target.checked) setSel({}) }} className="w-4 h-4 accent-gray-500" />
            該当なし（次に進められるタスクはまだ無い）
          </label>

          {/* この戸籍で不要になった他の戸籍タスクをまとめて完了 */}
          {dropAll.length > 0 && (
            <div className="mt-2 rounded-lg border border-gray-200 px-2.5 py-2">
              <div className="text-[12.5px] font-semibold text-gray-700">この戸籍で不要になったタスク</div>
              <p className="text-[11px] text-gray-400 mt-0.5 mb-1.5">
                1通の戸籍で他の人の分まで分かったときは、ここでまとめて完了にできます。選ばなければ何も起きません。
              </p>
              <div className="space-y-1">
                {dropAll.map(d => (
                  <label key={d.id} className={`flex items-center gap-2 text-[12px] rounded-md px-2 py-1 cursor-pointer border ${dropIds[d.id] ? 'border-brand-300 bg-brand-50' : 'border-transparent hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={!!dropIds[d.id]} onChange={e => setDropIds(prev => ({ ...prev, [d.id]: e.target.checked }))} className="w-4 h-4 accent-brand-600" />
                    <span className="flex-1 truncate text-gray-700">{d.title}</span>
                    <span className="text-[10.5px] text-gray-400">{normalizeTaskStatus(d.status)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 迷ったら報連相で相談（ヘルプタスクは起票しない） */}
          <div className="mt-2 rounded-lg border border-gray-200 px-2.5 py-2 flex items-center gap-2 flex-wrap">
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" strokeWidth={2} />
            <span className="text-[12.5px] text-gray-700">次が分からない・難しいときは</span>
            <button type="button" onClick={() => setHourenSouOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50">
              担当者に相談する
            </button>
          </div>

          {/* 候補に無い → 新規追加。入力欄は「タスク追加」モーダルの新規作成タブと同じ。 */}
          <div className="mt-2 rounded-lg border border-dashed border-gray-300 px-2.5 py-2.5">
            <div className="text-[11.5px] text-gray-500 inline-flex items-center gap-1 mb-2"><Plus className="w-3.5 h-3.5" />候補に無い → タスクを追加</div>
            <NewTaskFields
              caseId={task.case_id}
              value={newTask}
              onChange={p => setNewTask(prev => ({ ...prev, ...p }))}
              defaultGyomu={task.phase ?? undefined}
              compact
            />
          </div>
        </div>
      </div>
      {/* 相談用の報連相ウィンドウ（完了とは別に送れる） */}
      <TaskHourenSouModal
        isOpen={hourenSouOpen}
        onClose={() => setHourenSouOpen(false)}
        caseId={task.case_id}
        currentMemberId={memberId}
        taskTitle={task.title}
        onSent={() => setHourenSouOpen(false)}
      />
    </Modal>
  )
}
