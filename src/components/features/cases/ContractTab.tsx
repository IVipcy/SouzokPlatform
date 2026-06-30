'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ExternalLink, Receipt } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { advanceTotal } from '@/lib/advancePayment'
import {
  Section, FieldGrid, Field,
  InlineDate, InlineTextarea,
} from '@/components/ui/InlineFields'
import type { CaseRow, ExpenseRow, TaskRow, CaseReferralRow } from '@/types'
import TabHeader from './TabHeader'
import RewardBreakdownSection from './RewardBreakdownSection'
import BillingExpensesSection from './BillingExpensesSection'

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

export default function ContractTab({ caseData, expenses, onRefresh: _onRefresh, patchCase, orderSheetMode = false, referrals = [] }: Props) {
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

  // 返金（請求タブで記録されたマイナス入金）を案件単位で集計し、読み取り表示する。
  // 入力は請求タブ一本。ここは派生表示（前受金/確定 × 行政/司法 の内訳＋理由）。
  type RefundInfo = {
    total: number
    buckets: { label: string; amount: number }[]
    reasons: { date: string; amount: number; note: string }[]
  }
  const [refund, setRefund] = useState<RefundInfo | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('invoices')
        .select('invoice_type, firm_type, payments(amount, is_refund, match_note, payment_date)')
        .eq('case_id', caseData.id)
      if (!alive) return
      const firmLabel = (f: string | null) => (f === 'shiho' ? '司法' : '行政')
      const bucketMap = new Map<string, number>()
      const reasons: RefundInfo['reasons'] = []
      let total = 0
      type InvLite = { invoice_type: string; firm_type: string | null; payments: { amount: number; is_refund: boolean; match_note: string | null; payment_date: string | null }[] | null }
      for (const inv of (data ?? []) as InvLite[]) {
        for (const p of inv.payments ?? []) {
          if (!p.is_refund) continue
          const amt = -p.amount // マイナス保存→正の返金額
          total += amt
          const label = `${inv.invoice_type === '確定請求' ? '確定' : '前受金'}（${firmLabel(inv.firm_type)}）`
          bucketMap.set(label, (bucketMap.get(label) ?? 0) + amt)
          reasons.push({ date: p.payment_date ?? '', amount: amt, note: p.match_note ?? '' })
        }
      }
      if (total <= 0) { setRefund(null); return }
      reasons.sort((a, b) => (b.date).localeCompare(a.date))
      setRefund({ total, buckets: [...bucketMap].map(([label, amount]) => ({ label, amount })), reasons })
    })()
    return () => { alive = false }
  }, [caseData.id])

  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  // 報酬内訳の合計 → cases.fee_judicial / fee_administrative へ反映（確定報酬）
  const applyRewardTotals = async (shihou: number, gyousei: number) => {
    const patch: Partial<CaseRow> = {}
    if ((caseData.fee_judicial ?? 0) !== shihou) patch.fee_judicial = shihou
    if ((caseData.fee_administrative ?? 0) !== gyousei) patch.fee_administrative = gyousei
    if (Object.keys(patch).length > 0) await patchCase(patch)
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

  return (
    <div className="space-y-3.5">
      {!orderSheetMode && <TabHeader title="請求" description="報酬の内訳（司法/行政）・立替実費・請求書の発行・入金確認の管理" />}

      {/* 請求料金内訳（司法/行政。割引後合計＝確定報酬・前受金組込） */}
      <Section title="請求料金内訳（司法／行政）">
        <RewardBreakdownSection
          caseId={caseData.id}
          onTotals={applyRewardTotals}
          advance={{ 司法: caseData.advance_payment_judicial, 行政: caseData.advance_payment_administrative }}
          onAdvanceChange={(shigyo, v) => save(shigyo === '司法' ? 'advance_payment_judicial' : 'advance_payment_administrative', v)}
        />
        <p className="text-[11px] text-gray-400 mt-2">各士業の「割引後」合計が確定報酬になり、前受金を差し引いた額が確定請求になります。</p>
      </Section>

      {/* 立替実費（司法/行政・課税/非課税） */}
      <Section title="立替実費（司法／行政・課税/非課税）">
        <BillingExpensesSection caseId={caseData.id} />
        <p className="text-[11px] text-gray-400 mt-2">名目を選ぶと課税/非課税が自動。金額＝数量×単価（空欄なら直接入力）。請求書はこの内訳から生成します。</p>
      </Section>


          {/* 1. 契約情報（契約形態は「担当・受注内容」タブへ移設） */}
          <Section title="契約情報">
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

          {/* 2. 請求サマリー（報酬・前受金は上の内訳から自動） */}
          <Section title="請求サマリー" icon="💳">
            <FieldGrid cols={1}>
              <Field label="確定報酬（行政）＝内訳合計" value={yen(caseData.fee_administrative)} mono />
              <Field label="確定報酬（司法）＝内訳合計" value={yen(caseData.fee_judicial)} mono />
              <Field label="報酬小計" value={yen(feeSubtotal)} mono />
              <Field label="前受金小計" value={yen(advanceTotal(caseData))} mono />
              <Field label="請求金額（確定＝報酬−前受金）" value={yen(confirmedAmount)} mono />
              <InlineTextarea
                label="メモ"
                value={caseData.invoice_memo}
                onSave={v => save('invoice_memo', v)}
              />
            </FieldGrid>

            {/* 返金（請求タブで記録されたマイナス入金の読み取り表示。前受金/確定×行/司の内訳＋理由） */}
            {refund && (
              <div className="mt-3 pt-3 border-t border-rose-100">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[12px] font-bold text-rose-700">返金（請求タブで記録）</span>
                  <span className="text-[11px] text-gray-400">実際の受領額はこの分だけ減ります（売上集計への反映は別途）</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
                  <span className="text-[13px]"><span className="text-gray-500">返金額合計</span> <span className="font-mono font-bold text-rose-600">▲{yen(refund.total)}</span></span>
                  {refund.buckets.map(b => (
                    <span key={b.label} className="text-[12px] text-gray-600">{b.label} <span className="font-mono text-rose-600">▲{yen(b.amount)}</span></span>
                  ))}
                </div>
                <ul className="space-y-0.5">
                  {refund.reasons.map((r, i) => (
                    <li key={i} className="text-[11px] text-gray-500 flex gap-2">
                      <span className="font-mono text-gray-400 shrink-0">{r.date || '—'}</span>
                      <span className="font-mono text-rose-500 shrink-0">▲{yen(r.amount)}</span>
                      <span className="break-all">{r.note || '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 請求・入金 への導線（オーダーシート埋め込み時は不要なので非表示） */}
            {!orderSheetMode && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link
                href={`/billing?case=${caseData.id}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-medium text-brand-700 bg-brand-50/70 hover:bg-brand-100 border border-brand-100 rounded transition"
              >
                <Receipt className="w-3.5 h-3.5 text-brand-500" />
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
