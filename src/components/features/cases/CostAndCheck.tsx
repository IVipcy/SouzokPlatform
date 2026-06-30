'use client'

// 費用（予算/返金/確定）とダブルチェック（自分以外・確認者名＋日時）の共通部品。
// 戸籍請求・不動産取得資料・相続登記など、費用が発生する工程に設置する。

import { UserCheck, UserX, Coins } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { MoneyInput } from './FinancialAssetsTable'

const yen = (n: number | null | undefined) => (n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`)

/**
 * 費用ブロック。
 * mode='full'         … 予算・返金を入力、確定費用＝予算−返金（自動）。小為替がある工程（戸籍・市区町村請求）
 * mode='confirmedOnly'… 確定費用のみ直接入力（返金なし。法務局・登録免許税 等）
 */
export function CostBlock({ budget, refund, confirmed, mode = 'full', label = '費用（確定費用＝立替実費の実績）', onSave }: {
  budget: number | null
  refund: number | null
  confirmed: number | null
  mode?: 'full' | 'confirmedOnly'
  label?: string
  onSave: (field: 'cost_budget' | 'cost_refund' | 'cost_confirmed', value: string) => void
}) {
  const computed = mode === 'full' && budget != null ? budget - (refund ?? 0) : confirmed
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2 text-[11.5px] font-semibold text-gray-600"><Coins className="w-3.5 h-3.5" />{label}</div>
      <div className="grid grid-cols-3 gap-2.5">
        {mode === 'full' ? (
          <>
            <Field label="費用予算（同梱・予納）"><MoneyInput value={budget} onCommit={v => onSave('cost_budget', v)} /></Field>
            <Field label="返金分（おつり等）"><MoneyInput value={refund} onCommit={v => onSave('cost_refund', v)} /></Field>
            <Field label="確定費用（予算−返金）">
              <div className="px-2 py-1.5 text-[12.5px] text-right font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded">{yen(computed)}</div>
            </Field>
          </>
        ) : (
          <>
            <div className="col-span-2" />
            <Field label="確定費用（実費）"><MoneyInput value={confirmed} onCommit={v => onSave('cost_confirmed', v)} /></Field>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] text-gray-400">{label}</span>
      {children}
    </div>
  )
}

/**
 * ダブルチェック（自分以外）。押すと現在ユーザー名＋日時を記録する。
 */
export function DoubleCheck({ label, name, at, onSet }: {
  label: string
  name: string | null
  at: string | null
  onSet: (checkName: string | null, checkAt: string | null) => void
}) {
  const user = useAuth()
  const me = user?.memberName ?? user?.email ?? '担当者'
  const done = !!name
  return (
    <div className="flex-1 min-w-[150px] rounded-md border border-gray-200 px-2.5 py-2">
      <div className="text-[10.5px] text-gray-400 mb-1.5">{label}</div>
      {done ? (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
            <UserCheck className="w-3 h-3" strokeWidth={2.25} />確認済 {name}{at ? `・${at.slice(5, 10).replace('-', '/')}` : ''}
          </span>
          <button type="button" onClick={() => onSet(null, null)} title="確認を取消" className="text-gray-300 hover:text-red-500"><UserX className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => onSet(me, new Date().toISOString())} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-gray-500 bg-white border border-gray-300 hover:border-emerald-400 hover:text-emerald-700">
          <UserCheck className="w-3 h-3" strokeWidth={2} />ダブルチェック（自分以外）
        </button>
      )}
    </div>
  )
}
