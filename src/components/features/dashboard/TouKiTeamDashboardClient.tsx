'use client'

// 相続登記チームダッシュボードの本体。
// 表示: 案件 / タスク名 / 着手者 / 期限 / 残り / ステータス / 操作
// フィルタ: 事務管理タスク一覧と揃える → すべて / 着手OK / 対応中 / 完了
// 着手OK/受領次第OK のトグルは廃止。相続登記チームのタスクは数が少なく、
// 着手前＝これからやるもの としてまとめて見たほうが早いため。
// （受注区分 / 工程 / 業務区分 は 相続登記チームには不要なので出さない）

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Package, PlayCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { normalizeTaskStatus } from '@/lib/taskReadiness'
import { bizDaysUntil } from '@/lib/overdue'
import type { TaskRow } from '@/types'

type FilterKey = 'all' | 'not_started' | 'in_progress' | 'done'

type Props = {
  tasks: TaskRow[]
  currentMemberId: string
}

const STATUS_BADGE: Record<string, string> = {
  '着手前': 'bg-gray-100 text-gray-600',
  '対応中': 'bg-amber-50 text-amber-700',
  '完了': 'bg-emerald-50 text-emerald-700',
  'キャンセル': 'bg-gray-100 text-gray-400',
}

export default function TouKiTeamDashboardClient({ tasks: initialTasks, currentMemberId }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('not_started')
  const [busy, setBusy] = useState<string | null>(null)
  const today = new Date().toLocaleDateString('sv-SE')

  const counts = useMemo(() => {
    const c = { all: initialTasks.length, not_started: 0, in_progress: 0, done: 0 }
    for (const t of initialTasks) {
      const s = normalizeTaskStatus(t.status)
      if (s === '完了') c.done++
      else if (s === '対応中') c.in_progress++
      else c.not_started++
    }
    return c
  }, [initialTasks])

  const visible = useMemo(() => {
    return initialTasks.filter(t => {
      const s = normalizeTaskStatus(t.status)
      if (filter === 'in_progress') return s === '対応中'
      if (filter === 'done') return s === '完了'
      if (filter === 'not_started') return s !== '完了' && s !== '対応中'
      return true   // all
    })
  }, [initialTasks, filter])

  const handleStart = async (t: TaskRow) => {
    setBusy(t.id)
    const supabase = createClient()
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('tasks').update({ status: '対応中', started_by: currentMemberId, started_at: nowIso }).eq('id', t.id)
    setBusy(null)
    if (error) { showToast(`着手に失敗しました: ${error.message}`, 'error'); return }
    showToast('着手しました', 'success')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* フィルタ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-md p-0.5 w-fit">
          <FilterChip label="すべて" active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all} />
          <FilterChip label="着手OK" active={filter === 'not_started'} onClick={() => setFilter('not_started')} count={counts.not_started} />
          <FilterChip label="対応中" active={filter === 'in_progress'} onClick={() => setFilter('in_progress')} count={counts.in_progress} />
          <FilterChip label="完了" active={filter === 'done'} onClick={() => setFilter('done')} count={counts.done} />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-[13px] text-gray-400">該当するタスクはありません</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 1000 }}>
              <thead className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600 tracking-[0.04em]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">案件</th>
                  <th className="px-3 py-2 text-left font-medium">タスク</th>
                  <th className="px-3 py-2 text-left font-medium">着手者</th>
                  <th className="px-3 py-2 text-left font-medium">期限</th>
                  <th className="px-3 py-2 text-left font-medium w-24">残り</th>
                  <th className="px-3 py-2 text-left font-medium">ステータス</th>
                  <th className="px-3 py-2 w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visible.map(t => {
                  const s = normalizeTaskStatus(t.status)
                  const caseInfo = t.cases as { id: string; case_number: string; deal_name: string; status: string } | undefined
                  const startedBy = t.started_by_member as { name?: string } | null | undefined
                  const isNotStarted = s !== '完了' && s !== '対応中'
                  return (
                    <tr key={t.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="text-[12px] font-mono text-brand-600">{caseInfo?.case_number ?? '—'}</div>
                        <Link href={`/cases/${caseInfo?.id ?? ''}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline">
                          {caseInfo?.deal_name ?? '—'}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/tasks/${t.id}`} className="text-[13px] font-medium text-gray-800 hover:text-brand-600 hover:underline">{t.title}</Link>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700">
                        {startedBy?.name ? (
                          <>{startedBy.name}{t.started_at ? <span className="ml-1 text-[10.5px] text-gray-400 font-mono">({t.started_at.slice(0, 10)})</span> : null}</>
                        ) : <span className="text-gray-300">— 未着手 —</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600 whitespace-nowrap">{t.due_date ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><RemainCell dueDate={t.due_date} today={today} done={s === '完了'} /></td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${STATUS_BADGE[s] ?? 'bg-gray-100 text-gray-600'}`}>{s}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isNotStarted && (
                          <button
                            type="button"
                            disabled={busy === t.id}
                            onClick={() => handleStart(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            {busy === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" strokeWidth={2.25} />}
                            着手する
                          </button>
                        )}
                        {s === '対応中' && (
                          <Link href={`/tasks/${t.id}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50 whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" strokeWidth={2.25} />完了する
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1"><Package className="w-3 h-3" strokeWidth={2} /> 権利書の製本 完了後は 事務管理担当が 案件詳細の「納品タブ」から 戸籍等とまとめて納品します（納品は案件全体の最終ステップ）。</p>
    </div>
  )
}

// 「残り」列。期限までの営業日。超過は赤で日数を出す（タスク一覧と同じ見た目）。
function RemainCell({ dueDate, today, done }: { dueDate: string | null; today: string; done: boolean }) {
  if (!dueDate) return <span className="text-[12px] text-gray-300">—</span>
  const n = bizDaysUntil(dueDate, today)
  if (done) return <span className="text-[12px] text-gray-400">{n < 0 ? `${-n}日超過` : '—'}</span>
  if (n < 0) {
    return (
      <span className="inline-flex items-baseline gap-0.5 text-red-600">
        <span className="text-[17px] font-bold leading-none tabular-nums">{-n}</span>
        <span className="text-[11px] font-bold">日超過</span>
      </span>
    )
  }
  if (n === 0) return <span className="text-[14px] font-bold text-amber-700 leading-none">本日</span>
  return (
    <span className={`inline-flex items-baseline gap-0.5 ${n <= 2 ? 'text-amber-700' : 'text-gray-700'}`}>
      <span className="text-[17px] font-bold leading-none tabular-nums">{n}</span>
      <span className="text-[11px] font-semibold">日</span>
    </span>
  )
}

function FilterChip({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${active ? 'bg-brand-600 text-white font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-white'}`}>
      {label}{count !== undefined && <span className={`ml-1 text-[10px] font-mono ${active ? 'opacity-80' : 'opacity-50'}`}>{count}</span>}
    </button>
  )
}
