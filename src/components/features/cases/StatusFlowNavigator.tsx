'use client'

import { ArrowRight, Check, Circle } from 'lucide-react'
import type { TabKey } from './CaseTabs'

// 受託（受注）→対応中へ進むための前提条件を、対象タブのスポットライトと連動して案内する
// ナビゲーター。条件の対応順は順不同（どれから着手してもよい）なので、未完了をすべて
// 並列に提示し、該当タブを同時にハイライトする。完了判定は呼び出し側で算出して渡す。

export type FlowStep = {
  key: string
  label: string
  tab: TabKey
  tabLabel: string
  done: boolean
}

// 受託案件の前提条件。done は呼び出し側で判定して渡す。順番は問わない。
export function getJutakuFlowSteps(args: {
  orderSheetCompleted: boolean
  managerAssigned: boolean
  initialTasksDone: boolean
  contractProcDone: boolean
}): FlowStep[] {
  return [
    { key: 'orderSheet', label: 'オーダーシート作成', tab: 'orderSheet', tabLabel: 'オーダーシート', done: args.orderSheetCompleted },
    { key: 'manager', label: '管理担当アサイン', tab: 'ownerSales', tabLabel: '担当・受注ルート', done: args.managerAssigned },
    { key: 'initialTasks', label: '初期対応タスク完了', tab: 'tasks', tabLabel: 'タスク', done: args.initialTasksDone },
    { key: 'contractProc', label: '契約残手続き完了', tab: 'contractProc', tabLabel: '契約残手続き', done: args.contractProcDone },
  ]
}

// 検討中（契約書待ち）→受託 の前提条件。契約残手続き＋受注/管理担当タスク完了（事務管理タスクは対応中で着手するため除外）。
export function getKentouContractFlowSteps(args: {
  contractProcDone: boolean
  allTasksDone: boolean
}): FlowStep[] {
  return [
    { key: 'contractProc', label: '契約残手続き完了', tab: 'contractProc', tabLabel: '契約残手続き', done: args.contractProcDone },
    { key: 'tasks', label: '受注/管理担当タスク完了', tab: 'tasks', tabLabel: 'タスク', done: args.allTasksDone },
  ]
}

type Props = {
  steps: FlowStep[]
  onAdvance: () => void // 次のステータスへ進める
  onDismiss: () => void // 「あとで」
  targetLabel?: string  // 進行先ステータス名（既定: 対応中）
}

export default function StatusFlowNavigator({ steps, onAdvance, onDismiss, targetLabel = '対応中' }: Props) {
  const total = steps.length
  const doneCount = steps.filter(s => s.done).length
  const remaining = total - doneCount
  const allDone = remaining === 0

  return (
    <div className="mb-5 rounded-xl border border-brand-300 bg-brand-50/40 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-brand-700">
              {allDone ? '準備完了' : `「${targetLabel}」に進むための残り対応`}
            </span>
            <span className="text-[11px] text-gray-400">（{doneCount}/{total} 完了{allDone ? '' : `・残り${remaining}件`}）</span>
          </div>
          <p className="text-[12.5px] text-gray-500 leading-relaxed mt-0.5">
            {allDone
              ? `すべての前提条件が揃いました。「${targetLabel}」に進められます。`
              : '点滅しているタブを開いて対応してください。順番は問いません（どれからでもOK）。'}
          </p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-[12px] font-medium text-gray-400 hover:text-gray-600 px-1 py-0.5"
        >
          あとで
        </button>
      </div>

      {/* 前提条件チェックリスト（順不同） */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {steps.map(s => (
          <span
            key={s.key}
            data-nav-step={s.tab}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] ${
              s.done
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-brand-300 bg-white text-brand-700 font-semibold'
            }`}
          >
            {s.done ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            {s.label}
            {!s.done && (
              <span className="ml-0.5 inline-flex items-center rounded bg-brand-100 px-1.5 py-0.5 text-[10.5px] font-medium text-brand-700">
                {s.tabLabel}タブ
              </span>
            )}
          </span>
        ))}

        {allDone && (
          <button
            type="button"
            onClick={onAdvance}
            className="ml-auto inline-flex items-center gap-1 px-3.5 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
          >
            {targetLabel}に進める <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
