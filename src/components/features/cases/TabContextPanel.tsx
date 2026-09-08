'use client'

// 実務タブの右サイドパネル（作業内容／関連タスク）。
//
// 以前はタブの上に2本の帯（作業内容のアコーディオン／進行中の作業）を置いていたが、
// 中身より先に、中身と同じ幅で補足が場所を取っていて邪魔だった。
// 見出しの行の右端に2つのチップを置き、押すと画面の右端からパネルが重なって出る。
//   ・チップごとに別のパネル。「作業内容」は欄だけ、「関連タスク」はタスクだけ
//   ・右端に重ねて出て中身は縮めない。暗い背景は敷かず、開いたまま左の表を操作できる
//   ・閉じるのは右上の「✕ 閉じる」と左端の丸い「»」、それに Esc
//   ・関連タスクは上に「進行中／完了」の2タブ。行は「タスク名・作業内容・業務/期限/担当」の3段
//
//   TabContextChips … 見出し右端のチップ2つ
//   TabContextPanel … パネル本体（target で中身が変わる）
//
// まずは財産調査タブだけ。他の実務タブへは様子を見てから広げる。

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronsRight, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react'
import type { CaseRow, TaskRow } from '@/types'
import { normalizeTaskStatus, getStartSignal, isWaitingReceipt } from '@/lib/taskReadiness'
import { WorkContentField } from './WorkContentField'
import { countTabTasks, useTabTaskActions } from './TabTasksSection'

export type TabContextTarget = 'memo' | 'tasks'

