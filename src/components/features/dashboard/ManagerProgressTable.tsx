import Link from 'next/link'
import { tenureLabel } from '@/lib/dashboardMetrics'
import UserAvatar from '@/components/ui/UserAvatar'

export type ManagerRow = {
  id: string
  name: string
  avatarUrl: string | null
  jobType: string | null
  joinedAt: string | null
  // 当月の実績値
  monthlyInvoiceCount: number          // 発行請求書件数
  totalAssigned: number                // 担当アクティブ案件数
  monthlyCompleted: number             // 当月完了件数
}

type Props = {
  rows: ManagerRow[]
  teamName: string
  today: Date
}

/**
 * 「管理担当別 月次成績」テーブル。
 * 個人目標は持たない方針なので、実績の可視化に特化:
 *   - 担当アクティブ案件数 / 当月完了件数 / 当月発行請求件数 のみ表示。
 * （請求件数を目標化すると、案件進捗ではなく請求発行タイミング操作を
 *   誘発する恐れがあるため、目標管理は外している）
 */
export default function ManagerProgressTable({ rows, teamName, today }: Props) {
  if (rows.length === 0) {
    return (
      <section className="mt-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">管理担当別 月次成績</h3>
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          このチームに管理担当のメンバーがいません
        </div>
      </section>
    )
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">管理担当別 月次成績</h3>
        <p className="text-[12px] text-gray-400">
          当月の担当案件数・完了件数・請求件数を可視化（個人目標は設定しません）
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="text-[13px] border-collapse w-full" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 110 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="px-2.5 py-2 text-left font-semibold">所属チーム</th>
              <th className="px-2.5 py-2 text-left font-semibold">氏名</th>
              <th className="px-2.5 py-2 text-left font-semibold">職種</th>
              <th className="px-2.5 py-2 text-left font-semibold">在籍期間</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="アクティブ案件の担当数">担当案件</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="当月完了件数">完了</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200" title="当月発行請求書件数">請求件数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
              const cls = 'px-2 py-2 text-right tabular-nums font-mono border-l border-gray-100 text-gray-700'
              const dim = <span className="text-gray-300">-</span>

              return (
                <tr key={m.id} className={`border-b border-gray-100 hover:bg-gray-50/50 ${rowBg}`}>
                  <td className="px-2.5 py-2 text-gray-700">{teamName}</td>
                  <td className="px-2.5 py-2">
                    <Link
                      href={`/profile/${m.id}`}
                      className="flex items-center gap-1.5 group/name"
                      title={`${m.name} のプロフィール`}
                    >
                      <UserAvatar
                        name={m.name}
                        role="manager"
                        url={m.avatarUrl}
                        size="sm"
                      />
                      <span className="text-gray-700 group-hover/name:text-brand-700 group-hover/name:underline truncate">{m.name}</span>
                    </Link>
                  </td>
                  <td className="px-2.5 py-2 text-gray-700">
                    {m.jobType ?? <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-2.5 py-2 text-gray-700">{tenureLabel(m.joinedAt, today)}</td>
                  <td className={cls}>{m.totalAssigned > 0 ? m.totalAssigned : dim}</td>
                  <td className={cls}>{m.monthlyCompleted > 0 ? m.monthlyCompleted : dim}</td>
                  <td className={cls}>{m.monthlyInvoiceCount > 0 ? m.monthlyInvoiceCount : dim}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
