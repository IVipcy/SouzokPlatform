'use client'

// 実務タブの右サイドパネル（「この業務の補足」）。
//
// 以前はタブの上に2本の帯（作業内容のアコーディオン／進行中の作業）を置いていたが、
// 中身より先に、中身と同じ幅で補足が場所を取っていて邪魔だった。
// 見出しの行の右端に2つのチップを置き、押すと画面の右端からパネルが重なって出る。
// 型は Asana のタスク詳細・Jira の課題パネル・Salesforce の詳細パネルと同じ：
//   ・パネルは1枚で上にタブ（作業内容／進行中の作業／完了）。押したチップのタブが開く
//   ・右端に重ねて出て中身は縮めない。暗い背景は敷かず、開いたまま左の表を操作できる
//   ・閉じるのは左端の丸い「»」ボタンと Esc。「広げる」で幅を大きくできる
//   ・タスクの行は「タイトル1行＋小さなメタ1行」。担当区分のバッジは出さない
//
//   TabContextChips … 見出し右端のチップ2つ
//   TabContextPanel … 右サイドパネル本体
//
// まずは財産調査タブだけ。他の実務タブへは様子を見てから広げる。

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronsRight, ChevronDown, ChevronRight, Maximize2, Minimize2, Loader2 } from 'lucide-react'
import type { CaseRow, TaskRow } from '@/types'
import { normalizeTaskStatus, getStartSignal, isWaitingReceipt } from '@/lib/taskReadiness'
import { WorkContentField } from './WorkContentField'
import { countTabTasks, useTabTaskActions } from './TabTasksSection'

