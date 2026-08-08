'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Star, Users, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { notifyManagerAssigned } from '@/lib/managerAssignNotify'
import Modal from '@/components/ui/Modal'

export type UnassignedCase = { id: string; caseNumber: string; dealName: string; orderSheetReady: boolean }

// 割り振り待ちテーブル1行
export type UnassignedCaseRow = {
  id: string
  orderDate: string | null
  elapsedDays: number | null
  caseNumber: string
  dealName: string
  status: string
  teamId: string | null
  teamName: string | null
  salesName: string | null
  serviceCategory: string | null
  difficulty: string | null
  difficultyReason: string | null
}

// 割り振り先候補（管理担当）
export type ManagerCandidate = {
  memberId: string
  name: string
  teamIds: string[]
  teamNames: string | null
  jobType: string | null
  years: number | null
  activeCount: number
}

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
  // 受注系かつ管理担当未設定の案件（担当者起点の割り振りモーダル用）
  unassignedCases: UnassignedCase[]
  // 割り振り待ちテーブル（案件起点の割り振り用）
  unassignedRows: UnassignedCaseRow[]
  // 割り振り先候補（全社の管理担当）
  managers: ManagerCandidate[]
}

const ROLE_TABS: { key: string; label: string }[] = [
  { key: 'manager', label: '管理担当' },
  { key: 'sales', label: '受注担当' },
  { key: 'assistant', label: '事務管理担当' },
]
const ROLE_LABEL: Record<string, string> = { manager: '管理担当', sales: '受注担当', assistant: '事務管理担当' }

// 受注系ステータスのチップ配色
const statusChipCls = (s: string) =>
  s === '受注' ? 'bg-blue-100 text-blue-800'
  : s === '戻り受注' ? 'bg-indigo-100 text-indigo-700'
  : s === '作業着手準備' ? 'bg-orange-100 text-orange-700'
  : 'bg-gray-100 text-gray-600'

// 経過日数チップ（2営業日超で警告色。5日以上で赤）
const elapsedChipCls = (d: number | null) =>
  d == null ? 'bg-gray-100 text-gray-400'
  : d >= 5 ? 'bg-red-100 text-red-700'
  : d >= 2 ? 'bg-amber-100 text-amber-700'
  : 'bg-gray-100 text-gray-500'

// 難易度チップ（激難＞難＞それ以外）
const difficultyChipCls = (d: string | null) =>
  !d ? 'bg-gray-100 text-gray-400'
  : d.includes('激') ? 'bg-red-900 text-white'
  : d.includes('難') ? 'bg-red-100 text-red-700'
  : 'bg-gray-100 text-gray-600'

