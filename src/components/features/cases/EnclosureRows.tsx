'use client'

// 請求カードの「同梱する資料」。請求の種類ごとに決まって要る資料（lib/originals.ts REQUIRED_ENCLOSURES）を縦に並べ、
// 行ごとに「手元にいくつあるか」と「今回入れる数」を出す。戸籍・不動産・金融で同じ部品。
//   ・今回入れる数は手元の数まで（それ以上を打つと手元の数に戻る。手元 0 の行は打てない）
//   ・手元の数は到着物タブの原本の出入りと同じ（契約時受領＋届いたもの − 出払い中 − 納品）。入れた分はその場で減る
//   ・写し（本人確認書類の写し）は数えない。数だけ入れる
//   ・戸籍のように手元の行が複数（届いた通ごと）あるときは、古いものから順に充てる（どれを出したかは原本の出入りに残る）
//   ・一覧に無い物が要るときだけ「＋ ほかの資料を手元から足す」
// 行はこの部品が直接 request_enclosures に書く（1つの要る資料＝doc_name が同じ行の集まり）。親には onChanged で知らせる。

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { matchStockForRequired, requiredEnclosuresFor, type RequiredEnclosure, type StockRow } from '@/lib/originals'
import type { RequestEnclosureRow } from '@/types'

const digits = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '')
const qtyCls = 'input-flat w-14 px-2 py-1 text-[14px] text-right text-gray-800 outline-none disabled:text-gray-300 disabled:cursor-not-allowed'

