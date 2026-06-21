'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react'
import type { TaskRow } from '@/types'

// TasksTab と同じ正規化（未着手→着手前、Wチェック待ち/保留→対応中、キャンセル→完了）
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}

function execResult(t: TaskRow): string {
  const ext = (t.ext_data ?? {}) as Record<string, unknown>
  return typeof ext.execution_result === 'string' ? ext.execution_result.trim() : ''
}

/**
 * 案件進捗の先頭に置く「現在の状況／次やること」カード。
 * - 現在の状況 = 直近に実施結果(ext_data.execution_result)が記入されたタスクの内容（クリックで全文）。
 * - 次やること = 未完了タスクのうち先頭（対応中→着手前の順）。
 * 翌日の作業者が「今どこまで進み、次に何をするか」を一目で把握できるようにする。
 */
export default function CaseCurrentStatusCard({ tasks }: { tasks: TaskRow[] }) {
  const [open, setOpen] = useState(false)

  // 実施結果が入っているタスクのうち、完了日（無ければ更新日）が最新のもの
  const withResult = tasks
    .filter(t => execResult(t))
    .sort((a, b) => (b.completed_at ?? b.updated_at ?? '').localeCompare(a.completed_at ?? a.updated_at ?? ''))
  const latest = withResult[0] ?? null
  const result = latest ? execResult(latest) : ''

  // 次やること = 未完了（対応中を優先、次に着手前）を sort_order 昇順で先頭
  const pending = tasks.filter(t => normalizeStatus(t.status) !== '完了')
  const rank = (t: TaskRow) => (normalizeStatus(t.status) === '対応中' ? 0 : 1)
  const next = pending.sort((a, b) => rank(a) - rank(b) || (a.sort_order ?? 999) - (b.sort_order ?? 999))[0] ?? null

  if (!latest && !next) return null

  const long = result.length > 80

  return (
    <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/40 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <ClipboardCheck className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <span className="text-[12px] font-bold text-brand-800">現在の状況・次やること</span>
      </div>

      {/* 現在の状況（最新の実施結果） */}
      {latest ? (
        <div className="mb-2">
          <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-0.5">
            <span className="font-semibold text-gray-600">直近の実施結果</span>
            <Link href={`/tasks/${latest.id}`} className="text-brand-700 hover:underline font-medium truncate max-w-[260px]">{latest.title}</Link>
            {latest.completed_at && <span className="font-mono text-gray-400">{latest.completed_at}</span>}
          </div>
          <div className="text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed">
            {long && !open ? `${result.slice(0, 80)}…` : result}
          </div>
          {long && (
            <button type="button" onClick={() => setOpen(o => !o)} className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-600 hover:text-brand-700">
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{open ? '閉じる' : '全文を見る'}
            </button>
          )}
        </div>
      ) : (
        <div className="mb-2 text-[12px] text-gray-400">まだ実施結果の記入されたタスクはありません。</div>
      )}

      {/* 次やること */}
      {next && (
        <div className="flex items-center gap-1.5 pt-1.5 border-t border-brand-100 text-[12px]">
          <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="font-semibold text-gray-600">次やること</span>
          <Link href={`/tasks/${next.id}`} className="text-brand-700 hover:underline font-medium truncate">{next.title}</Link>
          <span className={`ml-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${normalizeStatus(next.status) === '対応中' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{normalizeStatus(next.status)}</span>
        </div>
      )}
    </div>
  )
}
