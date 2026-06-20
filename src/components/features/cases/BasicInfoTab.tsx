'use client'

// 「案件進捗」タブ（旧「基本情報」タブ）。
// 構成: 進行状態サマリー → 基本情報アコーディオン → 作業の進捗（タスク・書類の線表）→ 進捗報告・メモ
// マイルストーン軸はヘッダー直下（タブ上部）に常時表示。ここには作業の細かい線表のみ持つ。
// 面談内容・相談情報・担当者・受注内容・受注ルート・収益等は「面談情報」タブへ移動済み。

import { useState, useRef, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import { SubTabs } from '@/components/ui/SubTabs'
import { CASE_STATUSES, getCaseStatusLabel, getSelectableCaseStatuses, isInitialTasksDone } from '@/lib/constants'
import { getPhaseLabel } from '@/lib/phases'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import type { CaseRow, TaskRow, MemberRow, RealEstatePropertyRow } from '@/types'
import CaseTimeline, { type TimelineReceipt } from './CaseTimeline'
import HistoryTab from './HistoryTab'

type Props = {
  caseData: CaseRow
  tasks: TaskRow[]
  properties: RealEstatePropertyRow[]
  allMembers: MemberRow[]
  currentMemberId: string | null
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  documentReceipts?: TimelineReceipt[]
  // 管理担当アサイン済か（対応中ガード用）
  managerAssigned?: boolean
  // 契約残手続き（契約書類受信）完了か（対応中ガード用）
  contractProcDone?: boolean
  // 進捗確認依頼の確認者＝受注担当
  salesMemberId?: string | null
  // 進捗確認を依頼できるか（この案件の管理担当のみ）
  canRequestReview?: boolean
}

const PHASE_ORDER = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6']

export default function BasicInfoTab({ caseData, tasks, properties, allMembers, currentMemberId, patchCase, documentReceipts, managerAssigned = false, contractProcDone = true, salesMemberId = null, canRequestReview = false }: Props) {
  const saveCaseField = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  // ── 進行状態サマリー用の集計 ──
  const todayYmd = todayJstYmd(new Date())
  const caseTasks = tasks.filter(t => t.task_kind !== 'system')
  const totalTasks = caseTasks.length
  const completedTasks = caseTasks.filter(t => t.status === '完了').length
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const overdueCount = caseTasks.filter(t => t.status !== '完了' && t.due_date && t.due_date < todayYmd).length

  // 現在フェーズ = タスクが残っている最初のPhase（全完了なら「完了」）
  const currentPhaseLabel = (() => {
    if (totalTasks === 0) return null
    for (const p of PHASE_ORDER) {
      const phaseTasks = caseTasks.filter(t => (t.phase || 'phase1') === p)
      if (phaseTasks.length === 0) continue
      if (phaseTasks.some(t => t.status !== '完了')) return getPhaseLabel(p)
    }
    return '完了'
  })()

  const [sub, setSub] = useState<'progress' | 'history'>('progress')
  const SUBTABS = [{ key: 'progress', label: '進捗' }, { key: 'history', label: '進捗報告・メモ' }]

  return (
    <div className="space-y-3.5">
      <SubTabs tabs={SUBTABS} active={sub} onChange={k => setSub(k as 'progress' | 'history')} />

      {sub === 'progress' && (
        <div className="space-y-3.5">
      {/* 案件進捗（ステータス＋進行サマリーを1セクションに集約。ステータスは先頭セル） */}
      <Section title="案件進捗">
        <div className="rounded-lg border border-gray-200">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-gray-100">
            <SummaryItem label="案件ステータス">
              <StatusChipDropdown status={caseData.status} orderSheetCompleted={!!caseData.order_sheet_completed_at} managerAssigned={managerAssigned} initialTasksDone={isInitialTasksDone(tasks)} contractProcDone={contractProcDone} onChange={s => saveCaseField('status', s)} />
            </SummaryItem>
            <SummaryItem label="現在フェーズ">
              <span className="text-[14px] font-bold text-gray-900">{currentPhaseLabel ?? '未着手'}</span>
            </SummaryItem>
            <SummaryItem label="タスク進捗">
              <div className="flex items-center gap-2 w-full">
                <span className="text-[14px] font-bold text-gray-900 tabular-nums">{completedTasks}/{totalTasks}</span>
                <div className="flex-1 min-w-[40px] h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="text-[13px] font-semibold text-gray-600 tabular-nums">{progressPct}%</span>
              </div>
            </SummaryItem>
            <SummaryItem label="遅延タスク">
              {overdueCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-[14px] font-bold text-red-600">
                  <AlertTriangle className="w-4 h-4" strokeWidth={2.25} />{overdueCount}件
                </span>
              ) : (
                <span className="text-[14px] font-semibold text-emerald-600">なし</span>
              )}
            </SummaryItem>
            <SummaryItem label="完了予定日">
              <span className="text-[13px] font-mono text-gray-700">{caseData.expected_completion_date ?? '未設定'}</span>
            </SummaryItem>
          </div>
        </div>
      </Section>

          {/* 作業の進捗（タスク・書類の線表）。フラット埋め込み */}
          <CaseTimeline
            caseData={caseData}
            tasks={tasks}
            properties={properties}
            documentReceipts={documentReceipts}
            variant="detail"
            embedded
          />
        </div>
      )}

      {/* 進捗報告・メモ（進捗報告＋進捗メモを縦並び。基本情報はヘッダーへ移設） */}
      {sub === 'history' && (
        <HistoryTab caseData={caseData} allMembers={allMembers} currentMemberId={currentMemberId} salesMemberId={salesMemberId} canRequestReview={canRequestReview} />
      )}
    </div>
  )
}

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[11px] font-semibold text-gray-400 tracking-wide mb-1.5">{label}</div>
      <div className="flex items-center min-h-[26px]">{children}</div>
    </div>
  )
}

