'use client'

// 遺産承継タブ。サブタブ＝精算書作成／指図書作成。
//   精算書：収入（被相続人の財産。目録から取込）− 支出（報酬・立替＝請求タブ連動／代理支払＝受信簿連動）＝ 残余財産
//   指図書：相続人一覧をコピーし、振込先・金額・振込済を管理
// データは settlement_income_items / settlement_expense_items / instruction_items。

import { useEffect, useState } from 'react'
import { Trash2, Plus, DownloadCloud } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { SubTabs } from '@/components/ui/SubTabs'
import { Section } from '@/components/ui/InlineFields'
import TabHeader from './TabHeader'
import { WorkContentField } from './WorkContentField'
import ProgressSummary from './ProgressSummary'
import { MoneyInput } from './FinancialAssetsTable'
import type { CaseRow, HeirRow, AssetInventoryRow, SettlementIncomeItemRow, SettlementExpenseItemRow, InstructionItemRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()
const INCOME_CLASSES = ['金融', '不動産', 'その他']

export default function SuccessionTab({ caseData, heirs = [], assetInventory = [] }: {
  caseData: CaseRow
  heirs?: HeirRow[]
  assetInventory?: AssetInventoryRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const [sub, setSub] = useState<'settlement' | 'instruction'>('settlement')
  const [income, setIncome] = useState<SettlementIncomeItemRow[]>([])
  const [expense, setExpense] = useState<SettlementExpenseItemRow[]>([])
  const [instr, setInstr] = useState<InstructionItemRow[]>([])
  // 代理支払（到着物）＝「精算書作成」タスクに紐づいた受信簿アイテム。ここでチェック＋金額を入れて支出に入れる。
  const [payItems, setPayItems] = useState<{ id: string; name: string; reflect: boolean; amount: number | null }[]>([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [inc, exp, ins, rec] = await Promise.all([
        supabase.from('settlement_income_items').select('*').eq('case_id', caseData.id).order('sort_order'),
        supabase.from('settlement_expense_items').select('*').eq('case_id', caseData.id).order('sort_order'),
        supabase.from('instruction_items').select('*').eq('case_id', caseData.id).order('sort_order'),
        supabase.from('document_receipts').select('items:document_receipt_items(id, item_name, settlement_reflect, settlement_amount, item_tasks:document_receipt_item_tasks(task:tasks(title)))').eq('case_id', caseData.id),
      ])
      if (!alive) return
      setIncome((inc.data ?? []) as SettlementIncomeItemRow[])
      setExpense((exp.data ?? []) as SettlementExpenseItemRow[])
      setInstr((ins.data ?? []) as InstructionItemRow[])
      // 「精算書作成」タスクに紐づいたアイテムだけを代理支払候補にする（戸籍等は出ない）。
      // ※Supabase の埋め込みリレーション（task）は配列で返ることがあるため両対応。
      type RecTask = { title: string | null }
      type RecItem = { id: string; item_name: string | null; settlement_reflect: boolean | null; settlement_amount: number | null; item_tasks: Array<{ task: RecTask | RecTask[] | null }> | null }
      const items = ((rec.data ?? []) as unknown as Array<{ items: RecItem[] | null }>).flatMap(r => r.items ?? [])
        .filter(it => (it.item_tasks ?? []).some(t => { const task = Array.isArray(t.task) ? t.task[0] : t.task; return task?.title === '精算書作成' }))
        .map(it => ({ id: it.id, name: it.item_name ?? '請求書', reflect: it.settlement_reflect === true, amount: it.settlement_amount ?? null }))
      setPayItems(items)
    })()
    return () => { alive = false }
  }, [caseData.id, supabase])

  // 代理支払（到着物）の編集：チェック（含める）／金額。document_receipt_items を更新。
  const setPayReflect = (id: string, reflect: boolean) => {
    setPayItems(prev => prev.map(r => r.id === id ? { ...r, reflect } : r))
    supabase.from('document_receipt_items').update({ settlement_reflect: reflect }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') })
  }
  const setPayAmount = (id: string, amount: number | null) => {
    setPayItems(prev => prev.map(r => r.id === id ? { ...r, amount } : r))
    supabase.from('document_receipt_items').update({ settlement_amount: amount }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') })
  }
  const payTotal = payItems.filter(r => r.reflect).reduce((s, r) => s + (r.amount ?? 0), 0)

  const incomeTotal = income.reduce((s, r) => s + (r.amount ?? 0), 0)
  // 旧・receipt由来（代理支払）は下の到着物一覧に移行済みなので支出合計から除外し、代わりに payTotal を足す。
  const expenseTotal = expense.filter(r => r.source !== 'receipt').reduce((s, r) => s + (r.amount ?? 0), 0) + payTotal
  const remaining = incomeTotal - expenseTotal

  // ── 収入 ──
  const importIncome = async () => {
    const existing = new Set(income.map(r => `${r.asset_class}|${r.detail}`))
    const rows = assetInventory
      .filter(a => a.amount != null && !existing.has(`${a.asset_class}|${a.detail}`))
      .map((a, i) => ({ case_id: caseData.id, asset_class: a.asset_class, detail: a.detail, amount: a.amount ?? 0, sort_order: income.length + i }))
    if (rows.length === 0) { showToast('取り込む目録がありません（財産目録を作成してください）', 'info'); return }
    const { data, error } = await supabase.from('settlement_income_items').insert(rows).select('*')
    if (error) { showToast(`取込に失敗: ${error.message}`, 'error'); return }
    setIncome(prev => [...prev, ...((data ?? []) as SettlementIncomeItemRow[])])
  }
  const addIncome = async () => {
    const { data, error } = await supabase.from('settlement_income_items').insert({ case_id: caseData.id, asset_class: 'その他', sort_order: income.length }).select('*').single()
    if (!error && data) setIncome(prev => [...prev, data as SettlementIncomeItemRow])
  }
  const commitIncome = (id: string, field: keyof SettlementIncomeItemRow, value: unknown) => {
    setIncome(prev => prev.map(r => r.id === id ? { ...r, [field]: value } as SettlementIncomeItemRow : r))
    supabase.from('settlement_income_items').update({ [field]: value }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') })
  }
  const delIncome = async (id: string) => { await supabase.from('settlement_income_items').delete().eq('id', id); setIncome(prev => prev.filter(r => r.id !== id)) }

  // ── 支出（報酬・立替を請求タブから取込） ──
  const importExpense = async () => {
    const supa = supabase
    const [rew, exp] = await Promise.all([
      supa.from('reward_items').select('shigyo, amount, discount').eq('case_id', caseData.id),
      // 立替実費は請求タブの billing_expense_items（司法/行政・課税/非課税）から取り込む
      supa.from('billing_expense_items').select('shigyo, amount').eq('case_id', caseData.id),
    ])
    const rows: Array<{ case_id: string; kind: string; label: string; amount: number; source: string; sort_order: number }> = []
    let order = expense.length
    const rewardRows = (rew.data ?? []) as Array<{ shigyo: string; amount: number; discount: number }>
    const sh = rewardRows.filter(r => r.shigyo === '司法').reduce((n, r) => n + ((r.amount ?? 0) - (r.discount ?? 0)), 0)
    const gy = rewardRows.filter(r => r.shigyo === '行政').reduce((n, r) => n + ((r.amount ?? 0) - (r.discount ?? 0)), 0)
    if (sh > 0) rows.push({ case_id: caseData.id, kind: '報酬', label: 'オーシャン報酬（司法）', amount: sh, source: 'reward', sort_order: order++ })
    if (gy > 0) rows.push({ case_id: caseData.id, kind: '報酬', label: 'オーシャン報酬（行政）', amount: gy, source: 'reward', sort_order: order++ })
    const expRows = (exp.data ?? []) as Array<{ shigyo: string; amount: number }>
    const expSh = expRows.filter(r => r.shigyo === '司法').reduce((n, e) => n + (e.amount ?? 0), 0)
    const expGy = expRows.filter(r => r.shigyo === '行政').reduce((n, e) => n + (e.amount ?? 0), 0)
    if (expSh > 0) rows.push({ case_id: caseData.id, kind: '立替', label: '立替実費（司法）', amount: expSh, source: 'expense', sort_order: order++ })
    if (expGy > 0) rows.push({ case_id: caseData.id, kind: '立替', label: '立替実費（行政）', amount: expGy, source: 'expense', sort_order: order++ })
    // ※代理支払（介護施設・葬儀費用等）は下の「代理支払（到着物から）」でチェック＋金額を入れる（ここでは取り込まない）。
    if (rows.length === 0) { showToast('取り込む報酬・立替がありません', 'info'); return }
    // 既存の reward/expense 由来は作り直す。旧・receipt由来（代理支払）は下の一覧に移行したので削除だけする（重複防止）。
    await supabase.from('settlement_expense_items').delete().eq('case_id', caseData.id).in('source', ['reward', 'expense', 'receipt'])
    const { data, error } = await supabase.from('settlement_expense_items').insert(rows).select('*')
    if (error) { showToast(`取込に失敗: ${error.message}`, 'error'); return }
    setExpense(prev => [...prev.filter(r => !['reward', 'expense', 'receipt'].includes(r.source ?? '')), ...((data ?? []) as SettlementExpenseItemRow[])])
    showToast('請求タブから取り込みました', 'success')
  }
  const addExpense = async () => {
    const { data, error } = await supabase.from('settlement_expense_items').insert({ case_id: caseData.id, kind: '代理支払', source: 'manual', sort_order: expense.length }).select('*').single()
    if (!error && data) setExpense(prev => [...prev, data as SettlementExpenseItemRow])
  }
  const commitExpense = (id: string, field: keyof SettlementExpenseItemRow, value: unknown) => {
    setExpense(prev => prev.map(r => r.id === id ? { ...r, [field]: value } as SettlementExpenseItemRow : r))
    supabase.from('settlement_expense_items').update({ [field]: value }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') })
  }
  const delExpense = async (id: string) => { await supabase.from('settlement_expense_items').delete().eq('id', id); setExpense(prev => prev.filter(r => r.id !== id)) }

  // ── 指図書 ──
  const importHeirs = async () => {
    const existing = new Set(instr.map(r => r.heir_id))
    const rows = heirs.filter(h => !existing.has(h.id)).map((h, i) => ({ case_id: caseData.id, heir_id: h.id, heir_name: h.name, sort_order: instr.length + i }))
    if (rows.length === 0) { showToast('取り込む相続人がいません', 'info'); return }
    const { data, error } = await supabase.from('instruction_items').insert(rows).select('*')
    if (error) { showToast(`取込に失敗: ${error.message}`, 'error'); return }
    setInstr(prev => [...prev, ...((data ?? []) as InstructionItemRow[])])
  }
  const commitInstr = (id: string, field: keyof InstructionItemRow, value: unknown) => {
    setInstr(prev => prev.map(r => r.id === id ? { ...r, [field]: value } as InstructionItemRow : r))
    supabase.from('instruction_items').update({ [field]: value }).eq('id', id).then(({ error }) => { if (error) showToast(`保存に失敗: ${error.message}`, 'error') })
  }
  const delInstr = async (id: string) => { await supabase.from('instruction_items').delete().eq('id', id); setInstr(prev => prev.filter(r => r.id !== id)) }
  const instrTotal = instr.reduce((s, r) => s + (r.amount ?? 0), 0)

  return (
    <div className="space-y-3.5">
      <TabHeader title="遺産承継" description="精算書（収入−支出＝残り）と指図書（相続人への振込）をここで作ります。" />
      <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-3">
        <WorkContentField caseData={caseData} gyomu="succession" patchCase={async p => { await supabase.from('cases').update(p).eq('id', caseData.id) }} label="作業内容（フリー・オーダーシートと共有）" collapsible />
      </div>
      <SubTabs tabs={[{ key: 'settlement', label: '精算書作成' }, { key: 'instruction', label: '指図書作成' }]} active={sub} onChange={k => setSub(k as 'settlement' | 'instruction')} />

      {/* 精算書 */}
      <div className={sub === 'settlement' ? 'space-y-3.5' : 'hidden'}>
        <Section title="収入（被相続人の財産）">
          <div className="flex items-center gap-2 mb-2">
            <button type="button" onClick={importIncome} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50"><DownloadCloud className="w-3.5 h-3.5" /> 財産目録から取込</button>
          </div>
          <table className="w-full text-[12px] border-collapse" style={{ minWidth: 560 }}>
            <thead><tr className="text-[11px] text-gray-500 border-b border-gray-100"><th className="px-2 py-1.5 text-left font-medium w-28">財産区分</th><th className="px-2 py-1.5 text-left font-medium">詳細</th><th className="px-2 py-1.5 text-right font-medium w-36">金額</th><th className="px-2 py-1.5 text-center font-medium w-24">OC移管済</th><th className="px-2 py-1.5 text-left font-medium w-40">備考</th><th className="px-2 py-1.5 w-7" /></tr></thead>
            <tbody>
              {income.length === 0 ? <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-400">「財産目録から取込」または行を追加</td></tr> : income.map(r => (
                <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-2 py-1.5"><select value={r.asset_class ?? ''} onChange={e => commitIncome(r.id, 'asset_class', e.target.value)} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white">{INCOME_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                  <td className="px-2 py-1.5"><input type="text" defaultValue={r.detail ?? ''} onBlur={e => commitIncome(r.id, 'detail', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={r.amount} onCommit={v => commitIncome(r.id, 'amount', v === '' ? 0 : Number(v))} /></td>
                  <td className="px-2 py-1.5 text-center">{r.asset_class === '金融' ? <input type="checkbox" checked={r.oc_transferred} onChange={e => commitIncome(r.id, 'oc_transferred', e.target.checked)} className="w-4 h-4 accent-emerald-600" /> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5"><input type="text" defaultValue={r.note ?? ''} onBlur={e => commitIncome(r.id, 'note', e.target.value)} placeholder="例: OC口座へ移管済(7/3)" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" /></td>
                  <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => delIncome(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-emerald-200 bg-emerald-50/40 font-semibold text-emerald-800"><td className="px-2 py-1.5" colSpan={2}>収入合計</td><td className="px-2 py-1.5 text-right tabular-nums">{yen(incomeTotal)}</td><td colSpan={3} /></tr></tfoot>
          </table>
          <button type="button" onClick={addIncome} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" /> 行を追加</button>
        </Section>

        <Section title="支出（報酬・立替・代理支払）">
          <div className="flex items-center gap-2 mb-2">
            <button type="button" onClick={importExpense} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50"><DownloadCloud className="w-3.5 h-3.5" /> 請求タブから取込</button>
            <span className="text-[11px] text-gray-400">報酬・立替（請求タブ）を取込。代理支払は下の「到着物から」で入れます</span>
          </div>
          <table className="w-full text-[12px] border-collapse" style={{ minWidth: 560 }}>
            <thead><tr className="text-[11px] text-gray-500 border-b border-gray-100"><th className="px-2 py-1.5 text-left font-medium w-24">区分</th><th className="px-2 py-1.5 text-left font-medium">内容</th><th className="px-2 py-1.5 text-right font-medium w-36">金額</th><th className="px-2 py-1.5 text-center font-medium w-20">振込済</th><th className="px-2 py-1.5 text-left font-medium w-40">備考</th><th className="px-2 py-1.5 w-7" /></tr></thead>
            <tbody>
              {expense.filter(r => r.source !== 'receipt').length === 0 ? <tr><td colSpan={6} className="px-2 py-4 text-center text-gray-400">「請求タブから取込」または行を追加</td></tr> : expense.filter(r => r.source !== 'receipt').map(r => (
                <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-2 py-1.5"><select value={r.kind ?? ''} onChange={e => commitExpense(r.id, 'kind', e.target.value)} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white">{['報酬', '立替', '代理支払'].map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                  <td className="px-2 py-1.5"><input type="text" defaultValue={r.label ?? ''} onBlur={e => commitExpense(r.id, 'label', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" />{r.source && r.source !== 'manual' && <span className="text-[10px] text-brand-500 ml-1">連動</span>}</td>
                  <td className="px-2 py-1.5"><MoneyInput value={r.amount} onCommit={v => commitExpense(r.id, 'amount', v === '' ? 0 : Number(v))} /></td>
                  <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={r.paid} onChange={e => commitExpense(r.id, 'paid', e.target.checked)} className="w-4 h-4 accent-emerald-600" title="振込が完了したらチェック" /></td>
                  <td className="px-2 py-1.5"><input type="text" defaultValue={r.note ?? ''} onBlur={e => commitExpense(r.id, 'note', e.target.value)} placeholder="例: 7/2 振込" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" /></td>
                  <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => delExpense(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addExpense} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" /> 行を追加</button>

          {/* 代理支払（到着物から）＝「精算書作成」タスクに紐づいた受信簿アイテム。チェック＋金額で支出に入る。 */}
          <div className="mt-4">
            <div className="text-[12px] font-semibold text-gray-700 mb-1.5">代理支払（到着物から）<span className="text-[11px] font-normal text-gray-400 ml-1">「精算書作成」タスクに紐づいた請求書。チェック＋金額で支出に入ります</span></div>
            {payItems.length === 0 ? (
              <div className="text-[11.5px] text-gray-400 px-2 py-3 border border-dashed border-gray-200 rounded">到着物がありません。届いた請求書を受信簿で「精算書作成」タスクに紐づけると、ここに並びます。</div>
            ) : (
              <table className="w-full text-[12px] border-collapse" style={{ minWidth: 480 }}>
                <thead><tr className="text-[11px] text-gray-500 border-b border-gray-100"><th className="px-2 py-1.5 text-center font-medium w-16">含める</th><th className="px-2 py-1.5 text-left font-medium">内容</th><th className="px-2 py-1.5 text-right font-medium w-36">金額</th></tr></thead>
                <tbody>
                  {payItems.map(p => (
                    <tr key={p.id} className={`border-b border-gray-50 last:border-b-0 ${p.reflect ? '' : 'opacity-60'}`}>
                      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={p.reflect} onChange={e => setPayReflect(p.id, e.target.checked)} className="w-4 h-4 accent-brand-600" /></td>
                      <td className="px-2 py-1.5 text-gray-800">{p.name}</td>
                      <td className="px-2 py-1.5"><MoneyInput value={p.amount} onCommit={v => setPayAmount(p.id, v === '' ? null : Number(v))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-3 flex items-center justify-end gap-3 border-t border-red-200 pt-2 font-semibold text-red-800">
            <span className="text-[13px]">支出合計</span><span className="text-[15px] tabular-nums">{yen(expenseTotal)}</span>
          </div>
        </Section>

        <div className="flex items-center justify-end gap-3 px-4 py-3 rounded-xl border-2 border-brand-200 bg-brand-50/50">
          <span className="text-[13px] text-brand-700">残余財産（相続人へ分配）</span>
          <span className="text-[20px] font-bold text-brand-800 tabular-nums">{yen(remaining)}</span>
        </div>
      </div>

      {/* 指図書 */}
      <div className={sub === 'instruction' ? 'space-y-3.5' : 'hidden'}>
        <ProgressSummary caseId={caseData.id} scopeKey="succession_instruction" title="進捗/結果（指図書）" />
        <Section title="指図書（相続人への振込）">
          <div className="flex items-center gap-2 mb-2">
            <button type="button" onClick={importHeirs} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50"><DownloadCloud className="w-3.5 h-3.5" /> 相続人一覧から取込</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse" style={{ minWidth: 760 }}>
              <thead><tr className="text-[11px] text-gray-500 border-b border-gray-100"><th className="px-2 py-1.5 text-left font-medium w-32">相続人</th><th className="px-2 py-1.5 text-left font-medium">銀行名</th><th className="px-2 py-1.5 text-left font-medium">支店</th><th className="px-2 py-1.5 text-left font-medium">口座番号</th><th className="px-2 py-1.5 text-right font-medium w-36">振込金額</th><th className="px-2 py-1.5 text-center font-medium w-20">振込済</th><th className="px-2 py-1.5 w-7" /></tr></thead>
              <tbody>
                {instr.length === 0 ? <tr><td colSpan={7} className="px-2 py-4 text-center text-gray-400">「相続人一覧から取込」してください</td></tr> : instr.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-2 py-1.5 text-gray-800">{r.heir_name ?? '—'}</td>
                    <td className="px-2 py-1.5"><input type="text" defaultValue={r.bank_name ?? ''} onBlur={e => commitInstr(r.id, 'bank_name', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" /></td>
                    <td className="px-2 py-1.5"><input type="text" defaultValue={r.branch_name ?? ''} onBlur={e => commitInstr(r.id, 'branch_name', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" /></td>
                    <td className="px-2 py-1.5"><input type="text" defaultValue={r.account_no ?? ''} onBlur={e => commitInstr(r.id, 'account_no', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" /></td>
                    <td className="px-2 py-1.5"><MoneyInput value={r.amount} onCommit={v => commitInstr(r.id, 'amount', v === '' ? null : Number(v))} /></td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={r.transferred} onChange={e => commitInstr(r.id, 'transferred', e.target.checked)} className="w-4 h-4 accent-emerald-600" /></td>
                    <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => delInstr(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t border-brand-200 bg-brand-50/40 font-semibold text-brand-800"><td className="px-2 py-1.5" colSpan={4}>振込合計</td><td className="px-2 py-1.5 text-right tabular-nums">{yen(instrTotal)}</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
        </Section>
      </div>
    </div>
  )
}
