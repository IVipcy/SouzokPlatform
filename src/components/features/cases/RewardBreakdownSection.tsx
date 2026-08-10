'use client'

// 報酬内訳（行政 → 司法の順）。
//   表は行政・司法とも同じ形（項目 / 金額）。
//   登録免許税・印紙代は報酬ではなく立替実費なので、この表では扱わない（請求タブの立替実費で入れる）。
//   割引・備考は「士業（司法/行政）ごとに1つ」＝cases.reward_discount_* / reward_note_*。
//   確定報酬 = 金額小計 − 割引 → cases.fee_judicial / fee_administrative。
//   前受金を差し引いた額が、その士業の確定請求になる。
//
// 金額の流れ（小計→割引→確定報酬→前受金→差引後）は表の右下に縦に積んで、
// 上から順に読めば計算が追えるようにしている。以前は割引と前受金が別の場所に散っていた。

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

export default function RewardBreakdownSection({ caseId, onTotals, advance, onAdvanceChange, hideAdvance = false }: {
  caseId: string
  onTotals?: (shihou: number, gyousei: number) => void
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
        const adv = advance?.[s.key] ?? 0
        const showAdvance = !!advance && !!onAdvanceChange && !hideAdvance
        return (
          <div key={s.key} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 flex items-center gap-2 border-l-4" style={{ borderColor: s.color }}>
              <span className="text-[12.5px] font-semibold" style={{ color: s.color }}>{s.label}</span>
              <span className="text-[12px] text-gray-500">報酬の内訳</span>
              <span className="ml-auto text-[12.5px] text-gray-500">
                {showAdvance ? '差引後' : '確定報酬'}
                <span className="ml-1.5 font-mono font-semibold" style={{ color: s.color }}>{yen(showAdvance ? fee - adv : fee)}</span>
              </span>
            </div>

            <div className="p-3">
              {/* 表は幅を決め打ちにする。w-full だと項目の欄が画面いっぱいに伸びて読みづらい。 */}
              <div className="overflow-x-auto">
                <table className="text-[12px] border-collapse" style={{ width: 560, maxWidth: '100%' }}>
                  <thead>
                    <tr className="text-[11px] text-gray-500 border-b border-gray-100">
                      <th className="px-2 py-1.5 text-left font-medium">項目</th>
                      <th className="px-2 py-1.5 text-right font-medium w-36">金額（報酬）</th>
                      <th className="px-2 py-1.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={3} className="px-2 py-4 text-center text-gray-400">行を追加してください</td></tr>
                    ) : items.map(r => (
                      <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                        <td className="px-2 py-1.5">
                          <SelectOrTextField value={r.label} options={ITEM_OPTIONS} onSave={v => { setLocal(r.id, 'label', v); commit(r.id, 'label', v) }} placeholder="項目名を入力" />
                        </td>
                        <td className="px-2 py-1.5"><MoneyInput value={r.amount} onCommit={v => { setLocal(r.id, 'amount', v === '' ? 0 : Number(v)); commit(r.id, 'amount', v === '' ? 0 : Number(v)) }} /></td>
                        <td className="px-2 py-1.5 text-center"><button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" onClick={() => addRow(s.key)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
                <Plus className="w-3.5 h-3.5" /> 項目を追加
              </button>

              {/* 金額の流れ。上から順に読めば計算が追える。 */}
              <div className="mt-3 ml-auto w-full sm:w-[320px] text-[12px]">
                <SumRow label="小計" value={yen(amt)} />
                <SumRow label="割引" input={<MoneyInput value={disc} onCommit={v => commitDiscount(s.key, v === '' ? 0 : Number(v))} />} minus={disc > 0} />
                <SumRow label="確定報酬" value={yen(fee)} strong color={s.color} />
                {showAdvance && (
                  <>
                    <SumRow label="前受金" input={<MoneyInput value={advance![s.key]} onCommit={v => onAdvanceChange!(s.key, v === '' ? null : Number(v))} />} minus={adv > 0} />
                    <SumRow label="差引後" value={yen(fee - adv)} strong color={s.color} top />
                  </>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 text-[12px]">
                <span className="text-gray-500 flex-none">備考</span>
                <input type="text" defaultValue={note[s.key]} onBlur={e => commitNote(s.key, e.target.value)} placeholder="割引理由・特記など（この請求に1つ）" className="flex-1 px-2 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
              </div>
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

// 金額の流れの1行。ラベルは左、金額は右。入力欄のある行は前に − を出す。
function SumRow({ label, value, input, minus, strong, color, top }: {
  label: string
  value?: string
  input?: React.ReactNode
  minus?: boolean
  strong?: boolean
  color?: string
  top?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 py-1 ${top ? 'border-t border-gray-300 mt-0.5 pt-1.5' : ''}`}>
      <span className={`flex-1 ${strong ? 'text-gray-600 font-semibold' : 'text-gray-500'}`}>{label}</span>
      {minus && <span className="text-gray-400 flex-none">−</span>}
      {input
        ? <span className="w-[132px] flex-none">{input}</span>
        : <span className={`w-[132px] flex-none text-right font-mono tabular-nums ${strong ? 'font-semibold text-[13px]' : 'text-gray-700'}`} style={strong ? { color } : undefined}>{value}</span>}
    </div>
  )
}
