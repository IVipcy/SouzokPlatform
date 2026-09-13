'use client'

// 請求カードの「同梱する資料」。1行1資料（資料名・通数・原本／写し・手元）。戸籍・不動産・金融で同じ部品。
//   ・「手元の原本から選ぶ」… 到着物タブの原本の出入りにある原本を結ぶ。原本を選ぶと、その分は「出払い中」になり手元の数が減る
//   ・定型（本人確認書類の写し・返信用封筒・委任状・印鑑登録証明書）と自由入力
//   ・写し・その他は数えない（手元の数に影響しない）
// 行はこの部品が直接 request_enclosures に書く。親には onChanged で知らせる（原本の数を読み直すため）。

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { ENCLOSURE_FORMS, ENCLOSURE_PRESETS, enclosureOutstanding, type EnclosureForm, type StockRow } from '@/lib/originals'
import type { RequestEnclosureRow } from '@/types'

const inp = 'input-flat w-full px-2 py-1 text-[13px] text-gray-800 outline-none'
const sel = 'input-flat px-2 py-1 text-[13px] text-gray-800 outline-none cursor-pointer'
const chip = 'inline-flex items-center gap-1 px-2 py-0.5 text-[12px] border border-gray-300 bg-white text-gray-600 hover:border-brand-400 hover:text-brand-700'

