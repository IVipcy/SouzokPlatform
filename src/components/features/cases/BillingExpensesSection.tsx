'use client'

// 立替実費（請求タブ）。司法/行政それぞれ、課税/非課税に分けて入力する。
// 名目は定型リスト（課税/非課税）から選択 or 自由入力。金額＝数量×単価（空欄なら直接）。
// 実務タブからの取り込みは、課税/非課税はシステム自動・司法/行政はユーザー選択（ポップアップ）。
// 取り込み後も、各行のメニューから事業区分（司法/行政）・税区分（課税/非課税）を移動できる。

import { useEffect, useState } from 'react'
import { Trash2, Plus, Download, MoreVertical, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import { MoneyInput } from './FinancialAssetsTable'
import SelectOrTextField from './SelectOrTextField'
import { EXPENSE_NONTAX_ITEMS, EXPENSE_TAX_ITEMS } from '@/lib/constants'
import { isMinimalMode } from '@/lib/featureMode'
import type { BillingExpenseItemRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()
// 司法=青 / 行政=緑（請求料金内訳と統一。アイコン・ドットは付けず文字色で区別）
const SHIGYO = [
  { key: '司法', color: '#185FA5', bg: '#E6F1FB', text: '#0C447C' },
  { key: '行政', color: '#0F6E56', bg: '#E1F5EE', text: '#085041' },
] as const

// 取り込み候補（確定 → ポップアップで司法/行政・課税/非課税を確認してから登録）
type PendingItem = { key: string; source_kind: string; source_id: string; label: string; amount: number; shigyo: string; taxable: boolean }

export default function BillingExpensesSection({ caseId }: { caseId: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<BillingExpenseItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [pending, setPending] = useState<PendingItem[] | null>(null)  // 非nullでポップアップ表示
  const [menuFor, setMenuFor] = useState<string | null>(null)         // 行の区分移動メニュー

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('billing_expense_items').select('*').eq('case_id', caseId).order('sort_order')
      if (alive) { setRows((data ?? []) as BillingExpenseItemRow[]); setLoading(false) }
    })()
    return () => { alive = false }
  }, [caseId, supabase])

  const setLocal = (id: string, patch: Partial<BillingExpenseItemRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } as BillingExpenseItemRow : r))
  const commit = async (id: string, patch: Partial<BillingExpenseItemRow>) => {
    const { error } = await supabase.from('billing_expense_items').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error')
  }
  // 数量×単価で金額を更新（両方あるとき）。片方でも変わったら再計算。
  const recalcAmount = (r: BillingExpenseItemRow, q: number | null, u: number | null): number => {
    if (q != null && u != null) return Math.round(q * u)
    return r.amount ?? 0
  }
  const addRow = async (shigyo: string, taxable: boolean) => {
    const { data, error } = await supabase.from('billing_expense_items')
      .insert({ case_id: caseId, shigyo, taxable, amount: 0, sort_order: rows.length }).select('*').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as BillingExpenseItemRow])
  }
  const delRow = async (id: string) => {
    const { error } = await supabase.from('billing_expense_items').delete().eq('id', id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }
  // 行の区分（事業＝司法/行政、税＝課税/非課税）を移動。表の別ブロックへ即座に移る。
  const moveRow = (id: string, patch: Partial<BillingExpenseItemRow>) => { setLocal(id, patch); commit(id, patch); setMenuFor(null) }

  // 各実務タブで確定した立替実費を集めてポップアップを開く（戸籍の小為替・不動産の取得資料・登録免許税）。
  // 前回取り込んだ司法/行政・課税/非課税の選択は source_id 単位で引き継ぐ。
  const openImport = async () => {
    setImporting(true)
    const [{ data: kos }, { data: rea }, { data: props }] = await Promise.all([
      supabase.from('koseki_requests').select('id, target_person, request_to, acquirer, cost_budget, cost_refund, cost_confirmed').eq('case_id', caseId),
      supabase.from('real_estate_acquisitions').select('id, item_type, target_municipality, cost_confirmed').eq('case_id', caseId),
      supabase.from('real_estate_properties').select('id, address, lot_number, registration_cost').eq('case_id', caseId),
    ])
    // 既存の取り込み分から前回の選択を保持（source_kind:source_id をキーに）
    const prior = new Map<string, { shigyo: string; taxable: boolean }>()
    for (const r of rows) if (r.source_kind && r.source_id) prior.set(`${r.source_kind}:${r.source_id}`, { shigyo: r.shigyo ?? '司法', taxable: r.taxable })
    const items: PendingItem[] = []
    const add = (source_kind: string, source_id: string, label: string, amount: number) => {
      const key = `${source_kind}:${source_id}`
      const p = prior.get(key)
      // 初期値：司法／非課税（相続の立替実費はほぼ非課税）。前回選択があればそれを優先。
      items.push({ key, source_kind, source_id, label, amount, shigyo: p?.shigyo ?? '司法', taxable: p?.taxable ?? false })
    }
    for (const k of (kos ?? []) as Record<string, unknown>[]) {
      if (k.acquirer === '依頼者') continue  // 依頼者負担は立替に含めない
      const b = k.cost_budget as number | null, rf = k.cost_refund as number | null, c = k.cost_confirmed as number | null
      const amt = (b != null || rf != null) ? (b ?? 0) - (rf ?? 0) : (c ?? 0)
      if (amt > 0) add('koseki', k.id as string, `戸籍等取得（${(k.target_person as string) || (k.request_to as string) || '戸籍'}）`, amt)
    }
    for (const a of (rea ?? []) as Record<string, unknown>[]) {
      const amt = (a.cost_confirmed as number | null) ?? 0
      if (amt > 0) add('real_estate_acq', a.id as string, `${(a.item_type as string) || '取得資料'}${a.target_municipality ? `（${a.target_municipality}）` : ''}`, amt)
    }
    for (const p of (props ?? []) as Record<string, unknown>[]) {
      const amt = (p.registration_cost as number | null) ?? 0
      if (amt > 0) add('registration', p.id as string, `登録免許税（${(p.address as string) || (p.lot_number as string) || '物件'}）`, amt)
    }
    setImporting(false)
    if (!items.length) { showToast('取り込める確定済の立替実費がありませんでした', 'info'); return }
    setPending(items)
  }

  const setPend = (key: string, patch: Partial<PendingItem>) => setPending(prev => prev ? prev.map(p => p.key === key ? { ...p, ...patch } : p) : prev)
  const setAllShigyo = (s: string) => setPending(prev => prev ? prev.map(p => ({ ...p, shigyo: s })) : prev)

  // ポップアップで確定 → 既存の取り込み分を入れ替え（手入力分 source_kind=null は残す）
  const confirmImport = async () => {
    if (!pending) return
    setImporting(true)
    await supabase.from('billing_expense_items').delete().eq('case_id', caseId).not('source_kind', 'is', null)
    const base = rows.filter(r => !r.source_kind).length
    const { error } = await supabase.from('billing_expense_items').insert(pending.map((it, i) => ({
      case_id: caseId, sort_order: base + i, quantity: null, unit_price: null, note: null,
      shigyo: it.shigyo, taxable: it.taxable, label: it.label, amount: it.amount,
      source_kind: it.source_kind, source_id: it.source_id,
    })))
    if (error) { showToast(`取り込みに失敗: ${error.message}`, 'error'); setImporting(false); return }
    const { data } = await supabase.from('billing_expense_items').select('*').eq('case_id', caseId).order('sort_order')
    setRows((data ?? []) as BillingExpenseItemRow[])
    setImporting(false); setPending(null)
    showToast(`実務タブから${pending.length}件の立替実費を取り込みました`, 'success')
  }

  if (loading) return <div className="text-[12px] text-gray-400 py-3">読み込み中…</div>

  const renderBlock = (shigyo: string, taxable: boolean) => {
    const items = rows.filter(r => r.shigyo === shigyo && r.taxable === taxable)
    const subtotal = items.reduce((n, r) => n + (r.amount ?? 0), 0)
    const options = taxable ? EXPENSE_TAX_ITEMS : EXPENSE_NONTAX_ITEMS
    return (
      <div className="mt-2">
        <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full mb-1.5 ${taxable ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-700'}`}>{taxable ? '課税（税込）' : '非課税'}</span>
        <table className="w-full text-[12px] border-collapse table-fixed" style={{ minWidth: 700 }}>
          <colgroup>
            <col style={{ width: 300 }} /><col style={{ width: 64 }} /><col style={{ width: 80 }} /><col style={{ width: 96 }} /><col /><col style={{ width: 52 }} />
          </colgroup>
          <thead><tr className="text-[10.5px] text-gray-500 border-b border-gray-100">
            <th className="px-1.5 py-1 text-left font-medium">名目</th><th className="px-1.5 py-1 text-right font-medium">数量</th><th className="px-1.5 py-1 text-right font-medium">単価</th><th className="px-1.5 py-1 text-right font-medium">金額</th><th className="px-1.5 py-1 text-left font-medium">備考</th><th className="px-1.5 py-1" />
          </tr></thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                <td className="px-1.5 py-1"><SelectOrTextField value={r.label} options={options} onSave={v => { setLocal(r.id, { label: v }); commit(r.id, { label: v }) }} placeholder="名目を入力" /></td>
                <td className="px-1.5 py-1"><MoneyInput value={r.quantity} onCommit={v => { const q = v === '' ? null : Number(v); const amt = recalcAmount(r, q, r.unit_price); setLocal(r.id, { quantity: q, amount: amt }); commit(r.id, { quantity: q, amount: amt }) }} /></td>
                <td className="px-1.5 py-1"><MoneyInput value={r.unit_price} onCommit={v => { const u = v === '' ? null : Number(v); const amt = recalcAmount(r, r.quantity, u); setLocal(r.id, { unit_price: u, amount: amt }); commit(r.id, { unit_price: u, amount: amt }) }} /></td>
                <td className="px-1.5 py-1">
                  {r.quantity != null && r.unit_price != null ? (
                    // 数量×単価が入っていれば金額は自動計算（読み取り専用）
                    <div className="px-1.5 py-1.5 text-[12px] text-right tabular-nums text-gray-700 bg-gray-50/70 rounded" title="数量×単価の自動計算">{yen(r.amount ?? 0)}</div>
                  ) : (
                    <MoneyInput value={r.amount} onCommit={v => commit(r.id, { amount: v === '' ? 0 : Number(v) })} />
                  )}
                </td>
                <td className="px-1.5 py-1"><input type="text" defaultValue={r.note ?? ''} onBlur={e => commit(r.id, { note: e.target.value })} placeholder="備考" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" /></td>
                <td className="px-1.5 py-1 text-center relative">
                  <div className="flex items-center justify-center gap-0.5">
                    <button type="button" onClick={() => setMenuFor(menuFor === r.id ? null : r.id)} title="司法/行政・課税/非課税を移動" className="text-gray-300 hover:text-brand-600"><MoreVertical className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => delRow(r.id)} title="削除" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  {menuFor === r.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-32 bg-white border border-gray-200 rounded-md shadow-lg py-1 text-left">
                        <div className="px-2.5 py-1 text-[10px] text-gray-400">事業区分</div>
                        {SHIGYO.map(s => (
                          <button key={s.key} type="button" onClick={() => moveRow(r.id, { shigyo: s.key })} className="w-full flex items-center gap-1.5 px-2.5 py-1 text-[12px] hover:bg-gray-50">
                            <Check className={`w-3 h-3 flex-none ${r.shigyo === s.key ? 'opacity-100 text-brand-600' : 'opacity-0'}`} /><span style={{ color: s.text }}>{s.key}</span>
                          </button>
                        ))}
                        <div className="border-t border-gray-100 my-1" />
                        <div className="px-2.5 py-1 text-[10px] text-gray-400">税区分</div>
                        {[{ t: false, l: '非課税' }, { t: true, l: '課税' }].map(o => (
                          <button key={o.l} type="button" onClick={() => moveRow(r.id, { taxable: o.t })} className="w-full flex items-center gap-1.5 px-2.5 py-1 text-[12px] hover:bg-gray-50">
                            <Check className={`w-3 h-3 flex-none ${r.taxable === o.t ? 'opacity-100 text-brand-600' : 'opacity-0'}`} />{o.l}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold bg-gray-50/60"><td colSpan={3} className="px-1.5 py-1">{taxable ? '課税 小計（税込）' : '非課税 小計'}</td><td className="px-1.5 py-1 text-right tabular-nums">{yen(subtotal)}</td><td colSpan={2} /></tr></tfoot>
        </table>
        <button type="button" onClick={() => addRow(shigyo, taxable)} className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3 h-3" /> 行を追加</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 実務タブからの取り込みはミニマム運用では非表示（実務タブ自体が非表示のため） */}
      {!isMinimalMode() && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400">各実務タブ（戸籍の小為替・不動産の取得資料・登録免許税）で確定した立替実費を取り込めます。手入力分はそのまま残ります。</p>
          <button type="button" onClick={openImport} disabled={importing}
            className="flex-none inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" />{importing ? '取り込み中…' : '実務タブから取り込み'}
          </button>
        </div>
      )}
      {SHIGYO.map(s => {
        const firmTotal = rows.filter(r => r.shigyo === s.key).reduce((n, r) => n + (r.amount ?? 0), 0)
        return (
          <div key={s.key} className="border border-gray-200 rounded-lg">
            <div className="px-3 py-2 bg-gray-50 flex items-center gap-2 border-l-4 rounded-t-lg" style={{ borderColor: s.color }}>
              <span className="text-[12.5px] font-semibold" style={{ color: s.color }}>立替実費（{s.key}）</span>
              <span className="ml-auto text-[12.5px] font-semibold" style={{ color: s.color }}>小計 {yen(firmTotal)}</span>
            </div>
            <div className="px-3 pb-3">
              {renderBlock(s.key, false)}
              {renderBlock(s.key, true)}
            </div>
          </div>
        )
      })}

      {pending && (
        <ImportModal
          items={pending}
          importing={importing}
          onClose={() => setPending(null)}
          onSetShigyo={(key, s) => setPend(key, { shigyo: s })}
          onToggleTaxable={key => setPend(key, { taxable: !pending.find(p => p.key === key)!.taxable })}
          onAllShigyo={setAllShigyo}
          onConfirm={confirmImport}
        />
      )}
    </div>
  )
}

// 取り込みポップアップ：課税/非課税はシステム自動（クリックで手直し可）、司法/行政はユーザー選択。
function ImportModal({ items, importing, onClose, onSetShigyo, onToggleTaxable, onAllShigyo, onConfirm }: {
  items: PendingItem[]
  importing: boolean
  onClose: () => void
  onSetShigyo: (key: string, shigyo: string) => void
  onToggleTaxable: (key: string) => void
  onAllShigyo: (shigyo: string) => void
  onConfirm: () => void
}) {
  const total = items.reduce((n, it) => n + it.amount, 0)
  return (
    <Modal isOpen onClose={onClose} title="立替実費の取り込み">
      <div className="space-y-3">
        <p className="text-[12px] text-gray-500 leading-relaxed">課税／非課税は名目から自動で決まります。<span className="font-semibold text-gray-700">司法・行政の振り分けだけ</span>選んでください（前回選んだ内容は残ります）。</p>
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <span className="text-[12px] text-gray-500">一括:</span>
          {SHIGYO.map(s => (
            <button key={s.key} type="button" onClick={() => onAllShigyo(s.key)} className="text-[12px] px-3 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50">全て{s.key}</button>
          ))}
          <span className="ml-auto text-[12px] text-gray-400 tabular-nums">{items.length}件・{yen(total)}</span>
        </div>
        <div className="max-h-[46vh] overflow-y-auto -mx-1 px-1">
          {items.map(it => (
            <div key={it.key} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-gray-800 truncate">{it.label}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <button type="button" onClick={() => onToggleTaxable(it.key)}
                    title="クリックで課税/非課税を切替"
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${it.taxable ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-brand-50 text-brand-700 border-brand-200'}`}>
                    {it.taxable ? '課税・自動' : '非課税・自動'}
                  </button>
                  <span className="text-[12px] text-gray-500 tabular-nums">{yen(it.amount)}</span>
                </div>
              </div>
              <div className="inline-flex flex-none border border-gray-300 rounded-md overflow-hidden">
                {SHIGYO.map((s, i) => {
                  const active = it.shigyo === s.key
                  return (
                    <button key={s.key} type="button" onClick={() => onSetShigyo(it.key, s.key)}
                      className={`text-[12px] px-3.5 py-1.5 ${i > 0 ? 'border-l border-gray-200' : ''}`}
                      style={active ? { background: s.bg, color: s.text, fontWeight: 600 } : { color: '#6b7280' }}>
                      {s.key}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] text-gray-400">手入力した実費行はそのまま残ります</span>
          <button type="button" onClick={onClose} className="ml-auto px-3 py-1.5 text-[12px] text-gray-600 hover:text-gray-800">キャンセル</button>
          <button type="button" disabled={importing} onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md disabled:opacity-50">
            <Download className="w-3.5 h-3.5" />{importing ? '取り込み中…' : `取り込む（${items.length}件）`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
