'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ExternalLink, Receipt } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Section, FieldGrid, Field,
  InlineCurrency, InlineDate, InlineTextarea,
} from '@/components/ui/InlineFields'
import type { CaseRow, ExpenseRow, TaskRow, PartnerRow } from '@/types'

type Props = {
  caseData: CaseRow
  expenses: ExpenseRow[]
  tasks: TaskRow[]
  onRefresh: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // オーダーシート埋め込み時: 請求サマリーを非表示
  orderSheetMode?: boolean
}

const yen = (v: number | null | undefined) =>
  v != null ? `¥${v.toLocaleString()}` : '未設定'

export default function ContractTab({ caseData, expenses, tasks, onRefresh: _onRefresh, patchCase, orderSheetMode = false }: Props) {
  const [partner, setPartner] = useState<PartnerRow | null>(null)

  // パートナー取得
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!caseData.partner_id) { setPartner(null); return }
    const fetchPartner = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('partners').select('*').eq('id', caseData.partner_id!).single()
      setPartner(data as PartnerRow | null)
    }
    fetchPartner()
  }, [caseData.partner_id])

  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  // 計算値
  const feeSubtotal = (caseData.fee_administrative ?? 0) + (caseData.fee_judicial ?? 0)
  const confirmedAmount = feeSubtotal - (caseData.advance_payment ?? 0)
  const partnerCompensation = partner
    ? (caseData.fee_administrative ?? 0) * (partner.kickback_rate ?? 0) / 100
    : null
  const expenseTotal = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)
  const feeRealEstate = caseData.fee_real_estate ?? 0
  const feeTaxReferral = caseData.fee_tax_referral ?? 0
  const totalRevenue = feeSubtotal + feeRealEstate + feeTaxReferral

  const getRelatedTaskName = (expense: ExpenseRow) => {
    if (expense.related_task_id) {
      const task = tasks.find(t => t.id === expense.related_task_id)
      if (task) return task.title
    }
    return expense.related_task ?? '—'
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

        {/* ─── Left column ─── */}
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
                label="前受金"
                value={caseData.advance_payment}
                onSave={v => save('advance_payment', v)}
              />
              <Field label="請求金額（確定）" value={yen(confirmedAmount)} mono />
              <InlineTextarea
                label="メモ"
                value={caseData.invoice_memo}
                onSave={v => save('invoice_memo', v)}
              />
            </FieldGrid>

            {/* 請求・入金 への導線 */}
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
          </Section>

          {/* 3. 付帯収益 */}
          <Section title="付帯収益" icon="💹">
            <FieldGrid>
              <InlineCurrency
                label="不動産売却手数料見込"
                value={caseData.fee_real_estate}
                onSave={v => save('fee_real_estate', v)}
              />
              <InlineCurrency
                label="税理士紹介手数料"
                value={caseData.fee_tax_referral}
                onSave={v => save('fee_tax_referral', v)}
              />
            </FieldGrid>
            <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
              <span className="text-gray-500 font-medium text-sm">案件トータル収益見込</span>
              <span className="text-brand-600 font-bold text-base">{yen(totalRevenue || null)}</span>
            </div>
          </Section>

          {/* 4. パートナー報酬 */}
          <Section title="パートナー報酬" icon="🤝">
            <FieldGrid cols={1}>
              <Field label="紹介元パートナー" value={partner ? partner.name : '未設定'} />
              <Field label="パートナー報酬割合" value={partner ? `${partner.kickback_rate}%` : '—'} mono />
              <Field
                label="パートナー報酬金額"
                value={partner && partnerCompensation != null ? yen(Math.round(partnerCompensation)) : '—'}
                mono
              />
            </FieldGrid>
            <div className="text-[12px] text-gray-400 mt-2">
              ※ 紹介元パートナーは「基本情報 → 受注ルート・紹介 → 紹介パートナー」で選択します。
              報酬金額は「確定金額（行政）× 還元率」で自動計算されます。
            </div>
          </Section>
        </div>

        {/* ─── Right column ─── */}
        <div className="space-y-3.5">

          {/* 収益サマリーカード */}
          <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
            <div className="text-[12px] font-semibold opacity-70 tracking-wider uppercase mb-1.5">案件トータル収益見込</div>
            <div className="text-[26px] font-extrabold tracking-tight mb-2.5">
              {totalRevenue > 0 ? `¥${totalRevenue.toLocaleString()}` : '—'}
            </div>
            <div className="space-y-1 text-[13px]">
              <div className="flex justify-between">
                <span className="opacity-70">確定金額合計（行政＋司法）</span>
                <span className="font-mono">{feeSubtotal > 0 ? `¥${feeSubtotal.toLocaleString()}` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">不動産手数料見込</span>
                <span className="font-mono">{feeRealEstate > 0 ? `¥${feeRealEstate.toLocaleString()}` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">税理士紹介手数料</span>
                <span className="font-mono">{feeTaxReferral > 0 ? `¥${feeTaxReferral.toLocaleString()}` : '—'}</span>
              </div>
            </div>
          </div>

          {/* 立替実費明細（読み取り専用・入力は /billing の請求書発行モーダルで） */}
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
        </div>
      </div>

      {/* ─── 請求サマリー（下部）。オーダーシート埋め込み時は非表示 ─── */}
      {!orderSheetMode && (
      <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
        <div className="text-[12px] font-semibold opacity-70 tracking-wider uppercase mb-2.5">請求サマリー</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-[13px] opacity-80 mb-0.5">報酬小計</div>
            <div className="text-lg font-bold tracking-tight">{yen(feeSubtotal)}</div>
          </div>
          <div>
            <div className="text-[13px] opacity-80 mb-0.5">立替実費合計</div>
            <div className="text-lg font-bold tracking-tight">{yen(expenseTotal)}</div>
          </div>
          <div>
            <div className="text-[13px] opacity-80 mb-0.5">請求金額（確定）</div>
            <div className="text-lg font-bold tracking-tight">{yen(confirmedAmount)}</div>
          </div>
          <div>
            <div className="text-[13px] opacity-80 mb-0.5">パートナー報酬額</div>
            <div className="text-lg font-bold tracking-tight">
              {partnerCompensation != null ? yen(Math.round(partnerCompensation)) : '—'}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
