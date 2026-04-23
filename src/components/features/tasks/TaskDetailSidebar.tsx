'use client'

import Link from 'next/link'
import { QIRow } from '@/components/ui/InlineFields'
import { getPhaseLabel } from '@/lib/phases'
import { getWorkRoleDef } from '@/lib/constants'
import { evaluateCondition } from '@/lib/taskDependencyUtils'
import type { TaskRow, DocumentRow, TaskDependencyRow } from '@/types'

type Props = {
  task: TaskRow
  documents: DocumentRow[]
  dependencies?: TaskDependencyRow[]
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  '着手前': { bg: 'bg-gray-100', text: 'text-gray-600' },
  '対応中': { bg: 'bg-blue-50', text: 'text-blue-700' },
  '完了': { bg: 'bg-green-50', text: 'text-green-700' },
}

export default function TaskDetailSidebar({ task, documents, dependencies = [] }: Props) {
  const caseData = task.cases
  const ext = (task.ext_data ?? {}) as Record<string, unknown>

  // 次のタスク（このタスクが前提のもの）
  const nextTaskDeps = dependencies.filter(d => d.from_task_id === task.id && d.to_task)
  // 前提条件（このタスクの前提）
  const prereqDeps = dependencies.filter(d => d.to_task_id === task.id && d.from_task)

  // タイムラインイベント構築
  const timelineEvents: { date: string; label: string; color: string }[] = []
  if (task.created_at) {
    timelineEvents.push({ date: task.created_at.slice(0, 10), label: 'タスク起票', color: '#2563EB' })
  }

  // 残高証明請求（複数銀行）はbanks配列から最小reqDate/最大arrDateを取得
  if (task.template_key === 'bank_balance_request' && Array.isArray(ext.banks)) {
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
            案件詳細を開く
          </Link>
        </div>
      )}

      {/* クイック情報 */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
        <h4 className="text-[11px] font-semibold text-gray-500 mb-1">クイック情報</h4>
        <QIRow label="フェーズ">
          <span className="text-xs font-semibold text-gray-700">{getPhaseLabel(task.phase)}</span>
        </QIRow>
        <QIRow label="担当区分">
          {(() => {
            const wr = getWorkRoleDef(task.work_role)
            if (!wr) return <span className="text-[11px] text-gray-400">未設定</span>
            return (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${wr.pill}`}>
                <span>{wr.icon}</span>
                {wr.label}
              </span>
            )
          })()}
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

      {/* このタスクが終わったら */}
      {nextTaskDeps.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-3 py-2.5 bg-blue-600 flex items-center gap-2">
            <span className="text-white text-[12px] font-bold">このタスクが終わったら</span>
          </div>
          <div className="divide-y divide-gray-100">
            {nextTaskDeps.map(dep => {
              const toTask = dep.to_task!
              const isMet = evaluateCondition(task, dep)
              return (
                <Link
                  key={dep.id}
                  href={`/tasks/${toTask.id}`}
                  className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors group ${
                    isMet ? 'bg-green-50 hover:bg-green-100' : ''
                  }`}
                >
                  {/* 矢印アイコン */}
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${
                    isMet ? 'bg-green-500' : 'bg-gray-200'
                  }`}>
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 group-hover:text-blue-600 truncate">
                      {toTask.title}
                    </p>
                    {isMet && (
                      <p className="text-[10px] text-green-600 font-medium">今すぐ着手できます</p>
                    )}
                  </div>
                  {isMet && (
                    <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">
                      着手OK
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* このタスクを始めるには */}
      {prereqDeps.length > 0 && (() => {
        const allMet = prereqDeps.every(dep => evaluateCondition(dep.from_task!, dep))
        const metCount = prereqDeps.filter(dep => evaluateCondition(dep.from_task!, dep)).length
        return (
          <div className={`rounded-xl shadow-sm overflow-hidden border-2 ${
            allMet ? 'border-green-400' : 'border-amber-300'
          }`}>
            {/* ヘッダー */}
            <div className={`px-3 py-2.5 flex items-center gap-2 ${
              allMet ? 'bg-green-500' : 'bg-amber-400'
            }`}>
              {allMet ? (
                <>
                  <svg className="w-4 h-4 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white text-[12px] font-bold">着手してOKです！</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white text-[12px] font-bold">
                    先に終わらせるものがあります
                  </span>
                  <span className="ml-auto text-white text-[10px] font-bold bg-white/30 px-1.5 py-0.5 rounded-full">
                    {metCount}/{prereqDeps.length}
                  </span>
                </>
              )}
            </div>

            {/* 各タスクの状態 */}
            <div className="bg-white divide-y divide-gray-100">
              {prereqDeps.map(dep => {
                const fromTask = dep.from_task!
                const isMet = evaluateCondition(fromTask, dep)
                const conditionLabel = dep.condition_type === 'task_completed'
                  ? 'を終わらせる'
                  : `の「${dep.label ?? 'チェック項目'}」を記入する`
                return (
                  <div
                    key={dep.id}
                    className={`flex items-start gap-2.5 px-3 py-2.5 ${
                      isMet ? 'bg-green-50' : 'bg-white'
                    }`}
                  >
                    {/* チェックアイコン */}
                    <div className="flex-shrink-0 mt-0.5">
                      {isMet ? (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 bg-white" />
                      )}
                    </div>
                    {/* テキスト */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-semibold leading-snug ${
                        isMet ? 'text-green-700 line-through decoration-green-400' : 'text-gray-800'
                      }`}>
                        「{fromTask.title}」{conditionLabel}
                      </p>
                      {!isMet && (
                        <Link href={`/tasks/${fromTask.id}`} className="text-[10px] text-blue-500 hover:underline">
                          そのタスクを開く →
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* タイムライン */}
      {timelineEvents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <h4 className="text-[11px] font-semibold text-gray-500 mb-2">タイムライン</h4>
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
          <h4 className="text-[11px] font-semibold text-gray-500 mb-2">関連ドキュメント <span className="text-gray-400">({documents.length}件)</span></h4>
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">{doc.generated_by === 'AI' ? '🤖' : '📄'}</span>
                <span className="text-gray-700 font-medium truncate flex-1">{doc.name}</span>
              </div>
            ))}
          </div>
          {caseData && (
            <div className="mt-2 flex gap-2">
              <Link
                href={`/cases/${caseData.id}?tab=documents`}
                className="flex-1 text-center text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg py-1.5 transition-colors"
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
