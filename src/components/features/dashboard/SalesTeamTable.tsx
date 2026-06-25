import Link from 'next/link'
import { tenureLabel, formatMan, type SalesMetricsBundle } from '@/lib/dashboardMetrics'
import UserAvatar from '@/components/ui/UserAvatar'
import EditableMemberTarget from './EditableMemberTarget'

export type SalesMemberRow = {
  id: string
  name: string
  avatarColor: string  // 互換用に残置（未使用）
  avatarUrl?: string | null
  jobType: string | null
  joinedAt: string | null
  metrics: SalesMetricsBundle
  // 新規受注件数の個人目標（未設定なら 0）
  newOrdersTarget: number
  // 個人目標達成状態（true=新規受注 actual>=target、target>0）
  achieved: boolean
}

export type SalesTeamGroup = {
  teamName: string
  teamMetrics: SalesMetricsBundle
  members: SalesMemberRow[]
}

type Props = {
  groups: SalesTeamGroup[]
  today: Date
  // 当月（target upsert に渡す）
  ym: string
  // 見出し（既定: 月次成績。本日ビューでは「本日成績」を渡す）
  title?: string
}

export default function SalesTeamTable({ groups, today, ym, title = 'チーム別／個人別 月次成績' }: Props) {
  const totalMembers = groups.reduce((s, g) => s + g.members.length, 0)

  if (totalMembers === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          受注担当のメンバーが登録されていません
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-[12px] text-gray-400">
          「目標(新規受注)」列をクリックで個人目標を編集できます。達成すると氏名アイコンにレインボーリング 🌈
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="text-[13px] border-collapse w-full table-auto">
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-brand-700 whitespace-nowrap">
              <th className="px-2.5 py-2 text-left font-semibold">所属チーム</th>
              <th className="px-2.5 py-2 text-left font-semibold">氏名</th>
              <th className="px-2.5 py-2 text-left font-semibold">職種</th>
              <th className="px-2.5 py-2 text-left font-semibold">在籍期間</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="当月面談数">面談数</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="当月新規受注件数">新規受注</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200 bg-amber-50/50" title="新規受注の個人目標（クリックで編集）">目標(新規受注)</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200">受注率</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200">平均単価</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="業務完了予定件数">完了予定</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="業務完了件数">完了</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="業務完了金額">完了金額</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="平均サイクル">サイクル</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <TeamGroupRows key={g.teamName} group={g} today={today} ym={ym} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TeamGroupRows({ group, today, ym }: { group: SalesTeamGroup; today: Date; ym: string }) {
  return (
    <>
      {/* チーム小計 */}
      <tr className="bg-brand-50/50 border-b border-brand-100 font-semibold">
        <td className="px-2.5 py-2 text-gray-900" colSpan={2}>
          <div className="flex items-center gap-1.5">
            <span className="text-[14px]">{group.teamName}</span>
            <span className="text-[13px] font-mono px-1.5 py-0.5 rounded bg-brand-200/60 text-brand-800">
              チーム合計
            </span>
            <span className="text-[14px] font-normal text-gray-500">（{group.members.length}人）</span>
          </div>
        </td>
        <td className="px-2.5 py-2 text-gray-400 text-[14px]">-</td>
        <td className="px-2.5 py-2 text-gray-400 text-[14px]">-</td>
        <MetricCells metrics={group.teamMetrics} bold />
      </tr>

      {/* 個人行 */}
      {group.members.map(m => (
        <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50/50">
          <td className="px-2.5 py-2 text-gray-300 text-[14px]"></td>
          <td className="px-2.5 py-2">
            <Link
              href={`/profile/${m.id}`}
              className="flex items-center gap-1.5 pl-3 group/name"
              title={`${m.name} のプロフィール`}
            >
              <UserAvatar
                name={m.name}
                role="sales"
                url={m.avatarUrl}
                size="sm"
                achievedFrame={m.achieved}
              />
              <span className="text-gray-700 group-hover/name:text-brand-700 group-hover/name:underline truncate max-w-[150px]">{m.name}</span>
            </Link>
          </td>
          <td className="px-2.5 py-2 text-gray-700 whitespace-nowrap">
            {m.jobType ?? <span className="text-gray-400">-</span>}
          </td>
          <td className="px-2.5 py-2 text-gray-700 whitespace-nowrap">{tenureLabel(m.joinedAt, today)}</td>
          <MemberMetricCells metrics={m.metrics} target={m.newOrdersTarget} achieved={m.achieved} memberId={m.id} ym={ym} />
        </tr>
      ))}
    </>
  )
}

// チーム合計の指標セル（目標列は「-」）
function MetricCells({ metrics: m, bold }: { metrics: SalesMetricsBundle; bold?: boolean }) {
  const cls = `px-2 py-2 text-right tabular-nums font-mono border-l border-gray-100 ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`
  const dim = <span className="text-gray-300">-</span>

  return (
    <>
      <td className={cls}>{m.meetingsCount > 0 ? m.meetingsCount : dim}</td>
      <td className={cls}>{m.newOrdersCount > 0 ? m.newOrdersCount : dim}</td>
      <td className={`${cls} bg-amber-50/30`}>{dim}</td>
      <td className={cls}>
        {m.conversionRate === null ? dim : `${Math.round(m.conversionRate * 100)}%`}
      </td>
      <td className={cls}>{m.avgOrderUnit === null ? dim : `${formatMan(m.avgOrderUnit)}万`}</td>
      <td className={cls}>{m.expectedCompletions > 0 ? m.expectedCompletions : dim}</td>
      <td className={cls}>{m.completedCount > 0 ? m.completedCount : dim}</td>
      <td className={cls}>{m.completedAmount > 0 ? `${formatMan(m.completedAmount)}万` : dim}</td>
      <td className={cls}>{m.avgCycleMonths === null ? dim : m.avgCycleMonths.toFixed(1)}</td>
    </>
  )
}

// 個人行の指標セル（目標列は編集可能）
function MemberMetricCells({
  metrics: m,
  target,
  achieved,
  memberId,
  ym,
}: {
  metrics: SalesMetricsBundle
  target: number
  achieved: boolean
  memberId: string
  ym: string
}) {
  const cls = 'px-2 py-2 text-right tabular-nums font-mono border-l border-gray-100 text-gray-700'
  const dim = <span className="text-gray-300">-</span>
  // 新規受注の数値色: 達成時は緑、未達+目標ありは赤、目標なしは通常
  const newOrdersColor = target <= 0
    ? ''
    : achieved
      ? 'text-emerald-700 font-bold'
      : 'text-red-600'

  return (
    <>
      <td className={cls}>{m.meetingsCount > 0 ? m.meetingsCount : dim}</td>
      <td className={`${cls} ${newOrdersColor}`}>{m.newOrdersCount > 0 ? m.newOrdersCount : dim}</td>
      <td className={`px-2 py-2 border-l border-gray-100 bg-amber-50/30`}>
        <EditableMemberTarget memberId={memberId} ym={ym} initialTarget={target} />
      </td>
      <td className={cls}>
        {m.conversionRate === null ? dim : `${Math.round(m.conversionRate * 100)}%`}
      </td>
      <td className={cls}>{m.avgOrderUnit === null ? dim : `${formatMan(m.avgOrderUnit)}万`}</td>
      <td className={cls}>{m.expectedCompletions > 0 ? m.expectedCompletions : dim}</td>
      <td className={cls}>{m.completedCount > 0 ? m.completedCount : dim}</td>
      <td className={cls}>{m.completedAmount > 0 ? `${formatMan(m.completedAmount)}万` : dim}</td>
      <td className={cls}>{m.avgCycleMonths === null ? dim : m.avgCycleMonths.toFixed(1)}</td>
    </>
  )
}