export type TabContextTarget = 'memo' | 'tasks'
type PanelTab = 'memo' | 'active' | 'done'

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
        進行中の作業
        <span className={`px-1.5 text-[11.5px] font-bold ${active > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{active}</span>
      </button>
    </div>
  )
}

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function TabContextPanel({ title, caseData, gyomu, patchCase, tasks, gyomus, target, onClose, onRefresh }: {
  /** 業務名（財産調査 など）。パネルの見出しに出す */
  title: string
  caseData: CaseRow
  gyomu: string
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  tasks: TaskRow[]
  gyomus: string[]
  /** どちらのチップから開いたか。そのタブを最初に開く */
  target: TabContextTarget
  onClose: () => void
  onRefresh?: () => void
}) {
  // 押したチップが変わったら親が key で作り直す（effect で setTab しない）
  const [tab, setTab] = useState<PanelTab>(target === 'memo' ? 'memo' : 'active')
  const [wide, setWide] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const { busyId, onRowClick, modal } = useTabTaskActions(onRefresh)

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mine = tasks.filter(t => gyomus.some(g => (t.phase ?? '') === g))
  const active = mine.filter(t => normalizeTaskStatus(t.status) !== '完了')
  const done = mine
    .filter(t => normalizeTaskStatus(t.status) === '完了')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const doing = active.filter(t => normalizeTaskStatus(t.status) === '対応中')
  const ready = active.filter(t => normalizeTaskStatus(t.status) !== '対応中' && getStartSignal(t).ready)
  const waiting = active.filter(t => normalizeTaskStatus(t.status) !== '対応中' && !getStartSignal(t).ready)

  const tabBtn = (k: PanelTab, label: string, n?: number, tone?: string) => (
    <button type="button" onClick={() => setTab(k)}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? 'text-brand-800 border-brand-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
      {label}
      {n != null && <span className={`px-1.5 text-[11px] font-bold ${n > 0 ? tone : 'bg-gray-100 text-gray-500'}`}>{n}</span>}
    </button>
  )

  // 状態のグループ（畳める）
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
          const wait = isWaitingReceipt(t)
          return (
            <button key={t.id} type="button" onClick={() => onRowClick(t)} disabled={busy}
              title={normalizeTaskStatus(t.status) === '対応中' ? 'クリックで完了' : getStartSignal(t).ready ? 'クリックで着手' : '詳細を開く'}
              className="w-full flex items-start gap-2.5 px-2 py-2 text-left hover:bg-gray-50 disabled:opacity-50">
              {busy
                ? <Loader2 className="w-3.5 h-3.5 mt-0.5 flex-none animate-spin text-gray-400" />
                : <span className={`w-3.5 h-3.5 mt-0.5 flex-none rounded-full border-[1.5px] ${dot}`} />}
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-gray-800 leading-snug">{t.title}</span>
                <span className="flex flex-wrap gap-x-2.5 mt-0.5 text-[11.5px] text-gray-500">
                  <span className="text-brand-700">{t.phase}</span>
                  {t.due_date && <span className="text-amber-700">期限 {t.due_date.slice(5).replace('-', '/')}</span>}
                  {wait && <span>受領待ち</span>}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <aside
      className={`fixed top-0 right-0 bottom-0 z-40 bg-white border-l border-gray-200 shadow-[-6px_0_20px_rgba(15,23,42,0.08)] flex flex-col transition-[width] ${wide ? 'w-[640px]' : 'w-[420px]'} max-w-[92vw]`}
      role="complementary" aria-label={`${title}の補足`}>
      {/* 左端の丸い閉じるボタン（境目にまたがせる） */}
      <button type="button" onClick={onClose} title="閉じる（Esc）"
        className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-gray-300 shadow-sm flex items-center justify-center text-gray-500 hover:text-gray-800 hover:border-gray-400">
        <ChevronsRight className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="text-[14px] font-bold text-gray-800">{title}</span>
        <span className="text-[12px] text-gray-500">この業務の補足</span>
        <button type="button" onClick={() => setWide(w => !w)} title={wide ? '元の幅に戻す' : '広げる'} className="ml-auto p-1 text-gray-400 hover:text-gray-700">
          {wide ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex items-center gap-1 px-2 mt-1 border-b border-gray-200">
        {tabBtn('memo', '作業内容')}
        {tabBtn('active', '進行中の作業', active.length, 'bg-amber-50 text-amber-700')}
        {tabBtn('done', '完了', done.length, 'bg-emerald-50 text-emerald-700')}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'memo' && (
          <div className="p-4">
            <WorkContentField caseData={caseData} gyomu={gyomu} patchCase={patchCase} label="" large
              placeholder="作業内容や備考を自由に記載してください（オーダーシートと共有）"
              onSaved={() => setSavedAt(new Date().toISOString())} />
            <div className="mt-1.5 text-right text-[11.5px] text-gray-400">
              {savedAt ? `保存済み ${fmtTime(savedAt).slice(-5)}` : '欄から出ると保存されます'}
            </div>
          </div>
        )}
        {tab === 'active' && (
          <div className="px-2 pb-3">
            {active.length === 0 && <p className="px-2 pt-4 text-[13px] text-gray-400">進行中の作業はありません</p>}
            {group('doing', '対応中', doing, 'border-brand-600 bg-brand-600')}
            {group('ready', '着手できる', ready, 'border-amber-500')}
            {group('waiting', '待ち', waiting, 'border-gray-300', '着手OK待ち')}
          </div>
        )}
        {tab === 'done' && (
          <div className="px-2 pb-3">
            {done.length === 0 && <p className="px-2 pt-4 text-[13px] text-gray-400">完了した作業はありません</p>}
            {done.map(t => {
              const ext = (t.ext_data ?? {}) as Record<string, unknown>
              const result = typeof ext.execution_result === 'string' ? ext.execution_result.trim() : ''
              const by = typeof ext.completed_by_name === 'string' ? ext.completed_by_name : ''
              const at = typeof ext.completed_at === 'string' ? fmtTime(ext.completed_at) : ''
              return (
                <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-start gap-2.5 px-2 py-2 hover:bg-gray-50">
                  <span className="w-3.5 h-3.5 mt-0.5 flex-none rounded-full border-[1.5px] border-emerald-600 bg-emerald-600" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-gray-800 leading-snug">{t.title}</span>
                    <span className={`block mt-0.5 text-[12px] leading-snug line-clamp-2 ${result ? 'text-gray-600' : 'text-gray-400'}`}>{result || '実施結果の記載なし'}</span>
                    <span className="block mt-0.5 text-[11.5px] text-gray-400">{[t.phase, by, at].filter(Boolean).join('・')}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 text-[12px]">
        <Link href="/tasks" className="font-semibold text-brand-600 hover:text-brand-700">タスク一覧で開く →</Link>
        <span className="text-gray-400">Esc で閉じる</span>
      </div>
      {modal}
    </aside>
  )
}
