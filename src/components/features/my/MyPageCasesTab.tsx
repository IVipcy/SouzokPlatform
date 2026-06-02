'use client'

import Link from 'next/link'
import { Briefcase, AlertTriangle } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { CASE_STATUSES } from '@/lib/constants'

type CaseFlag = 'purple' | 'red' | 'yellow' | 'blue' | null

export type MyCaseRow = {
  id: string
  case_number: string
  deal_name: string
  status: string
  deceased_name: string | null
  expected_completion_date: string | null
  completion_date: string | null
  has_complaint?: boolean | null
  last_opened_at?: string | null
  created_at?: string | null
  client_name?: string | null
  sales_name?: string | null
  manager_name?: string | null
  /** 進捗: 次の未完了タスク + 完了/総数 */
  nextTaskId?: string | null
  nextTaskTitle?: string | null
  progressDone?: number
  progressTotal?: number
  /** 週次報告状況 */
  weeklyStatus?: '未対応' | '依頼中' | '確認済'
  /** 直近お客様報告 */
  lastCommDate?: string | null
  lastCommDetail?: string | null
  /** 管理担当向けアラート: 週次報告の漏れ */
  weeklyReportMissing?: boolean
  /** 管理担当向けアラート: タスク期限超過 */
  taskOverdue?: boolean
  /** 進捗管理ダッシュボード経由で計算済の場合 */
  flag?: CaseFlag
}

const WEEKLY_BADGE: Record<string, string> = {
  '未対応': 'bg-gray-100 text-gray-600 border-gray-200',
  '依頼中': 'bg-amber-50 text-amber-700 border-amber-200',
  '確認済': 'bg-green-50 text-green-700 border-green-200',
}

type Props = {
  memberId: string
  cases: MyCaseRow[]
  /** ヘッダーや「↗ 全件見る」など最小表示にする */
  compact?: boolean
}

const FLAG_LABEL: Record<NonNullable<CaseFlag>, string> = {
  purple: '紫',
  red:    '赤',
  yellow: '黄',
  blue:   '青',
}
const FLAG_BG: Record<NonNullable<CaseFlag>, string> = {
  purple: 'bg-purple-600 text-white',
  red:    'bg-red-500 text-white',
  yellow: 'bg-yellow-400 text-gray-900',
  blue:   'bg-sky-500 text-white',
}

const FLAG_RANK: Record<NonNullable<CaseFlag>, number> = {
  purple: 0, red: 1, yellow: 2, blue: 3,
}

// 管理案件 = 受注後に管理担当が責任をもつ案件（受注 / 対応中 / 保留・長期）。
// 相談案件（面談設定済・検討中・失注）や「紹介のみ」「完了」は管理案件一覧には出さない。
const MANAGEMENT_ACTIVE = new Set(['受注', '対応中', '保留・長期'])

// 鮮度フラグ: 紫=クレーム / 赤・黄・青=最終接触(案件を最後に開いた日)からの経過日数
// 青: <=3日 / 黄: 4〜7日 / 赤: >7日
const FRESHNESS = { yellowDays: 3, redDays: 7 }

function computeFlagSimple(c: MyCaseRow): CaseFlag {
  if (!MANAGEMENT_ACTIVE.has(c.status)) return null
  if (c.has_complaint) return 'purple'
  const ref = c.last_opened_at ?? c.created_at ?? null
  if (!ref) return 'blue'
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000)
  if (Number.isNaN(days)) return 'blue'
  if (days > FRESHNESS.redDays) return 'red'
  if (days > FRESHNESS.yellowDays) return 'yellow'
  return 'blue'
}

/**
 * マイページの担当案件タブ
 * 進捗管理ダッシュボードと同じテーブル形式:
 *   フラグ / 案件管理番号 / 案件名 / 担当者(受注/管理 別列) / 完了予定日 / 依頼者名
 */
