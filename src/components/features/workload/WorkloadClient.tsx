'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'

export type UnassignedCase = { id: string; caseNumber: string; dealName: string; orderSheetReady: boolean }

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
  // 案件詳細から「割り振り」で遷移してきた場合の対象案件ID（案件選択で先頭に固定表示）
  assignCaseId: string | null
  // 受託かつ管理担当未設定の案件
  unassignedCases: UnassignedCase[]
}

const ROLE_TABS: { key: string; label: string }[] = [
  { key: 'manager', label: '管理担当' },
  { key: 'sales', label: '受注担当' },
  { key: 'assistant', label: '事務管理担当' },
]
const ROLE_LABEL: Record<string, string> = { manager: '管理担当', sales: '受注担当', assistant: '事務管理担当' }

export default function WorkloadClient({ teams, defaultTeamId, assignCaseId, unassignedCases }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [viewMode, setViewMode] = useState<'team' | 'all'>('team')
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? teams[0]?.id ?? '')
  const [roleFilter, setRoleFilter] = useState<string>('manager')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [pickCaseOpen, setPickCaseOpen] = useState(false)
  const [caseSearch, setCaseSearch] = useState('')
  const [assigning, setAssigning] = useState(false)

  // すべて＝全チーム合算（memberIdで重複排除）
  const allRows: WorkloadRow[] = (() => {
    const seen = new Set<string>()
    const out: WorkloadRow[] = []
    for (const t of teams) for (const r of t.rows) {
      if (!seen.has(r.memberId)) { seen.add(r.memberId); out.push(r) }
    }
    return out
  })()

  const baseRows = viewMode === 'all' ? allRows : (teams.find(t => t.id === teamId)?.rows ?? [])
  const rows = baseRows.filter(r => r.primaryRole === roleFilter)
  // 割り振り（管理担当セット）は管理担当ビューのみ
  const canAssign = roleFilter === 'manager'
  const selectedMember = canAssign ? rows.find(r => r.memberId === selectedMemberId) ?? null : null

  // 案件選択リスト（assignCaseId があればそれを先頭に固定）
  const orderedCases: UnassignedCase[] = assignCaseId
    ? [...unassignedCases].sort((a, b) => (a.id === assignCaseId ? -1 : b.id === assignCaseId ? 1 : 0))
    : unassignedCases

  const assign = async (caseId: string) => {
    if (!selectedMemberId) return
    setAssigning(true)
    await supabase.from('case_members').delete().eq('case_id', caseId).eq('role', 'manager')
    const { error } = await supabase.from('case_members').insert({ case_id: caseId, member_id: selectedMemberId, role: 'manager' })
    setAssigning(false)
    if (error) { showToast(`割り振りに失敗しました: ${error.message}`, 'error'); return }
    showToast(`${selectedMember?.name ?? '担当者'} を管理担当に割り振りました`, 'success')
    setPickCaseOpen(false)
    router.push(`/cases/${caseId}`)
  }

  return (
    <div>
      {assignCaseId && (
        <div className="mb-3 flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-800 rounded-lg px-4 py-2.5 text-[13px]">
          <UserPlus className="w-4 h-4" strokeWidth={2} />
          管理担当を割り振る案件が指定されています。担当者を選んで「割り振る」を押してください。
        </div>
      )}

      {/* すべて / チーム別 */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setViewMode('team')}
            className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${viewMode === 'team' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            チーム別
          </button>
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${viewMode === 'all' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            すべて
          </button>
        </div>
        {viewMode === 'team' && (
          <select
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
            className="px-3 py-1.5 text-[13px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            {teams.length === 0 && <option value="">チーム未登録</option>}
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* 担当区分フィルタ＋割り振りツールバー */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-[12px] font-semibold text-gray-500 mr-0.5">担当区分</span>
        {ROLE_TABS.map(r => (
          <button
            key={r.key}
            type="button"
            onClick={() => { setRoleFilter(r.key); setSelectedMemberId(null) }}
            className={`px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${roleFilter === r.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {r.label}
          </button>
        ))}
        {canAssign && (
          <div className="ml-auto flex items-center gap-2">
            {selectedMember && <span className="text-[12px] text-gray-500">選択中：<strong className="text-gray-800">{selectedMember.name}</strong></span>}
            <button
              type="button"
              onClick={() => setPickCaseOpen(true)}
              disabled={!selectedMemberId}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-4 h-4" strokeWidth={2.25} />
              割り振る
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-brand-700">
              {canAssign && <th className="px-3 py-2.5 w-10" />}
              <th className="px-3 py-2.5 text-left font-semibold">氏名</th>
              <th className="px-3 py-2.5 text-left font-semibold">所属チーム</th>
              <th className="px-3 py-2.5 text-left font-semibold">担当区分</th>
              <th className="px-3 py-2.5 text-left font-semibold">職種</th>
              <th className="px-3 py-2.5 text-center font-semibold">経験年数</th>
              <th className="px-3 py-2.5 text-center font-semibold">担当案件数</th>
              <th className="px-3 py-2.5 text-center font-semibold">今月業完予定</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canAssign ? 8 : 7} className="px-3 py-10 text-center text-[13px] text-gray-400">該当する担当者がいません</td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const checked = selectedMemberId === r.memberId
                return (
                  <tr key={r.memberId} className={`border-b border-gray-100 last:border-b-0 ${checked ? 'bg-brand-50/50' : i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    {canAssign && (
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedMemberId(checked ? null : r.memberId)}
                          className="w-4 h-4 accent-brand-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-semibold text-gray-900">{r.name}</td>
                    <td className="px-3 py-2.5 text-gray-600">{r.teamName}</td>
                    <td className="px-3 py-2.5 text-gray-600">{ROLE_LABEL[r.primaryRole] ?? r.primaryRole}</td>
                    <td className="px-3 py-2.5 text-gray-600">{r.jobType ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-gray-700">{r.years != null ? `${r.years}年` : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-gray-700">{r.activeCount}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-gray-700">{r.thisMonthCount}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 案件選択モーダル */}
      <Modal isOpen={pickCaseOpen} onClose={() => setPickCaseOpen(false)} title="案件を選択してください">
        <p className="text-[13px] text-gray-500 mb-3">
          {selectedMember ? <><strong className="text-gray-800">{selectedMember.name}</strong> を管理担当として割り振る案件を選んでください。</> : '担当者を選択してください。'}
        </p>
        <input
          type="text"
          value={caseSearch}
          onChange={e => setCaseSearch(e.target.value)}
          placeholder="案件名・管理番号で検索"
          className="w-full mb-3 px-3 py-2 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        <div className="max-h-[360px] overflow-y-auto -mx-1">
          {(() => {
            const q = caseSearch.trim().toLowerCase()
            const list = q ? orderedCases.filter(c => `${c.caseNumber} ${c.dealName}`.toLowerCase().includes(q)) : orderedCases
            if (list.length === 0) return <div className="px-3 py-10 text-center text-[13px] text-gray-400">受託・未割り振りの案件はありません</div>
            return list.map(c => (
              <button
                key={c.id}
                type="button"
                disabled={assigning}
                onClick={() => assign(c.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-brand-50/60 text-left transition-colors disabled:opacity-50"
              >
                <span className="font-mono text-[12px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{c.caseNumber}</span>
                <span className="text-[13px] font-semibold text-gray-800 flex-1 min-w-0 truncate">{c.dealName}</span>
                {c.id === assignCaseId && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700 border border-brand-200">この案件</span>}
                {!c.orderSheetReady && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">OS未完成</span>}
              </button>
            ))
          })()}
        </div>
      </Modal>
    </div>
  )
}
