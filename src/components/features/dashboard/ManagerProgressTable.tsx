import Link from 'next/link'
import { tenureLabel } from '@/lib/dashboardMetrics'
import UserAvatar from '@/components/ui/UserAvatar'
import EditableMemberTarget from './EditableMemberTarget'

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
  // 月間目標値
  invoiceTarget: number
  // 達成判定（actual >= target かつ target > 0）
  achieved: boolean
}

type Props = {
  rows: ManagerRow[]
  teamName: string
  today: Date
  ym: string
}

export default function ManagerProgressTable({ rows, teamName, today, ym }: Props) {
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
          「目標(請求件数)」列をクリックで個人目標を編集できます。達成すると氏名アイコンにレインボーリング 🌈
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
            <col style={{ width: 100 }} />
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
              <th className="px-2 py-2 text-center font-semibold border-l border-gray-200 bg-amber-50/50" title="請求件数の月間目標（クリックで編集）">目標(請求件数)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
              const cls = 'px-2 py-2 text-right tabular-nums font-mono border-l border-gray-100 text-gray-700'
              const dim = <span className="text-gray-300">-</span>
              // 請求件数の色: 達成=緑、未達+目標あり=赤、目標なし=通常
              const invoiceColor = m.invoiceTarget <= 0
                ? ''
                : m.achieved
                  ? 'text-emerald-700 font-bold'
                  : 'text-red-600'

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
                        achievedFrame={m.achieved}
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
                  <td className={`${cls} ${invoiceColor}`}>{m.monthlyInvoiceCount > 0 ? m.monthlyInvoiceCount : dim}</td>
                  <td className="px-2 py-2 border-l border-gray-100 bg-amber-50/30">
                    <EditableMemberTarget
                      memberId={m.id}
                      ym={ym}
                      initialTarget={m.invoiceTarget}
                      field="invoice_count"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
