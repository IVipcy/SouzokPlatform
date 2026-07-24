import { createClient } from '@/lib/supabase/server'
import { Trophy } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import RankingClient from '@/components/features/dashboard/RankingClient'
import { buildRankings } from '@/lib/rankingMetrics'

type CaseRow = { id: string; order_received_date: string | null; completion_date: string | null; contract_type: string | null; fee_administrative: number | null; fee_judicial: number | null; fee_total: number | null }
type CaseMemberRow = { case_id: string; member_id: string; role: string }
type MemberRow = { id: string; name: string; avatar_color: string | null; avatar_url: string | null; team_id: string | null }
type TeamRow = { id: string; name: string }

// ランキングダッシュボード（月間）。管理担当／受注担当／チームの3軸。
export default async function RankingDashboard() {
  const supabase = await createClient()
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [{ data: casesRaw }, { data: cmRaw }, { data: membersRaw }, { data: teamsRaw }] = await Promise.all([
    supabase.from('cases').select('id,order_received_date,completion_date,contract_type,fee_administrative,fee_judicial,fee_total'),
    supabase.from('case_members').select('case_id,member_id,role'),
    supabase.from('members').select('id,name,avatar_color,avatar_url,team_id').eq('is_active', true),
    supabase.from('teams').select('id,name').eq('is_active', true),
  ])

  const result = buildRankings(
    (casesRaw ?? []) as CaseRow[],
    (cmRaw ?? []) as CaseMemberRow[],
    (membersRaw ?? []) as MemberRow[],
    (teamsRaw ?? []) as TeamRow[],
    ym,
  )

  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`

  return (
    <div>
      <PageHeader
        eyebrow="Department · Ranking"
        title="ランキング"
        icon={Trophy}
        description={`${monthLabel}・管理担当／受注担当／チームの月間ランキング（綜合＝各順位の平均）`}
      />
      <RankingClient monthLabel={monthLabel} axes={result} />
    </div>
  )
}
