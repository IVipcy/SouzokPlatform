'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ExternalLink, Receipt, Check, Save, Calculator } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/providers/AuthProvider'
import { showToast } from '@/components/ui/Toast'
import { advanceTotal } from '@/lib/advancePayment'
import { BILLING_PATTERNS, billingPatternOf, SHIGYO_COLORS } from '@/lib/constants'
import {
  Section,
  InlineTextarea,
} from '@/components/ui/InlineFields'
import HintTip from '@/components/ui/HintTip'
import type { CaseRow, ExpenseRow, TaskRow, CaseReferralRow } from '@/types'
import TabHeader from './TabHeader'
import RewardBreakdownSection from './RewardBreakdownSection'
import { MoneyInput } from './FinancialAssetsTable'
import BillingExpensesSection from './BillingExpensesSection'
import KakuteiInvoiceModal from './KakuteiInvoiceModal'
import InvoiceDocumentModal from './InvoiceDocumentModal'
import ImportShihoInvoiceModal from './ImportShihoInvoiceModal'
import { FileText, Download } from 'lucide-react'
import { isMinimalMode } from '@/lib/featureMode'

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

// expenses / referrals は受け取るだけ（付帯収益・パートナー報酬の削除で参照しなくなった。呼び出し側の互換のため型には残す）
export default function ContractTab({ caseData, tasks, onRefresh: _onRefresh, patchCase, orderSheetMode = false }: Props) {
  // ミニマム運用モードでは請求サマリー・付帯収益・パートナー報酬・案件トータル収益見込を非表示
  const minimal = isMinimalMode()
  // 請求書の発行は受注確定（受注／戻り受注）以降のみ。依頼確定待ち以前は不可。
  const canBill = ['受注', '戻り受注', '対応中', '完了'].includes(caseData.status)
  // 請求パターン（案件単位）。②③は前受金に確定分を含む「一括」＝確定請求なし。③は立替実費もなし。
  const pattern = billingPatternOf(caseData.billing_pattern)
  // 'full'=報酬＋立替の確定請求書 / 'expense'=立替実費だけの請求書 / null=閉じている
  const [kakuteiOpen, setKakuteiOpen] = useState<'full' | 'expense' | null>(null)
  const [advanceInvoiceOpen, setAdvanceInvoiceOpen] = useState(false)
  const [importShihoOpen, setImportShihoOpen] = useState(false)
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

  // 立替実費（billing_expense_items）の合計。確定請求＝報酬＋立替実費−前受金 に含める。
  const [billingExpTotal, setBillingExpTotal] = useState(0)
  useEffect(() => {
    const supabase = createClient()
    supabase.from('billing_expense_items').select('amount').eq('case_id', caseData.id).then(({ data }) => {
      setBillingExpTotal(((data ?? []) as { amount: number }[]).reduce((n, r) => n + (r.amount ?? 0), 0))
    })
  }, [caseData.id])

  // 請求完了バッジ用：この案件の請求書（前受金／確定請求）の状態。
  // 会計上は「請求書発行=売掛計上=請求完了」。前受金請求書を作成すると invoices は
  //   status='作成済' + issued_date=今日 で作られる（api/documents/invoice）。
  // そのため sent(=請求完了扱い) は 発行済(issued_date あり) or 入金待ち以降 で判定する。
  //   exists=作成済以上・sent=発行済(=請求完了)・paid=入金済
  type Leg = { exists: boolean; sent: boolean; paid: boolean }
  const [invLegs, setInvLegs] = useState<{ advance: Leg; final: Leg } | null>(null)
  const loadLegs = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('invoices').select('invoice_type, status, issued_date').eq('case_id', caseData.id)
    const rows = (data ?? []) as { invoice_type: string; status: string; issued_date: string | null }[]
    const legOf = (r: typeof rows): Leg => ({
      exists: r.length > 0,
      // 発行済(issued_date あり)＝請求完了。入金追跡の status(入金待ち/入金済)でも真。
      sent: r.some(x => !!x.issued_date || ['入金待ち', '一部入金', '入金済'].includes(x.status)),
      paid: r.some(x => x.status === '入金済'),
    })
    setInvLegs({ advance: legOf(rows.filter(r => r.invoice_type === '前受金')), final: legOf(rows.filter(r => r.invoice_type === '確定請求')) })
  }, [caseData.id])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadLegs() }, [loadLegs])


  // 計算値
  const feeSubtotal = (caseData.fee_administrative ?? 0) + (caseData.fee_judicial ?? 0)
  const confirmedAmount = feeSubtotal + billingExpTotal - advanceTotal(caseData)

  // 請求完了判定：会計上、請求書発行=売掛計上=請求完了扱いとする。
  // 前受金が発行済(=送付済)＋（①②は確定/立替も発行済）。③は前受金のみで完了。
  // 入金追跡は 請求/入金 一覧側の invoice.status(未請求/入金待ち/入金済) と経理タブで継続。
  const reqFinal = pattern.finalInvoiceLabel != null
  const anyInvoice = !!invLegs && (invLegs.advance.exists || invLegs.final.exists)
  const billingComplete = !!invLegs && invLegs.advance.sent && (!reqFinal || invLegs.final.sent)
  // 請求ステータスの脚チップ（前受金／確定 or 立替）。
  //   会計上、請求書発行=売掛計上=請求完了として扱う(集約チップと同じルール)。
  //   発行済(sent) 以降はすべて「請求完了」表示。入金追跡は 請求/入金 一覧側・経理タブで並行。
  const legChip = (label: string, leg: Leg | null, na = false) => {
    const paid = !!leg?.paid, sent = !!leg?.sent, exists = !!leg?.exists
    const cls = na || (!exists) ? 'bg-gray-50 text-gray-400 border-gray-200'
      : sent ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-amber-50 text-amber-700 border-amber-200'
    const txt = na ? '対象外' : (paid || sent) ? '請求完了' : exists ? '作成済（未発行）' : '未請求'
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${cls}`} title={paid ? '請求完了 (入金済)' : sent ? '請求完了 (入金待ち)' : undefined}>{label}：{txt}</span>
  }

  return (
    <div className="space-y-3.5">
      {!orderSheetMode && (
        <TabHeader title="請求" description="請求料金の内訳（司法／行政）・立替実費・請求書の発行・入金の確認をここで行います。"
          right={
            <div className="flex items-center gap-2">
              {!canBill && <span className="text-[11px] text-gray-400">受注（戻り受注含む）以降で発行できます</span>}
              <button type="button" disabled={!canBill} onClick={() => canBill && setAdvanceInvoiceOpen(true)} title={canBill ? undefined : '受注／戻り受注以降で発行できます'} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"><FileText className="w-3.5 h-3.5" /> 前受金請求書を作成</button>
              {pattern.finalInvoiceLabel && (
                <button type="button" disabled={!canBill} onClick={() => canBill && setKakuteiOpen(pattern.value === 'lump_expense' ? 'expense' : 'full')} title={canBill ? undefined : '受注／戻り受注以降で発行できます'} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-600"><FileText className="w-3.5 h-3.5" /> {pattern.finalInvoiceLabel}</button>
              )}
              {/* 立替実費だけを先に請求したいケース（報酬は後日 or 別建て）。②は上のボタンが立替実費そのものなので出さない。 */}
              {pattern.hasExpense && pattern.value !== 'lump_expense' && (
                <button type="button" disabled={!canBill} onClick={() => canBill && setKakuteiOpen('expense')} title={canBill ? '立替実費だけの請求書を作ります（報酬は載せません）' : '受注／戻り受注以降で発行できます'} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"><Receipt className="w-3.5 h-3.5" /> 立替実費のみ請求書</button>
              )}
              {pattern.lumpNote && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-md" title="前受金に確定請求ぶんを含む一括パターンです">{pattern.lumpNote}</span>}
              {/* 司法は相続の力で発行 → 金額を取り込んで確定請求レコードを作成済で登録（入金待ちは請求・入金タブで） */}
              <button type="button" disabled={!canBill} onClick={() => canBill && setImportShihoOpen(true)} title={canBill ? '司法書士請求書 読込・反映：請求書画像をOCRで読み取り、司法の報酬・登録免許税/印紙税・立替実費に反映して確定請求を登録' : '受注／戻り受注以降で登録できます'} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"><Download className="w-3.5 h-3.5" /> 司法書士請求書 読込・反映</button>
            </div>
          }
        />
      )}
      {kakuteiOpen && <KakuteiInvoiceModal isOpen onClose={() => setKakuteiOpen(null)} caseData={caseData} tasks={tasks} expenseOnly={kakuteiOpen === 'expense'} onSaved={_onRefresh} />}
      {advanceInvoiceOpen && <InvoiceDocumentModal isOpen onClose={() => setAdvanceInvoiceOpen(false)} caseData={caseData} tasks={tasks} docType="請求書" onSaved={_onRefresh} />}
      {importShihoOpen && <ImportShihoInvoiceModal isOpen onClose={() => setImportShihoOpen(false)} caseData={caseData} onSaved={_onRefresh} />}

      {/* 請求ステータス（案件としての請求完了をパターン別に判定）。パターンの上に配置。 */}
      {!orderSheetMode && invLegs && (
        <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] font-semibold text-gray-700">請求ステータス</span>
            {billingComplete
              ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><Check className="w-3.5 h-3.5" strokeWidth={2.5} />請求完了</span>
              : anyInvoice
                ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200">請求中</span>
                : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold bg-gray-50 text-gray-400 border border-gray-200">未請求</span>}
            <span className="ml-auto flex items-center gap-1.5 flex-wrap">
              {legChip('前受金', invLegs.advance)}
              {reqFinal
                ? legChip(pattern.finalLegLabel, invLegs.final)
                : legChip('確定請求', null, true)}
            </span>
          </div>
        </div>
      )}

      {/* 経理入力欄（経理・システム管理者のみ編集。変更保存時に受注/管理担当へ通知） */}
      {!orderSheetMode && <AccountingMemoCard caseData={caseData} onRefresh={_onRefresh} />}

      {/* 請求パターン（案件単位）。②③は前受金＝確定（一括）。契約時に受注担当／管理担当が選択。 */}
      {!orderSheetMode && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/40 px-3.5 py-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[12.5px] font-semibold text-brand-800">請求パターン</span>
            <span className="text-[11px] text-gray-400">案件単位・契約時に選択（受注担当／管理担当。変更可）</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {BILLING_PATTERNS.map(p => {
              const active = pattern.value === p.value
              return (
                <button key={p.value} type="button" onClick={() => save('billing_pattern', p.value)}
                  className={`text-left rounded-lg px-3 py-2 bg-white transition ${active ? 'border-2 border-brand-500' : 'border border-gray-200 hover:border-brand-300'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-5 h-5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center ${active ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}>{p.no}</span>
                    <span className="text-[12.5px] font-semibold text-gray-800">{p.label}</span>
                    {active && <Check className="w-3.5 h-3.5 text-brand-600 ml-auto" strokeWidth={2.5} />}
                  </div>
                  <div className="text-[11px] text-gray-500 leading-snug">{p.desc}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 前受金。契約時にもらう額なので、請求パターンのすぐ下（時系列の順）に置く。
          パターン②③（一括）は前受金＝確定報酬で入力する値がないため出さない。 */}
      {pattern.value === 'staged' && (
        <Section title="前受金（契約時に受け取る額）">
          <div className="flex items-center gap-5 flex-wrap text-[12.5px]">
            <span className="inline-flex items-center gap-2">
              <span className="font-semibold" style={{ color: SHIGYO_COLORS['行政'].color }}>行政</span>
              <span className="w-28"><MoneyInput value={caseData.advance_payment_administrative} onCommit={v => save('advance_payment_administrative', v === '' ? null : Number(v))} /></span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="font-semibold" style={{ color: SHIGYO_COLORS['司法'].color }}>司法</span>
              <span className="w-28"><MoneyInput value={caseData.advance_payment_judicial} onCommit={v => save('advance_payment_judicial', v === '' ? null : Number(v))} /></span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-gray-500">計</span>
              <span className="font-mono font-semibold text-[14px] text-gray-800 tabular-nums">{yen(advanceTotal(caseData))}</span>
            </span>
            {!orderSheetMode && invLegs && <span className="ml-auto">{legChip('前受金請求書', invLegs.advance)}</span>}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            この額を「前受金請求書を作成」で請求します。業務が終わったあと、報酬＋立替実費からこの額を差し引いたものが確定請求になります。
          </p>
        </Section>
      )}

      {/* 請求料金内訳（司法/行政。小計−割引＝確定報酬） */}
      <Section title="請求料金内訳（司法／行政）">
        <RewardBreakdownSection caseId={caseData.id} onTotals={applyRewardTotals} />
        <p className="text-[11px] text-gray-400 mt-2">
          {pattern.value === 'staged'
            ? '各士業の「小計−割引」が確定報酬になり、前受金を差し引いた額が確定請求になります。'
            : '一括のため、各士業の確定報酬（小計−割引）をそのまま前受金として請求します。'}
        </p>
      </Section>

      {/* 立替実費（司法/行政・課税/非課税）。③一括のみは立替実費の請求がない。 */}
      <Section title="立替実費（司法／行政・課税/非課税）">
        {pattern.hasExpense ? (
          <>
            <BillingExpensesSection caseId={caseData.id} />
            <p className="text-[11px] text-gray-400 mt-2">名目を選ぶと課税/非課税が自動。金額＝数量×単価（空欄なら直接入力）。請求書はこの内訳から生成します。</p>
          </>
        ) : (
          <div className="text-[12px] text-gray-400 py-2">このパターン（③一括のみ）は立替実費の請求がありません（前受金で完結）。</div>
        )}
      </Section>


          {!minimal && (<>
          {/* 請求サマリー（報酬・前受金は上の内訳から自動。契約日は受注内容へ・特記事項は廃止） */}
          <Section title="請求サマリー" icon="💳">
            {/* 計算の流れ（報酬＋実費−前受金＝請求金額）を横一列で読めるようにする。
                縦に並べると、どれが足し算でどれが引き算かが行の名前を読まないと分からなかった。 */}
            <div className="flex items-stretch flex-wrap bg-gray-50 rounded-lg py-3.5 px-1">
              <SumCell label="報酬小計" value={yen(feeSubtotal)}
                sub={<><span style={{ color: SHIGYO_COLORS['行政'].color }}>行政</span> <b className="font-normal tabular-nums">{yen(caseData.fee_administrative)}</b><br /><span style={{ color: SHIGYO_COLORS['司法'].color }}>司法</span> <b className="font-normal tabular-nums">{yen(caseData.fee_judicial)}</b></>} />
              <SumOp>＋</SumOp>
              <SumCell label="立替実費" value={yen(billingExpTotal)} sub="司法・行政の合計" />
              <SumOp>−</SumOp>
              <SumCell label="前受金" value={yen(advanceTotal(caseData))}
                sub={<>行政 <b className="font-normal tabular-nums">{yen(caseData.advance_payment_administrative)}</b><br />司法 <b className="font-normal tabular-nums">{yen(caseData.advance_payment_judicial)}</b></>} />
              <SumOp>＝</SumOp>
              <SumCell label="請求金額（確定）" value={yen(confirmedAmount)} sub="報酬＋立替実費−前受金" final />
            </div>
            <div className="flex items-start gap-2.5 mt-3">
              <span className="text-[12px] text-gray-500 flex-none pt-1.5">メモ</span>
              <div className="flex-1"><InlineTextarea label="" value={caseData.invoice_memo} onSave={v => save('invoice_memo', v)} /></div>
            </div>

            {/* 返金（請求タブで記録されたマイナス入金の読み取り表示。前受金/確定×行/司の内訳＋理由） */}
            {refund && (
              <div className="mt-3 pt-3 border-t border-rose-100">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[12px] font-bold text-rose-700">返金（請求タブで記録）</span>
                  <HintTip text="この分だけ実際の受取額が減ります（売上への反映は別で行います）。" />
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
                入金状況は「請求・入金」で管理
                <ExternalLink className="w-3 h-3 opacity-60" />
              </Link>
              <p className="text-[11px] text-gray-400 mt-1.5 px-1">
                請求書の<strong className="font-medium">発行はこの請求タブ</strong>。請求日・入金ステータス・入金確認日・入金額は <span className="font-mono">/billing</span> で管理します。
              </p>
            </div>
            )}
          </Section>

          </>)}

    </div>
  )
}

