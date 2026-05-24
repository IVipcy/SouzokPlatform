import Link from 'next/link'
import {
  tenureLabel,
  formatMan,
  type SalesDailyMetricsBundle,
} from '@/lib/dashboardMetrics'
import UserAvatar from '@/components/ui/UserAvatar'
import EditableMemberTarget from './EditableMemberTarget'

// 「チーム本日」ダッシュボード下部の「本日成績」テーブル用の行型
export type SalesDailyMemberRow = {
  id: string
  name: string
  avatarUrl: string | null
  jobType: string | null
  joinedAt: string | null
  // 本日メトリクス
  daily: SalesDailyMetricsBundle
  // 月間目標と月累計
  newOrdersTarget: number       // 月目標（新規受注件数）
  monthlyNewOrders: number      // 月累計（新規受注件数、達成判定の actual）
  achieved: boolean             // 月累計が月目標を達成しているか
}

export type SalesDailyTeamGroup = {
  teamName: string
  // チーム合算の本日メトリクス
  teamDaily: SalesDailyMetricsBundle
  // チーム合算の月累計（参考表示）
  teamMonthlyNewOrders: number
  members: SalesDailyMemberRow[]
}

type Props = {
  groups: SalesDailyTeamGroup[]
  today: Date
  ym: string
}

export default function SalesDailyTeamTable({ groups, today, ym }: Props) {
  const totalMembers = groups.reduce((s, g) => s + g.members.length, 0)

  if (totalMembers === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">チーム別／個人別 本日成績</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          受注担当のメンバーが登録されていません
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">チーム別／個人別 本日成績</h3>
        <p className="text-[12px] text-gray-400">
          「目標」列の値はクリックで個人月間目標を編集できます。達成すると氏名アイコンにレインボーリング 🌈
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="text-[13px] border-collapse w-full" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 110 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="px-2.5 py-2 text-left font-semibold">所属チーム</th>
              <th className="px-2.5 py-2 text-left font-semibold">氏名</th>
              <th className="px-2.5 py-2 text-left font-semibold">職種</th>
              <th className="px-2.5 py-2 text-left font-semibold">在籍期間</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="本日の面談数">本日面談</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="本日の新規受注件数">本日新規受注</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="月累計 新規受注件数（達成判定用）">月累計 新規受注</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200 bg-amber-50/50" title="月目標(新規受注) — クリックで編集">月目標(新規受注)</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200">本日受注率</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200">本日平均単価</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="本日の相続税申告件数">本日 相続税</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="本日の不動産査定件数">本日 査定</th>
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

function TeamGroupRows({ group, today, ym }: { group: SalesDailyTeamGroup; today: Date; ym: string }) {
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
        <SummaryDailyCells daily={group.teamDaily} monthlyNewOrders={group.teamMonthlyNewOrders} bold />
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
              <span className="text-gray-700 group-hover/name:text-brand-700 group-hover/name:underline truncate">{m.name}</span>
            </Link>
          </td>
          <td className="px-2.5 py-2 text-gray-700">
            {m.jobType ?? <span className="text-gray-400">-</span>}
          </td>
          <td className="px-2.5 py-2 text-gray-700">{tenureLabel(m.joinedAt, today)}</td>
          <MemberDailyCells row={m} ym={ym} />
        </tr>
      ))}
    </>
  )
}

const cellCls = 'px-2 py-2 text-right tabular-nums font-mono border-l border-gray-100 text-gray-700'
const dim = <span className="text-gray-300">-</span>

function SummaryDailyCells({
  daily,
  monthlyNewOrders,
  bold,
}: {
  daily: SalesDailyMetricsBundle
  monthlyNewOrders: number
  bold?: boolean
}) {
  const cls = `${cellCls} ${bold ? 'font-bold text-gray-900' : ''}`
  return (
    <>
      <td className={cls}>{daily.meetingsCount > 0 ? daily.meetingsCount : dim}</td>
      <td className={cls}>{daily.newOrdersCount > 0 ? daily.newOrdersCount : dim}</td>
      <td className={cls}>{monthlyNewOrders > 0 ? monthlyNewOrders : dim}</td>
      <td className={`${cls} bg-amber-50/30`}>{dim}</td>
      <td className={cls}>
        {daily.conversionRate === null ? dim : `${Math.round(daily.conversionRate * 100)}%`}
      </td>
      <td className={cls}>{daily.avgOrderUnit === null ? dim : `${formatMan(daily.avgOrderUnit)}万`}</td>
      <td className={cls}>{daily.taxFilingCount > 0 ? daily.taxFilingCount : dim}</td>
      <td className={cls}>{daily.propertyAppraisalCount > 0 ? daily.propertyAppraisalCount : dim}</td>
    </>
  )
}

function MemberDailyCells({ row, ym }: { row: SalesDailyMemberRow; ym: string }) {
  const m = row.daily
  // 月累計新規受注の色: 達成=緑、未達+目標あり=赤、目標なし=通常
  const monthlyColor = row.newOrdersTarget <= 0
    ? ''
    : row.achieved
      ? 'text-emerald-700 font-bold'
      : 'text-red-600'

  return (
    <>
      <td className={cellCls}>{m.meetingsCount > 0 ? m.meetingsCount : dim}</td>
      <td className={cellCls}>{m.newOrdersCount > 0 ? m.newOrdersCount : dim}</td>
      <td className={`${cellCls} ${monthlyColor}`}>
        {row.monthlyNewOrders > 0 ? row.monthlyNewOrders : dim}
      </td>
      <td className="px-2 py-2 border-l border-gray-100 bg-amber-50/30">
        <EditableMemberTarget
          memberId={row.id}
          ym={ym}
          initialTarget={row.newOrdersTarget}
          field="new_orders_count"
        />
      </td>
      <td className={cellCls}>
        {m.conversionRate === null ? dim : `${Math.round(m.conversionRate * 100)}%`}
      </td>
      <td className={cellCls}>
        {m.avgOrderUnit === null ? dim : `${formatMan(m.avgOrderUnit)}万`}
      </td>
      <td className={cellCls}>{m.taxFilingCount > 0 ? m.taxFilingCount : dim}</td>
      <td className={cellCls}>{m.propertyAppraisalCount > 0 ? m.propertyAppraisalCount : dim}</td>
    </>
  )
}