export default function WorkloadClient({ teams, defaultTeamId, assignCaseId, unassignedCases, unassignedRows, managers }: Props) {
  const router = useRouter()
  const supabase = createClient()
  // トップレベル・サブタブ（担当者の稼働 / 割り振り待ち案件）。案件詳細から割り振りで来た場合は担当者ビュー。
  const [topView, setTopView] = useState<'members' | 'cases'>('members')
  const [viewMode, setViewMode] = useState<'team' | 'all'>('team')
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? teams[0]?.id ?? '')
  const [roleFilter, setRoleFilter] = useState<string>('manager')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [pickCaseOpen, setPickCaseOpen] = useState(false)
  const [caseSearch, setCaseSearch] = useState('')
  const [assigning, setAssigning] = useState(false)

  // 割り振り待ちテーブル（案件起点）
  const [caseRows, setCaseRows] = useState<UnassignedCaseRow[]>(unassignedRows)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<UnassignedCaseRow | null>(null)  // 管理担当ピックのモーダル対象
  const [mgrSearch, setMgrSearch] = useState('')

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

  // 担当者起点の割り振り（メンバー選択→案件選択）
  const assign = async (caseId: string) => {
    if (!selectedMemberId) return
    setAssigning(true)
    await supabase.from('case_members').delete().eq('case_id', caseId).eq('role', 'manager')
    const { error } = await supabase.from('case_members').insert({ case_id: caseId, member_id: selectedMemberId, role: 'manager' })
    setAssigning(false)
    if (error) { showToast(`割り振りに失敗しました: ${error.message}`, 'error'); return }
    await notifyManagerAssigned(caseId, selectedMemberId)   // 受注担当へ「割振り完了」
    showToast(`${selectedMember?.name ?? '担当者'} を管理担当に割り振りました`, 'success')
    setPickCaseOpen(false)
    router.push(`/cases/${caseId}`)
  }

  // 割り振り待ちテーブルの表示行（チーム別のときは案件のチームで絞る）
  const shownCases = viewMode === 'team' ? caseRows.filter(r => r.teamId === teamId) : caseRows
  const selectedCase = caseRows.find(r => r.id === selectedCaseId) ?? null

  // 案件起点の割り振り（案件選択→管理担当選択・即アサイン）
  const assignManager = async (memberId: string) => {
    if (!assignTarget) return
    const caseId = assignTarget.id
    setAssigning(true)
    await supabase.from('case_members').delete().eq('case_id', caseId).eq('role', 'manager')
    const { error } = await supabase.from('case_members').insert({ case_id: caseId, member_id: memberId, role: 'manager' })
    setAssigning(false)
    if (error) { showToast(`割り振りに失敗しました: ${error.message}`, 'error'); return }
    await notifyManagerAssigned(caseId, memberId)   // 受注担当へ「割振り完了」
    const mgr = managers.find(m => m.memberId === memberId)
    showToast(`${mgr?.name ?? '管理担当'} を「${assignTarget.dealName}」の管理担当に割り振りました`, 'success')
    setCaseRows(prev => prev.filter(r => r.id !== caseId))
    setSelectedCaseId(prev => (prev === caseId ? null : prev))
    setAssignTarget(null)
    setMgrSearch('')
  }

  // 管理担当ピックの推奨（同じチーム）／その他
  const { recoList, otherList } = useMemo(() => {
    const q = mgrSearch.trim().toLowerCase()
    const match = (m: ManagerCandidate) => !q || `${m.name} ${m.teamNames ?? ''}`.toLowerCase().includes(q)
    const targetTeam = assignTarget?.teamId ?? null
    const isReco = (m: ManagerCandidate) => !!targetTeam && m.teamIds.includes(targetTeam)
    const byLoad = (a: ManagerCandidate, b: ManagerCandidate) => a.activeCount - b.activeCount
    return {
      recoList: managers.filter(m => isReco(m) && match(m)).sort(byLoad),
      otherList: managers.filter(m => !isReco(m) && match(m)).sort(byLoad),
    }
  }, [managers, assignTarget, mgrSearch])

  const ManagerCard = ({ m, reco }: { m: ManagerCandidate; reco?: boolean }) => (
    <button
      type="button"
      disabled={assigning}
      onClick={() => assignManager(m.memberId)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors disabled:opacity-50 ${reco ? 'border-brand-200 bg-brand-50/40 hover:bg-brand-50' : 'border-gray-200 hover:bg-gray-50'}`}
    >
      <span className={`flex-none w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold ${reco ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600'}`}>{m.name.slice(0, 1)}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-gray-900 truncate">{m.name}</span>
        <span className="block text-[11px] text-gray-500 truncate">{[m.teamNames, m.jobType, m.years != null ? `経験${m.years}年` : null].filter(Boolean).join('・') || '—'}</span>
      </span>
      <span className="ml-auto text-right flex-none">
        <span className={`block font-mono font-bold text-[15px] ${m.activeCount >= 5 ? 'text-amber-600' : m.activeCount === 0 ? 'text-green-600' : 'text-gray-700'}`}>{m.activeCount}</span>
        <span className="block text-[10px] text-gray-400">担当案件</span>
      </span>
    </button>
  )

  return (
    <div>
      {assignCaseId && topView === 'members' && (
        <div className="mb-3 flex items-center gap-2 bg-brand-50 border border-brand-200 text-brand-800 rounded-lg px-4 py-2.5 text-[13px]">
          <UserPlus className="w-4 h-4" strokeWidth={2} />
          管理担当を割り振る案件が指定されています。担当者を選んで「割り振る」を押してください。
        </div>
      )}

      {/* トップレベル・サブタブ */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
        <button
          type="button"
          onClick={() => setTopView('members')}
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${topView === 'members' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
        >
          担当者の稼働
        </button>
        <button
          type="button"
          onClick={() => setTopView('cases')}
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 ${topView === 'cases' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
        >
          割り振り待ち案件
          {caseRows.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold">{caseRows.length}</span>
          )}
        </button>
      </div>

      {/* すべて / チーム別（両ビュー共通） */}
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

      {topView === 'members' ? (
        <>
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
        </>
      ) : (
        <>
          {/* 割り振り待ちツールバー（右上：割り振る） */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[12px] text-gray-500">
              <Clock className="w-3.5 h-3.5" strokeWidth={2} />
              管理担当が未設定で、作業進行中になっていない案件（経過日数の長い順）
            </span>
            <div className="ml-auto flex items-center gap-2">
              {selectedCase && <span className="text-[12px] text-gray-500">選択中：<strong className="text-gray-800">{selectedCase.dealName}</strong></span>}
              <button
                type="button"
                onClick={() => { if (selectedCase) { setAssignTarget(selectedCase); setMgrSearch('') } }}
                disabled={!selectedCaseId}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <UserPlus className="w-4 h-4" strokeWidth={2.25} />
                割り振る
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 1040 }}>
              <thead>
                <tr className="bg-brand-50/60 border-b border-brand-100 text-brand-700">
                  <th className="px-3 py-2.5 w-10" />
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">受注日</th>
                  <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">経過</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">案件管理番号</th>
                  <th className="px-3 py-2.5 text-left font-semibold">案件名</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">ステータス</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">チーム</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">受注担当</th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">受注区分</th>
                  <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">難易度</th>
                  <th className="px-3 py-2.5 text-left font-semibold">難易度理由</th>
                </tr>
              </thead>
              <tbody>
                {shownCases.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-[13px] text-gray-400">割り振り待ちの案件はありません</td>
                  </tr>
                ) : (
                  shownCases.map((c, i) => {
                    const checked = selectedCaseId === c.id
                    return (
                      <tr key={c.id} className={`border-b border-gray-100 last:border-b-0 ${checked ? 'bg-brand-50/50' : i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedCaseId(checked ? null : c.id)}
                            className="w-4 h-4 accent-brand-600 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-gray-500 whitespace-nowrap">{c.orderDate ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-block font-mono font-bold px-2 py-0.5 rounded-full text-[11.5px] ${elapsedChipCls(c.elapsedDays)}`}>{c.elapsedDays != null ? `${c.elapsedDays}日` : '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="font-mono text-[11.5px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{c.caseNumber}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <a href={`/cases/${c.id}`} className="font-semibold text-gray-900 hover:text-brand-700 hover:underline">{c.dealName}</a>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusChipCls(c.status)}`}>{c.status}</span></td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{c.teamName ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{c.salesName ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{c.serviceCategory ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">{c.difficulty ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${difficultyChipCls(c.difficulty)}`}>{c.difficulty}</span> : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-gray-500 max-w-[220px] truncate" title={c.difficultyReason ?? ''}>{c.difficultyReason ?? <span className="text-gray-300">—</span>}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 案件選択モーダル（担当者起点） */}
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
            if (list.length === 0) return <div className="px-3 py-10 text-center text-[13px] text-gray-400">受注・未割り振りの案件はありません</div>
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

      {/* 管理担当ピックのモーダル（案件起点・即アサイン） */}
      <Modal isOpen={!!assignTarget} onClose={() => { setAssignTarget(null); setMgrSearch('') }} title="管理担当を割り振る">
        {assignTarget && (
          <p className="text-[13px] text-gray-500 mb-3">
            対象：<span className="font-mono text-[12px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{assignTarget.caseNumber}</span>{' '}
            <strong className="text-gray-800">{assignTarget.dealName}</strong>
            {assignTarget.teamName && <span className="text-gray-400">（{assignTarget.teamName}）</span>}
          </p>
        )}
        <input
          type="text"
          value={mgrSearch}
          onChange={e => setMgrSearch(e.target.value)}
          placeholder="氏名・チームで検索（全社の管理担当）"
          className="w-full mb-3 px-3 py-2 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        <div className="max-h-[380px] overflow-y-auto space-y-1.5 -mx-0.5 px-0.5">
          {recoList.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-700 mb-1"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" strokeWidth={2} />推奨：同じチーム{assignTarget?.teamName ? `（${assignTarget.teamName}）` : ''}の管理担当</div>
              {recoList.map(m => <ManagerCard key={m.memberId} m={m} reco />)}
            </>
          )}
          {otherList.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 mt-3 mb-1"><Users className="w-3.5 h-3.5" strokeWidth={2} />{recoList.length > 0 ? '他チームの管理担当' : '管理担当'}</div>
              {otherList.map(m => <ManagerCard key={m.memberId} m={m} />)}
            </>
          )}
          {recoList.length === 0 && otherList.length === 0 && (
            <div className="px-3 py-10 text-center text-[13px] text-gray-400">該当する管理担当がいません</div>
          )}
        </div>
      </Modal>
    </div>
  )
}