// 請求サマリーの1マス。金額を大きく、内訳を下に小さく。
function SumCell({ label, value, sub, final = false }: {
  label: string
  value: string
  sub?: React.ReactNode
  final?: boolean
}) {
  return (
    <div className={`flex-1 min-w-[130px] px-3.5 ${final ? 'border-l border-gray-300' : ''}`}>
      <div className={`text-[11.5px] mb-1 ${final ? 'text-brand-700 font-semibold' : 'text-gray-500'}`}>{label}</div>
      <div className={`font-semibold tabular-nums leading-tight ${final ? 'text-[23px] text-brand-800' : 'text-[19px] text-gray-800'}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-gray-400 leading-relaxed">{sub}</div>}
    </div>
  )
}
function SumOp({ children }: { children: React.ReactNode }) {
  return <div className="flex-none w-5 flex items-center justify-center text-[15px] text-gray-400">{children}</div>
}

// ─── 経理入力欄（migration 200） ───
// 経理(primary_role='accounting')＋システム管理者(system_manager) のみ編集可。他ロールは閲覧のみ。
// 保存時に内容が変わっていれば受注担当＋管理担当へ通知（変更なしでは通知しない）。
function AccountingMemoCard({ caseData, onRefresh }: { caseData: CaseRow; onRefresh: () => void }) {
  const user = useAuth()
  const role = user?.primaryRole ?? null
  const roles = user?.roles ?? []
  const canEdit = role === 'accounting' || roles.includes('system_manager')

  const [draft, setDraft] = useState<string>(caseData.accounting_memo ?? '')
  const [saving, setSaving] = useState(false)
  const [updatedByName, setUpdatedByName] = useState<string | null>(null)
  const original = caseData.accounting_memo ?? ''
  const dirty = draft.trim() !== original.trim()

  // 更新者名の取得（保存者IDから）
  useEffect(() => {
    setDraft(caseData.accounting_memo ?? '')
    const uid = caseData.accounting_memo_updated_by
    if (!uid) { setUpdatedByName(null); return }
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase.from('members').select('name').eq('id', uid).maybeSingle()
      if (alive) setUpdatedByName((data as { name?: string } | null)?.name ?? null)
    })()
    return () => { alive = false }
  }, [caseData.accounting_memo, caseData.accounting_memo_updated_by])

  const save = async () => {
    if (!user?.memberId) { showToast('ログイン情報が取得できません', 'error'); return }
    if (!dirty) return
    setSaving(true)
    const supabase = createClient()
    const now = new Date().toISOString()
    const { error } = await supabase.from('cases').update({
      accounting_memo: draft.trim() || null,
      accounting_memo_updated_at: now,
      accounting_memo_updated_by: user.memberId,
    }).eq('id', caseData.id)
    if (error) { setSaving(false); showToast(`保存に失敗: ${error.message}`, 'error'); return }
    // 受注担当＋管理担当へ通知（case_members から取得。自分自身は除外）
    const { data: cm } = await supabase.from('case_members').select('member_id, role').eq('case_id', caseData.id).in('role', ['sales', 'manager', 'sub_manager'])
    const targets = new Set(((cm ?? []) as Array<{ member_id: string }>).map(m => m.member_id))
    targets.delete(user.memberId)
    if (targets.size > 0) {
      await supabase.from('notifications').insert([...targets].map(mid => ({
        member_id: mid,
        type: 'accounting_memo_updated',
        case_id: caseData.id,
        title: '経理から連絡があります',
        body: `${caseData.case_number} ${caseData.deal_name}：経理入力欄が更新されました`,
      })))
    }
    setSaving(false)
    showToast('保存しました' + (targets.size > 0 ? `（${targets.size}人へ通知）` : ''), 'success')
    onRefresh()
  }

  const lastUpdated = caseData.accounting_memo_updated_at ? caseData.accounting_memo_updated_at.slice(0, 16).replace('T', ' ') : null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-3.5 py-2.5">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <Calculator className="w-4 h-4 text-amber-700" strokeWidth={2} />
        <span className="text-[12.5px] font-semibold text-amber-900">経理入力欄</span>
        <span className="text-[11px] text-amber-700">経理担当が書き込み・受注/管理担当へ通知</span>
        {lastUpdated && <span className="ml-auto text-[10.5px] font-mono text-gray-500">最終更新 {updatedByName ?? '—'} / {lastUpdated}</span>}
      </div>
      {canEdit ? (
        <>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            placeholder="例：前受金入金確認済み、確定請求書の発行は◯月末で確定。／実費未計上分あり、確認お願いします 等"
            className="w-full text-[13px] border border-amber-200 rounded-md px-2.5 py-1.5 bg-white outline-none focus:border-amber-400 resize-y"
          />
          <div className="flex justify-end mt-1.5">
            <button type="button" onClick={save} disabled={!dirty || saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed">
              <Save className="w-3.5 h-3.5" strokeWidth={2.25} />保存{dirty ? '（変更を通知）' : ''}
            </button>
          </div>
        </>
      ) : (
        <div className={`text-[13px] whitespace-pre-wrap rounded-md px-2.5 py-1.5 bg-white border border-amber-100 ${caseData.accounting_memo ? 'text-gray-800' : 'text-gray-400 italic'}`}>
          {caseData.accounting_memo || '経理からのメモはまだありません。'}
        </div>
      )}
    </div>
  )
}
