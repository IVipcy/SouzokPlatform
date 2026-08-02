'use client'

// 報酬内訳（行政 → 司法の順）。
//   行政：項目 / 金額。司法：項目 / 金額 / 登録免許税又は印紙税（登免税・印紙代のみ）。
//   割引・備考は「士業（司法/行政）ごとに1つ」＝cases.reward_discount_* / reward_note_*。
//   確定報酬 = 金額小計 − 割引 → cases.fee_judicial / fee_administrative。
//   司法の登録免許税又は印紙税の小計は onRegistrationTax で親へ（司法の実費に加算）。

import { useEffect, useMemo, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { MoneyInput } from './FinancialAssetsTable'
import SelectOrTextField from './SelectOrTextField'
import { REWARD_ITEM_OPTIONS } from '@/lib/constants'
import type { RewardItemRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()
const ITEM_OPTIONS = [...REWARD_ITEM_OPTIONS]

// 行政＝緑 / 司法＝青（司法だけ登録免許税又は印紙税の列を持つ）。行政を先に。
const SHIGYO = [
  { key: '行政' as const, label: '行政（行政書士）', color: '#0F6E56', hasTax: false },
  { key: '司法' as const, label: '司法（司法書士）', color: '#185FA5', hasTax: true },
]

export default function RewardBreakdownSection({ caseId, onTotals, onRegistrationTax, advance, onAdvanceChange, hideAdvance = false }: {
  caseId: string
  onTotals?: (shihou: number, gyousei: number) => void
  /** 司法の登録免許税又は印紙税の小計（司法の実費に加算する用） */
  onRegistrationTax?: (shihouTax: number) => void
  advance?: { 司法: number | null; 行政: number | null }
  onAdvanceChange?: (shigyo: '司法' | '行政', value: number | null) => void
  hideAdvance?: boolean
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<RewardItemRow[]>([])
  const [discount, setDiscount] = useState<Record<'司法' | '行政', number>>({ 司法: 0, 行政: 0 })
  const [note, setNote] = useState<Record<'司法' | '行政', string>>({ 司法: '', 行政: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: items }, { data: c }] = await Promise.all([
        supabase.from('reward_items').select('*').eq('case_id', caseId).order('sort_order'),
        supabase.from('cases').select('reward_discount_judicial, reward_discount_administrative, reward_note_judicial, reward_note_administrative').eq('id', caseId).single(),
      ])
      if (!alive) return
      setRows((items ?? []) as RewardItemRow[])
      const cc = (c ?? {}) as { reward_discount_judicial?: number; reward_discount_administrative?: number; reward_note_judicial?: string | null; reward_note_administrative?: string | null }
      setDiscount({ 司法: cc.reward_discount_judicial ?? 0, 行政: cc.reward_discount_administrative ?? 0 })
      setNote({ 司法: cc.reward_note_judicial ?? '', 行政: cc.reward_note_administrative ?? '' })
      setLoading(false)
    })()
    return () => { alive = false }
  }, [caseId, supabase])

  // 金額小計（士業ごと）
  const amountSum = useMemo(() => {
    const t: Record<string, number> = { 司法: 0, 行政: 0 }
    for (const r of rows) t[r.shigyo] = (t[r.shigyo] ?? 0) + (r.amount ?? 0)
    return t
  }, [rows])
  // 確定報酬 = 金額小計 − 割引（士業ごと）
  const feeShihou = (amountSum['司法'] ?? 0) - (discount['司法'] ?? 0)
  const feeGyosei = (amountSum['行政'] ?? 0) - (discount['行政'] ?? 0)
  // 司法の登録免許税又は印紙税 小計
  const taxSum = useMemo(() => rows.filter(r => r.shigyo === '司法').reduce((n, r) => n + (r.registration_tax ?? 0), 0), [rows])

  useEffect(() => {
    if (loading) return
    onTotals?.(feeShihou, feeGyosei)
    onRegistrationTax?.(taxSum)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeShihou, feeGyosei, taxSum, loading])

  const setLocal = (id: string, field: keyof RewardItemRow, value: unknown) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } as RewardItemRow : r))
  const commit = async (id: string, field: keyof RewardItemRow, value: unknown) => {
    const { error } = await supabase.from('reward_items').update({ [field]: value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }
  const commitDiscount = async (shigyo: '司法' | '行政', value: number) => {
    setDiscount(prev => ({ ...prev, [shigyo]: value }))
    const field = shigyo === '司法' ? 'reward_discount_judicial' : 'reward_discount_administrative'
    await supabase.from('cases').update({ [field]: value }).eq('id', caseId)
  }
  const commitNote = async (shigyo: '司法' | '行政', value: string) => {
    const field = shigyo === '司法' ? 'reward_note_judicial' : 'reward_note_administrative'
    await supabase.from('cases').update({ [field]: value || null }).eq('id', caseId)
  }
  const addRow = async (shigyo: string) => {
    const { data, error } = await supabase.from('reward_items')
      .insert({ case_id: caseId, shigyo, label: '手続き一式', amount: 0, discount: 0, registration_tax: 0, sort_order: rows.length })
      .select('*').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as RewardItemRow])
  }
  const delRow = async (id: string) => {
    const { error } = await supabase.from('reward_items').delete().eq('id', id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  if (loading) return <div className="text-[12px] text-gray-400 py-3">読み込み中…</div>

  return (
    <div className="space-y-4">
      {SHIGYO.map(s => {
        const items = rows.filter(r => r.shigyo === s.key)
        const amt = amountSum[s.key] ?? 0
        const fee = s.key === '司法' ? feeShihou : feeGyosei
        const colCount = s.hasTax ? 4 : 3
        return (
          <div key={s.key} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 flex items-center gap-2 border-l-4" style={{ borderColor: s.color }}>
              <span className="text-[12.5px] font-semibold" style={{ color: s.color }}>{s.label}</span>
              <span className="text-[12.5px] text-gray-500">報酬の内訳</span>
              <span className="ml-auto text-[12.5px] font-semibold" style={{ color: s.color }}>確定報酬 {yen(fee)}{s.hasTax && <span className="text-gray-500 font-normal ml-2">登免/印紙 {yen(taxSum)}</span>}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse" style={{ minWidth: s.hasTax ? 560 : 440 }}>
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-100">
                    <th className="px-2 py-1.5 text-left font-medium w-40">項目</th>
                    <th className="px-2 py-1.5 text-right font-medium w-32">金額（報酬）</th>
                    {s.hasTax && <th className="px-2 py-1.5 text-right font-medium w-40 text-brand-700">登録免許税又は印紙税</th>}
                    <th className="px-2 py-1.5 w-7" />
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={colCount} className="px-2 py-4 text-center text-gray-400">行を追加してください</td></tr>
                  ) : items.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-2 py-1.5">
                        <SelectOrTextField value={r.label} options={ITEM_OPTIONS} onSave={v => { setLocal(r.id, 'label', v); commit(r.id, 'label', v) }} placeholder="項目名を入力" />
                      </td>
                      <td className="px-2 py-1.5"><MoneyInput value={r.amount} onCommit={v => { setLocal(r.id, 'amount', v === '' ? 0 : Number(v)); commit(r.id, 'amount', v === '' ? 0 : Number(v)) }} /></td>
                      {s.hasTax && <td className="px-2 py-1.5"><MoneyInput value={r.registration_tax ?? 0} onCommit={v => { setLocal(r.id, 'registration_tax', v === '' ? 0 : Number(v)); commit(r.id, 'registration_tax', v === '' ? 0 : Number(v)) }} /></td>}
                      <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
                {items.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50/60 font-semibold text-gray-700">
                      <td className="px-2 py-1.5 text-right">小計</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{yen(amt)}</td>
                      {s.hasTax && <td className="px-2 py-1.5 text-right tabular-nums text-brand-700">{yen(taxSum)}</td>}
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {/* 割引（士業1つ）＋確定報酬＋備考（士業1つ） */}
            <div className="px-3 py-2 border-t border-gray-100 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap text-[12px]">
                <button type="button" onClick={() => addRow(s.key)} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" /> 項目を追加</button>
                <span className="ml-auto inline-flex items-center gap-1.5"><span className="text-amber-700 font-semibold">割引</span><MoneyInput value={discount[s.key]} onCommit={v => commitDiscount(s.key, v === '' ? 0 : Number(v))} /></span>
                <span className="inline-flex items-center gap-1.5"><span className="text-gray-500">確定報酬</span><span className="font-mono font-semibold" style={{ color: s.color }}>{yen(fee)}</span></span>
              </div>
              <div className="flex items-center gap-2 text-[12px]">
                <span className="text-gray-500 flex-none">備考</span>
                <input type="text" defaultValue={note[s.key]} onBlur={e => commitNote(s.key, e.target.value)} placeholder="割引理由・特記など（この請求に1つ）" className="flex-1 px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
              </div>
              {advance && onAdvanceChange && !hideAdvance && (
                <div className="flex items-center gap-2 text-[12px] pt-1">
                  <span className="ml-auto inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    <span className="text-amber-700 font-bold">前受金（{s.key}）</span>
                    <MoneyInput value={advance[s.key]} onCommit={v => onAdvanceChange(s.key, v === '' ? null : Number(v))} />
                    <span className="text-gray-500">差引後 <span className="font-mono font-semibold text-amber-800">{yen(fee - (advance[s.key] ?? 0))}</span></span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
