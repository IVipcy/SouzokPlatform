'use client'

import Link from 'next/link'
import { Bot, FileText } from 'lucide-react'
import type { TaskRow, CaseDocumentRow, TaskDependencyRow, TaskTemplateRow } from '@/types'
import NextTaskSelector from './NextTaskSelector'

type Props = {
  task: TaskRow
  documents: CaseDocumentRow[]
  dependencies?: TaskDependencyRow[]
  /** 同一案件の他タスク（次タスク選択UI用） */
  caseTasks?: TaskRow[]
  /** タスクテンプレ（次タスク新規作成フォーム用） */
  taskTemplates?: TaskTemplateRow[]
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  '着手前': { bg: 'bg-gray-100', text: 'text-gray-600' },
  '対応中': { bg: 'bg-brand-50', text: 'text-brand-700' },
  '完了': { bg: 'bg-green-50', text: 'text-green-700' },
}

export default function TaskDetailSidebar({ task, documents, dependencies = [], caseTasks = [], taskTemplates = [] }: Props) {
  const caseData = task.cases
  const ext = (task.ext_data ?? {}) as Record<string, unknown>

  // 次のタスク（このタスクが前提のもの）
  const nextTaskDeps = dependencies.filter(d => d.from_task_id === task.id && d.to_task)
  // 前のタスク（このタスクの前段）
  const prevTaskDeps = dependencies.filter(d => d.to_task_id === task.id && d.from_task)
  // 紐づけ済 ID（前 / 次）
  const linkedNextIds = new Set(
    dependencies
      .filter(d => d.from_task_id === task.id && d.condition_type === 'task_completed')
      .map(d => d.to_task_id)
  )
  const linkedPrevIds = new Set(
    dependencies
      .filter(d => d.to_task_id === task.id && d.condition_type === 'task_completed')
      .map(d => d.from_task_id)
  )
  // 候補（同一案件の他タスク、自分自身は除外）
  const otherCaseTasks = caseTasks.filter(t => t.id !== task.id)

  // タイムラインイベント構築
  const timelineEvents: { date: string; label: string; color: string }[] = []
  if (task.created_at) {
    timelineEvents.push({ date: task.created_at.slice(0, 10), label: 'タスク起票', color: '#2563EB' })
  }

  // 戸籍請求書作成・提出（市区町村ごと）はsubmissions配列から最小/最大提出日を取得
  if (task.template_key === 'koseki_request_create' && Array.isArray(ext.submissions)) {
    type SubEntry = { sent_date?: string | null; method?: string }
    const subs = ext.submissions as SubEntry[]
    const sentDates = subs.map(s => s.sent_date).filter(Boolean) as string[]
    if (sentDates.length > 0) {
      const earliest = [...sentDates].sort()[0]
      timelineEvents.push({ date: earliest, label: '戸籍請求書 初回提出', color: '#EA580C' })
      if (sentDates.length === subs.length && subs.length > 1) {
        const latest = [...sentDates].sort().reverse()[0]
        if (latest !== earliest) {
          timelineEvents.push({ date: latest, label: `全${subs.length}件 提出完了`, color: '#059669' })
        }
      }
    }
  } else if (task.template_key === 'bank_balance_request' && Array.isArray(ext.banks)) {
    type BankEntry = { reqDate?: string | null; arrDate?: string | null }
    const banks = ext.banks as BankEntry[]
    const reqDates = banks.map(b => b.reqDate).filter(Boolean) as string[]
    const arrDates = banks.map(b => b.arrDate).filter(Boolean) as string[]
    if (reqDates.length > 0) {
      const earliest = reqDates.sort()[0]
      timelineEvents.push({ date: earliest, label: '残高証明 初回請求', color: '#7C3AED' })
    }
    if (arrDates.length > 0) {
      const latest = arrDates.sort().reverse()[0]
      timelineEvents.push({ date: latest, label: `書類到着 (${arrDates.length}/${banks.length}件)`, color: '#059669' })
    }
  } else {
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
  }

  if (task.status === '完了' && task.updated_at) {
    timelineEvents.push({ date: task.updated_at.slice(0, 10), label: 'タスク完了', color: '#059669' })
  }
  timelineEvents.sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="sticky top-[90px] flex flex-col gap-4">
      {/* AI書類作成ボタン（案件カードの上） */}
      {caseData && (
        <Link
          href={`/cases/${caseData.id}?tab=documentCreate`}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-sm font-semibold text-sm transition-colors"
        >
          <FileText className="w-4 h-4" strokeWidth={2.25} />
          AI書類作成
        </Link>
      )}

      {/* 関連案件カード（グラデーション廃止、他の画面と揃えてフラットに） */}
      {caseData && (
        <div className="rounded-xl p-4 bg-white border border-gray-200 shadow-sm">
          <h3 className="text-[15px] font-bold text-gray-900 mb-2">{caseData.deal_name}</h3>
          <div className="space-y-1.5 text-[13px] text-gray-600">
            {caseData.deceased_name && (
              <div className="flex justify-between">
                <span className="text-gray-400">被相続人</span>
                <span className="font-medium text-gray-800">{caseData.deceased_name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">管理番号</span>
              <span className="font-mono text-gray-800">{caseData.case_number}</span>
            </div>
            {caseData.date_of_death && (
              <div className="flex justify-between">
                <span className="text-gray-400">死亡日</span>
                <span className="font-mono text-gray-800">{caseData.date_of_death}</span>
              </div>
            )}
            {caseData.contract_type && (
              <div className="flex justify-between">
                <span className="text-gray-400">契約形態</span>
                <span className="text-gray-800">{caseData.contract_type}</span>
              </div>
            )}
            {caseData.location && (
              <div className="flex justify-between">
                <span className="text-gray-400">拠点</span>
                <span className="text-gray-800">{caseData.location}</span>
              </div>
            )}
          </div>
          <Link
            href={`/cases/${caseData.id}`}
            className="mt-3 block text-center text-[13px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg py-1.5 transition-colors"
          >
            案件詳細を開く
          </Link>
        </div>
      )}

      {/* このタスクの前のタスク（前段紐づけ） */}
      <NextTaskSelector
        currentTask={task}
        direction="prev"
        candidates={otherCaseTasks}
        linkedIds={linkedPrevIds}
        existingDeps={prevTaskDeps}
        taskTemplates={taskTemplates}
      />

      {/* このタスクが終わったら（次タスク紐づけ） */}
      <NextTaskSelector
        currentTask={task}
        direction="next"
        candidates={otherCaseTasks}
        linkedIds={linkedNextIds}
        existingDeps={nextTaskDeps}
        taskTemplates={taskTemplates}
      />

      {/* タイムライン */}
      {timelineEvents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <h4 className="text-[13px] font-semibold text-gray-500 mb-2">タイムライン</h4>
          <div className="relative">
            {timelineEvents.map((ev, i) => (
              <div key={i} className="flex gap-3 mb-3 last:mb-0 relative">
                {i < timelineEvents.length - 1 && (
                  <div className="absolute left-[5px] top-[14px] bottom-[-8px] w-px bg-gray-200" />
                )}
                <div
                  className="w-[11px] h-[11px] rounded-full flex-shrink-0 mt-0.5 relative z-10 border-2 border-white"
                  style={{ backgroundColor: ev.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-700">{ev.label}</div>
                  <div className="text-[12px] font-mono text-gray-400">{ev.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 関連ドキュメント */}
      {documents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <h4 className="text-[13px] font-semibold text-gray-500 mb-2">関連ドキュメント <span className="text-gray-400">({documents.length}件)</span></h4>
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 text-xs">
                {doc.generated_by === 'AI' ? <Bot className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.75} /> : <FileText className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.75} />}
                <span className="text-gray-700 font-medium truncate flex-1">{doc.document_name}</span>
              </div>
            ))}
          </div>
          {caseData && (
            <div className="mt-2 flex gap-2">
              <Link
                href={`/cases/${caseData.id}?tab=docs`}
                className="flex-1 text-center text-[12px] font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg py-1.5 transition-colors"
              >
                案件書類
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