export default function MyPageCasesTab({ memberId: _memberId, cases, compact = false }: Props) {
  void _memberId

  const rows = cases.map(c => ({
    ...c,
    flag: c.flag ?? computeFlagSimple(c),
  }))

  // 完了・失注は除外（フラグなし）
  const visibleRows = rows.filter(r => r.flag !== null)
  // ソート: フラグ優先度 → 完了予定日昇順
  visibleRows.sort((a, b) => {
    const fa = FLAG_RANK[a.flag!]
    const fb = FLAG_RANK[b.flag!]
    if (fa !== fb) return fa - fb
    const ad = a.expected_completion_date ?? '9999-12-31'
    const bd = b.expected_completion_date ?? '9999-12-31'
    return ad.localeCompare(bd)
  })

  if (visibleRows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-12 text-center text-[13px] text-gray-400">
        対応中の案件はありません
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-xl overflow-hidden ${compact ? '' : 'border border-gray-200 shadow-sm'}`}>
      <table className="w-full text-[13px]">
        <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-center font-bold" style={{ width: 56 }}>フラグ</th>
            <th className="px-3 py-2 text-left font-bold" style={{ width: 110 }}>案件管理番号</th>
            <th className="px-3 py-2 text-left font-bold">案件名</th>
            <th className="px-3 py-2 text-left font-bold" style={{ width: 90 }}>ステータス</th>
            <th className="px-3 py-2 text-left font-bold" style={{ width: 100 }}>受注担当</th>
            <th className="px-3 py-2 text-left font-bold" style={{ width: 200 }}>進捗</th>
            <th className="px-3 py-2 text-center font-bold" style={{ width: 100 }}>週次報告状況</th>
            <th className="px-3 py-2 text-left font-bold" style={{ width: 110 }}>直近お客様報告日</th>
            <th className="px-3 py-2 text-left font-bold" style={{ width: 200 }}>やり取り詳細</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visibleRows.map(c => {
            const total = c.progressTotal ?? 0
            const done = c.progressDone ?? 0
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const weekly = c.weeklyStatus ?? '未対応'
            const statusDef = CASE_STATUSES.find(s => s.key === c.status)
            return (
            <tr key={c.id} className="hover:bg-gray-50/60">
              <td className="px-3 py-2.5 text-center">
                <span className={`inline-flex items-center justify-center w-11 py-0.5 rounded text-[12px] font-bold ${FLAG_BG[c.flag!]}`}>
                  {FLAG_LABEL[c.flag!]}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px] text-gray-600">{c.case_number}</td>
              <td className="px-3 py-2.5">
                <Link href={`/cases/${c.id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[220px]">
                  {c.deal_name}
                </Link>
                {(c.weeklyReportMissing || c.taskOverdue) && (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {c.weeklyReportMissing && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />【重要】週次報告の漏れ
                      </span>
                    )}
                    {c.taskOverdue && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />【重要】タスク期限超過
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td className="px-3 py-2.5">
                {statusDef ? <Badge label={c.status} color={statusDef.color} /> : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-3 py-2.5 text-[12px] text-gray-700">{c.sales_name || <span className="text-gray-300">—</span>}</td>
              {/* 進捗: バー + 次の未完了タスク（クリックでタスクへ） */}
              <td className="px-3 py-2.5">
                {total > 0 ? (
                  <div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] font-mono text-gray-400 flex-shrink-0">{done}/{total}</span>
                    </div>
                    {c.nextTaskId && c.nextTaskTitle ? (
                      <Link href={`/tasks/${c.nextTaskId}`} className="text-[11px] text-brand-600 hover:underline truncate block max-w-[180px] mt-0.5" title={c.nextTaskTitle}>
                        ▶ {c.nextTaskTitle}
                      </Link>
                    ) : (
                      <span className="text-[11px] text-gray-400 mt-0.5 block">未完了タスクなし</span>
                    )}
                  </div>
                ) : (
                  <span className="text-[12px] text-gray-300">—</span>
                )}
              </td>
              {/* 週次報告状況 */}
              <td className="px-3 py-2.5 text-center">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${WEEKLY_BADGE[weekly]}`}>{weekly}</span>
              </td>
              {/* 直近お客様報告日 */}
              <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{c.lastCommDate ?? <span className="text-gray-300">—</span>}</td>
              {/* やり取り詳細 */}
              <td className="px-3 py-2.5 text-[12px] text-gray-600">
                {c.lastCommDetail ? (
                  <span className="line-clamp-2 whitespace-pre-line" title={c.lastCommDetail}>{c.lastCommDetail}</span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
      {compact && (
        <div className="px-4 py-2 text-center bg-gray-50/40 border-t border-gray-100">
          <Briefcase className="w-3 h-3 inline-block mr-1 text-gray-400" />
          <span className="text-[11px] text-gray-500">担当案件 {visibleRows.length} 件</span>
        </div>
      )}
    </div>
  )
}
