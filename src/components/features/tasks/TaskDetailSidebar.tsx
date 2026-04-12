'use client'

import Link from 'next/link'
import { QIRow } from '@/components/ui/InlineFields'
import { getPhaseLabel } from '@/lib/phases'
import type { TaskRow, DocumentRow } from '@/types'

type Props = {
  task: TaskRow
  documents: DocumentRow[]
}

const DOC_STATUS_COLORS: Record<string, string> = {
  '完了': '#059669',
  '送付済': '#7C3AED',
  '返送待ち': '#D97706',
  '作成済': '#2563EB',
  '下書き': '#6B7280',
}

export default function TaskDetailSidebar({ task, documents }: Props) {
  const caseData = task.cases
  const clientData = caseData?.clients
  const ext = (task.ext_data ?? {}) as Record<string, unknown>

  // タイムラインイベント構築
  const timelineEvents: { date: string; label: string; color: string }[] = []
  if (task.created_at) {
    timelineEvents.push({ date: task.created_at.slice(0, 10), label: 'タスク起票', color: '#2563EB' })
  }
  // ext_dataから日付フィールドを抽出
  const dateFields: { key: string; label: string; color: string }[] = [
    { key: 'reqDate', label: '書類請求', color: '#7C3AED' },
    { key: 'sendDate', label: '郵送発送', color: '#EA580C' },
    { key: 'arrDate', label: '書類到着', color: '#059669' },
    { key: 'contactDate', label: '税理士連絡', color: '#D97706' },
    { key: 'processDate', label: '手続実施', color: '#2563EB' },
    { key: 'completeDate', label: '完了', color: '#059669' },
    { key: 'agentReqDate', label: '査定依頼', color: '#7C3AED' },
    { key: 'applyDate', label: '登記申請', color: '#EA580C' },
    { key: 'deliveryDate', label: '原本納品', color: '#059669' },
  ]
  dateFields.forEach(df => {
    const v = ext[df.key]
    if (v && typeof v === 'string') {
      timelineEvents.push({ date: v, label: df.label, color: df.color })
    }
  })
  if (task.status === '完了' && task.updated_at) {
    timelineEvents.push({ date: task.updated_at.slice(0, 10), label: 'タスク完了', color: '#059669' })
  }
  timelineEvents.sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="sticky top-[90px] flex flex-col gap-4">
      {/* 関連案件カード */}
      {caseData && (
        <div className="rounded-xl p-4 text-white bg-gradient-to-br from-blue-800 to-blue-600 shadow-lg">
          <h3 className="text-[15px] font-bold mb-2">{caseData.deal_name}</h3>
          <div className="space-y-1.5 text-[12px] opacity-90">
            {caseData.deceased_name && (
              <div className="flex justify-between">
                <span>被相続人</span>
                <span className="font-medium">{caseData.deceased_name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>管理番号</span>
              <span className="font-mono">{caseData.case_number}</span>
            </div>
            {caseData.date_of_death && (
              <div className="flex justify-between">
                <span>死亡日</span>
                <span className="font-mono">{caseData.date_of_death}</span>
              </div>
            )}
            {caseData.contract_type && (
              <div className="flex justify-between">
                <span>契約形態</span>
                <span>{caseData.contract_type}</span>
              </div>
            )}
            {caseData.location && (
              <div className="flex justify-between">
                <span>拠点</span>
                <span>{caseData.location}</span>
              </div>
            )}
          </div>
          <Link
            href={`/cases/${caseData.id}`}
            className="mt-3 block text-center text-[11px] font-semibold bg-white/20 hover:bg-white/30 rounded-lg py-1.5 transition-colors"
          >
            📋 案件詳細を開く →
          </Link>
        </div>
      )}

      {/* クイック情報 */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
        <h4 className="text-[11px] font-semibold text-gray-500 mb-1">⚡ クイック情報</h4>
        <QIRow label="フェーズ">
          <span className="text-xs font-semibold text-gray-700">{getPhaseLabel(task.phase)}</span>
        </QIRow>
        {task.category && (
          <QIRow label="カテゴリ">
            <span className="text-xs font-medium text-gray-700">{task.category}</span>
          </QIRow>
        )}
        <QIRow label="起票日">
          <span className="text-xs font-mono text-gray-600">{task.issued_date ?? task.created_at?.slice(0, 10)}</span>
        </QIRow>
        <QIRow label="期限">
          <span className={`text-xs font-mono ${
            task.due_date && new Date(task.due_date) < new Date() ? 'text-red-600 font-bold' : 'text-gray-600'
          }`}>
            {task.due_date ?? '未設定'}
          </span>
        </QIRow>
      </div>

      {/* タイムライン */}
      {timelineEvents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <h4 className="text-[11px] font-semibold text-gray-500 mb-2">🕐 タイムライン</h4>
          <div className="relative">
            {timelineEvents.map((ev, i) => (
              <div key={i} className="flex gap-3 mb-3 last:mb-0 relative">
                {/* 縦線 */}
                {i < timelineEvents.length - 1 && (
                  <div className="absolute left-[5px] top-[14px] bottom-[-8px] w-px bg-gray-200" />
                )}
                {/* ドット */}
                <div
                  className="w-[11px] h-[11px] rounded-full flex-shrink-0 mt-0.5 relative z-10 border-2 border-white"
                  style={{ backgroundColor: ev.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-gray-700">{ev.label}</div>
                  <div className="text-[10px] font-mono text-gray-400">{ev.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 関連ドキュメント */}
      {documents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <h4 className="text-[11px] font-semibold text-gray-500 mb-2">📁 関連ドキュメント <span className="text-gray-400">({documents.length}件)</span></h4>
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">📄</span>
                <span className="text-gray-700 font-medium truncate flex-1">{doc.name}</span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    color: DOC_STATUS_COLORS[doc.status] ?? '#6B7280',
                    backgroundColor: `${DOC_STATUS_COLORS[doc.status] ?? '#6B7280'}15`,
                  }}
                >
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
          {caseData && (
            <div className="mt-2 flex gap-2">
              <Link
                href={`/cases/${caseData.id}?tab=documents`}
                className="flex-1 text-center text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg py-1.5 transition-colors"
              >
                📋 案件書類
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
