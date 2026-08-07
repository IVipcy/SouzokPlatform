'use client'

// マイページ「案件報告（受信）」の一覧。
//
// 案件報告は受注担当ひとりに溜まりがちで、月に何十件も来ると確認が止まる。
// そこで、受注担当・管理担当が同じチームの案件は チームの誰のマイページにも出し、
// 手が空いている人が確認できるようにした（確認は案件詳細で行う）。
// 報告の宛先と通知は今までどおり受注担当だけ。ここは「見える・押せる」範囲だけを広げている。

import { useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'

export type ReportInboxRow = {
  reportId: string
  case_id: string
  case_number: string
  deal_name: string
  requesterName: string | null
  requestedDate: string | null
  reviewPoint: string | null
  status: '依頼中' | '確認済'
  confirmedDate: string | null
  confirmerName: string | null
  kind: 'progress_check' | 'work_complete' | 'case_reopen' | 'delivery_confirm'
  scope: 'own' | 'team'
}

const KIND_LABEL = { progress_check: '案件報告', work_complete: '業務完了申請', case_reopen: '案件再オープン', delivery_confirm: '納品確認申請' } as const
const KIND_CHIP = {
  progress_check: 'bg-sky-100 text-sky-700 border-sky-200',
  work_complete: 'bg-amber-100 text-amber-800 border-amber-300',
  case_reopen: 'bg-purple-100 text-purple-700 border-purple-300',
  delivery_confirm: 'bg-emerald-100 text-emerald-700 border-emerald-300',
} as const

type Scope = 'all' | 'own' | 'team'

function ScopeBtn({ v, label, count, current, onSelect }: { v: Scope; label: string; count: number; current: Scope; onSelect: (s: Scope) => void }) {
  const on = current === v
  return (
    <button type="button" onClick={() => onSelect(v)}
      className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold border transition ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
      {label}<span className={`ml-1 font-mono ${on ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>
    </button>
  )
}

export default function CaseReportInbox({ rows, pendingOwnCount }: { rows: ReportInboxRow[]; pendingOwnCount: number }) {
  const [scope, setScope] = useState<Scope>('all')
  const shown = rows.filter(r => scope === 'all' || r.scope === scope)
  const teamCount = rows.filter(r => r.scope === 'team').length

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
        <ClipboardCheck className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-gray-900">案件報告（受信）</h3>
        <span className="text-[11px] text-gray-400 ml-2">自分の案件で報告中 {pendingOwnCount} 件</span>
        <div className="ml-auto flex items-center gap-1.5">
          <ScopeBtn v="all" label="すべて" count={rows.length} current={scope} onSelect={setScope} />
          <ScopeBtn v="own" label="自分の案件" count={rows.length - teamCount} current={scope} onSelect={setScope} />
          <ScopeBtn v="team" label="チーム" count={teamCount} current={scope} onSelect={setScope} />
        </div>
      </div>
      <p className="px-4 pt-2 text-[11px] text-gray-400">
        チームの案件も確認できます。案件名を押して内容を見てから「確認する」を押してください。
      </p>
      {shown.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">受信中の案件報告はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 1100 }}>
            <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-24">担当</th>
                <th className="px-3 py-2 text-left font-medium">分類</th>
                <th className="px-3 py-2 text-left font-medium">案件管理番号</th>
                <th className="px-3 py-2 text-left font-medium">案件名</th>
                <th className="px-3 py-2 text-left font-medium">報告者</th>
                <th className="px-3 py-2 text-left font-medium">報告日</th>
                <th className="px-3 py-2 text-left font-medium">内容</th>
                <th className="px-3 py-2 text-left font-medium">ステータス</th>
                <th className="px-3 py-2 text-left font-medium">確認者</th>
                <th className="px-3 py-2 text-left font-medium">確認日</th>
                <th className="px-3 py-2 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map(r => {
                const isApproval = r.kind === 'work_complete' || r.kind === 'delivery_confirm'
                const btnLabel = isApproval ? '承認/差戻し' : '確認する'
                return (
                  <tr key={r.reportId} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-semibold border ${r.scope === 'own' ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {r.scope === 'own' ? '自分の案件' : 'チーム'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-semibold border ${KIND_CHIP[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{r.case_number}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${r.case_id}?tab=progress&sub=report&openReport=${r.reportId}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[220px]">{r.deal_name}</Link>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{r.requesterName || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{r.requestedDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-pre-wrap max-w-[240px]">{r.reviewPoint || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${r.status === '確認済' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{r.status === '依頼中' ? '報告中' : '確認済'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{r.confirmerName || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{r.confirmedDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      {r.status === '依頼中' && (
                        <Link href={`/cases/${r.case_id}?tab=progress&sub=report&openReport=${r.reportId}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50 whitespace-nowrap">{btnLabel}</Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
