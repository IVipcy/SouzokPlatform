'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

export type WorkloadRow = {
  memberId: string
  name: string
  teamName: string
  primaryRole: string   // manager / sales / assistant
  jobType: string | null
  years: number | null
  activeCount: number
  thisMonthCount: number
}

export type WorkloadTeam = {
  id: string
  name: string
  rows: WorkloadRow[]
}

type Props = {
  teams: WorkloadTeam[]
  defaultTeamId: string | null
  // 案件詳細から「割り振り」で遷移してきた場合の対象案件ID
  assignCaseId: string | null
}

const ROLE_TABS: { key: string; label: string }[] = [
  { key: 'manager', label: '管理担当' },
  { key: 'sales', label: '受注担当' },
  { key: 'assistant', label: '事務管理担当' },
]
const ROLE_LABEL: Record<string, string> = { manager: '管理担当', sales: '受注担当', assistant: '事務管理担当' }

export default function WorkloadClient({ teams, defaultTeamId, assignCaseId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? teams[0]?.id ?? '')
  const [roleFilter, setRoleFilter] = useState<string>('manager')
  const [assigning, setAssigning] = useState<string | null>(null)

  const team = teams.find(t => t.id === teamId) ?? teams[0] ?? null
  const rows = (team?.rows ?? []).filter(r => r.primaryRole === roleFilter)
  // 割り振り（管理担当セット）は管理担当ビューかつ案件指定があるときのみ
  const canAssign = !!assignCaseId && roleFilter === 'manager'

  const assign = async (row: WorkloadRow) => {
    if (!assignCaseId) return
    setAssigning(row.memberId)
    // 既存の管理担当を置き換える
    await supabase.from('case_members').delete().eq('case_id', assignCaseId).eq('role', 'manager')
    const { error } = await supabase.from('case_members').insert({ case_id: assignCaseId, member_id: row.memberId, role: 'manager' })
    setAssigning(null)
    if (error) { showToast(`割り振りに失敗しました: ${error.message}`, 'error'); return }
    showToast(`${row.name} を管理担当に割り振りました`, 'success')
    router.push(`/cases/${assignCaseId}`)
  }

  return (
    <div>
      {/* 案件指定で遷移してきた場合の案内 */}
      {assignCaseId && (
        <div className="mb-3 flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-800 rounded-lg px-4 py-2.5 text-[13px]">
          <UserPlus className="w-4 h-4" strokeWidth={2} />
          選択した案件に<strong className="mx-0.5">管理担当</strong>を割り振ります。担当者の行の「割り振り」を押すと案件詳細に戻ります。
        </div>
      )}

      {/* チーム別タブ */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-3 flex-wrap">
        {teams.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTeamId(t.id)}
            className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
              teamId === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.name}
          </button>
        ))}
        {teams.length === 0 && <div className="px-2 py-2 text-[13px] text-gray-400">チームが登録されていません</div>}
      </div>

      {/* 担当区分フィルタ（既定：管理担当） */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-[12px] font-semibold text-gray-500 mr-0.5">担当区分</span>
        {ROLE_TABS.map(r => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRoleFilter(r.key)}
            className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${
              roleFilter === r.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 880 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <th className="px-3 py-2.5 text-left font-semibold">氏名</th>
              <th className="px-3 py-2.5 text-left font-semibold">所属チーム</th>
              <th className="px-3 py-2.5 text-left font-semibold">担当区分</th>
              <th className="px-3 py-2.5 text-left font-semibold">職種</th>
              <th className="px-3 py-2.5 text-center font-semibold">経験年数</th>
              <th className="px-3 py-2.5 text-center font-semibold">担当案件数</th>
              <th className="px-3 py-2.5 text-center font-semibold">今月業完予定</th>
              {canAssign && <th className="px-3 py-2.5 text-center font-semibold w-28">割り振り</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canAssign ? 8 : 7} className="px-3 py-10 text-center text-[13px] text-gray-400">
                  該当する担当者がいません
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.memberId} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-3 py-2.5 font-semibold text-gray-900">{r.name}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.teamName}</td>
                  <td className="px-3 py-2.5 text-gray-600">{ROLE_LABEL[r.primaryRole] ?? r.primaryRole}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.jobType ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-gray-700">{r.years != null ? `${r.years}年` : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-gray-700">{r.activeCount}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-gray-700">{r.thisMonthCount}</td>
                  {canAssign && (
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => assign(r)}
                        disabled={assigning !== null}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-600 text-white text-[12px] font-semibold hover:bg-brand-700 transition disabled:opacity-50"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {assigning === r.memberId ? '割り振り中...' : '割り振り'}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!assignCaseId && (
        <p className="mt-3 text-[12px] text-gray-400">
          ※ 管理担当の割り振りは、案件詳細の「管理担当」欄のボタンから対象案件を指定して行います。
        </p>
      )}
    </div>
  )
}
