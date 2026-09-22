'use client'

// 案件報告（progress_check）の確認モーダルの中身。受注担当が読むところ。
//   見出し（依頼者名様 受注区分 → 案件へ）／管理担当者・報告日時／状態のバッジ
//   案件の現状（フェーズ・最終連絡日・完了予定日＝報告した時点の値）
//   報告内容／次回報告までの対応（ネクストアクション・担当者・対応期日）／確認メモ
// 保存や「ネクストアクションの追加」（タスク化）は親（HistoryTab）が持つ。

import Link from 'next/link'
import { ExternalLink, User, CalendarDays, AlertCircle } from 'lucide-react'
import { reportStateLabel, reportStateChip } from '@/lib/constants'
import { categoriesOf } from '@/lib/serviceMaster'
import type { CaseRow, MemberRow, ProgressReportRow } from '@/types'

const jp = (d: string | null | undefined) => {
  if (!d) return '—'
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : d
}
const jpTime = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ProgressReportConfirmBody({ report, caseData, allMembers, comment, onComment, showCaseLink = true }: {
  report: ProgressReportRow
  caseData: CaseRow
  allMembers: MemberRow[]
  comment: string
  onComment: (v: string) => void
  showCaseLink?: boolean
}) {
  const name = (id: string | null | undefined) => (id ? allMembers.find(m => m.id === id)?.name ?? '—' : '—')
  const cats = categoriesOf(caseData.service_category, caseData.service_category_2)
  const heading = `${caseData.clients?.name ? `${caseData.clients.name}様` : caseData.deal_name}${cats.length > 0 ? `　${cats.join('・')}業務` : ''}`
  const state = reportStateLabel(report.report_state)
  const hasNext = !!(report.next_action || report.next_action_assignee_id || report.next_action_due)
  const th = 'bg-[#e6edf5] text-slate-700 px-3 py-2 text-[13px] font-medium border-r-2 border-white w-[9.5rem]'
  const td = 'px-3 py-2 text-[14px] text-gray-800'

  return (
    <div className="space-y-3.5">
      <div className="border border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2 text-[17px] font-bold text-brand-700">
          <span className="truncate">{heading}</span>
          {showCaseLink && <Link href={`/cases/${caseData.id}`} title="案件詳細を開く" className="flex-none text-brand-500 hover:text-brand-700"><ExternalLink className="w-4 h-4" /></Link>}
        </div>
        <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[12.5px] text-gray-600">
          <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5 text-gray-400" />管理担当者　<span className="text-gray-800 font-medium">{name(report.requester_id)}</span></span>
          <span className="text-gray-300">｜</span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-gray-400" />報告日時　<span className="text-gray-800 font-medium">{jp(report.requested_date)} {jpTime(report.created_at)}</span></span>
        </div>
        {state && (
          <span className={`mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-[12.5px] font-bold border ${reportStateChip(report.report_state)}`}>
            <AlertCircle className="w-3.5 h-3.5" />{state}
          </span>
        )}
      </div>

      <div>
        <div className="text-[13px] font-semibold text-gray-700 mb-1">案件の現状</div>
        <div className="border border-gray-200 divide-y divide-gray-100">
          <div className="flex"><span className={th}>フェーズ</span><span className={td}>{report.phase || '—'}</span></div>
          <div className="flex"><span className={th}>最終連絡日</span><span className={td}>{jp(report.last_contact_date)}</span></div>
          <div className="flex"><span className={th}>完了予定日</span><span className={td}>{jp(report.expected_completion_date)}</span></div>
        </div>
      </div>

      <div>
        <div className="text-[13px] font-semibold text-gray-700 mb-1">報告内容</div>
        <div className="bg-gray-50 border border-gray-200 px-3 py-2.5">
          <div className="text-[14px] text-gray-800 whitespace-pre-wrap">{report.review_point || <span className="text-gray-400">（指定なし）</span>}</div>
          <div className="text-[11.5px] text-gray-400 mt-1.5">{name(report.requester_id)} ・ {jp(report.requested_date)} 報告</div>
        </div>
      </div>

      <div>
        <div className="text-[13px] font-semibold text-gray-700 mb-1">次回報告までの対応</div>
        {hasNext ? (
          <div className="border border-brand-200 bg-brand-50/40">
            <div className="flex border-b border-brand-100"><span className="px-3 py-2 text-[13px] text-gray-600 w-[9.5rem] flex-none">ネクストアクション</span><span className="px-3 py-2 text-[14px] text-gray-800 whitespace-pre-wrap">{report.next_action || '—'}</span></div>
            <div className="grid grid-cols-2">
              <div className="px-3 py-2"><div className="text-[12px] text-gray-500">担当者</div><div className="text-[14px] text-gray-800">{name(report.next_action_assignee_id)}</div></div>
              <div className="px-3 py-2 border-l border-brand-100"><div className="text-[12px] text-gray-500">対応期日</div><div className="text-[14px] text-gray-800">{jp(report.next_action_due)}</div></div>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-gray-300 px-3 py-2 text-[12.5px] text-gray-400">なし（「ネクストアクションの追加」で、この報告からタスクを作れます）</div>
        )}
      </div>

      <div>
        <div className="text-[13px] font-semibold text-gray-700 mb-1">確認メモ <span className="font-normal text-gray-400">（任意）</span></div>
        <textarea value={comment} onChange={e => onComment(e.target.value)} placeholder="確認した事項を記録" rows={3}
          className="w-full text-[13px] border border-gray-200 px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 resize-y" />
      </div>
    </div>
  )
}
