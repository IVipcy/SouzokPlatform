'use client'

import { useState } from 'react'
import { Trash2, Plus, DownloadCloud } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { isNegativeClass } from '@/lib/constants'
import { computeHeirSettlement } from '@/lib/heirSettlement'
import type { DivisionDetailRow, HeirRow, AssetInventoryRow } from '@/types'

type Props = {
  caseId: string
  details: DivisionDetailRow[]
  heirs: HeirRow[]
  assetInventory?: AssetInventoryRow[]
  onRefresh?: () => void
}

// 財産区分の入力候補（自由入力は今までどおりできる）。目録の区分＋債務・その他費用。
const ASSET_CATEGORY_CHOICES = ['土地', '建物', '預貯金', '有価証券', 'その他財産', '債務', 'その他費用']

/** 金額の割付から取得割合の分数を作る。全部その人のものなら null（＝書かない）。 */
function ratioFraction(part: number, total: number | null): string | null {
  if (!total || part <= 0 || part >= total) return null
  const n = Math.round(part), d = Math.round(total)
  const g = gcd(n, d) || 1
  return `${n / g}/${d / g}`
}

/** 分割内容を表形式でインライン編集・行追加する。取得者は相続人の選択リスト。 */
export default function DivisionDetailsTable({ caseId, details, heirs, assetInventory = [], onRefresh }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<DivisionDetailRow[]>(details)
  const [busy, setBusy] = useState(false)
  const heirNames = heirs.map(h => h.name).filter(Boolean)

  // 財産目録から取り込む。目録には取得者ごとの割付（allocations）が入っているので、
  // 「財産 × 取得者」で1行ずつ作る。分割内容をここで入れ直す必要がなくなる。
  // 割付がまだの財産は、取得者を空にした1行だけ作って後から選べるようにする。
  // 相続債務・その他費用は「誰が負担するか」であって分割する財産ではないので持ってこない。
  const heirName = (id: string) => heirs.find(h => h.id === id)?.name ?? ''
  const importInventory = async () => {
    // 協議書には3種類の行が要る。
    //   財産 … ◯◯が取得する      債務 … ◯◯が負担する      精算 … ◯◯が△△へ支払う
    // 目録の割付と立替から全部作れるので、ここで入れ直す必要はない。
    const existing = new Set(rows.map(r => `${r.entry_kind}|${r.asset_category}|${r.recipient ?? ''}`))
    const news: Array<{ case_id: string; entry_kind: string; asset_category: string; amount: number | null; recipient: string | null; share_ratio: string | null; division_method: string | null; description: string | null }> = []
    const add = (entry_kind: string, asset_category: string, amount: number | null, recipient: string | null, extra?: { share_ratio?: string | null; division_method?: string | null; description?: string | null }) => {
      const key = `${entry_kind}|${asset_category}|${recipient ?? ''}`
      if (existing.has(key)) return
      existing.add(key)
      news.push({
        case_id: caseId, entry_kind, asset_category, amount, recipient,
        share_ratio: extra?.share_ratio ?? null, division_method: extra?.division_method ?? null, description: extra?.description ?? null,
      })
    }

    for (const a of assetInventory) {
      const label = a.detail ?? a.asset_class ?? ''
      const kind = isNegativeClass(a.asset_class) ? '債務' : '財産'
      const alloc = Object.entries(a.allocations ?? {}).filter(([, v]) => (v ?? 0) !== 0)
      if (alloc.length === 0) {
        add(kind, label, a.amount, null)
        continue
      }
      for (const [heirId, v] of alloc) {
        // 取得割合は「その財産のうち何分か」。協議書は分数で書くので分数のまま入れる。
        // 全部その人のものなら書かない（「持分1分の1」は文面が冗長になるため）。
        add(kind, label, v, heirName(heirId) || null, { share_ratio: ratioFraction(v, a.amount) })
      }
    }

    // 立替の精算（誰が誰にいくら）。代償分割の条項としてそのまま書ける形で入れる。
    const settlement = computeHeirSettlement(assetInventory, heirs.filter(h => h.is_legal_heir))
    for (const t of settlement.transfers) {
      add('精算', `精算金（${t.toName}へ）`, t.amount, t.fromName, {
        division_method: '代償分割',
        description: `${t.fromName}は${t.toName}に対し ${t.amount.toLocaleString()}円 を支払う`,
      })
    }

    if (news.length === 0) { showToast('取り込む目録がありません（財産目録で取得者を割り付けてください）', 'info'); return }
    const { data, error } = await supabase.from('division_details').insert(news).select('*')
    if (error) { showToast(`取込に失敗: ${error.message}`, 'error'); return }
    setRows(prev => [...prev, ...((data ?? []) as DivisionDetailRow[])])
    showToast(`${news.length}件を取り込みました`, 'success')
    onRefresh?.()
  }

  // 並びは協議書の条項の順（財産を分ける → 債務を負担する → 代償金を支払う）。
  // 債務が財産の行に混ざると、誰が何を取るのかが読み取れなくなるので下にまとめる。
  const KIND_ORDER = ['財産', '債務', '精算']
  const ordered = [...rows].sort((a, b) => {
    const ai = KIND_ORDER.indexOf(a.entry_kind || '財産')
    const bi = KIND_ORDER.indexOf(b.entry_kind || '財産')
    return (ai < 0 ? KIND_ORDER.length : ai) - (bi < 0 ? KIND_ORDER.length : bi)
  })

  const setLocal = (id: string, field: keyof DivisionDetailRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as DivisionDetailRow : r)))

  const commit = async (id: string, field: keyof DivisionDetailRow, value: string) => {
    const { error } = await supabase.from('division_details').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async () => {
    setBusy(true)
    const { data, error } = await supabase.from('division_details').insert({ case_id: caseId, asset_category: '' }).select('*').single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as DivisionDetailRow])
    onRefresh?.()
  }

  const delRow = async (row: DivisionDetailRow) => {
    if (!confirm(`「${row.asset_category || '未入力'}」を削除しますか？`)) return
    const { error } = await supabase.from('division_details').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={importInventory} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50"><DownloadCloud className="w-3.5 h-3.5" /> 財産目録から取込</button>
        <span className="text-[11px] text-gray-400">目録の割付から、財産の取得・債務の負担・立替の精算金まで取り込みます</span>
      </div>
      <datalist id="division-asset-categories">
        {ASSET_CATEGORY_CHOICES.map(c => <option key={c} value={c} />)}
      </datalist>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2.5 py-2 text-left font-semibold w-20">区分</th>
              <th className="px-2.5 py-2 text-left font-semibold">財産区分</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">取得者<span className="block text-[10px] font-normal text-brand-500">債務＝負担者／精算＝支払う人</span></th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">取得割合</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-gray-400">分割内容が登録されていません</td></tr>
            ) : (
              ordered.map((r, i) => (
                // 区分が切り替わるところに線を入れて、財産と債務のかたまりを分かりやすくする
                <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${
                  i > 0 && (ordered[i - 1].entry_kind || '財産') !== (r.entry_kind || '財産') ? 'border-t-2 border-t-gray-200' : ''}`}>
                  <td className="px-2.5 py-1.5">
                    <select value={r.entry_kind || '財産'} onChange={e => { setLocal(r.id, 'entry_kind', e.target.value); commit(r.id, 'entry_kind', e.target.value) }}
                      className={`w-full px-1 py-1 text-[11.5px] font-semibold border rounded outline-none ${kindCls(r.entry_kind)}`}>
                      {['財産', '債務', '精算'].map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </td>
                  <Cell value={r.asset_category} onChange={v => setLocal(r.id, 'asset_category', v)} onCommit={v => commit(r.id, 'asset_category', v)} placeholder="不動産, 預貯金, 債務, その他費用 等" list="division-asset-categories" />
                  <td className="px-2.5 py-1.5">
                    <select value={r.recipient ?? ''} onChange={e => { setLocal(r.id, 'recipient', e.target.value); commit(r.id, 'recipient', e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {/* 既存の取得者が相続人一覧に無い場合も選べるように残す */}
                      {r.recipient && !heirNames.includes(r.recipient) && <option value={r.recipient}>{r.recipient}</option>}
                      {heirNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <FractionCell value={r.share_ratio} onChange={v => setLocal(r.id, 'share_ratio', v)} onCommit={() => commit(r.id, 'share_ratio', r.share_ratio ?? '')} />
                  <td className="px-2.5 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r)} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} disabled={busy} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" /> 分割内容を追加
      </button>
    </div>
  )
}

// 協議書の行種別。財産＝取得する／債務＝負担する／精算＝代償金を支払う で文面が変わるため色を分ける。
function kindCls(kind: string | null | undefined) {
  const k = kind || '財産'
  return k === '債務' ? 'bg-red-50 text-red-700 border-red-200'
    : k === '精算' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-gray-50 text-gray-600 border-gray-200'
}

function Cell({ value, onChange, onCommit, placeholder, list }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string; list?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onCommit(e.target.value)}
        placeholder={placeholder}
        list={list}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
      />
    </td>
  )
}

// 取得割合。協議書は「持分2分の1」のように分数で書くので、分子・分母を別々に入れる。
// 保存は今までどおり share_ratio の1列に "1/2" の形で入れる（列は増やさない）。
// 目録から取り込んだ古い "50%" 表記も分数に直して見せる。
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
function parseFraction(value: string | null): { num: string; den: string } {
  const v = (value ?? '').trim()
  const f = /^(\d*)\s*\/\s*(\d*)$/.exec(v)
  if (f) return { num: f[1], den: f[2] }
  const p = /^(\d+(?:\.\d+)?)\s*%$/.exec(v)
  if (p) {
    const n = Math.round(Number(p[1]) * 10)
    const g = gcd(n, 1000) || 1
    return { num: String(n / g), den: String(1000 / g) }
  }
  return { num: '', den: '' }
}

function FractionCell({ value, onChange, onCommit }: {
  value: string | null
  onChange: (v: string) => void
  onCommit: () => void
}) {
  const { num, den } = parseFraction(value)
  const digits = (s: string) => s.replace(/[^\d]/g, '')
  const set = (n: string, d: string) => onChange(n || d ? `${n}/${d}` : '')
  const cls = 'w-12 px-1 py-1.5 text-[12px] text-center bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition'
  return (
    <td className="px-2.5 py-1.5">
      <div className="flex items-center gap-1">
        <input type="text" inputMode="numeric" value={num} placeholder="1" aria-label="分子"
          onChange={e => set(digits(e.target.value), den)} onBlur={onCommit} className={cls} />
        <span className="text-gray-400">/</span>
        <input type="text" inputMode="numeric" value={den} placeholder="2" aria-label="分母"
          onChange={e => set(num, digits(e.target.value))} onBlur={onCommit} className={cls} />
      </div>
    </td>
  )
}