export default function EnclosureRows({ caseId, refKind, refId, refLabel, stock, enclosures, onChanged, disabled = false, deceasedName = null, shokumujo = false }: {
  caseId: string
  refKind: 'koseki' | 're' | 'fin' | 'cancel'
  refId: string
  /** 請求の呼び名。原本の出入りの「出先」に出す（例：横浜市都筑区 戸籍請求（山田太郎）） */
  refLabel: string
  /** 案件の原本（手元にある資料） */
  stock: StockRow[]
  /** 案件の同梱 全件（この請求の分だけ使う） */
  enclosures: RequestEnclosureRow[]
  onChanged: () => void
  disabled?: boolean
  /** 被相続人の名前（戸籍の行を被相続人／相続人に分けるのに使う） */
  deceasedName?: string | null
  /** 職務上請求（委任状の行を出さない） */
  shokumujo?: boolean
}) {
  const supabase = createClient()
  const [moreOpen, setMoreOpen] = useState(false)
  const mine = enclosures.filter(e => e.ref_kind === refKind && e.ref_id === refId)
  const items = requiredEnclosuresFor(refKind, { shokumujo })
  const ctx = { deceasedName }
  const itemNames = new Set(items.map(i => i.name))

  /** この要る資料に当たる原本の行（古い順＝stock の並び） */
  const rowsFor = (item: RequiredEnclosure) => stock.filter(s => matchStockForRequired(item, s, ctx))
  const coveredKeys = new Set(items.flatMap(i => rowsFor(i).map(s => s.key)))

  const insertRows = async (rows: Array<{ doc_name: string; form: '原本' | '写し'; stock_key: string | null; quantity: number }>) => {
    if (rows.length === 0) return true
    const { error } = await supabase.from('request_enclosures').insert(rows.map((r, i) => ({ case_id: caseId, ref_kind: refKind, ref_id: refId, ref_label: refLabel, sort_order: mine.length + i, ...r })))
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return false }
    return true
  }
  const deleteRows = async (ids: string[]) => {
    if (ids.length === 0) return true
    const { error } = await supabase.from('request_enclosures').delete().in('id', ids)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return false }
    return true
  }

  /** 要る資料の「今回入れる数」を n にする。手元の行に古い順で充て直す */
  const setRequiredQty = async (item: RequiredEnclosure, n: number) => {
    const rows = rowsFor(item)
    const cur = mine.filter(e => e.doc_name === item.name)
    const curQty = cur.reduce((s, e) => s + e.quantity, 0)
    let target: number
    if (item.copy) {
      target = Math.max(0, Math.min(99, n))
    } else {
      // この請求が既に充てている分は「手元」に戻して数える（打ち直せるように）
      const allocated = new Map<string, number>()
      for (const e of cur) if (e.stock_key) allocated.set(e.stock_key, (allocated.get(e.stock_key) ?? 0) + e.quantity)
      const max = rows.reduce((s, r) => s + r.onHand + (allocated.get(r.key) ?? 0), 0)
      target = Math.max(0, Math.min(max, n))
      if (n > max) showToast(`手元にあるのは ${max} 通です`, 'error')
    }
    if (target === curQty) { onChanged(); return }
    if (!(await deleteRows(cur.map(e => e.id)))) return
    const out: Array<{ doc_name: string; form: '原本' | '写し'; stock_key: string | null; quantity: number }> = []
    if (item.copy) {
      if (target > 0) out.push({ doc_name: item.name, form: '写し', stock_key: rows[0]?.key ?? null, quantity: target })
    } else {
      const allocated = new Map<string, number>()
      for (const e of cur) if (e.stock_key) allocated.set(e.stock_key, (allocated.get(e.stock_key) ?? 0) + e.quantity)
      let left = target
      for (const r of rows) {
        if (left <= 0) break
        const avail = r.onHand + (allocated.get(r.key) ?? 0)
        if (avail <= 0) continue
        const take = Math.min(avail, left)
        out.push({ doc_name: item.name, form: '原本', stock_key: r.key, quantity: take })
        left -= take
      }
    }
    if (await insertRows(out)) onChanged()
  }

  /** 一覧に無い資料（手元の行を1つ選んで足したもの） */
  const extras = mine.filter(e => !itemNames.has(e.doc_name))
  const setExtraQty = async (e: RequestEnclosureRow, n: number) => {
    const s = stock.find(x => x.key === e.stock_key)
    const max = s ? (s.copy ? 99 : s.onHand + e.quantity) : 99
    const target = Math.max(0, Math.min(max, n))
    if (n > max) showToast(`手元にあるのは ${max} 通です`, 'error')
    if (target === 0) { if (await deleteRows([e.id])) onChanged(); return }
    if (target === e.quantity) return
    const { error } = await supabase.from('request_enclosures').update({ quantity: target }).eq('id', e.id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onChanged()
  }
  const addExtra = async (s: StockRow) => {
    setMoreOpen(false)
    if (await insertRows([{ doc_name: s.name, form: s.copy ? '写し' : '原本', stock_key: s.key, quantity: 1 }])) onChanged()
  }
  const morePick = stock.filter(s => !coveredKeys.has(s.key) && !extras.some(e => e.stock_key === s.key) && (s.copy || s.onHand > 0))

  const outsNote = (rows: StockRow[]) => {
    const outs = rows.flatMap(r => r.outs)
    const n = rows.reduce((s, r) => s + r.outstanding, 0)
    return n > 0 ? `出払い中 ${n}（${[...new Set(outs.map(o => o.label))].join('・')}）` : ''
  }

  return (
    <div className="w-full">
      <table className="border-collapse text-[13px]" style={{ minWidth: 560 }}>
        <thead>
          <tr className="text-[12px] text-gray-500">
            <th className="text-left font-medium pb-1 pr-3">資料</th>
            <th className="text-right font-medium pb-1 pr-3 w-16">手元</th>
            <th className="text-left font-medium pb-1 pr-3 w-28">今回入れる数</th>
            <th className="text-left font-medium pb-1" />
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const rows = rowsFor(item)
            const cur = mine.filter(e => e.doc_name === item.name)
            const qty = cur.reduce((s, e) => s + e.quantity, 0)
            const onHand = rows.reduce((s, r) => s + r.onHand, 0)
            const locked = cur.some(e => e.returned_qty > 0)
            const canType = !disabled && !locked && (item.copy || onHand + qty > 0)
            const note = locked ? `返却あり（${cur.reduce((s, e) => s + e.returned_qty, 0)} 通 戻り）`
              : item.copy ? '写しは数えない'
              : onHand + qty === 0 ? `手元にありません${item.note ? `・${item.note}` : ''}`
              : [qty > 0 ? `手元 ${onHand + qty} → ${onHand}` : '', outsNote(rows), item.note ?? ''].filter(Boolean).join('・')
            return (
              <tr key={item.key} className="border-t border-gray-100">
                <td className={`py-1.5 pr-3 ${onHand + qty === 0 && !item.copy ? 'text-gray-400' : 'text-gray-800'}`}>{item.name}</td>
                <td className={`py-1.5 pr-3 text-right tabular-nums ${item.copy ? 'text-gray-300' : onHand > 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}`}>{item.copy ? '—' : onHand}</td>
                <td className="py-1.5 pr-3">
                  <span className="inline-flex items-center gap-1">
                    <input type="text" inputMode="numeric" key={`q-${item.key}-${qty}`} defaultValue={String(qty)} disabled={!canType}
                      onBlur={e => { const n = Number(digits(e.target.value)); if (n !== qty) void setRequiredQty(item, n) }}
                      className={qtyCls} />
                    <span className="text-[12px] text-gray-500">通</span>
                  </span>
                </td>
                <td className="py-1.5 text-[11.5px] text-gray-500">{note}</td>
              </tr>
            )
          })}
          {extras.map(e => {
            const s = stock.find(x => x.key === e.stock_key)
            return (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="py-1.5 pr-3 text-gray-800">{e.doc_name}</td>
                <td className={`py-1.5 pr-3 text-right tabular-nums ${s?.copy ? 'text-gray-300' : (s?.onHand ?? 0) > 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}`}>{s ? (s.copy ? '—' : s.onHand) : '—'}</td>
                <td className="py-1.5 pr-3">
                  <span className="inline-flex items-center gap-1">
                    <input type="text" inputMode="numeric" key={`x-${e.id}-${e.quantity}`} defaultValue={String(e.quantity)} disabled={disabled || e.returned_qty > 0}
                      onBlur={ev => { const n = Number(digits(ev.target.value)); if (n !== e.quantity) void setExtraQty(e, n) }} className={qtyCls} />
                    <span className="text-[12px] text-gray-500">通</span>
                    {!disabled && <button type="button" onClick={() => void deleteRows([e.id]).then(ok => { if (ok) onChanged() })} title="外す" className="ml-1 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>}
                  </span>
                </td>
                <td className="py-1.5 text-[11.5px] text-gray-500">{s ? (s.copy ? '写しは数えない' : `手元 ${s.onHand + e.quantity} → ${s.onHand}`) : '原本の行に結んでいない'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!disabled && (
        <div className="relative mt-1.5">
          <button type="button" onClick={() => setMoreOpen(v => !v)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] text-gray-500 border border-dashed border-gray-300 hover:border-brand-400 hover:text-brand-700"><Plus className="w-3 h-3" />ほかの資料を手元から足す</button>
          {moreOpen && (
            <div className="absolute z-20 mt-1 min-w-[280px] max-w-[460px] bg-white border border-gray-300 shadow-lg p-1.5 text-[12.5px]">
              {morePick.length === 0 ? (
                <div className="px-2 py-1.5 text-gray-400">足せる資料がありません</div>
              ) : morePick.map(s => (
                <button key={s.key} type="button" onClick={() => void addExtra(s)} className="w-full text-left px-2 py-1.5 hover:bg-brand-50 flex items-center gap-2">
                  <span className="flex-1 truncate">{s.name}{s.person ? `（${s.person}）` : ''}</span>
                  <span className="flex-none text-[11px] text-gray-500">{s.copy ? '写し' : `手元 ${s.onHand}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
