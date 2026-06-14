'use client'

// 「案件進捗」タブ（旧「基本情報」タブ）。
// 構成: 進行状態サマリー → 基本情報アコーディオン → 作業の進捗（タスク・書類の線表）→ 進捗報告・メモ
// マイルストーン軸はヘッダー直下（タブ上部）に常時表示。ここには作業の細かい線表のみ持つ。
// 面談内容・相談情報・担当者・受注内容・受注ルート・収益等は「面談情報」タブへ移動済み。

import { useState, useRef, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Section, FieldGrid, Field, InlineEdit, InlineSelect, InlineDate,
} from '@/components/ui/InlineFields'
import { CASE_STATUSES, getCaseStatusLabel, LOCATIONS, getSelectableCaseStatuses, isInitialTasksDone } from '@/lib/constants'
import { getPhaseLabel } from '@/lib/phases'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import type { CaseRow, TaskRow, MemberRow, RealEstatePropertyRow } from '@/types'
import CaseTimeline, { type TimelineReceipt } from './CaseTimeline'
import HistoryTab from './HistoryTab'
import ProcedureIntakeSummary from './ProcedureIntakeSummary'

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
}

const PHASE_ORDER = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6']

export default function BasicInfoTab({ caseData, tasks, properties, allMembers, currentMemberId, patchCase, documentReceipts, managerAssigned = false }: Props) {
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

  return (
    <div className="space-y-3.5">
      {/* 案件進捗（ステータス＋進行サマリーを1セクションに集約。ステータスは先頭セル） */}
      <Section title="案件進捗">
        <div className="rounded-lg border border-gray-200">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-gray-100">
            <SummaryItem label="案件ステータス">
              <StatusChipDropdown status={caseData.status} orderSheetCompleted={!!caseData.order_sheet_completed_at} managerAssigned={managerAssigned} initialTasksDone={isInitialTasksDone(tasks)} onChange={s => saveCaseField('status', s)} />
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

      {/* 手続き詳細の連動表示（受託=受領待ち書類 / 対応中=請求・自社作業） */}
      <ProcedureIntakeSummary caseData={caseData} />

      {/* 基本情報（アコーディオン・既定で閉じる） */}
      <Section title="基本情報" collapsible defaultOpen={false}>
        <FieldGrid>
          <Field label="案件名（メイン依頼者の氏名に連動）" value={caseData.deal_name} />
          <Field label="管理番号" value={caseData.case_number} mono />
          <InlineEdit label="LP案件管理番号" value={caseData.lp_case_number} onSave={v => saveCaseField('lp_case_number', v)} />
          <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => saveCaseField('expected_completion_date', v || null)} />
          <Field label="完了日" value={caseData.completion_date ?? '未完了'} mono />
          <InlineSelect label="原本保管場所" value={caseData.location} options={[...LOCATIONS]} onSave={v => saveCaseField('location', v)} required />
          <InlineDate label="受注日（受託日）" value={caseData.order_received_date} onSave={v => saveCaseField('order_received_date', v || null)} />
        </FieldGrid>
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

      {/* 進捗報告・メモ（活動履歴はタイムラインに統合済み） */}
      <HistoryTab caseData={caseData} allMembers={allMembers} currentMemberId={currentMemberId} />
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
function StatusChipDropdown({ status, orderSheetCompleted, managerAssigned, initialTasksDone = true, onChange }: { status: string; orderSheetCompleted: boolean; managerAssigned: boolean; initialTasksDone?: boolean; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const allowed = new Set(getSelectableCaseStatuses(orderSheetCompleted, status, managerAssigned, initialTasksDone))

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
          {!(orderSheetCompleted && managerAssigned && initialTasksDone) && (
            <div className="px-3.5 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              「対応中」「完了」は{[
                !orderSheetCompleted ? 'オーダーシート完成' : null,
                !managerAssigned ? '管理担当の割り振り' : null,
                !initialTasksDone ? '初期対応タスクの完了' : null,
              ].filter(Boolean).join('＋')}後に選択できます
            </div>
          )}
        </div>
      )}
    </div>
  )
}
