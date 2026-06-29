'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ExternalLink, Receipt, Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { advanceTotal } from '@/lib/advancePayment'
import {
  Section, FieldGrid, Field,
  InlineCurrency, InlineDate, InlineTextarea,
} from '@/components/ui/InlineFields'
import type { CaseRow, ExpenseRow, TaskRow, CaseReferralRow } from '@/types'
import TabHeader from './TabHeader'
import RewardBreakdownSection from './RewardBreakdownSection'

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

  // 立替実費の追加・削除（請求タブで直接管理）
  const [expForm, setExpForm] = useState<{ item: string; amount: string; date: string } | null>(null)
  const addExpense = async () => {
    if (!expForm?.item || !expForm.amount) return
    const supabase = createClient()
    const { error } = await supabase.from('expenses').insert({ case_id: caseData.id, item_name: expForm.item, amount: Number(expForm.amount), expense_date: expForm.date || null })
    if (error) { showToast(`追加に失敗: ${error.message}`, 'error'); return }
    setExpForm(null); _onRefresh()
  }
  const deleteExpense = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    _onRefresh()
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

  const getRelatedTaskName = (expense: ExpenseRow) => {
    if (expense.related_task_id) {
      const task = tasks.find(t => t.id === expense.related_task_id)
      if (task) return task.title
    }
    return expense.related_task ?? '—'
  }

  return (
    <div className="space-y-3.5">
      {!orderSheetMode && <TabHeader title="請求" description="報酬の内訳（司法/行政）・立替実費・請求書の発行・入金確認の管理" />}

      {/* 報酬内訳（司法/行政。割引後合計＝確定報酬） */}
      <Section title="報酬内訳（司法／行政）">
        <RewardBreakdownSection caseId={caseData.id} onTotals={applyRewardTotals} />
        <p className="text-[11px] text-gray-400 mt-2">各士業の「割引後」合計が確定報酬になり、前受金・確定請求の発行金額に反映されます。</p>
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

          {/* 2. 報酬・前受金（報酬金額は上の内訳から自動） */}
          <Section title="報酬・前受金" icon="💳">
            <FieldGrid cols={1}>
              <Field label="確定報酬（行政）＝内訳合計" value={yen(caseData.fee_administrative)} mono />
              <Field label="確定報酬（司法）＝内訳合計" value={yen(caseData.fee_judicial)} mono />
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
                      <th className="pb-1.5 w-7" />
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
                        <td className="py-1.5 text-center">
                          {!e.billed_invoice_id && <button type="button" onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td className="pt-2 font-medium text-gray-700 text-xs">合計</td>
                      <td className="pt-2 text-right font-bold text-gray-900 font-mono text-xs">¥{expenseTotal.toLocaleString()}</td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="text-gray-400 text-center py-3 text-xs">立替実費はありません</p>
              )}
              {/* 立替の追加（請求タブで直接） */}
              {expForm ? (
                <div className="mt-2 flex items-center gap-2 flex-wrap border-t border-gray-100 pt-2">
                  <input value={expForm.item} onChange={e => setExpForm({ ...expForm, item: e.target.value })} placeholder="費目 *" className="px-2 py-1 text-[12px] border border-gray-200 rounded w-40 outline-none focus:border-brand-400" />
                  <input value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value.replace(/[^\d]/g, '') })} placeholder="金額 *" inputMode="numeric" className="px-2 py-1 text-[12px] border border-gray-200 rounded w-28 text-right outline-none focus:border-brand-400" />
                  <input type="date" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} className="px-2 py-1 text-[12px] border border-gray-200 rounded outline-none focus:border-brand-400" />
                  <button type="button" onClick={addExpense} disabled={!expForm.item || !expForm.amount} className="px-3 py-1 text-[12px] font-semibold text-white bg-brand-600 rounded hover:bg-brand-700 disabled:opacity-50">追加</button>
                  <button type="button" onClick={() => setExpForm(null)} className="px-2 py-1 text-[12px] text-gray-500 hover:text-gray-700">取消</button>
                </div>
              ) : (
                <button type="button" onClick={() => setExpForm({ item: '', amount: '', date: '' })} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" /> 立替実費を追加</button>
              )}
              <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
                請求書の発行・入金確認は<Link href={`/billing?case=${caseData.id}`} className="text-brand-600 hover:underline mx-0.5">請求・入金</Link>で行えます（報酬・立替はこの内訳から発行）。
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
