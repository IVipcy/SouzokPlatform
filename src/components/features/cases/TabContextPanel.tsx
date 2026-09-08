'use client'

// 実務タブの「補足」＝作業内容（フリー・オーダーシートと共有）と、この業務のタスク。
//
// 以前はタブの上に2本の帯（作業内容のアコーディオン／進行中の作業）を置いていたが、
// 中身より先に、中身と同じ幅で補足が場所を取っていて邪魔だった。
// ここでは見出しの行の右端に2つのチップを置き、押したときだけ右側にパネルを出す。
// パネルは重ねずに横に並べる（開いたまま中身を操作できる）。
//
//   TabContextChips … 見出し右端のチップ2つ（作業内容／進行中の作業）
//   TabContextPanel … 右側のパネル（作業内容の欄＋進行中・完了のタスク一覧）
//
// まずは財産調査タブだけ。他の実務タブへは様子を見てから広げる。

import { X } from 'lucide-react'
import type { CaseRow, TaskRow } from '@/types'
import { WorkContentField } from './WorkContentField'
import TabTasksSection, { countTabTasks } from './TabTasksSection'

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
        進行中の作業
        <span className={`px-1.5 text-[11.5px] font-bold ${active > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{active}</span>
      </button>
    </div>
  )
}

export function TabContextPanel({ caseData, gyomu, patchCase, tasks, gyomus, target, onClose, onRefresh }: {
  caseData: CaseRow
  gyomu: string
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  tasks: TaskRow[]
  gyomus: string[]
  /** どちらのチップから開いたか。そのセクションを上に出す */
  target: TabContextTarget
  onClose: () => void
  onRefresh?: () => void
}) {
  const memo = (
    <section>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-[3px] h-3.5 bg-brand-600" />
        <span className="text-[13.5px] font-semibold text-gray-700">作業内容</span>
        <span className="text-[12px] text-gray-400">オーダーシートと共有</span>
      </div>
      <WorkContentField caseData={caseData} gyomu={gyomu} patchCase={patchCase} label="" />
    </section>
  )
  const tasksSec = (
    <section>
      <TabTasksSection variant="panel" gyomus={gyomus} tasks={tasks} onRefresh={onRefresh} />
    </section>
  )
  return (
    <aside className="w-80 flex-none self-start sticky top-3 bg-white border-l border-gray-200 pl-3.5 pr-2 py-2 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-gray-500">この業務の補足</span>
        <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700" title="閉じる"><X className="w-4 h-4" /></button>
      </div>
      {target === 'memo' ? <>{memo}{tasksSec}</> : <>{tasksSec}{memo}</>}
    </aside>
  )
}
