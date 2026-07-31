'use client'

// 相続登記チームダッシュボードの本体。
// 表示: 案件 / タスク名 / 着手者 / 期限 / ステータス / 操作
// フィルタ: 事務管理タスク一覧と揃える → すべて / 未着手 / 対応中 / 完了
//          ＋ 着手前の中の絞り込みトグル 着手OK / 受領次第OK（両方ON＝今やれる/もうすぐやれる）
// （受注区分 / 工程 / 業務区分 は 相続登記チームには不要なので出さない）

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Package, PlayCircle, Loader2, CheckCircle2, PackageCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { normalizeTaskStatus, getStartSignal, isWaitingReceipt } from '@/lib/taskReadiness'
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
  // 着手前の中の絞り込み。既定は両方ON＝今やれる/もうすぐやれるものだけ。未着手選択時のみ効く。
  const [showReady, setShowReady] = useState(true)      // 着手OK（今すぐ）
  const [showWaiting, setShowWaiting] = useState(true)  // 受領次第OK
  const [busy, setBusy] = useState<string | null>(null)

  // 各タスクの着手前サブ状態を判定
  const readinessOf = (t: TaskRow): 'ready' | 'waiting' | 'plain' => {
    if (getStartSignal(t).ready) return 'ready'
    if (isWaitingReceipt(t)) return 'waiting'
    return 'plain'
  }

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
      if (filter === 'not_started') {
        if (s === '完了' || s === '対応中') return false
        // 着手前の中で 着手OK/受領次第OK トグル絞り込み。両OFFなら plain(前提未整備) だけ残す。
        const r = readinessOf(t)
        if (r === 'ready') return showReady
        if (r === 'waiting') return showWaiting
        return true  // plain（着手OKでも受領待ちでもない）は常に表示
      }
      // all
      return true
    })
  }, [initialTasks, filter, showReady, showWaiting])

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
          <FilterChip label="未着手" active={filter === 'not_started'} onClick={() => setFilter('not_started')} count={counts.not_started} />
          <FilterChip label="対応中" active={filter === 'in_progress'} onClick={() => setFilter('in_progress')} count={counts.in_progress} />
          <FilterChip label="完了" active={filter === 'done'} onClick={() => setFilter('done')} count={counts.done} />
        </div>
        {/* 着手OK / 受領次第OK トグル（未着手選択時のみ意味がある） */}
        {filter === 'not_started' && (
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setShowReady(v => !v)}
              title="今すぐ着手できるタスクだけ表示"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-semibold border transition-colors ${showReady ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}>
              <CheckCircle2 className="w-3 h-3" strokeWidth={2.25} />着手OK
            </button>
            <button type="button" onClick={() => setShowWaiting(v => !v)}
              title="資料が届いたら着手OKになる『受領次第OK』のタスクだけ表示"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-semibold border transition-colors ${showWaiting ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}>
              <PackageCheck className="w-3 h-3" strokeWidth={2} />受領次第OK
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-[13px] text-gray-400">該当するタスクはありません</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 1000 }}>
              <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">案件</th>
                  <th className="px-3 py-2 text-left font-medium">タスク</th>
                  <th className="px-3 py-2 text-left font-medium">着手者</th>
                  <th className="px-3 py-2 text-left font-medium">期限</th>
                  <th className="px-3 py-2 text-left font-medium">ステータス</th>
                  <th className="px-3 py-2 w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(t => {
                  const s = normalizeTaskStatus(t.status)
                  const caseInfo = t.cases as { id: string; case_number: string; deal_name: string; status: string } | undefined
                  const startedBy = t.started_by_member as { name?: string } | null | undefined
                  const isNotStarted = s !== '完了' && s !== '対応中'
                  const signal = getStartSignal(t)
                  const waiting = isWaitingReceipt(t)
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
                      <td className="px-3 py-2.5">
                        {/* 着手前は 着手OK/受領次第OK を優先表示、それ以外は通常ステータス */}
                        {isNotStarted && signal.ready ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title={signal.reason ?? ''}>
                            <CheckCircle2 className="w-3 h-3" strokeWidth={2.25} />着手OK
                          </span>
                        ) : isNotStarted && waiting ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200" title={String((t.ext_data as Record<string, unknown> | null)?.ready_wait_note ?? '受領待ち')}>
                            <PackageCheck className="w-3 h-3" strokeWidth={2} />受領次第OK
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${STATUS_BADGE[s] ?? 'bg-gray-100 text-gray-600'}`}>{s}</span>
                        )}
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

      <p className="text-[11px] text-gray-400 flex items-center gap-1"><Package className="w-3 h-3" strokeWidth={2} /> 権利書の製本 完了後は 案件詳細の「納品対応（事務管理タスク）」に自動でバトンが渡ります。</p>
    </div>
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
