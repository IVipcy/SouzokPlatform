'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClipboardList, Check } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

export type OfficeRow = {
  caseId: string
  caseNumber: string
  dealName: string
  osUpdatedAt: string | null
  teamName: string | null
  salesName: string | null
  managerName: string | null
  advancePaid: boolean          // 前受金入金（system判定）
  filingStatus: '未' | '済'      // ファイル化（プルダウンで変更）
}

// 事務管理担当ダッシュボード：作業着手待ち案件一覧。全部『済』で着手OK→対応中→案件詳細でタスク生成。
export default function OfficeManagerDashboard({ rows, currentMemberId, currentMemberName }: {
  rows: OfficeRow[]
  currentMemberId: string | null
  currentMemberName: string | null
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  const setFiling = async (caseId: string, val: '未' | '済') => {
    const { error } = await createClient().from('cases').update({ filing_status: val }).eq('id', caseId)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    router.refresh()
  }

  const startOk = async (row: OfficeRow) => {
    setBusyId(row.caseId)
    const { error } = await createClient().from('cases')
      .update({ status: '対応中', work_start_ok_at: new Date().toISOString(), work_start_ok_by: currentMemberId, work_start_ok_name: currentMemberName })
      .eq('id', row.caseId)
    setBusyId(null)
    if (error) { showToast(`着手に失敗: ${error.message}`, 'error'); return }
    showToast('着手OK：作業進行中にしました', 'success')
    // 案件詳細へ遷移（タスクは着手準備の「タスク出し」で管理担当が作成済み）
    router.push(`/cases/${row.caseId}`)
  }

  const TH = 'px-2.5 py-2 text-left font-semibold whitespace-nowrap'
  const YesNo = ({ ok }: { ok: boolean }) => ok
    ? <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><Check className="w-3.5 h-3.5" strokeWidth={2.5} />済</span>
    : <span className="text-gray-400">未</span>

  return (
    <div>
      <PageHeader eyebrow="Dashboard" title="事務管理担当ダッシュボード" icon={ClipboardList} description="作業着手待ち案件一覧（作業着手準備）。前受金入金・ファイル化が済むと着手OK（作業進行中へ）。" />

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 text-[14px] font-bold text-gray-900">作業着手待ち案件一覧 <span className="text-[12px] font-normal text-gray-400 ml-1">{rows.length}件</span></div>
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-gray-400">作業着手準備の案件はありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 920 }}>
              <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
                <tr>
                  <th className={TH}>OS最終更新日</th>
                  <th className={TH}>案件番号</th>
                  <th className={TH}>案件名</th>
                  <th className={TH}>チーム</th>
                  <th className={TH}>受注担当</th>
                  <th className={TH}>管理担当</th>
                  <th className={`${TH} text-center`}>前受金入金<span className="block text-[10px] font-normal text-gray-400">system</span></th>
                  <th className={`${TH} text-center`}>ファイル化</th>
                  <th className={`${TH} text-center w-28`}>着手</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => {
                  const canStart = r.advancePaid && r.filingStatus === '済'
                  return (
                    <tr key={r.caseId} className="hover:bg-gray-50/60">
                      <td className="px-2.5 py-2 font-mono text-gray-600">{r.osUpdatedAt ?? '—'}</td>
                      <td className="px-2.5 py-2 font-mono text-gray-500">{r.caseNumber}</td>
                      <td className="px-2.5 py-2"><Link href={`/cases/${r.caseId}`} className="font-semibold text-gray-800 hover:text-brand-600 hover:underline">{r.dealName}</Link></td>
                      <td className="px-2.5 py-2 text-gray-700">{r.teamName ?? '—'}</td>
                      <td className="px-2.5 py-2 text-gray-700">{r.salesName ?? '—'}</td>
                      <td className="px-2.5 py-2 text-gray-700">{r.managerName ?? <span className="text-gray-300">未</span>}</td>
                      <td className="px-2.5 py-2 text-center"><YesNo ok={r.advancePaid} /></td>
                      <td className="px-2.5 py-2 text-center">
                        <select value={r.filingStatus} onChange={e => setFiling(r.caseId, e.target.value as '未' | '済')} className={`px-1.5 py-1 text-[12px] border rounded outline-none focus:border-brand-500 ${r.filingStatus === '済' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold' : 'border-gray-200 bg-white text-gray-500'}`}>
                          <option value="未">未</option>
                          <option value="済">済</option>
                        </select>
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        {canStart ? (
                          <button type="button" onClick={() => startOk(r)} disabled={busyId === r.caseId} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                            {busyId === r.caseId ? '着手中…' : '着手OK'}
                          </button>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1.5 rounded-md text-[12px] font-semibold text-gray-500 bg-gray-100 border border-gray-200">着手不可</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