export default function EnclosureRows({ caseId, refKind, refId, refLabel, stock, enclosures, onChanged, disabled = false }: {
  caseId: string
  refKind: 'koseki' | 're' | 'fin' | 'cancel'
  refId: string
  /** 請求の呼び名。原本の出入りの「出先」に出す（例：横浜市都筑区 戸籍請求（山田太郎）） */
  refLabel: string
  /** 案件の原本（手元の原本から選ぶ候補） */
  stock: StockRow[]
  /** 案件の同梱 全件（この請求の分だけ出す） */
  enclosures: RequestEnclosureRow[]
  onChanged: () => void
  disabled?: boolean
}) {
  const supabase = createClient()
  const mine = enclosures.filter(e => e.ref_kind === refKind && e.ref_id === refId)
  const [pickOpen, setPickOpen] = useState(false)
  const [freeOpen, setFreeOpen] = useState(false)
  const [freeName, setFreeName] = useState('')

  const add = async (doc_name: string, form: EnclosureForm, stock_key: string | null, quantity = 1) => {
    const { error } = await supabase.from('request_enclosures').insert({
      case_id: caseId, ref_kind: refKind, ref_id: refId, ref_label: refLabel, doc_name, form, stock_key, quantity, sort_order: mine.length,
    })
    if (error) { showToast(`追加に失敗: ${error.message}`, 'error'); return }
    onChanged()
  }
  const patch = async (id: string, p: Partial<RequestEnclosureRow>) => {
    const { error } = await supabase.from('request_enclosures').update(p).eq('id', id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onChanged()
  }
  const remove = async (id: string) => {
    const { error } = await supabase.from('request_enclosures').delete().eq('id', id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    onChanged()
  }

  // 手元にある原本（この請求で既に選んだ分も、まだ手元があるなら出す）
  const pickable = stock.filter(s => s.onHand > 0)
  const stockOf = (key: string | null) => (key ? stock.find(s => s.key === key) ?? null : null)

  return (
    <div className="w-full">
      {mine.length > 0 && (
        <table className="w-full text-[13px] border-collapse mb-1.5">
          <thead>
            <tr className="text-[12px] text-gray-500">
              <th className="text-left font-medium pb-1 pr-2">資料</th>
              <th className="text-left font-medium pb-1 pr-2 w-16">通数</th>
              <th className="text-left font-medium pb-1 pr-2 w-24">原本／写し</th>
              <th className="text-left font-medium pb-1 pr-2">手元</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {mine.map(e => {
              const s = stockOf(e.stock_key)
              const out = enclosureOutstanding(e)
              return (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="py-1 pr-2">
                    <input type="text" defaultValue={e.doc_name} disabled={disabled} onBlur={ev => { if (ev.target.value.trim() && ev.target.value !== e.doc_name) void patch(e.id, { doc_name: ev.target.value.trim() }) }} className={inp} />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="text" inputMode="numeric" defaultValue={String(e.quantity)} disabled={disabled}
                      onBlur={ev => { const n = Number(ev.target.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '')); if (n > 0 && n !== e.quantity) void patch(e.id, { quantity: n }) }}
                      className={`${inp} text-right`} />
                  </td>
                  <td className="py-1 pr-2">
                    <select value={e.form} disabled={disabled} onChange={ev => void patch(e.id, { form: ev.target.value as EnclosureForm, ...(ev.target.value === '原本' ? {} : { stock_key: null }) })} style={{ fontFamily: 'inherit' }} className={sel}>
                      {ENCLOSURE_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </td>
                  <td className="py-1 pr-2 text-[12px] text-gray-600">
                    {e.form !== '原本' ? <span className="text-gray-400">—（数えない）</span>
                      : s ? <>手元 {s.onHand}<span className="text-gray-400">（この請求で {out} 通 出払い中{e.returned_qty > 0 ? `・${e.returned_qty} 通 戻り` : ''}）</span></>
                      : <span className="text-amber-700">原本の出入りに結んでいない（手元の数は減りません）</span>}
                  </td>
                  <td className="py-1 text-right">
                    {!disabled && <button type="button" onClick={() => void remove(e.id)} title="外す" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <button type="button" onClick={() => { setPickOpen(v => !v); setFreeOpen(false) }} className={chip}><Plus className="w-3 h-3" />手元の原本から選ぶ</button>
            {pickOpen && (
              <div className="absolute z-20 mt-1 min-w-[280px] max-w-[420px] bg-white border border-gray-300 shadow-lg p-1.5 text-[12.5px]">
                {pickable.length === 0 ? (
                  <div className="px-2 py-1.5 text-gray-400">手元にある原本がありません（契約時受領の書類・受信簿の到着物から自動で出ます）</div>
                ) : pickable.map(s => (
                  <button key={s.key} type="button" onClick={() => { setPickOpen(false); void add(s.name, '原本', s.key) }}
                    className="w-full text-left px-2 py-1.5 hover:bg-brand-50 flex items-center gap-2">
                    <span className="flex-1 truncate">{s.name}{s.person ? `（${s.person}）` : ''}</span>
                    <span className="flex-none text-[11px] text-gray-500">手元 {s.onHand}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {ENCLOSURE_PRESETS.map(p => (
            <button key={p.name} type="button" className={chip} title={p.form === '原本' ? '原本の出入りに同じ名前の原本があれば結びます' : undefined}
              onClick={() => {
                // 原本の定型は、同じ名前の原本が手元にあればそれに結ぶ（印鑑登録証明書など）
                const s = p.form === '原本' ? pickable.find(x => x.name.includes(p.name.replace('（写し）', ''))) ?? null : null
                void add(p.name, p.form, s?.key ?? null)
              }}>{p.name}</button>
          ))}
          <button type="button" onClick={() => { setFreeOpen(v => !v); setPickOpen(false) }} className={chip}><Plus className="w-3 h-3" />自由入力</button>
          {freeOpen && (
            <span className="inline-flex items-center gap-1">
              <input type="text" value={freeName} onChange={e => setFreeName(e.target.value)} placeholder="資料名" autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && freeName.trim()) { void add(freeName.trim(), 'その他', null); setFreeName(''); setFreeOpen(false) } }}
                className="input-flat px-2 py-1 text-[13px] outline-none w-48" />
              <button type="button" disabled={!freeName.trim()} onClick={() => { void add(freeName.trim(), 'その他', null); setFreeName(''); setFreeOpen(false) }} className="px-2 py-1 text-[12px] font-semibold text-white bg-brand-600 rounded disabled:opacity-40">追加</button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
