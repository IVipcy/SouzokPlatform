'use client'

// 報酬内訳（行政 → 司法の順）。
//   表は行政・司法とも同じ形（項目 / 金額）。
//   登録免許税・印紙代は報酬ではなく立替実費なので、この表では扱わない（請求タブの立替実費で入れる）。
//   割引・備考は「士業（司法/行政）ごとに1つ」＝cases.reward_discount_* / reward_note_*。
//   確定報酬 = 金額小計 − 割引 → cases.fee_judicial / fee_administrative。
//
// 前受金はここでは扱わない。前受金は「もらった額」で報酬の内訳ではなく、
// 請求パターン①のときだけ入れる値なので、独立した「前受金」セクション（請求タブ）に置いている。
// 表と集計は左右に並べる。項目は2〜3行しかないので、集計を右端まで飛ばすと真ん中が空く。

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

// 行政＝緑 / 司法＝青。行政を先に。
const SHIGYO = [
  { key: '行政' as const, label: '行政（行政書士）', color: '#0F6E56' },
  { key: '司法' as const, label: '司法（司法書士）', color: '#185FA5' },
]

export default function RewardBreakdownSection({ caseId, onTotals }: {
  caseId: string
  onTotals?: (shihou: number, gyousei: number) => void
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

  useEffect(() => {
    if (loading) return
    onTotals?.(feeShihou, feeGyosei)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeShihou, feeGyosei, loading])

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
    <div className="space-y-3.5">
      {SHIGYO.map(s => {
        const items = rows.filter(r => r.shigyo === s.key)
        const amt = amountSum[s.key] ?? 0
        const disc = discount[s.key] ?? 0
        const fee = s.key === '司法' ? feeShihou : feeGyosei
        return (
          <div key={s.key} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 flex items-center gap-2 border-l-4" style={{ borderColor: s.color }}>
              <span className="text-[12.5px] font-semibold" style={{ color: s.color }}>{s.label}</span>
              <span className="text-[12px] text-gray-500">報酬の内訳</span>
              <span className="ml-auto text-[12px] text-gray-500">
                確定報酬<span className="ml-1.5 font-mono font-semibold text-[12.5px]" style={{ color: s.color }}>{yen(fee)}</span>
              </span>
            </div>

            {/* 左＝項目の表 / 右＝集計。行が増えても左が伸びるだけで右は動かない。 */}
            <div className="flex items-stretch flex-col sm:flex-row">
              <div className="flex-1 min-w-0 p-3">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="text-[11px] text-gray-400">
                      <th className="px-1.5 pb-1.5 text-left font-normal">項目</th>
                      <th className="px-1.5 pb-1.5 text-right font-normal w-28">金額（報酬）</th>
                      <th className="w-7" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={3} className="px-1.5 py-4 text-center text-gray-400">行を追加してください</td></tr>
                    ) : items.map(r => (
                      <tr key={r.id}>
                        <td className="px-1.5 py-1">
                          <SelectOrTextField value={r.label} options={ITEM_OPTIONS} onSave={v => { setLocal(r.id, 'label', v); commit(r.id, 'label', v) }} placeholder="項目名を入力" />
                        </td>
                        <td className="px-1.5 py-1"><MoneyInput value={r.amount} onCommit={v => { setLocal(r.id, 'amount', v === '' ? 0 : Number(v)); commit(r.id, 'amount', v === '' ? 0 : Number(v)) }} /></td>
                        <td className="px-1 py-1 text-center"><button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" onClick={() => addRow(s.key)} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
                  <Plus className="w-3.5 h-3.5" /> 項目を追加
                </button>
              </div>

              <div className="w-full sm:w-[250px] flex-none p-3 bg-gray-50/70 border-t sm:border-t-0 sm:border-l border-gray-200 text-[12px]">
                <div className="flex items-center gap-2 py-1">
                  <span className="flex-1 text-gray-500">小計</span>
                  <span className="w-24 text-right font-mono tabular-nums text-gray-700">{yen(amt)}</span>
                </div>
                <div className="flex items-center gap-2 py-1">
                  <span className="flex-1 text-gray-500">割引</span>
                  <span className="text-gray-400">−</span>
                  <span className="w-24"><MoneyInput value={disc} onCommit={v => commitDiscount(s.key, v === '' ? 0 : Number(v))} /></span>
                </div>
                <div className="flex items-center gap-2 pt-2 mt-1 border-t border-gray-300">
                  <span className="flex-1 font-semibold text-gray-700">確定報酬</span>
                  <span className="w-24 text-right font-mono font-semibold text-[14px] tabular-nums" style={{ color: s.color }}>{yen(fee)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 pb-3 text-[12px]">
              <span className="text-gray-500 flex-none">備考</span>
              <input type="text" defaultValue={note[s.key]} onBlur={e => commitNote(s.key, e.target.value)} placeholder="割引理由・特記など（この請求に1つ）" className="flex-1 px-2 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
            </div>
          </div>
        )
      })}
      <p className="text-[11.5px] text-gray-400">
        登録免許税・収入印紙代は報酬ではなく立替実費です。下の「立替実費」で入れてください（登録免許税は財産調査の評価額から取り込めます）。
      </p>
    </div>
  )
}
