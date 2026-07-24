// ランキングダッシュボードの集計。管理担当／受注担当／チームの月間ランキングを作る。
// 綜合＝各サブランキングの単純平均（順位平均・小さいほど上位）。実績ゼロの人はその軸の綜合から除外(B案)。
import { isDashboardHiddenTeam } from '@/lib/constants'

export type RankUnit = 'ken' | 'yen' | 'days' | 'avgrank'
export type RankEntry = { id: string; name: string; value: number; rank: number; avatarColor: string | null; avatarUrl: string | null; isTeam?: boolean }
export type Ranking = { key: string; title: string; unit: RankUnit; note?: string; entries: RankEntry[] }
export type AxisKey = 'manager' | 'sales' | 'team'
export type AxisRankings = { axis: AxisKey; label: string; rankings: Ranking[] }
export type RankingResult = { manager: AxisRankings; sales: AxisRankings; team: AxisRankings }

type CaseLite = { id: string; order_received_date: string | null; completion_date: string | null; contract_type: string | null; fee_administrative: number | null; fee_judicial: number | null; fee_total: number | null }
type CaseMemberLite = { case_id: string; member_id: string; role: string }
type MemberLite = { id: string; name: string; avatar_color: string | null; avatar_url: string | null; team_id: string | null }
type TeamLite = { id: string; name: string }

const num = (n: number | null | undefined) => n ?? 0

// 確定売上：契約形態で 行政単独=行政報酬／司法単独=司法報酬／連名=合計。
function confirmedRevenue(c: CaseLite): number {
  switch (c.contract_type) {
    case '行政書士法人単独': return num(c.fee_administrative)
    case '司法書士法人単独': return num(c.fee_judicial)
    case '行・司連名': return c.fee_total ?? (num(c.fee_administrative) + num(c.fee_judicial))
    default: return c.fee_total ?? 0
  }
}
function daysBetween(a: string, b: string): number | null {
  const d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00')
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null
  return Math.round((d2.getTime() - d1.getTime()) / 86400000)
}

type Raw = { id: string; name: string; value: number; avatarColor: string | null; avatarUrl: string | null; isTeam?: boolean }
// 競技順位（同値は同順位、次はスキップ：1,2,2,4）。dir=desc（大きいほど上位）/asc（小さいほど上位）。
function rankEntries(list: Raw[], dir: 'desc' | 'asc'): RankEntry[] {
  const sorted = [...list].sort((a, b) => dir === 'desc' ? b.value - a.value : a.value - b.value)
  let rank = 0, prev: number | null = null, seen = 0
  return sorted.map(e => {
    seen++
    if (prev === null || e.value !== prev) { rank = seen; prev = e.value }
    return { ...e, rank }
  })
}
// 綜合＝サブランキングでの順位の単純平均（利用可能な分だけ）。小さいほど上位。
function composite(subs: Ranking[], ids: string[], meta: Map<string, Raw>): Ranking {
  const rankMaps = subs.map(r => new Map(r.entries.map(e => [e.id, e.rank])))
  const raw: Raw[] = ids.map(id => {
    const ranks = rankMaps.map(m => m.get(id)).filter((x): x is number => x != null)
    const avg = ranks.length ? ranks.reduce((s, x) => s + x, 0) / ranks.length : 999
    const m = meta.get(id)
    return { id, name: m?.name ?? '—', value: Math.round(avg * 100) / 100, avatarColor: m?.avatarColor ?? null, avatarUrl: m?.avatarUrl ?? null, isTeam: m?.isTeam }
  })
  return { key: 'composite', title: '綜合ランキング', unit: 'avgrank', note: '各ランキング順位の平均（小さいほど上位）', entries: rankEntries(raw, 'asc') }
}

type Agg = { count: number; amount: number; cycleSum: number; cycleN: number }
const emptyAgg = (): Agg => ({ count: 0, amount: 0, cycleSum: 0, cycleN: 0 })

