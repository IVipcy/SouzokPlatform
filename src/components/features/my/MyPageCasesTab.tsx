'use client'

import Link from 'next/link'
import { Briefcase, AlertTriangle, CheckCircle2 } from 'lucide-react'

type CaseLite = {
  id: string
  case_number: string
  deal_name: string
  status: string
  deceased_name: string | null
  expected_completion_date: string | null
  completion_date: string | null
}

type Props = {
  memberId: string
  cases: CaseLite[]
  compact?: boolean
}

// 進捗マーカーの色（赤/黄/青）— 進捗管理ダッシュボードと統一
function getProgressColor(c: CaseLite): { color: string; label: string } {
  if (c.status === '完了') return { color: '#0f487e', label: '完了' }
  if (c.status === '失注') return { color: '#9CA3AF', label: '失注' }
  const today = new Date().toISOString().split('T')[0]
  if (c.expected_completion_date && c.expected_completion_date < today) {
    return { color: '#DC2626', label: '完了予定超過' }  // 赤
  }
  if (c.status === '対応中') return { color: '#0EA5E9', label: '対応中' }  // 青
  return { color: '#D97706', label: c.status }  // 黄
}

/**
 * マイページの担当案件一覧。
 * 進捗管理ダッシュボードと同じく、赤/黄/青の進捗マーカー付き。
 */
export default function MyPageCasesTab({ memberId: _memberId, cases, compact = false }: Props) {
  void _memberId
  if (cases.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[13px] text-gray-400">
        担当案件はありません
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-xl overflow-hidden ${compact ? '' : 'border border-gray-200 shadow-sm'}`}>
      <table className="w-full text-[13px]">
        <colgroup>
          <col style={{ width: 8 }} />
          <col />
          <col style={{ width: 120 }} />
          <col style={{ width: 140 }} />
        </colgroup>
        <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider">
          <tr>
            <th />
            <th className="px-3 py-2 text-left font-bold">案件</th>
            <th className="px-3 py-2 text-left font-bold">ステータス</th>
            <th className="px-3 py-2 text-left font-bold">完了予定</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {cases.map(c => {
            const prog = getProgressColor(c)
            return (
              <tr key={c.id} className="hover:bg-gray-50/60">
                <td className="px-1 py-2.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: prog.color }}
                    title={prog.label}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/cases/${c.id}`} className="block group">
                    <div className="text-[12px] font-mono text-gray-400">{c.case_number}</div>
                    <div className="text-[13px] font-semibold text-gray-800 group-hover:text-brand-600 group-hover:underline truncate">
                      {c.deal_name}
                    </div>
                    {c.deceased_name && (
                      <div className="text-[11px] text-gray-400 truncate">被相続人: {c.deceased_name}</div>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-[12px] text-gray-700 font-semibold">
                  {c.status}
                </td>
                <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">
                  {c.completion_date ? (
                    <span className="inline-flex items-center gap-1 text-brand-700">
                      <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
                      {c.completion_date}
                    </span>
                  ) : c.expected_completion_date ? (
                    <span className={c.expected_completion_date < new Date().toISOString().split('T')[0] ? 'text-red-600 font-bold' : 'text-gray-500'}>
                      {c.expected_completion_date < new Date().toISOString().split('T')[0] && (
                        <AlertTriangle className="w-3 h-3 inline mr-0.5" strokeWidth={2.25} />
                      )}
                      {c.expected_completion_date}
                    </span>
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
          <span className="text-[11px] text-gray-500">担当案件 {cases.length} 件</span>
        </div>
      )}
    </div>
  )
}
