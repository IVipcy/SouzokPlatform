'use client'

// 要対応（期日超過）詳細ページ。バナー(要確認/要注意)から遷移してくる。
// 上部タブで「入金期日超過（請求）」「タスク期日超過（案件）」を切替。
// タスク側は 進捗列に task_kind別の遅延タスクを複数リンクで並べる（古い順）。

import { useState } from 'react'
import Link from 'next/link'
import type { OverdueSeverity } from '@/lib/overdue'

const yen = (v: number) => `¥${Math.round(v).toLocaleString('ja-JP')}`

type BillLite = {
  id: string; caseId: string; caseName: string; typeLabel: string; firmLabel: string
  amount: number; dueDate: string; over: number; severity: OverdueSeverity
}
type OverdueTaskLite = { id: string; title: string; due_date: string; over: number; severity: OverdueSeverity | null; priority?: string | null; kind?: 'case' | 'system' }
type CaseLite = {
  id: string; case_number: string; deal_name: string; status: string
  client_name: string | null
  overdue: {
    severity: OverdueSeverity; countTasks: number; countCase: number; countSystem: number
    caseTasks: OverdueTaskLite[]; systemTasks: OverdueTaskLite[]
  } | null
  progressCaseDone: number; progressCaseTotal: number
  progressSystemDone: number; progressSystemTotal: number
}

type Section = 'payment' | 'task' | 'caseAlert'
type CaseAlertLite = {
  caseId: string; caseNumber: string; dealName: string; category: string
  severity: OverdueSeverity; href?: string
  since?: string | null; days?: number; reason?: string
}

export default function OverdueDetailClient({ bills, cases, caseAlerts = [], sev: _sev, initialSection = 'payment' }: {
  bills: BillLite[]; cases: CaseLite[]; caseAlerts?: CaseAlertLite[]; sev: OverdueSeverity | null
  initialSection?: Section
}) {
  // タブ初期値: 請求超過があれば payment、なければ task／案件アラートを優先
  const smartInitial: Section = bills.length > 0 ? 'payment' : cases.length > 0 ? 'task' : caseAlerts.length > 0 ? 'caseAlert' : initialSection
  const [section, setSection] = useState<Section>(smartInitial)

  // タスクタブは「1行＝1タスク」。どの案件のどのタスクが何日遅れているかだけを見せる。
  // 進捗バーは案件一覧で見られるので、ここでは出さない。
  const flatTasks = cases.flatMap(c => [...(c.overdue?.caseTasks ?? []), ...(c.overdue?.systemTasks ?? [])]
    .map(t => ({ ...t, caseId: c.id, caseNumber: c.case_number, dealName: c.deal_name })))
    .sort((a, b) => b.over - a.over)

  const TabBtn = ({ s, label, count }: { s: Section; label: string; count: number }) => {
    const active = section === s
    return (
      <button
        type="button"
        onClick={() => setSection(s)}
        className={`px-4 py-2 -mb-px border-b-2 text-[13px] font-semibold transition-colors ${active ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
      >
        {label}<span className={`ml-1.5 text-[11px] font-mono ${active ? 'text-brand-500' : 'text-gray-400'}`}>{count}</span>
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {/* タブ */}
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        <TabBtn s="payment" label="入金期日超過（請求）" count={bills.length} />
        <TabBtn s="task" label="タスク期日超過" count={flatTasks.length} />
        <TabBtn s="caseAlert" label="案件アラート" count={caseAlerts.length} />
      </div>

      {section === 'caseAlert' && (
        <section>
          {caseAlerts.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-[13px] text-gray-400">該当なし</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-200 overflow-hidden">
              {caseAlerts.map(a => (
                <div key={a.caseId + a.category} className="flex items-start gap-3 px-4 py-3">
                  <span className={`flex-none mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${a.severity === 'chui' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{a.category}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-800 truncate">{a.dealName}<span className="ml-2 text-[11px] font-mono font-normal text-gray-500">{a.caseNumber}</span></div>
                    {/* なぜ出たのか（条件）と、起点日からの経過。覚えていなくても緊急度が判断できるようにする。 */}
                    {a.reason && <div className="text-[11.5px] text-gray-600 mt-0.5">{a.reason}</div>}
                    {a.since && (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        起点 {a.since}
                        {a.days != null && <> ・ <span className={`font-bold ${a.severity === 'chui' ? 'text-[#C0392B]' : 'text-[#B5651D]'}`}>{a.days}営業日経過</span></>}
                      </div>
                    )}
                  </div>
                  <Link href={a.href ?? `/cases/${a.caseId}?tab=assignees`} className="flex-none px-3 py-1.5 rounded-md text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50 whitespace-nowrap">{a.href ? '開く' : '割振り・アサイン'}</Link>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {section === 'payment' && (
        <section>
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
                  <tbody className="divide-y divide-gray-200">
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
      )}

      {section === 'task' && (
        <section>
          {flatTasks.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-[13px] text-gray-400">該当なし</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 820 }}>
                  <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold whitespace-nowrap w-32">案件管理番号</th>
                      <th className="px-3 py-2 text-left font-bold whitespace-nowrap w-40">案件名</th>
                      <th className="px-3 py-2 text-left font-bold">超過しているタスク</th>
                      <th className="px-3 py-2 text-left font-bold whitespace-nowrap w-24">期日</th>
                      <th className="px-3 py-2 text-left font-bold whitespace-nowrap w-24">超過日数</th>
                      <th className="px-3 py-2 text-left font-bold whitespace-nowrap w-24">優先度</th>
                      <th className="px-3 py-2 text-left font-bold whitespace-nowrap w-24">重要度</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {flatTasks.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap">
                          <Link href={`/cases/${t.caseId}`} className="text-brand-700 hover:underline">{t.caseNumber}</Link>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-gray-800 truncate">{t.dealName}</td>
                        <td className="px-3 py-2.5">
                          <Link href={`/tasks/${t.id}`} className="text-[12.5px] font-semibold text-gray-800 hover:text-brand-700 hover:underline">{t.title}</Link>
                          {t.kind && <span className="ml-2 text-[10.5px] px-1 py-0.5 rounded bg-gray-100 text-gray-500">{t.kind === 'case' ? '事務管理' : '受注/管理'}</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-gray-600 whitespace-nowrap">{t.due_date}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-flex items-baseline gap-0.5">
                            <span className={`text-[18px] font-bold leading-none tabular-nums ${t.severity === 'chui' ? 'text-[#C0392B]' : t.severity === 'kakunin' ? 'text-[#B5651D]' : 'text-gray-500'}`}>{t.over}</span>
                            <span className="text-[10.5px] text-gray-500">日</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap"><PriorityBadge p={t.priority} /></td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {t.severity === 'chui'
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: '#C0392B' }}>要注意</span>
                            : t.severity === 'kakunin'
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: '#B5651D' }}>要確認</span>
                            : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-500 bg-gray-100">軽微</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// タスクの優先度。超急ぎ＝赤、急ぎ＝琥珀、通常＝無地。
function PriorityBadge({ p }: { p?: string | null }) {
  if (!p || p === '通常') return <span className="text-[11.5px] text-gray-400">通常</span>
  const cls = p === '超急ぎ' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${cls}`}>{p}</span>
}
