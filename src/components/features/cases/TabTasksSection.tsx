'use client'

// 実務タブ（相続人調査・財産調査・遺産分割・相続登記・解約手続・遺言検認 等）の
// 上部に出すタスクのセクション。task.phase = 業務名（戸籍/財産/分割/...）で拾う。
//
//   ・進行中の作業 … まだ終わっていないもの
//   ・完了した作業 … 済んだものと、その実施結果
//
// 「これから何をやるか」は各タブの表（誰の戸籍・どの銀行・どの物件）を見れば分かる、
// という理由で以前は完了ぶんだけにしていた。ただし表の行に出てくるのは
// source_rid で行に結ばれたタスクだけで、手で作ったタスクはどこにも出てこなかった。
// 業務区分さえ選んであれば拾えるので、未完了ぶんもここに出す。

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, Check } from 'lucide-react'
import { normalizeTaskStatus, getStartSignal, isWaitingReceipt } from '@/lib/taskReadiness'
import { TantoKubunBadge } from '@/components/ui/TantoKubunBadge'
import type { TaskRow } from '@/types'

type Props = {
  /** 業務名のリスト（例: ['戸籍', '相関図', '法定相続情報取得']）。task.phase と一致するもの */
  gyomus: string[]
  tasks: TaskRow[]
  /** セクションタイトル（既定:「完了した作業」） */
  title?: string
}

// 完了日時 ISO → 「M/D HH:MM」表記
const fmtDateTime = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function TabTasksSection({ gyomus, tasks, title = '完了した作業' }: Props) {
  const [open, setOpen] = useState(false)
  const [activeOpen, setActiveOpen] = useState(false)
  const inGyomu = (t: TaskRow) => gyomus.some(g => (t.phase ?? '') === g)

  // 進行中（未完了）。対応中を先に、そのあと着手前。
  const active = tasks
    .filter(t => inGyomu(t) && normalizeTaskStatus(t.status) !== '完了')
    .sort((a, b) => {
      const rank = (t: TaskRow) => (normalizeTaskStatus(t.status) === '対応中' ? 0 : 1)
      return rank(a) - rank(b) || (a.title ?? '').localeCompare(b.title ?? '')
    })
  // 該当業務の完了タスクだけ。事務管理(case)・管理担当(system)いずれの区分も対象。
  // 管理業務（遺言作成/信託/検認/後見/調停/精算書/指図書/法定相続情報取得/他事業者紹介）は
  // system タスクとして生成されるため、区分ではなく phase で拾う。
  const done = tasks
    .filter(t => gyomus.some(g => (t.phase ?? '') === g) && normalizeTaskStatus(t.status) === '完了')
    .map(t => {
      const ext = (t.ext_data ?? {}) as Record<string, unknown>
      const execResult = typeof ext.execution_result === 'string' ? ext.execution_result.trim() : ''
      const completedBy = typeof ext.completed_by_name === 'string' ? ext.completed_by_name.trim() : ''
      const completedAt = typeof ext.completed_at === 'string' ? ext.completed_at : ''
      return { task: t, execResult, completedBy, completedAt }
    })
    // 完了が新しい順（完了日時が無いものは後ろ）
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))

  if (done.length === 0 && active.length === 0) return null

  return (
    <div className="space-y-2">
      {/* 進行中：表の行に紐づいていないタスクもここに出る */}
      {active.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-gray-600">進行中の作業</span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{active.length}</span>
            <button type="button" onClick={() => setActiveOpen(o => !o)} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              {activeOpen ? '閉じる' : '一覧'} {activeOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          {activeOpen && (
          <div className="flex flex-col gap-1 border-t border-gray-100 pt-2 mt-2">
            {active.map(t => {
              const doing = normalizeTaskStatus(t.status) === '対応中'
              const ready = getStartSignal(t).ready
              const waiting = isWaitingReceipt(t)
              return (
                <Link key={t.id} href={`/tasks/${t.id}`}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-gray-50 text-[12px]">
                  <TantoKubunBadge task={t} size="xs" />
                  <span className="flex-1 min-w-0 truncate font-medium text-gray-700">{t.title}</span>
                  {ready && (
                    <span className="flex-none text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">着手OK</span>
                  )}
                  {waiting && (
                    <span className="flex-none text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">受領待ち</span>
                  )}
                  <span className={`flex-none text-[10.5px] font-semibold px-1.5 py-0.5 rounded ${doing ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    {doing ? '対応中' : '着手前'}
                  </span>
                  {t.due_date && <span className="flex-none text-[10px] text-gray-400 whitespace-nowrap">{t.due_date.slice(5).replace('-', '/')}</span>}
                </Link>
              )
            })}
            <button type="button" onClick={() => setActiveOpen(false)} className="w-full mt-1 inline-flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-gray-600">
              閉じる <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
          )}
        </div>
      )}

      {done.length > 0 && (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-semibold text-gray-600">{title}</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{done.length}</span>
        <button type="button" onClick={() => setOpen(o => !o)} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
          {open ? '閉じる' : '一覧'} {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {open && (
        <div className="space-y-1.5 border-t border-gray-100 pt-2.5 mt-2">
          {done.map(({ task, execResult, completedBy, completedAt }) => {
            const meta = `${completedBy}${completedBy && completedAt ? ' ・ ' : ''}${completedAt ? fmtDateTime(completedAt) : ''}`
            return (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="flex items-start gap-2 px-2.5 py-1.5 rounded hover:bg-gray-50 text-[12px]"
              >
                <Check className="w-3.5 h-3.5 flex-none mt-0.5 text-emerald-600" strokeWidth={2.5} />
                <span className="w-56 flex-none font-medium text-gray-700 truncate">{task.title}</span>
                {/* 実施結果（このタブでしか読めない中身） */}
                <span className="flex-1 min-w-0">
                  {execResult
                    ? <span className="block text-[11px] text-gray-600 line-clamp-2" title={execResult}>{execResult}</span>
                    : <span className="block text-[11px] text-gray-300">実施結果の記載なし</span>}
                </span>
                {meta && <span className="text-[10px] text-gray-400 flex-none mt-0.5 whitespace-nowrap">{meta}</span>}
              </Link>
            )
          })}
          <button type="button" onClick={() => setOpen(false)} className="w-full mt-1 inline-flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-gray-600">
            閉じる <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
      )}
    </div>
  )
}