export function TabContextChips({ caseData, gyomu, tasks, gyomus, open, onToggle }: {
  caseData: CaseRow
  /** work_content のキー（assets など） */
  gyomu: string
  tasks: TaskRow[]
  /** task.phase の業務名リスト */
  gyomus: string[]
  open: TabContextTarget | null
  onToggle: (t: TabContextTarget) => void
}) {
  const memo = ((caseData.work_content ?? {})[gyomu] ?? '').trim()
  const { active } = countTabTasks(tasks, gyomus)
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-semibold border transition-colors ${
      on ? 'bg-brand-50 border-brand-400 text-brand-800' : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'}`
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onToggle('memo')} className={chip(open === 'memo')} title="作業内容（フリー・オーダーシートと共有）">
        作業内容
        <span className={`font-normal ${memo ? 'text-gray-500' : 'text-gray-400'}`}>{memo ? '記入あり' : '未記入'}</span>
      </button>
      <button type="button" onClick={() => onToggle('tasks')} className={chip(open === 'tasks')} title="この業務のタスク">
        関連タスク
        <span className={`px-1.5 text-[11.5px] font-bold ${active > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{active}</span>
      </button>
    </div>
  )
}

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const fmtDate = (iso: string) => iso.slice(5, 10).replace('-', '/')

/** パネルの器（右端に重ねる・左端の「»」・右上の「✕ 閉じる」・Esc） */
function PanelShell({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <aside className="fixed top-0 right-0 bottom-0 z-40 w-[440px] max-w-[92vw] bg-white border-l border-gray-200 shadow-[-6px_0_20px_rgba(15,23,42,0.08)] flex flex-col"
      role="complementary" aria-label={`${title}の${sub}`}>
      <button type="button" onClick={onClose} title="閉じる（Esc）"
        className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-gray-300 shadow-sm flex items-center justify-center text-gray-500 hover:text-gray-800 hover:border-gray-400">
        <ChevronsRight className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="text-[14px] font-bold text-gray-800">{title}</span>
        <span className="text-[12px] text-gray-500">{sub}</span>
        <button type="button" onClick={onClose} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-gray-800">
          <X className="w-3.5 h-3.5" />閉じる
        </button>
      </div>
      {children}
    </aside>
  )
}

export function TabContextPanel({ title, caseData, gyomu, patchCase, tasks, gyomus, target, onClose, onRefresh }: {
  /** 業務名（財産調査 など）。パネルの見出しに出す */
  title: string
  caseData: CaseRow
  gyomu: string
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  tasks: TaskRow[]
  gyomus: string[]
  /** どちらのチップから開いたか */
  target: TabContextTarget
  onClose: () => void
  onRefresh?: () => void
}) {
  if (target === 'memo') {
    return <MemoPanel title={title} caseData={caseData} gyomu={gyomu} patchCase={patchCase} onClose={onClose} />
  }
  return <TasksPanel title={title} tasks={tasks} gyomus={gyomus} onClose={onClose} onRefresh={onRefresh} />
}

// ── 作業内容：欄だけ ──
function MemoPanel({ title, caseData, gyomu, patchCase, onClose }: {
  title: string; caseData: CaseRow; gyomu: string; patchCase: (p: Partial<CaseRow>) => Promise<void>; onClose: () => void
}) {
  const [savedAt, setSavedAt] = useState<string | null>(null)
  return (
    <PanelShell title={title} sub="作業内容（オーダーシートと共有）" onClose={onClose}>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <WorkContentField caseData={caseData} gyomu={gyomu} patchCase={patchCase} label="" large
          placeholder="作業内容や備考を自由に記載してください"
          onSaved={() => setSavedAt(new Date().toISOString())} />
        <div className="mt-1.5 text-right text-[11.5px] text-gray-400">
          {savedAt ? `保存済み ${fmtTime(savedAt).slice(-5)}` : '欄から出ると保存されます'}
        </div>
      </div>
    </PanelShell>
  )
}

// ── 関連タスク：進行中／完了 ──
function TasksPanel({ title, tasks, gyomus, onClose, onRefresh }: {
  title: string; tasks: TaskRow[]; gyomus: string[]; onClose: () => void; onRefresh?: () => void
}) {
  const [tab, setTab] = useState<'active' | 'done'>('active')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const { busyId, onRowClick, modal } = useTabTaskActions(onRefresh)

  const mine = tasks.filter(t => gyomus.some(g => (t.phase ?? '') === g))
  const active = mine.filter(t => normalizeTaskStatus(t.status) !== '完了')
  const done = mine
    .filter(t => normalizeTaskStatus(t.status) === '完了')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const doing = active.filter(t => normalizeTaskStatus(t.status) === '対応中')
  const ready = active.filter(t => normalizeTaskStatus(t.status) !== '対応中' && getStartSignal(t).ready)
  const waiting = active.filter(t => normalizeTaskStatus(t.status) !== '対応中' && !getStartSignal(t).ready)

  const assigneeNames = (t: TaskRow) => (t.task_assignees ?? []).map(a => a.members?.name).filter(Boolean).join('・')

  // 1行＝タスク名／作業内容（procedure_text）／業務・期限・担当・着手日
  const body = (t: TaskRow, extra?: React.ReactNode) => {
    const work = (t.procedure_text ?? '').trim()
    return (
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold text-gray-800 leading-snug">{t.title}</span>
        <span className={`block mt-0.5 text-[12px] leading-snug line-clamp-3 ${work ? 'text-gray-600' : 'text-gray-400'}`}>
          <span className="text-gray-400 mr-1">作業内容</span>{work || '記載なし'}
        </span>
        <span className="flex flex-wrap gap-x-2.5 mt-1 text-[11.5px] text-gray-400">
          <span className="text-brand-700">{t.phase}</span>
          {t.due_date && <span className="text-amber-700">期限 {fmtDate(t.due_date)}</span>}
          {assigneeNames(t) && <span>{assigneeNames(t)}</span>}
          {t.started_at && <span>着手 {fmtDate(t.started_at)}</span>}
          {extra}
        </span>
      </span>
    )
  }

  const group = (key: string, label: string, rows: TaskRow[], dot: string, note?: string) => {
    if (rows.length === 0) return null
    const isClosed = !!closed[key]
    return (
      <div key={key}>
        <button type="button" onClick={() => setClosed(c => ({ ...c, [key]: !isClosed }))}
          className="w-full flex items-center gap-1.5 px-1.5 pt-3 pb-1 text-[12px] font-semibold text-gray-600">
          {isClosed ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
          {label}<span className="font-normal text-gray-400">{rows.length}</span>
          {note && <span className="ml-1 px-1.5 text-[11px] font-medium bg-gray-100 text-gray-500">{note}</span>}
        </button>
        {!isClosed && rows.map(t => {
          const busy = busyId === t.id
          return (
            <button key={t.id} type="button" onClick={() => onRowClick(t)} disabled={busy}
              title={normalizeTaskStatus(t.status) === '対応中' ? 'クリックで完了' : getStartSignal(t).ready ? 'クリックで着手' : '詳細を開く'}
              className="w-full flex items-start gap-2.5 px-2 py-2.5 text-left border-b border-gray-100 hover:bg-gray-50 disabled:opacity-50">
              {busy
                ? <Loader2 className="w-3.5 h-3.5 mt-0.5 flex-none animate-spin text-gray-400" />
                : <span className={`w-3.5 h-3.5 mt-0.5 flex-none rounded-full border-[1.5px] ${dot}`} />}
              {body(t, isWaitingReceipt(t) ? <span>受領待ち</span> : undefined)}
            </button>
          )
        })}
      </div>
    )
  }

  const tabBtn = (k: 'active' | 'done', label: string, n: number, tone: string) => (
    <button type="button" onClick={() => setTab(k)}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? 'text-brand-800 border-brand-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
      {label}<span className={`px-1.5 text-[11px] font-bold ${n > 0 ? tone : 'bg-gray-100 text-gray-500'}`}>{n}</span>
    </button>
  )

  return (
    <PanelShell title={title} sub="関連タスク" onClose={onClose}>
      <div className="flex items-center gap-1 px-2 border-b border-gray-200">
        {tabBtn('active', '進行中', active.length, 'bg-amber-50 text-amber-700')}
        {tabBtn('done', '完了', done.length, 'bg-emerald-50 text-emerald-700')}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
        {tab === 'active' && (<>
          {active.length === 0 && <p className="px-2 pt-4 text-[13px] text-gray-400">進行中のタスクはありません</p>}
          {group('doing', '対応中', doing, 'border-brand-600 bg-brand-600')}
          {group('ready', '着手できる', ready, 'border-amber-500')}
          {group('waiting', '待ち', waiting, 'border-gray-300', '着手OK待ち')}
        </>)}
        {tab === 'done' && (<>
          {done.length === 0 && <p className="px-2 pt-4 text-[13px] text-gray-400">完了したタスクはありません</p>}
          {done.map(t => {
            const ext = (t.ext_data ?? {}) as Record<string, unknown>
            const result = typeof ext.execution_result === 'string' ? ext.execution_result.trim() : ''
            const by = typeof ext.completed_by_name === 'string' ? ext.completed_by_name : ''
            const at = typeof ext.completed_at === 'string' ? fmtTime(ext.completed_at) : ''
            return (
              <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-start gap-2.5 px-2 py-2.5 border-b border-gray-100 hover:bg-gray-50">
                <span className="w-3.5 h-3.5 mt-0.5 flex-none rounded-full border-[1.5px] border-emerald-600 bg-emerald-600" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-gray-800 leading-snug">{t.title}</span>
                  <span className={`block mt-0.5 text-[12px] leading-snug line-clamp-3 ${result ? 'text-gray-600' : 'text-gray-400'}`}>
                    <span className="text-gray-400 mr-1">実施結果</span>{result || '記載なし'}
                  </span>
                  <span className="block mt-1 text-[11.5px] text-gray-400">{[t.phase, by, at].filter(Boolean).join('・')}</span>
                </span>
              </Link>
            )
          })}
        </>)}
      </div>
      {modal}
    </PanelShell>
  )
}
