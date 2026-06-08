'use client'

// 「案件進捗」タブ（旧「基本情報」タブ）。
// 構成: 進行状態サマリー → 基本情報アコーディオン → 作業の進捗（タスク・書類の線表）→ 進捗報告・メモ
// マイルストーン軸はヘッダー直下（タブ上部）に常時表示。ここには作業の細かい線表のみ持つ。
// 面談内容・相談情報・担当者・受注内容・受注ルート・収益等は「面談情報」タブへ移動済み。

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import {
  FieldGrid, Field, InlineEdit, InlineSelect, InlineDate,
} from '@/components/ui/InlineFields'
import { CASE_STATUSES, getCaseStatusLabel, LOCATIONS } from '@/lib/constants'
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
}

const PHASE_ORDER = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6']

export default function BasicInfoTab({ caseData, tasks, properties, allMembers, currentMemberId, patchCase, documentReceipts }: Props) {
  const [basicOpen, setBasicOpen] = useState(false)

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
    <div className="space-y-4">
      {/* ① 進行状態サマリー（一目でわかる） */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* ステータス（編集可能・ブランド単色でヘッダーのフローと統一） */}
          <SummaryItem label="ステータス">
            <StatusChipDropdown status={caseData.status} onChange={s => saveCaseField('status', s)} />
          </SummaryItem>
          {/* 現在フェーズ */}
          <SummaryItem label="現在フェーズ">
            <span className="text-[14px] font-bold text-gray-900">{currentPhaseLabel ?? '未着手'}</span>
          </SummaryItem>
          {/* タスク進捗 */}
          <SummaryItem label="タスク進捗">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-gray-900 tabular-nums">{completedTasks}/{totalTasks}</span>
              <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-[13px] font-semibold text-gray-600 tabular-nums">{progressPct}%</span>
            </div>
          </SummaryItem>
          {/* 遅延 */}
          <SummaryItem label="遅延タスク">
            {overdueCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[14px] font-bold text-red-600">
                <AlertTriangle className="w-4 h-4" strokeWidth={2.25} />{overdueCount}件
              </span>
            ) : (
              <span className="text-[14px] font-semibold text-emerald-600">なし</span>
            )}
          </SummaryItem>
          {/* 完了予定日 */}
          <SummaryItem label="完了予定日">
            <span className="text-[13px] font-mono text-gray-700">{caseData.expected_completion_date ?? '未設定'}</span>
          </SummaryItem>
        </div>
      </div>

      {/* ② 基本情報（アコーディオン） */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
        <button
          type="button"
          onClick={() => setBasicOpen(o => !o)}
          className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50 transition-colors"
        >
          {basicOpen
            ? <ChevronDown className="w-4 h-4 text-gray-500" strokeWidth={2.25} />
            : <ChevronRight className="w-4 h-4 text-gray-500" strokeWidth={2.25} />}
          <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
          <h3 className="text-[13px] font-semibold text-gray-900">基本情報</h3>
          {!basicOpen && (
            <span className="text-[12px] text-gray-400 ml-1 truncate">
              {caseData.deal_name} · {getCaseStatusLabel(caseData.status)}
            </span>
          )}
          <span className="ml-auto text-[12px] text-gray-400">{basicOpen ? '閉じる' : '開く'}</span>
        </button>
        {basicOpen && (
          <div className="px-4 py-3 border-t border-gray-100">
            <FieldGrid>
              <InlineEdit label="案件名" value={caseData.deal_name} onSave={v => saveCaseField('deal_name', v)} fullWidth />
              <Field label="管理番号" value={caseData.case_number} mono />
              <InlineSelect
                label="案件ステータス"
                value={caseData.status}
                options={CASE_STATUSES.map(s => s.key)}
                optionLabel={getCaseStatusLabel}
                onSave={v => saveCaseField('status', v)}
                renderValue={v => {
                  const s = CASE_STATUSES.find(cs => cs.key === v)
                  return s ? <Badge label={s.label} color={s.color} /> : v
                }}
              />
              <InlineDate label="依頼日" value={caseData.order_date} onSave={v => saveCaseField('order_date', v || null)} required />
              <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => saveCaseField('expected_completion_date', v || null)} />
              <Field label="完了日" value={caseData.completion_date ?? '未完了'} mono />
              <InlineSelect label="原本保管場所" value={caseData.location} options={[...LOCATIONS]} onSave={v => saveCaseField('location', v)} required />
              <InlineSelect
                label="確度"
                value={caseData.probability != null ? String(caseData.probability) : null}
                options={['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100']}
                onSave={v => saveCaseField('probability', v != null ? Number(v) : null)}
                renderValue={v => v != null ? `${v}%` : ''}
              />
              <InlineDate label="受注日" value={caseData.order_received_date} onSave={v => saveCaseField('order_received_date', v || null)} />
            </FieldGrid>
          </div>
        )}
      </div>

      {/* ③ 作業の進捗（タスク・書類の線表）。マイルストーン軸はタブ上部に常時表示 */}
      <CaseTimeline
        caseData={caseData}
        tasks={tasks}
        properties={properties}
        documentReceipts={documentReceipts}
        variant="detail"
      />

      {/* ④ 進捗報告・メモ（活動履歴はタイムラインに統合済み） */}
      <HistoryTab caseData={caseData} allMembers={allMembers} currentMemberId={currentMemberId} />
    </div>
  )
}

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-gray-400 tracking-wide uppercase">{label}</span>
      <div className="flex items-center min-h-[24px]">{children}</div>
    </div>
  )
}

// 案件ステータスの編集チップ（ブランド単色。ヘッダーのステータスフローと色を統一）
function StatusChipDropdown({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
        {getCaseStatusLabel(status)}
        <span className="text-[12px] opacity-70">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[160px] z-50 overflow-hidden">
          {CASE_STATUSES.map(s => (
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
        </div>
      )}
    </div>
  )
}
