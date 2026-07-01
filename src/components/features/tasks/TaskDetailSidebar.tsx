'use client'

import Link from 'next/link'
import { Bot, FileText } from 'lucide-react'
import type { TaskRow, CaseDocumentRow, TaskDependencyRow, TaskTemplateRow } from '@/types'

type Props = {
  task: TaskRow
  documents: CaseDocumentRow[]
  dependencies?: TaskDependencyRow[]
  /** 同一案件の他タスク（次タスク選択UI用） */
  caseTasks?: TaskRow[]
  /** タスクテンプレ（次タスク新規作成フォーム用） */
  taskTemplates?: TaskTemplateRow[]
}

export default function TaskDetailSidebar({ task, documents }: Props) {
  const caseData = task.cases

  return (
    <div className="sticky top-[90px] flex flex-col gap-4">
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
