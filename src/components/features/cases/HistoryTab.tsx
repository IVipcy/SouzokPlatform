'use client'

import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
}

export default function HistoryTab({ caseData }: Props) {
  return (
    <div style={{ maxWidth: 700 }}>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <span className="text-sm">📅</span>
          <h3 className="text-[13px] font-semibold text-gray-900">活動履歴</h3>
        </div>
        <div className="px-4 py-3">
          {/* Timeline items */}
          <div className="space-y-0">
            <TimelineItem
              color="#2563EB"
              icon="📋"
              title="案件作成"
              date={caseData.created_at ? new Date(caseData.created_at).toLocaleDateString('ja-JP') : '—'}
              note={`${caseData.case_number} ${caseData.deal_name}`}
            />
            {caseData.order_date && (
              <TimelineItem
                color="#16A34A"
                icon="✅"
                title="受注"
                date={caseData.order_date}
                note="案件を受注しました"
              />
            )}
            <TimelineItem
              color="#6B7280"
              icon="📝"
              title="ステータス変更"
              date={caseData.updated_at ? new Date(caseData.updated_at).toLocaleDateString('ja-JP') : '—'}
              note={`現在のステータス: ${caseData.status}`}
            />
          </div>
          <div className="text-xs text-gray-400 text-center py-4 mt-3 border-t border-gray-50">
            詳細な操作ログは今後の機能追加で表示されます
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineItem({ color, icon, title, date, note }: {
  color: string
  icon: string
  title: string
  date: string
  note?: string
}) {
  return (
    <div className="flex gap-3 pb-4 relative">
      {/* Line */}
      <div className="flex flex-col items-center">
        <div
          className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] z-10 flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          <span>{icon}</span>
        </div>
        <div className="w-px flex-1 bg-gray-200 mt-1" />
      </div>
      {/* Content */}
      <div className="flex-1 pb-1">
        <div className="text-xs font-semibold text-gray-700 mb-0.5">{title}</div>
        <div className="text-[10px] text-gray-400 font-mono">{date}</div>
        {note && <div className="text-[11px] text-gray-500 mt-1 leading-relaxed">{note}</div>}
      </div>
    </div>
  )
}
