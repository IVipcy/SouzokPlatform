'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpDown, ArrowRight } from 'lucide-react'
import UserAvatar from '@/components/ui/UserAvatar'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import type { TaskRow } from '@/types'
import type { CaseInfo } from './TaskListClient'

const STALL_DAYS = 7  // この日数以上タスクの動きが無いと「停滞」

// TasksTab と同じ正規化
const normalizeStatus = (status: string) => {
  if (status === '未着手') return '着手前'
  if (['Wチェック待ち', '保留', '差戻し'].includes(status)) return '対応中'
  if (status === 'キャンセル') return '完了'
  return status
}
const execResult = (t: TaskRow): string => {
  const ext = (t.ext_data ?? {}) as Record<string, unknown>
  return typeof ext.execution_result === 'string' ? ext.execution_result.trim() : ''
}
const daysBetween = (fromYmd: string, toYmd: string): number =>
  Math.floor((new Date(`${toYmd}T00:00:00`).getTime() - new Date(`${fromYmd}T00:00:00`).getTime()) / 86400000)

type BoardRow = {
  caseId: string
  info: CaseInfo
  total: number
  done: number
  latest: TaskRow | null
  latestResult: string
  next: TaskRow | null
  overdue: number
  stallDays: number | null
  badge: '順調' | '遅延' | '停滞'
}

type SortKey = 'due' | 'overdue' | 'stall'

type Props = {
  tasks: TaskRow[]
  caseMap: Record<string, CaseInfo>
  currentMemberId: string | null
}

