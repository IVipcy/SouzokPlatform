'use client'

import { ArrowRight, Check, Circle, X } from 'lucide-react'
import type { TabKey } from './CaseTabs'

// 受託（受注）→対応中へ進むための前提条件を、対象タブのスポットライトと連動した
// コーチマークで順番に案内するナビゲーター。
// ステップ完了は呼び出し側（CaseDetailClient）が算出して steps で渡す。

export type FlowStep = {
  key: string
  title: string
  desc: string
  tab: TabKey
  done: boolean
}

// 受託案件の3ステップ定義。done は呼び出し側で判定して渡す。
export function getJutakuFlowSteps(args: {
  orderSheetCompleted: boolean
  managerAssigned: boolean
  initialTasksDone: boolean
}): FlowStep[] {
  return [
    {
      key: 'orderSheet',
      title: 'オーダーシートを作成してください',
      desc: '対応中に進めるには、まず案件詳細（オーダーシート）の作成が必要です。',
      tab: 'orderSheet',
      done: args.orderSheetCompleted,
    },
    {
      key: 'manager',
      title: '管理担当をアサインしてください',
      desc: '「担当・受注内容」タブで管理担当を割り当ててください。',
      tab: 'ownerSales',
      done: args.managerAssigned,
    },
    {
      key: 'initialTasks',
      title: '初期対応タスクを完了してください',
      desc: '「タスク」タブの初期対応タスク（前受金入金の確認など）をすべて完了してください。',
      tab: 'tasks',
      done: args.initialTasksDone,
    },
  ]
}

type Props = {
  steps: FlowStep[]
  onGoToTab: (tab: TabKey) => void
  onAdvance: () => void // 対応中へ進める
  onDismiss: () => void // 「あとで」
}

export default function StatusFlowNavigator({ steps, onGoToTab, onAdvance, onDismiss }: Props) {
  const total = steps.length
  const doneCount = steps.filter(s => s.done).length
  const currentIndex = steps.findIndex(s => !s.done)
  const allDone = currentIndex === -1
  const current = allDone ? null : steps[currentIndex]

  return (
    <div className="mb-5 rounded-xl border border-brand-300 bg-brand-50/40 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* 進捗ヘッダー */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[12px] font-bold text-brand-700">
              {allDone ? '準備完了' : `ステップ ${currentIndex + 1} / ${total}`}
            </span>
            <div className="flex items-center gap-1">
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={`h-1.5 w-5 rounded-full ${
                    s.done ? 'bg-brand-600' : i === currentIndex ? 'bg-brand-400' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] text-gray-400">（{doneCount}/{total} 完了）</span>
          </div>

          {/* 本文 */}
          {allDone ? (
            <p className="text-[14px] font-semibold text-gray-800">
              すべての前提条件が揃いました。「対応中」に進められます。
            </p>
          ) : current ? (
            <>
              <p className="text-[14px] font-semibold text-gray-800">{current.title}</p>
              <p className="text-[12.5px] text-gray-500 leading-relaxed mt-0.5">{current.desc}</p>
            </>
          ) : null}
        </div>

        {/* 閉じる（あとで） */}
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-gray-300 hover:text-gray-500"
          title="あとで"
          aria-label="あとで"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* チェックリスト＋アクション */}
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {steps.map((s, i) => (
            <span
              key={s.key}
              className={`inline-flex items-center gap-1 text-[12px] ${
                s.done ? 'text-emerald-600' : i === currentIndex ? 'text-brand-700 font-semibold' : 'text-gray-400'
              }`}
            >
              {s.done ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              {`${'①②③'[i] ?? i + 1} ${stepShortLabel(s.key)}`}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-700"
          >
            あとで
          </button>
          {allDone ? (
            <button
              type="button"
              onClick={onAdvance}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
            >
              対応中に進める <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : current ? (
            <button
              type="button"
              onClick={() => onGoToTab(current.tab)}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 text-[13px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50 rounded-lg"
            >
              そのタブへ <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function stepShortLabel(key: string): string {
  switch (key) {
    case 'orderSheet': return 'オーダーシート作成'
    case 'manager': return '管理担当アサイン'
    case 'initialTasks': return '初期対応タスク完了'
    default: return ''
  }
}
