'use client'

// 要対応（期日超過）詳細ページ。バナーから遷移してくる。
// 入金超過の請求と、案件別の超過（事務管理・受注/管理担当タスクいずれか超過あり）を表示。

import Link from 'next/link'
import type { OverdueSeverity } from '@/lib/overdue'

const yen = (v: number) => `¥${Math.round(v).toLocaleString('ja-JP')}`

type BillLite = {
  id: string; caseId: string; caseName: string; typeLabel: string; firmLabel: string
  amount: number; dueDate: string; over: number; severity: OverdueSeverity
}
type CaseLite = {
  id: string; case_number: string; deal_name: string; status: string
  client_name: string | null
  overdue: { severity: OverdueSeverity; countTasks: number; countCase: number; countSystem: number } | null
  progressCaseDone: number; progressCaseTotal: number
  progressSystemDone: number; progressSystemTotal: number
}

export default function OverdueDetailClient({ bills, cases, sev: _sev }: { bills: BillLite[]; cases: CaseLite[]; sev: OverdueSeverity | null }) {
  return (
    <div className="space-y-6">
      {/* 入金超過の請求 */}
      <section>
        <h2 className="text-[14px] font-bold text-gray-900 mb-2">入金期日超過（請求）<span className="text-[11px] text-gray-400 font-normal ml-2">{bills.length}件</span></h2>
        {bills.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-[13px] text-gray-400">該当なし</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 640 }}>
                <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">案件</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">請求</th>
                    <th className="px-3 py-2 text-right font-bold whitespace-nowrap">金額</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">入金期日</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">超過</th>
                    <th className="px-3 py-2 text-center font-bold whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bills.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 font-medium text-gray-800">{b.caseName || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{b.firmLabel && <span className="text-[10px] mr-1 px-1 py-0.5 rounded bg-gray-100 text-gray-600">{b.firmLabel}</span>}{b.typeLabel}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{yen(b.amount)}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-600 whitespace-nowrap">{b.dueDate}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-baseline gap-0.5">
                          <span className={`text-[20px] font-bold leading-none tabular-nums ${b.severity === 'chui' ? 'text-[#C0392B]' : 'text-[#B5651D]'}`}>{b.over}</span>
                          <span className="text-[10.5px] text-gray-500">日超過</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <Link href={`/billing?case=${b.caseId}&invoice=${b.id}`} className="inline-flex items-center px-2.5 py-1 rounded-md text-[11.5px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50">入金確認</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 案件別（タスク期日超過があるもの・管理案件一覧と同じレイアウトの一部） */}
      <section>
        <h2 className="text-[14px] font-bold text-gray-900 mb-2">タスク期日超過（案件）<span className="text-[11px] text-gray-400 font-normal ml-2">{cases.length}件</span></h2>
        {cases.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-[13px] text-gray-400">該当なし</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 640 }}>
                <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">案件管理番号</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">案件名</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">依頼者</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">超過タスク（事務管理）</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">超過タスク（受注/管理）</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">事務管理タスク進捗</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">受注/管理タスク進捗</th>
                    <th className="px-3 py-2 text-left font-bold whitespace-nowrap">重要度</th>
                    <th className="px-3 py-2 text-center font-bold whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cases.map(c => {
                    const o = c.overdue!
                    // 超過タスクがあるので常に赤バー
                    const pctCase = c.progressCaseTotal > 0 ? Math.round((c.progressCaseDone / c.progressCaseTotal) * 100) : 0
                    const pctSys = c.progressSystemTotal > 0 ? Math.round((c.progressSystemDone / c.progressSystemTotal) * 100) : 0
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 font-mono text-[12px]"><Link href={`/cases/${c.id}`} className="text-brand-700 hover:underline">{c.case_number}</Link></td>
                        <td className="px-3 py-2.5 font-medium text-gray-800">{c.deal_name}</td>
                        <td className="px-3 py-2.5 text-gray-600">{c.client_name ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{o.countCase > 0 ? `${o.countCase} 件` : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{o.countSystem > 0 ? `${o.countSystem} 件` : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5">
                          {c.progressCaseTotal > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
                                <div className="h-full bg-red-500 rounded-full" style={{ width: `${pctCase}%` }} />
                              </div>
                              <span className="text-[11px] font-mono flex-shrink-0 text-red-600 font-bold">{c.progressCaseDone}/{c.progressCaseTotal}</span>
                            </div>
                          ) : <span className="text-[12px] text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {c.progressSystemTotal > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[60px]">
                                <div className="h-full bg-red-500 rounded-full" style={{ width: `${pctSys}%` }} />
                              </div>
                              <span className="text-[11px] font-mono flex-shrink-0 text-red-600 font-bold">{c.progressSystemDone}/{c.progressSystemTotal}</span>
                            </div>
                          ) : <span className="text-[12px] text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {o.severity === 'chui'
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: '#C0392B' }}>要注意</span>
                            : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: '#B5651D' }}>要確認</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <Link href={`/cases/${c.id}?tab=tasks`} className="inline-flex items-center px-2.5 py-1 rounded-md text-[11.5px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50">タスクを開く</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