export default function CaseStatusBoard({ tasks, caseMap, currentMemberId }: Props) {
  const today = todayJstYmd(new Date())
  const [includeReceived, setIncludeReceived] = useState(false)  // 受託(着手前)も含める
  const [mineOnly, setMineOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('due')

  // 案件ごとにタスクをまとめる
  const tasksByCase = useMemo(() => {
    const m: Record<string, TaskRow[]> = {}
    for (const t of tasks) {
      if (!t.case_id) continue
      ;(m[t.case_id] ??= []).push(t)
    }
    return m
  }, [tasks])

  const rows = useMemo<BoardRow[]>(() => {
    const activeStatuses = includeReceived ? ['対応中', '受託'] : ['対応中']
    const out: BoardRow[] = []
    for (const [caseId, info] of Object.entries(caseMap)) {
      if (!activeStatuses.includes(info.status)) continue
      if (mineOnly && info.manager?.id !== currentMemberId) continue
      const ct = tasksByCase[caseId] ?? []
      const total = ct.length
      const done = ct.filter(t => normalizeStatus(t.status) === '完了').length
      const pending = ct.filter(t => normalizeStatus(t.status) !== '完了')
      const rank = (t: TaskRow) => (normalizeStatus(t.status) === '対応中' ? 0 : 1)
      const next = pending.slice().sort((a, b) => rank(a) - rank(b) || (a.sort_order ?? 999) - (b.sort_order ?? 999))[0] ?? null
      const withResult = ct.filter(execResult).sort((a, b) =>
        (b.completed_at ?? b.started_at ?? b.updated_at ?? '').localeCompare(a.completed_at ?? a.started_at ?? a.updated_at ?? ''))
      const latest = withResult[0] ?? null
      const overdue = pending.filter(t => t.due_date && t.due_date < today).length
      const lastActivity = ct.reduce<string | null>((acc, t) => {
        const d = t.completed_at ?? t.started_at ?? null
        return d && (!acc || d > acc) ? d : acc
      }, null)
      const stallDays = lastActivity ? daysBetween(lastActivity.slice(0, 10), today) : null
      const badge: BoardRow['badge'] = overdue > 0 ? '遅延' : (stallDays !== null && stallDays >= STALL_DAYS) ? '停滞' : '順調'
      out.push({ caseId, info, total, done, latest, latestResult: latest ? execResult(latest) : '', next, overdue, stallDays, badge })
    }
    return out
  }, [caseMap, tasksByCase, includeReceived, mineOnly, currentMemberId, today])

  const sorted = useMemo(() => {
    const r = rows.slice()
    if (sortKey === 'due') {
      r.sort((a, b) => (a.info.expected_completion_date ?? '9999').localeCompare(b.info.expected_completion_date ?? '9999'))
    } else if (sortKey === 'overdue') {
      r.sort((a, b) => b.overdue - a.overdue || (a.info.expected_completion_date ?? '9999').localeCompare(b.info.expected_completion_date ?? '9999'))
    } else {
      r.sort((a, b) => (b.stallDays ?? -1) - (a.stallDays ?? -1))
    }
    return r
  }, [rows, sortKey])

  const counts = useMemo(() => ({
    active: rows.length,
    overdue: rows.filter(r => r.badge === '遅延').length,
    stall: rows.filter(r => r.badge === '停滞').length,
  }), [rows])

  return (
    <div>
      {/* フィルタ・サマリー */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[12px] font-semibold text-gray-500">対象</span>
        <FilterChip active={!includeReceived} onClick={() => setIncludeReceived(false)} label="対応中のみ" />
        <FilterChip active={includeReceived} onClick={() => setIncludeReceived(true)} label="受託(着手前)も含む" />
        <span className="mx-1 w-px h-4 bg-gray-200" />
        <FilterChip active={mineOnly} onClick={() => setMineOnly(m => !m)} label="自分が管理担当" />
        <div className="ml-auto flex items-center gap-2 text-[12px]">
          <span className="text-gray-500">対応中 <b className="text-gray-800">{counts.active}</b></span>
          <span className="text-red-600">遅延 <b>{counts.overdue}</b></span>
          <span className="text-amber-600">停滞 <b>{counts.stall}</b></span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="text-[13px] border-collapse w-max min-w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 whitespace-nowrap">
              <th className="px-2.5 py-2 text-left font-semibold">状態</th>
              <th className="px-2.5 py-2 text-left font-semibold">案件管理番号</th>
              <th className="px-2.5 py-2 text-left font-semibold">案件名</th>
              <th className="px-2.5 py-2 text-left font-semibold">受注区分</th>
              <th className="px-2.5 py-2 text-left font-semibold">進捗</th>
              <th className="px-2.5 py-2 text-left font-semibold">最新の実施結果</th>
              <th className="px-2.5 py-2 text-left font-semibold">次やること</th>
              <SortableTh label="滞留日数" active={sortKey === 'stall'} onClick={() => setSortKey('stall')} />
              <SortableTh label="期限超過" active={sortKey === 'overdue'} onClick={() => setSortKey('overdue')} />
              <SortableTh label="完了予定日" active={sortKey === 'due'} onClick={() => setSortKey('due')} />
              <th className="px-2.5 py-2 text-left font-semibold">受注/管理担当</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-[13px] text-gray-400">対象の案件がありません</td></tr>
            ) : sorted.map((r, i) => (
              <tr key={r.caseId} className={`border-b border-gray-100 hover:bg-brand-50/30 whitespace-nowrap ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-2.5 py-2"><BadgePill badge={r.badge} /></td>
                <td className="px-2.5 py-2 font-mono">
                  <Link href={`/cases/${r.caseId}`} className="text-brand-700 hover:underline font-semibold">{r.info.case_number}</Link>
                </td>
                <td className="px-2.5 py-2">
                  <Link href={`/cases/${r.caseId}?tab=basicInfo`} className="text-gray-900 hover:text-brand-700 hover:underline" title="案件進捗を開く">{r.info.deal_name}</Link>
                </td>
                <td className="px-2.5 py-2 text-gray-600">{[r.info.service_category, r.info.service_category_2].filter(Boolean).join('・') || <span className="text-gray-300">—</span>}</td>
                <td className="px-2.5 py-2"><Progress done={r.done} total={r.total} /></td>
                <td className="px-2.5 py-2 max-w-[280px]">
                  {r.latest ? (
                    <Link href={`/tasks/${r.latest.id}`} className="group block" title="最新タスクを開く">
                      <span className="text-gray-800 group-hover:text-brand-700 group-hover:underline line-clamp-2">{r.latestResult || r.latest.title}</span>
                      <span className="text-[11px] text-gray-400">{r.latest.title}{r.latest.completed_at ? ` ・ ${r.latest.completed_at}` : ''}</span>
                    </Link>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2.5 py-2">
                  {r.next ? (
                    <Link href={`/tasks/${r.next.id}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400" />{r.next.title}
                    </Link>
                  ) : r.total > 0 ? (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">次タスク未起票</span>
                  ) : (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">タスク未作成</span>
                  )}
                </td>
                <td className="px-2.5 py-2 text-right font-mono">{r.stallDays === null ? <span className="text-gray-300">—</span> : <span className={r.stallDays >= STALL_DAYS ? 'text-amber-600 font-semibold' : 'text-gray-600'}>{r.stallDays}日</span>}</td>
                <td className="px-2.5 py-2 text-right font-mono">{r.overdue > 0 ? <span className="text-red-600 font-bold">{r.overdue}件</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-2.5 py-2 font-mono text-gray-700">{r.info.expected_completion_date ?? <span className="text-gray-300">未設定</span>}</td>
                <td className="px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <Member m={r.info.sales} role="sales" />
                    <Member m={r.info.manager} role="manager" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{label}</button>
  )
}

function SortableTh({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th className="px-2.5 py-2 text-right font-semibold">
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 hover:text-brand-600 ${active ? 'text-brand-600' : ''}`}>
        {label}<ArrowUpDown className="w-3 h-3" strokeWidth={2} />
      </button>
    </th>
  )
}

function BadgePill({ badge }: { badge: '順調' | '遅延' | '停滞' }) {
  const cls = badge === '遅延' ? 'bg-red-50 text-red-700 border-red-200'
    : badge === '停滞' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${cls}`}>{badge}</span>
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="w-28">
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="font-mono text-gray-700">{done}/{total}</span>
        <span className="text-gray-400">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Member({ m, role }: { m?: { id: string; name: string; avatar_color: string; avatar_url: string | null }; role: 'sales' | 'manager' }) {
  if (!m) return <span className="text-gray-300 text-[12px]">—</span>
  return (
    <Link href={`/profile/${m.id}`} title={`${role === 'sales' ? '受注' : '管理'}: ${m.name}`} className="hover:opacity-80">
      <UserAvatar name={m.name} role={role} url={m.avatar_url} size="sm" />
    </Link>
  )
}
