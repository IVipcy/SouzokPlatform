import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type { CaseFlag } from '@/lib/dashboardMetrics'
import UserAvatar from '@/components/ui/UserAvatar'

export type ProgressCaseRow = {
  id: string
  caseNumber: string
  dealName: string
  // 受注担当
  salesId?: string | null
  salesName?: string | null
  salesAvatarUrl?: string | null
  // 管理担当
  managerId: string | null
  managerName: string | null
  managerAvatarColor: string | null
  managerAvatarUrl?: string | null
  // 担当者列で表示する人の主たるロール（色決定用）
  managerPrimaryRole?: 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | null
  // 受注内容（手続区分）
  procedureType?: string[] | null
  expectedCompletionDate: string | null
  clientName: string | null
  flag: CaseFlag | null  // null = 完了予定日未設定（フラグ判定対象外）
  myRolesOnCase?: ('sales' | 'manager')[]
}

type Props = {
  rowsWithFlag: ProgressCaseRow[]   // 完了予定日が設定されているもの
  rowsUnset: ProgressCaseRow[]      // 完了予定日が未設定のもの
  showRoleBadge: boolean
}

const FLAG_DEF: Record<CaseFlag, { label: string; cls: string }> = {
  purple: { label: '紫', cls: 'bg-purple-600 text-white' },
  red:    { label: '赤', cls: 'bg-red-600 text-white' },
  yellow: { label: '黄', cls: 'bg-yellow-400 text-gray-900' },
  blue:   { label: '青', cls: 'bg-blue-600 text-white' },
}

export default function ProgressCaseTable({ rowsWithFlag, rowsUnset, showRoleBadge }: Props) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">案件一覧</h3>
        {rowsWithFlag.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
            該当する案件はありません
          </div>
        ) : (
          <CasesTable rows={rowsWithFlag} showRoleBadge={showRoleBadge} />
        )}
      </section>

      {rowsUnset.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" strokeWidth={2.25} />
            <span>完了予定日が未設定の案件</span>
            <span className="text-xs font-normal text-amber-700 px-2 py-0.5 bg-amber-50 rounded">
              {rowsUnset.length}件 — 設定漏れの可能性
            </span>
          </h3>
          <CasesTable rows={rowsUnset} showRoleBadge={showRoleBadge} hideFlagColumn />
        </section>
      )}
    </div>
  )
}

function CasesTable({ rows, showRoleBadge, hideFlagColumn = false }: {
  rows: ProgressCaseRow[]
  showRoleBadge: boolean
  hideFlagColumn?: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="text-[13px] border-collapse w-full" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          {!hideFlagColumn && <col style={{ width: 70 }} />}
          <col style={{ width: 120 }} />
          <col style={{ width: 240 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 140 }} />
        </colgroup>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
            {!hideFlagColumn && <th className="px-2 py-2 text-center font-semibold">フラグ</th>}
            <th className="px-2.5 py-2 text-left font-semibold">案件管理番号</th>
            <th className="px-2.5 py-2 text-left font-semibold">案件名</th>
            <th className="px-2.5 py-2 text-left font-semibold">受注担当</th>
            <th className="px-2.5 py-2 text-left font-semibold">管理担当</th>
            <th className="px-2.5 py-2 text-left font-semibold">受注内容</th>
            <th className="px-2.5 py-2 text-left font-semibold">完了予定日</th>
            <th className="px-2.5 py-2 text-left font-semibold">依頼者名</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
            return (
              <tr key={r.id} className={`border-b border-gray-100 hover:bg-brand-50/30 ${rowBg}`}>
                {!hideFlagColumn && (
                  <td className="px-2 py-2 text-center">
                    {r.flag !== null && (
                      <span className={`inline-flex items-center justify-center w-10 h-6 text-[13px] font-bold rounded ${FLAG_DEF[r.flag].cls}`}>
                        {FLAG_DEF[r.flag].label}
                      </span>
                    )}
                  </td>
                )}
                <td className="px-2.5 py-2 font-mono">
                  <Link href={`/cases/${r.id}`} className="text-brand-700 hover:underline font-semibold">
                    {r.caseNumber}
                  </Link>
                </td>
                <td className="px-2.5 py-2 text-gray-900">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{r.dealName}</span>
                    {showRoleBadge && r.myRolesOnCase && r.myRolesOnCase.length > 0 && (
                      <span className="flex gap-1 flex-shrink-0">
                        {r.myRolesOnCase.includes('sales') && (
                          <span className="text-[13px] font-mono px-1 py-0.5 rounded border bg-brand-50 text-brand-700 border-brand-200">受注</span>
                        )}
                        {r.myRolesOnCase.includes('manager') && (
                          <span className="text-[13px] font-mono px-1 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200">管理</span>
                        )}
                      </span>
                    )}
                  </div>
                </td>
                {/* 受注担当 */}
                <td className="px-2.5 py-2 text-gray-700">
                  {r.salesName && r.salesId ? (
                    <Link
                      href={`/profile/${r.salesId}`}
                      className="flex items-center gap-1.5 hover:text-brand-700 hover:underline"
                    >
                      <UserAvatar name={r.salesName} role="sales" url={r.salesAvatarUrl} size="sm" />
                      <span className="truncate">{r.salesName}</span>
                    </Link>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                {/* 管理担当 */}
                <td className="px-2.5 py-2 text-gray-700">
                  {r.managerName && r.managerId ? (
                    <Link
                      href={`/profile/${r.managerId}`}
                      className="flex items-center gap-1.5 hover:text-brand-700 hover:underline"
                    >
                      <UserAvatar
                        name={r.managerName}
                        role={r.managerPrimaryRole ?? 'manager'}
                        url={r.managerAvatarUrl}
                        size="sm"
                      />
                      <span className="truncate">{r.managerName}</span>
                    </Link>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                {/* 受注内容（手続区分） */}
                <td className="px-2.5 py-2">
                  {r.procedureType && r.procedureType.filter(Boolean).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {r.procedureType.filter(Boolean).map(p => (
                        <span key={p} className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">{p}</span>
                      ))}
                    </div>
                  ) : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-2.5 py-2 font-mono text-gray-700">
                  {r.expectedCompletionDate ?? <span className="text-gray-400">未設定</span>}
                </td>
                <td className="px-2.5 py-2 text-gray-700 truncate">
                  {r.clientName ?? <span className="text-gray-400">-</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
