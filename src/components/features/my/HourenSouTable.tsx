'use client'

// 報連相の一覧（マイページの受信ぶん・事務管理ダッシュボードの送信ぶんで共用）。
// 未回答／確認中／回答済 のサブタブで分ける。
// 要対応のものだけ、送信日からの営業日超過をバッジで出す（1営業日で要確認・3営業日で要注意）。

import { useState } from 'react'
import Link from 'next/link'
import { Eye, Check, CornerDownLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import {
  CASE_REPORT_STATUS_LABEL, CASE_REPORT_TABS, CASE_REPORT_KIND_STYLE,
  caseReportOverdueDays, caseReportSeverity,
} from '@/lib/caseReports'
import type { CaseReportStatus } from '@/types'

export type HourenSouItem = {
  id: string
  caseId: string
  caseNumber: string
  dealName: string
  kind: string
  message: string | null
  requestedDate: string | null
  status: CaseReportStatus
  /** 受信ぶん＝送信者名／送信ぶん＝宛先名 */
  personLabel: string
  confirmerName: string | null
  confirmedDate: string | null
  /** 自分が送ったもの（受信一覧で「確認中にする」を出さない） */
  isMine?: boolean
}

type Props = {
  rows: HourenSouItem[]
  /** received=自分あて（操作できる）／sent=自分が出した（見るだけ） */
  mode: 'received' | 'sent'
  title: string
  note?: string
  todayStr: string
}

export default function HourenSouTable({ rows, mode, title, note, todayStr }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<CaseReportStatus>('依頼中')
  const [busyId, setBusyId] = useState<string | null>(null)

  const counts = CASE_REPORT_TABS.map(t => ({ ...t, n: rows.filter(r => r.status === t.key).length }))
  const shown = rows.filter(r => r.status === tab)

  // 「確認中にする」＝見て動き出したことを送り手に見せる（回答はまだ）
  const markReviewing = async (r: HourenSouItem) => {
    if (busyId) return
    setBusyId(r.id)
    const supabase = createClient()
    const { error } = await supabase.from('case_reports')
      .update({ status: '確認中', reviewing_at: new Date().toISOString() })
      .eq('id', r.id)
    setBusyId(null)
    if (error) { showToast('確認中にできませんでした', 'error'); return }
    showToast('確認中にしました', 'success')
    router.refresh()
  }

  const TH = 'px-3 py-2 text-left font-medium whitespace-nowrap'
  // 操作ボタン（高さ固定・折り返しなし。案件詳細の報連相表と同じ形）
  const ROW_BTN = 'inline-flex items-center gap-1 h-[26px] px-2.5 text-[12px] font-semibold border rounded-md whitespace-nowrap shrink-0'

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <h3 className="text-[14px] font-bold text-brand-900">{title}</h3>
        <span className="text-[12px] text-gray-400">{rows.length}件</span>
        {note && <span className="ml-auto text-[11px] text-gray-400">{note}</span>}
      </div>

      {/* 未回答 / 確認中 / 回答済 */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1.5 flex-wrap">
        {counts.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-2.5 py-0.5 rounded-full text-[12px] font-semibold border transition-colors ${
              tab === t.key ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-white text-gray-400 border-gray-200 hover:text-gray-600'}`}>
            {t.label}<span className="ml-1 text-[11px] font-mono opacity-70">{t.n}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">この状態の報連相はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 980 }}>
            <thead className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600">
              <tr>
                <th className={TH}>種別</th>
                <th className={TH}>案件管理番号</th>
                <th className={TH}>案件名</th>
                <th className={TH}>{mode === 'received' ? '送信者' : '宛先'}</th>
                <th className={TH}>送信日</th>
                <th className={TH}>内容</th>
                <th className={TH}>ステータス</th>
                <th className={TH}>確認者 / 確認日</th>
                <th className="px-3 py-2 w-44 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {shown.map(r => {
                const like = { kind: r.kind, status: r.status, requested_date: r.requestedDate }
                const sev = caseReportSeverity(like, todayStr)
                const over = caseReportOverdueDays(like, todayStr)
                return (
                  <tr key={r.id} className={`hover:bg-gray-50/60 ${sev === 'chui' ? 'bg-orange-50/40' : sev === 'kakunin' ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-semibold border ${CASE_REPORT_KIND_STYLE[r.kind] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>{r.kind}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{r.caseNumber}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${r.caseId}?tab=progress&sub=memo&openReport=${r.id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[220px]">{r.dealName}</Link>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{r.personLabel || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-[12px] font-mono text-gray-600">{r.requestedDate ?? '—'}</span>
                      {sev && (
                        <span className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-bold ${sev === 'chui' ? 'bg-[#DC2626] text-white' : 'bg-[#EAB308] text-white'}`}>
                          {over}営業日超過
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-pre-wrap max-w-[260px]">{r.message || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${
                        r.status === '確認済' ? 'bg-emerald-50 text-emerald-700'
                        : r.status === '確認中' ? 'bg-sky-50 text-sky-700'
                        : 'bg-amber-50 text-amber-700'}`}>{CASE_REPORT_STATUS_LABEL[r.status] ?? r.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-nowrap">
                      {r.confirmerName ? `${r.confirmerName}${r.confirmedDate ? ` / ${r.confirmedDate}` : ''}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {/* 高さを揃えて横並び固定（折り返すと段差になる） */}
                      <div className="flex items-center justify-end gap-1.5">
                        {mode === 'received' && !r.isMine && r.status !== '確認済' && (
                          <>
                            {/* 「確認中にする」は要対応だけ。情報共有は放置してもアラートに出ないため中途半端な状態を作らない */}
                            {r.kind === '要対応' && r.status === '依頼中' && (
                              <button type="button" onClick={() => markReviewing(r)} disabled={busyId === r.id}
                                className={ROW_BTN + ' text-sky-700 bg-sky-50 border-sky-200 hover:bg-sky-100 disabled:opacity-50'}>
                                <Eye className="w-3 h-3" strokeWidth={2.25} />確認中にする
                              </button>
                            )}
                            <Link href={`/cases/${r.caseId}?tab=progress&sub=memo&openReport=${r.id}`}
                              className={ROW_BTN + ' text-brand-700 bg-white border-brand-300 hover:bg-brand-50'}>
                              {r.kind === '要対応'
                                ? <><CornerDownLeft className="w-3 h-3" strokeWidth={2.25} />回答する</>
                                : <><Check className="w-3 h-3" strokeWidth={2.25} />確認した</>}
                            </Link>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