// 案件ステータスの編集チップ（ブランド単色。ヘッダーのステータスフローと色を統一）
// 対応中/完了はオーダーシート完成＋管理担当アサイン後のみ選択可（getSelectableCaseStatuses）。
function StatusChipDropdown({ status, orderSheetCompleted, managerAssigned, initialTasksDone = true, contractProcDone = true, onChange }: { status: string; orderSheetCompleted: boolean; managerAssigned: boolean; initialTasksDone?: boolean; contractProcDone?: boolean; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const allowed = new Set(getSelectableCaseStatuses(orderSheetCompleted, status, managerAssigned, initialTasksDone, contractProcDone))

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[15px] font-bold border cursor-pointer transition-colors bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100"
      >
        <span className="w-2 h-2 rounded-full bg-brand-600" />
        {getCaseStatusLabel(status)}
        <span className="text-[13px] opacity-70">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[160px] z-50 overflow-hidden">
          {CASE_STATUSES.filter(s => allowed.has(s.key)).map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => { setOpen(false); if (s.key !== status) onChange(s.key) }}
              className={`w-full px-3.5 py-2 text-xs font-medium flex items-center hover:bg-gray-50 transition-colors ${
                s.key === status ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-700'
              }`}
            >
              {s.label}
            </button>
          ))}
          {!(orderSheetCompleted && managerAssigned && initialTasksDone && contractProcDone) && (
            <div className="px-3.5 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              「対応中」「完了」は{[
                !orderSheetCompleted ? 'オーダーシート完成' : null,
                !managerAssigned ? '管理担当の割り振り' : null,
                !initialTasksDone ? '初期対応タスクの完了' : null,
                !contractProcDone ? '契約残手続きの完了' : null,
              ].filter(Boolean).join('＋')}後に選択できます
            </div>
          )}
        </div>
      )}
    </div>
  )
}