export function buildRankings(cases: CaseLite[], caseMembers: CaseMemberLite[], members: MemberLite[], teams: TeamLite[], ym: string): RankingResult {
  const excludedTeamIds = new Set(teams.filter(t => isDashboardHiddenTeam(t.name)).map(t => t.id))
  // 集計対象メンバー（在籍中＋非表示チーム以外）
  const eligible = members.filter(m => !m.team_id || !excludedTeamIds.has(m.team_id))
  const memberById = new Map(eligible.map(m => [m.id, m]))
  const teamById = new Map(teams.filter(t => !excludedTeamIds.has(t.id)).map(t => [t.id, t]))
  const memberTeam = new Map(members.map(m => [m.id, m.team_id]))
  const cmByCase = new Map<string, CaseMemberLite[]>()
  for (const cm of caseMembers) { const a = cmByCase.get(cm.case_id) ?? []; a.push(cm); cmByCase.set(cm.case_id, a) }

  const managerAgg = new Map<string, Agg>()
  const teamAgg = new Map<string, Agg>()
  const salesAgg = new Map<string, Agg>()

  for (const c of cases) {
    const cms = cmByCase.get(c.id) ?? []
    const rev = confirmedRevenue(c)
    // 業完（完了日が当月）→ 管理担当・チーム
    if (c.completion_date && c.completion_date.startsWith(ym)) {
      const cyc = c.order_received_date ? daysBetween(c.order_received_date, c.completion_date) : null
      const mgrIds = cms.filter(x => x.role === 'manager').map(x => x.member_id).filter(id => memberById.has(id))
      for (const mid of mgrIds) {
        const a = managerAgg.get(mid) ?? emptyAgg(); a.count++; a.amount += rev; if (cyc != null && cyc >= 0) { a.cycleSum += cyc; a.cycleN++ }; managerAgg.set(mid, a)
      }
      // チーム＝管理担当の所属チーム（重複排除）
      const teamIds = new Set(mgrIds.map(mid => memberTeam.get(mid)).filter((t): t is string => !!t && teamById.has(t)))
      for (const tid of teamIds) {
        const a = teamAgg.get(tid) ?? emptyAgg(); a.count++; a.amount += rev; if (cyc != null && cyc >= 0) { a.cycleSum += cyc; a.cycleN++ }; teamAgg.set(tid, a)
      }
    }
    // 受注（受注日が当月）→ 受注担当
    if (c.order_received_date && c.order_received_date.startsWith(ym)) {
      const salesIds = cms.filter(x => x.role === 'sales').map(x => x.member_id).filter(id => memberById.has(id))
      for (const sid of salesIds) { const a = salesAgg.get(sid) ?? emptyAgg(); a.count++; a.amount += rev; salesAgg.set(sid, a) }
    }
  }

  const mMeta = (id: string): Raw => { const m = memberById.get(id)!; return { id, name: m.name, value: 0, avatarColor: m.avatar_color, avatarUrl: m.avatar_url } }
  const tMeta = (id: string): Raw => { const t = teamById.get(id)!; return { id, name: t.name, value: 0, avatarColor: null, avatarUrl: null, isTeam: true } }

  // 管理担当
  const mgrIds = [...managerAgg.keys()]
  const mgrMetaMap = new Map(mgrIds.map(id => [id, mMeta(id)]))
  const mCount = rankEntries(mgrIds.map(id => ({ ...mMeta(id), value: managerAgg.get(id)!.count })), 'desc')
  const mAmount = rankEntries(mgrIds.map(id => ({ ...mMeta(id), value: managerAgg.get(id)!.amount })), 'desc')
  const mCycle = rankEntries(mgrIds.filter(id => managerAgg.get(id)!.cycleN > 0).map(id => ({ ...mMeta(id), value: Math.round(managerAgg.get(id)!.cycleSum / managerAgg.get(id)!.cycleN) })), 'asc')
  const mSubs: Ranking[] = [
    { key: 'gyokan_count', title: '業完件数ランキング', unit: 'ken', entries: mCount },
    { key: 'gyokan_amount', title: '業完金額ランキング', unit: 'yen', entries: mAmount },
    { key: 'gyokan_cycle', title: '業完サイクルランキング', unit: 'days', note: '日数が短いほど上位', entries: mCycle },
  ]
  const manager: AxisRankings = { axis: 'manager', label: '管理担当', rankings: [...mSubs, composite(mSubs, mgrIds, mgrMetaMap)] }

  // 受注担当
  const sIds = [...salesAgg.keys()]
  const sMetaMap = new Map(sIds.map(id => [id, mMeta(id)]))
  const sCount = rankEntries(sIds.map(id => ({ ...mMeta(id), value: salesAgg.get(id)!.count })), 'desc')
  const sAmount = rankEntries(sIds.map(id => ({ ...mMeta(id), value: salesAgg.get(id)!.amount })), 'desc')
  const sSubs: Ranking[] = [
    { key: 'juchu_count', title: '受注件数ランキング', unit: 'ken', entries: sCount },
    { key: 'juchu_amount', title: '受注金額ランキング', unit: 'yen', entries: sAmount },
  ]
  const sales: AxisRankings = { axis: 'sales', label: '受注担当', rankings: [...sSubs, composite(sSubs, sIds, sMetaMap)] }

  // チーム
  const tIds = [...teamAgg.keys()]
  const tMetaMap = new Map(tIds.map(id => [id, tMeta(id)]))
  const tCount = rankEntries(tIds.map(id => ({ ...tMeta(id), value: teamAgg.get(id)!.count })), 'desc')
  const tAmount = rankEntries(tIds.map(id => ({ ...tMeta(id), value: teamAgg.get(id)!.amount })), 'desc')
  const tCycle = rankEntries(tIds.filter(id => teamAgg.get(id)!.cycleN > 0).map(id => ({ ...tMeta(id), value: Math.round(teamAgg.get(id)!.cycleSum / teamAgg.get(id)!.cycleN) })), 'asc')
  const tSubs: Ranking[] = [
    { key: 'team_count', title: '業完件数ランキング', unit: 'ken', entries: tCount },
    { key: 'team_amount', title: '業完金額ランキング', unit: 'yen', entries: tAmount },
    { key: 'team_cycle', title: '業完サイクルランキング', unit: 'days', note: '日数が短いほど上位', entries: tCycle },
  ]
  const team: AxisRankings = { axis: 'team', label: 'チーム', rankings: [...tSubs, composite(tSubs, tIds, tMetaMap)] }

  return { manager, sales, team }
}
