'use client'

// 遺産承継タブ。サブタブ＝精算書作成／指図書作成。
//   精算書：財産管理口座預かり金（銀行・証券の解約金等。目録から取込）
//         − 費用（立替金・報酬＝請求タブ連動／振込手数料・代理支払＝受信簿連動）＝ 残余財産
//   指図書：相続人一覧をコピーし、振込先・金額・振込済を管理
// データは settlement_income_items / settlement_expense_items / instruction_items。

import { useEffect, useState } from 'react'
import { Trash2, Plus, DownloadCloud } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { SubTabs } from '@/components/ui/SubTabs'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Section } from '@/components/ui/InlineFields'
import TabHeader from './TabHeader'
import TabTasksSection from './TabTasksSection'
import { WorkContentField } from './WorkContentField'
import ProgressSummary from './ProgressSummary'
import { MoneyInput } from './FinancialAssetsTable'
import { isNegativeClass } from '@/lib/constants'
import type { CaseRow, HeirRow, AssetInventoryRow, SettlementIncomeItemRow, SettlementExpenseItemRow, InstructionItemRow, TaskRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()
const INCOME_CLASSES = ['金融', '不動産', 'その他']

export default function SuccessionTab({ caseData, heirs = [], assetInventory = [], tasks = [] }: {
  caseData: CaseRow
  heirs?: HeirRow[]
  assetInventory?: AssetInventoryRow[]
  onRefresh?: () => void
  tasks?: TaskRow[]
}) {
  const supabase = createClient()
  const [sub, setSub] = useState<'settlement' | 'instruction'>('settlement')
  const [income, setIncome] = useState<SettlementIncomeItemRow[]>([])
  const [expense, setExpense] = useState<SettlementExpenseItemRow[]>([])
  const [instr, setInstr] = useState<InstructionItemRow[]>([])
  // 代理支払（到着物）＝オーシャンが代理で払った請求書。
  // 以前は「受信簿アイテムを『精算書作成』タスクに紐づける」ことが前提だったが、
  // それは受信簿を触る人に「あとで精算書に載せる」という先読みを強いる作りで、
  // 紐づけ忘れ＝精算書に出てこない、という漏れが起きていた。
  // そこで向きを逆にし、精算書側から到着物を選ぶ（ピッカー）方式にした。
  // 保存先は従来どおり document_receipt_items（settlement_reflect / settlement_amount）。
  type PayItem = { id: string; name: string; receiptDate: string | null; reflect: boolean; amount: number | null }
  const [payItems, setPayItems] = useState<PayItem[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [inc, exp, ins, rec] = await Promise.all([
        supabase.from('settlement_income_items').select('*').eq('case_id', caseData.id).order('sort_order').order('created_at'),
        supabase.from('settlement_expense_items').select('*').eq('case_id', caseData.id).order('sort_order').order('created_at'),
        supabase.from('instruction_items').select('*').eq('case_id', caseData.id).order('sort_order').order('created_at'),
        supabase.from('document_receipts').select('received_date, items:document_receipt_items(id, item_name, settlement_reflect, settlement_amount)').eq('case_id', caseData.id),
      ])
      if (!alive) return
      setIncome((inc.data ?? []) as SettlementIncomeItemRow[])
      setExpense((exp.data ?? []) as SettlementExpenseItemRow[])
      setInstr((ins.data ?? []) as InstructionItemRow[])
      // 案件の到着物は全部持ってくる（タスク紐づけによる絞り込みはやめた）。
      // 精算書に並べるのは選択済み（settlement_reflect）だけで、残りはピッカーの中にだけ出す。
      type RecItem = { id: string; item_name: string | null; settlement_reflect: boolean | null; settlement_amount: number | null }
      const items = ((rec.data ?? []) as unknown as Array<{ received_date: string | null; items: RecItem[] | null }>)
        .flatMap(r => (r.items ?? []).map(it => ({
          id: it.id,
          name: it.item_name ?? '（名称なし）',
          receiptDate: r.received_date,
          reflect: it.settlement_reflect === true,
          amount: it.settlement_amount ?? null,
        })))
        .sort((a, b) => (b.receiptDate ?? '').localeCompare(a.receiptDate ?? ''))
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
  // 精算書に並べるのは選んだものだけ。未選択はピッカーの中にだけ出す。
  const selectedPay = payItems.filter(r => r.reflect)
  const payTotal = selectedPay.reduce((s, r) => s + (r.amount ?? 0), 0)

  const incomeTotal = income.reduce((s, r) => s + (r.amount ?? 0), 0)
  // 旧・receipt由来（代理支払）は下の到着物一覧に移行済みなので費用合計から除外し、代わりに payTotal を足す。
  const expenseTotal = expense.filter(r => r.source !== 'receipt').reduce((s, r) => s + (r.amount ?? 0), 0) + payTotal
  const remaining = incomeTotal - expenseTotal

  // ── 財産管理口座預かり金（収入側） ──
  const importIncome = async () => {
    const existing = new Set(income.map(r => `${r.asset_class}|${r.detail}`))
    // 預かり金に入るのは「被相続人のプラス財産」だけ。目録に載る相続債務・その他費用は
    // 遺産分割時に相続人間で精算するものなので、ここには持ってこない。
    // 目録の細かい分類（預金/証券/信託・不動産（土地）/（建物））は 金融/不動産/その他 に丸める。
    const toIncomeClass = (c: string | null | undefined) =>
      c === '預金' || c === '証券' || c === '信託' || c === '金融' ? '金融'
        : (c ?? '').startsWith('不動産') ? '不動産' : 'その他'
    const rows = assetInventory
      .filter(a => a.amount != null && !isNegativeClass(a.asset_class))
      .map(a => ({ ...a, asset_class: toIncomeClass(a.asset_class) }))
      .filter(a => !existing.has(`${a.asset_class}|${a.detail}`))
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

  // ── 費用（報酬・立替を請求タブから取込） ──
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
      <TabHeader title="遺産承継" description="精算書（財産管理口座の預かり金 − 費用 ＝ 残り）と指図書（相続人への振込）をここで作ります。" />
      <div className="mb-3.5"><TabTasksSection gyomus={['精算書作成', '指図書作成']} tasks={tasks} /></div>
      <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-3">
        <WorkContentField caseData={caseData} gyomu="succession" patchCase={async p => { await supabase.from('cases').update(p).eq('id', caseData.id) }} label="作業内容（フリー・オーダーシートと共有）" collapsible />
      </div>
      <SubTabs tabs={[{ key: 'settlement', label: '精算書作成' }, { key: 'instruction', label: '指図書作成' }]} active={sub} onChange={k => setSub(k as 'settlement' | 'instruction')} />

      {/* 精算書 */}
      <div className={sub === 'settlement' ? 'space-y-3.5' : 'hidden'}>
        <Section title="財産管理口座預かり金（銀行・証券の解約金等）">
          <div className="flex items-center gap-2 mb-2">
            <button type="button" onClick={importIncome} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50"><DownloadCloud className="w-3.5 h-3.5" /> 財産目録から取込</button>
          </div>
          <table className="w-full text-[12px] border-collapse" style={{ minWidth: 560 }}>
            <thead><tr className="text-[11px] text-gray-500 border-b border-gray-100"><th className="px-2 py-1.5 text-left font-medium w-28">財産区分</th><th className="px-2 py-1.5 text-left font-medium">詳細</th><th className="px-2 py-1.5 text-right font-medium w-36">金額</th><th className="px-2 py-1.5 text-left font-medium w-40">備考</th><th className="px-2 py-1.5 w-7" /></tr></thead>
            <tbody>
              {income.length === 0 ? <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-400">「財産目録から取込」または行を追加</td></tr> : income.map(r => (
                <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-2 py-1.5"><select value={r.asset_class ?? ''} onChange={e => commitIncome(r.id, 'asset_class', e.target.value)} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white">{INCOME_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                  <td className="px-2 py-1.5"><input type="text" defaultValue={r.detail ?? ''} onBlur={e => commitIncome(r.id, 'detail', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" /></td>
                  <td className="px-2 py-1.5"><MoneyInput value={r.amount} onCommit={v => commitIncome(r.id, 'amount', v === '' ? 0 : Number(v))} /></td>
                  <td className="px-2 py-1.5"><input type="text" defaultValue={r.note ?? ''} onBlur={e => commitIncome(r.id, 'note', e.target.value)} placeholder="例: OC口座へ移管済(7/3)" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" /></td>
                  <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => delIncome(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-emerald-200 bg-emerald-50/40 font-semibold text-emerald-800"><td className="px-2 py-1.5" colSpan={2}>預かり金 合計</td><td className="px-2 py-1.5 text-right tabular-nums">{yen(incomeTotal)}</td><td colSpan={3} /></tr></tfoot>
          </table>
          <button type="button" onClick={addIncome} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" /> 行を追加</button>
        </Section>

        <Section title="費用（立替金・報酬・振込手数料等）">
          <div className="flex items-center gap-2 mb-2">
            <button type="button" onClick={importExpense} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50"><DownloadCloud className="w-3.5 h-3.5" /> 請求タブから取込</button>
            <span className="text-[11px] text-gray-400">報酬・立替（請求タブ）を取込。代理支払は下の「到着物から」で入れます</span>
          </div>
          <table className="w-full text-[12px] border-collapse" style={{ minWidth: 560 }}>
            <thead><tr className="text-[11px] text-gray-500 border-b border-gray-100"><th className="px-2 py-1.5 text-left font-medium w-24">区分</th><th className="px-2 py-1.5 text-left font-medium">内容</th><th className="px-2 py-1.5 text-right font-medium w-36">金額</th><th className="px-2 py-1.5 text-left font-medium w-40">備考</th><th className="px-2 py-1.5 w-7" /></tr></thead>
            <tbody>
              {expense.filter(r => r.source !== 'receipt').length === 0 ? <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-400">「請求タブから取込」または行を追加</td></tr> : expense.filter(r => r.source !== 'receipt').map(r => (
                <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-2 py-1.5"><select value={r.kind ?? ''} onChange={e => commitExpense(r.id, 'kind', e.target.value)} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white">{['報酬', '立替', '代理支払'].map(c => <option key={c} value={c}>{c}</option>)}</select></td>
                  <td className="px-2 py-1.5"><input type="text" defaultValue={r.label ?? ''} onBlur={e => commitExpense(r.id, 'label', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" />{r.source && r.source !== 'manual' && <span className="text-[10px] text-brand-500 ml-1">連動</span>}</td>
                  <td className="px-2 py-1.5"><MoneyInput value={r.amount} onCommit={v => commitExpense(r.id, 'amount', v === '' ? 0 : Number(v))} /></td>
                  <td className="px-2 py-1.5"><input type="text" defaultValue={r.note ?? ''} onBlur={e => commitExpense(r.id, 'note', e.target.value)} placeholder="例: 7/2 振込" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded" /></td>
                  <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => delExpense(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addExpense} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" /> 行を追加</button>

          {/* 代理支払（到着物から）。選んだものだけを並べ、追加はピッカーから行う。 */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[12px] font-semibold text-gray-700">代理支払（到着物から）</span>
              <span className="text-[11px] font-normal text-gray-400 flex-1">当社が代理で支払った請求書。金額を入れると費用に入ります</span>
              <button type="button" onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 flex-none">
                <Plus className="w-3.5 h-3.5" />到着物から追加
              </button>
            </div>
            {selectedPay.length === 0 ? (
              <div className="text-[11.5px] text-gray-400 px-2 py-3 border border-dashed border-gray-200 rounded">
                「到着物から追加」で、当社が代理で支払った請求書を選んでください。
              </div>
            ) : (
              <table className="w-full text-[12px] border-collapse" style={{ minWidth: 480 }}>
                <thead><tr className="text-[11px] text-gray-500 border-b border-gray-100"><th className="px-2 py-1.5 text-left font-medium w-24">受信日</th><th className="px-2 py-1.5 text-left font-medium">内容</th><th className="px-2 py-1.5 text-right font-medium w-36">金額</th><th className="w-9" /></tr></thead>
                <tbody>
                  {selectedPay.map(p => (
                    <tr key={p.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-2 py-1.5 text-gray-500 tabular-nums">{p.receiptDate ? p.receiptDate.slice(5).replace('-', '/') : '—'}</td>
                      <td className="px-2 py-1.5 text-gray-800">{p.name}</td>
                      <td className="px-2 py-1.5"><MoneyInput value={p.amount} onCommit={v => setPayAmount(p.id, v === '' ? null : Number(v))} /></td>
                      <td className="px-1 py-1.5 text-center">
                        <button type="button" onClick={() => setPayReflect(p.id, false)} title="この行を外す" className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-3 flex items-center justify-end gap-3 border-t border-red-200 pt-2 font-semibold text-red-800">
            <span className="text-[13px]">費用 合計</span><span className="text-[15px] tabular-nums">{yen(expenseTotal)}</span>
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

      {/* 到着物ピッカー：案件の到着物から、当社が代理で払った請求書を選ぶ。
          受信簿側での事前の紐づけを不要にするための入口。 */}
      <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="到着物から追加" maxWidth="max-w-lg"
        footer={<Button variant="secondary" onClick={() => setPickerOpen(false)}>閉じる</Button>}>
        {payItems.length === 0 ? (
          <p className="text-[13px] text-gray-500">この案件には到着物が登録されていません。</p>
        ) : (
          <>
            <p className="text-[12px] text-gray-500 mb-2">当社が代理で支払った請求書を選んでください。金額は選んだあと精算書で入力します。</p>
            <div className="max-h-[52vh] overflow-y-auto -mx-1 px-1">
              {payItems.map(p => (
                <label key={p.id} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border mb-1.5 cursor-pointer transition-colors ${p.reflect ? 'border-brand-300 bg-brand-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <input type="checkbox" checked={p.reflect} onChange={e => setPayReflect(p.id, e.target.checked)} className="w-4 h-4 accent-brand-600 flex-none" />
                  <span className="text-[11px] text-gray-400 tabular-nums w-14 flex-none">{p.receiptDate ? p.receiptDate.slice(5).replace('-', '/') : '—'}</span>
                  <span className="text-[13px] text-gray-800 flex-1">{p.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
