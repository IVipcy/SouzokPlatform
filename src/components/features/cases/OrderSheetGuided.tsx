'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, Check, Home, MonitorSmartphone, Flag, Clock } from 'lucide-react'
import { WorkContentField, workContentPlaceholder } from './WorkContentField'
import { NestedSectionContext } from '@/components/ui/InlineFields'
import BackToTopButton from '@/components/ui/BackToTopButton'
import type { CaseRow } from '@/types'

export type GuidedSection = { title: string; gate?: string; workContentKey?: string; node: ReactNode }

// オーダーシートのガイド入力（スマホ最適）。1セクション＝1画面のステップ。
// 各ステップは「簡易メモ」を主役にし、「詳細を入力」で既存セクションの詳細項目を展開する。
// 各項目はインライン自動保存のため、途中でアプリを閉じても内容は保存される。
export default function OrderSheetGuided({ sections, caseData, patchCase, finalized, lastUpdatedAt, onGo, onSaveOnly, saving }: {
  sections: GuidedSection[]
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  finalized: boolean                    // これでGO！で確定済み
  lastUpdatedAt: string | null          // 最終更新日
  onGo: () => Promise<boolean>          // これでGO！（確定）
  onSaveOnly: () => Promise<boolean>    // 保存だけ（最終更新日更新）
  saving: boolean
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  // 詳細（契約形態など、面談シートで入力済みの構造化項目）は既定で開く。
  // 折りたたみ既定だと「面談シートで入れた契約形態がオーダーシートに反映されていない」ように見えるため。
  const [detailOpen, setDetailOpen] = useState(true)
  // 「保存/これでGO」押下直後だけ完了画面を出す。開き直したときは通常の入力画面（＝いつでも修正可）。
  const [justCompleted, setJustCompleted] = useState(false)
  const total = sections.length

  // 完成画面（完成ボタン押下直後）。スマホ/タブレットは「以降はPCで」の案内・PCは案件詳細への直行ボタンを主役に。
  if (justCompleted) {
    return (
      <div className="py-6 flex flex-col items-center text-center">
        <div className="w-[76px] h-[76px] rounded-full bg-emerald-50 flex items-center justify-center mb-5">
          <Check className="w-10 h-10 text-emerald-600" strokeWidth={2.25} />
        </div>
        <div className="text-[20px] font-bold text-gray-900 mb-1.5">お疲れさまでした</div>
        <div className="text-[13px] text-gray-500 mb-5">{finalized ? 'オーダーシートを確定しました（これでGO！）' : 'オーダーシートを保存しました'}</div>

        {/* スマホ/タブレット時のみ「以降はPCで」の案内 (lg以上=PC では非表示) */}
        <div className="w-full max-w-[320px] rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3.5 mb-6 lg:hidden">
          <div className="flex items-start gap-2 text-left">
            <MonitorSmartphone className="w-[18px] h-[18px] text-brand-600 mt-0.5 flex-none" />
            <span className="text-[13px] leading-relaxed text-brand-800">この先の追加・変更はPC（管理画面）で行ってください</span>
          </div>
        </div>

        <div className="w-full max-w-[420px] flex flex-col gap-2.5">
          {/* PC想定: 案件詳細を直接開く (主導線) */}
          <button
            type="button"
            onClick={() => router.push(`/cases/${caseData.id}`)}
            className="w-full h-12 rounded-xl bg-brand-600 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 hover:bg-brand-700 transition"
          >
            案件詳細を開く →
          </button>
          {/* 管理画面(PC)のTOP=ダッシュボード */}
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full h-11 rounded-xl bg-white border border-gray-300 text-gray-700 text-[14px] font-semibold inline-flex items-center justify-center gap-2 hover:bg-gray-50 transition"
          >
            <Home className="w-[16px] h-[16px]" />管理画面TOP（ダッシュボード）へ
          </button>
          {/* 面談シートアプリのTOP（続けて別案件を登録する用） */}
          <button
            type="button"
            onClick={() => router.push('/order-sheet')}
            className="w-full h-10 rounded-xl bg-white border border-gray-200 text-gray-600 text-[13px] font-medium inline-flex items-center justify-center gap-2 hover:bg-gray-50 transition"
          >
            面談シートアプリのTOPへ
          </button>
        </div>
        <div className="text-[11px] text-gray-400 mt-4">入力内容はすべて自動保存済みです</div>
      </div>
    )
  }

  if (total === 0) {
    return <div className="py-12 text-center text-[13px] text-gray-400">入力するセクションがありません（受注区分を設定してください）。</div>
  }

  const current = sections[Math.min(step, total - 1)]
  const isLast = step >= total - 1
  const go = (next: number) => { setStep(Math.max(0, Math.min(total - 1, next))); setDetailOpen(true); window.scrollTo(0, 0) }

  return (
    <div>
      {/* 進行バー */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-gray-500">ステップ {step + 1} / {total}</span>
          {finalized ? (
            <span className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />確定済（編集は×で解除）
            </span>
          ) : lastUpdatedAt ? (
            <span className="text-[11px] font-medium text-gray-500 inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" strokeWidth={2} />最終更新 {lastUpdatedAt.slice(5, 10).replace('-', '/')}
            </span>
          ) : null}
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      </div>

      {/* 現在のセクション */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-[16px] font-bold text-gray-900 mb-3">{current.title}</div>

        {/* 簡易メモ（主役）。受注内容セクションは gyomu="order"(受注内容/提案内容) を簡易メモ位置に出す
            （OrderContentTab側は hideOrderMemo で内部の同フリー欄を非表示にして二重表示を防ぐ）。 */}
        {(() => {
          const isOrder = current.title === '受注内容'
          const key = isOrder ? 'order' : (current.workContentKey ?? current.gate ?? current.title)
          return (
            <WorkContentField
              caseData={caseData}
              gyomu={key}
              patchCase={patchCase}
              label={isOrder ? '受注内容（提案内容）／面談シートと共有' : '作業内容・関連情報'}
              placeholder={workContentPlaceholder(key)}
            />
          )
        })()}

        {/* 詳細を入力（展開） */}
        <button
          type="button"
          onClick={() => setDetailOpen(o => !o)}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${detailOpen ? 'rotate-180' : ''}`} />
          {detailOpen ? '詳細を閉じる' : '詳細を入力'}
        </button>
        {detailOpen && (
          <NestedSectionContext.Provider value={true}>
            <div className="mt-3 pt-3 border-t border-gray-100">
              {current.node}
            </div>
          </NestedSectionContext.Provider>
        )}
      </div>

      {/* ナビゲーション（コンパクト） */}
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={() => go(step - 1)}
          disabled={step === 0}
          className="flex-1 py-2.5 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-700 disabled:opacity-40 hover:bg-gray-50 transition inline-flex items-center justify-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />前へ
        </button>
        {isLast ? (
          finalized ? (
            <span className="flex-[2] py-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[13px] font-bold inline-flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" strokeWidth={2.25} />確定済
            </span>
          ) : (
            <button
              type="button"
              onClick={async () => { if (await onGo()) setJustCompleted(true) }}
              disabled={saving}
              className="flex-[2] py-2.5 rounded-lg bg-brand-600 text-white text-[13px] font-bold hover:bg-brand-700 disabled:opacity-50 transition inline-flex items-center justify-center gap-1.5"
            >
              <Flag className="w-4 h-4" strokeWidth={2.25} />{saving ? '処理中...' : 'これでGO！'}
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => go(step + 1)}
            className="flex-[2] py-2.5 rounded-lg bg-brand-600 text-white text-[13px] font-bold hover:bg-brand-700 transition inline-flex items-center justify-center gap-1"
          >
            次へ<ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 最終ステップ：確定せず保存だけして終了（受注担当が確定を管理担当に任せるケース） */}
      {isLast && !finalized && (
        <button
          type="button"
          onClick={async () => { if (await onSaveOnly()) setJustCompleted(true) }}
          disabled={saving}
          className="w-full mt-2 py-2.5 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
        >
          まだ確定せず、保存だけして終了
        </button>
      )}

      {/* ステップ番号（タップで移動・コンパクト） */}
      <div className="flex flex-wrap gap-1 mt-2.5 justify-center">
        {sections.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => go(i)}
            title={s.title}
            className={`w-6 h-6 text-[11px] font-semibold rounded transition ${i === step ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <BackToTopButton />
    </div>
  )
}
