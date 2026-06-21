'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ExternalLink, Receipt } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { advanceTotal } from '@/lib/advancePayment'
import {
  Section, FieldGrid, Field,
  InlineCurrency, InlineDate, InlineTextarea,
} from '@/components/ui/InlineFields'
import type { CaseRow, ExpenseRow, TaskRow, CaseReferralRow } from '@/types'

type Props = {
  caseData: CaseRow
  expenses: ExpenseRow[]
  tasks: TaskRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // オーダーシート埋め込み時: 請求サマリーを非表示
  orderSheetMode?: boolean
  // 他事業者紹介（紹介料を付帯収益に合算）
  referrals?: CaseReferralRow[]
}

const yen = (v: number | null | undefined) =>
  v != null ? `¥${v.toLocaleString()}` : '未設定'

export default function ContractTab({ caseData, expenses, tasks, onRefresh: _onRefresh, patchCase, orderSheetMode = false, referrals = [] }: Props) {
  // 紹介元（面談ルートの詳細）の紹介料率を取得 → パートナー報酬の自動計算に使う
  const [referralRate, setReferralRate] = useState<number | null>(null)
  useEffect(() => {
    const route = caseData.order_route
    const name = caseData.order_route_detail
    let alive = true
    ;(async () => {
      if (!route || !name) { if (alive) setReferralRate(null); return }
      const supabase = createClient()
      const { data } = await supabase.from('referral_sources').select('referral_rate').eq('route', route).eq('name', name).maybeSingle()
      if (alive) setReferralRate((data?.referral_rate ?? null) as number | null)
    })()
    return () => { alive = false }
  }, [caseData.order_route, caseData.order_route_detail])

  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  // 計算値
  const feeSubtotal = (caseData.fee_administrative ?? 0) + (caseData.fee_judicial ?? 0)
  const confirmedAmount = feeSubtotal - advanceTotal(caseData)
  const partnerName = caseData.order_route_detail
  const partnerCompensation = referralRate != null
    ? (caseData.fee_administrative ?? 0) * referralRate / 100
    : null
  const expenseTotal = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)
  // 他事業者紹介の見込み報酬（紹介料）を付帯収益として集計。
  // ※ 旧「不動産売却手数料見込(fee_real_estate)」は他事業者紹介 紹介料(不動産)と重複のため廃止。
  const referralFeeTotal = referrals.reduce((s, r) => s + (r.estimated_fee ?? 0), 0)
  const totalRevenue = feeSubtotal + referralFeeTotal

  const getRelatedTaskName = (expense: ExpenseRow) => {
    if (expense.related_task_id) {
      const task = tasks.find(t => t.id === expense.related_task_id)
      if (task) return task.title
    }
    return expense.related_task ?? '—'
  }

  return (
    <div className="space-y-3.5">

          {/* 1. 契約情報（契約形態は「担当・受注内容」タブへ移設） */}
          <Section title="契約情報" icon="📄">
            <FieldGrid>
              <InlineDate
                label="契約日"
                value={caseData.contract_date}
                onSave={v => save('contract_date', v)}
              />
            </FieldGrid>
            <FieldGrid cols={1}>
              <InlineTextarea
                label="特記事項"
                value={caseData.notes}
                onSave={v => save('notes', v)}
                fullWidth
              />
            </FieldGrid>
          </Section>

          {/* 2. 報酬（契約条件） */}
          <Section title="報酬（契約条件）" icon="💳">
            <FieldGrid cols={1}>
              <InlineCurrency
                label="報酬金額（行政）"
                value={caseData.fee_administrative}
                onSave={v => save('fee_administrative', v)}
              />
              <InlineCurrency
                label="報酬金額（司法）"
                value={caseData.fee_judicial}
                onSave={v => save('fee_judicial', v)}
              />
              <Field label="報酬小計" value={yen(feeSubtotal)} mono />
              <InlineCurrency
                label="前受金（行政）"
                value={caseData.advance_payment_administrative}
                onSave={v => save('advance_payment_administrative', v)}
              />
              <InlineCurrency
                label="前受金（司法）"
                value={caseData.advance_payment_judicial}
                onSave={v => save('advance_payment_judicial', v)}
              />
              <Field label="前受金小計" value={yen(advanceTotal(caseData))} mono />
              <Field label="請求金額（確定）" value={yen(confirmedAmount)} mono />
              <InlineTextarea
                label="メモ"
                value={caseData.invoice_memo}
                onSave={v => save('invoice_memo', v)}
              />
            </FieldGrid>

            {/* 請求・入金 への導線（オーダーシート埋め込み時は不要なので非表示） */}
            {!orderSheetMode && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link
                href={`/billing?case=${caseData.id}`}
                className="inline-flex items-center gap-2 px-3 py-2 text-[13px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md transition w-full justify-center"
              >
                <Receipt className="w-4 h-4" />
                請求書発行・入金状況は「請求・入金」で管理
                <ExternalLink className="w-3 h-3 opacity-60" />
              </Link>
              <p className="text-[11px] text-gray-400 mt-1.5 px-1">
                請求書ステータス・請求日・入金ステータス・入金確認日・入金額は <span className="font-mono">/billing</span> で一元管理しています。
              </p>
            </div>
            )}
          </Section>

          {/* 3. 付帯収益（他事業者紹介の紹介料・見込み。入力は「他事業者紹介」タブ） */}
          <Section title="付帯収益（他事業者紹介 紹介料・見込み）" icon="💹">
            {referrals.length === 0 ? (
              <div className="text-[12px] text-gray-300">他事業者紹介はありません（「他事業者紹介」タブで登録）</div>
            ) : (
              <div className="max-w-md space-y-1">
                {referrals.map(r => (
                  <div key={r.id} className="flex justify-between gap-4 text-[13px]">
                    <span className="text-gray-500">{r.partner_type}{r.firm_name ? `（${r.firm_name}）` : ''}</span>
                    <span className="font-mono text-gray-700">{yen(r.estimated_fee)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-4 text-[13px] border-t border-gray-100 pt-1 mt-1">
                  <span className="text-gray-500 font-medium">紹介料合計</span>
                  <span className="font-mono font-semibold text-gray-800">{yen(referralFeeTotal || null)}</span>
                </div>
              </div>
            )}
          </Section>

          {/* 4. パートナー報酬（紹介元の紹介料率で自動計算） */}
          <Section title="パートナー報酬" icon="🤝">
            <FieldGrid cols={1}>
              <Field label="紹介元パートナー" value={partnerName || '未設定'} />
              <Field label="パートナー報酬割合" value={referralRate != null ? `${referralRate}%` : '—'} mono />
              <Field
                label="パートナー報酬金額"
                value={partnerCompensation != null ? yen(Math.round(partnerCompensation)) : '—'}
                mono
              />
            </FieldGrid>
            <div className="text-[12px] text-gray-400 mt-2">
              ※ 紹介元は「面談ルート → 詳細（紹介元）」で選択します。報酬金額は「確定金額（行政）× 紹介料率」で自動計算（紹介料率は紹介元マスタで管理）。
            </div>
          </Section>

          {/* 収益サマリーカード（パートナー報酬の下に配置。フラット＝ブランド淡色＋枠線） */}
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
            <div className="text-[12px] font-semibold text-brand-700 mb-1.5">案件トータル収益見込</div>
            <div className="text-[26px] font-bold tracking-tight text-brand-800 mb-2.5">
              {totalRevenue > 0 ? `¥${totalRevenue.toLocaleString()}` : '—'}
            </div>
            <div className="max-w-md space-y-1 text-[13px]">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">確定金額合計（行政＋司法）</span>
                <span className="font-mono text-gray-700">{feeSubtotal > 0 ? `¥${feeSubtotal.toLocaleString()}` : '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">他事業者紹介 紹介料</span>
                <span className="font-mono text-gray-700">{referralFeeTotal > 0 ? `¥${referralFeeTotal.toLocaleString()}` : '—'}</span>
              </div>
            </div>
          </div>

          {/* 立替実費明細（読み取り専用・入力は /billing の請求書発行モーダルで）。
              オーダーシート作成時は不要（対応結果で発生する費用のため）→ OS時は非表示 */}
          {!orderSheetMode && (
          <Section title="立替実費明細">
            <div className="text-sm">
              {expenses.length > 0 ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[13px] text-gray-400 border-b border-gray-100">
                      <th className="pb-1.5 font-medium">費目</th>
                      <th className="pb-1.5 font-medium text-right">金額</th>
                      <th className="pb-1.5 font-medium">発生日</th>
                      <th className="pb-1.5 font-medium">備考</th>
                      <th className="pb-1.5 font-medium text-[11px]">請求</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-1.5 text-xs">{e.category || e.item_name}</td>
                        <td className="py-1.5 text-right font-mono text-xs">¥{e.amount.toLocaleString()}</td>
                        <td className="py-1.5 text-gray-500 text-xs">{e.expense_date ?? '—'}</td>
                        <td className="py-1.5 text-gray-500 text-xs truncate max-w-[80px]">
                          {getRelatedTaskName(e) !== '—' ? getRelatedTaskName(e) : (e.notes ?? '—')}
                        </td>
                        <td className="py-1.5">
                          {e.billed_invoice_id ? (
                            <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">請求済</span>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">未請求</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td className="pt-2 font-medium text-gray-700 text-xs">合計</td>
                      <td className="pt-2 text-right font-bold text-gray-900 font-mono text-xs">¥{expenseTotal.toLocaleString()}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="text-gray-400 text-center py-3 text-xs">立替実費はありません</p>
              )}
              <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
                立替実費の追加・編集は<Link href={`/billing?case=${caseData.id}`} className="text-brand-600 hover:underline mx-0.5">請求・入金</Link>の請求書発行時に行えます。
              </p>
            </div>
          </Section>
          )}

      {/* ─── 請求サマリー（下部）。オーダーシート埋め込み時は非表示。フラット＝ブランド淡色＋枠線 ─── */}
      {!orderSheetMode && (
      <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
        <div className="text-[12px] font-semibold text-brand-700 mb-2.5">請求サマリー</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-[12px] text-gray-500 mb-0.5">報酬小計</div>
            <div className="text-lg font-bold tracking-tight text-brand-800">{yen(feeSubtotal)}</div>
          </div>
          <div>
            <div className="text-[12px] text-gray-500 mb-0.5">立替実費合計</div>
            <div className="text-lg font-bold tracking-tight text-brand-800">{yen(expenseTotal)}</div>
          </div>
          <div>
            <div className="text-[12px] text-gray-500 mb-0.5">請求金額（確定）</div>
            <div className="text-lg font-bold tracking-tight text-brand-800">{yen(confirmedAmount)}</div>
          </div>
          <div>
            <div className="text-[12px] text-gray-500 mb-0.5">パートナー報酬額</div>
            <div className="text-lg font-bold tracking-tight text-brand-800">
              {partnerCompensation != null ? yen(Math.round(partnerCompensation)) : '—'}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
