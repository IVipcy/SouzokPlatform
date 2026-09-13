'use client'

// 請求カードの「同梱する資料」。手元にある資料（契約時に受領したもの・受信簿で届いたもの）がチップで並び、
// 押すと1通で入る。通数はチップの中で直し、✕ で外す。戸籍・不動産・金融で同じ部品。
//   ・原本は押した分だけ「出払い中」になり、到着物タブの手元の数が減る
//   ・名前に「写し」が付くものは数えない（何度でも入れられる）
//   ・手元が 0 のものは薄く出して押せない
// 行はこの部品が直接 request_enclosures に書く。親には onChanged で知らせる（原本の数を読み直すため）。

import { Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { enclosureOutstanding, sortStockForPick, type StockRow } from '@/lib/originals'
import type { RequestEnclosureRow } from '@/types'

const digits = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '')

export default function EnclosureRows({ caseId, refKind, refId, refLabel, stock, enclosures, onChanged, disabled = false }: {
  caseId: string
  refKind: 'koseki' | 're' | 'fin' | 'cancel'
  refId: string
  /** 請求の呼び名。原本の出入りの「出先」に出す（例：横浜市都筑区 戸籍請求（山田太郎）） */
  refLabel: string
  /** 案件の原本（手元にある資料） */
  stock: StockRow[]
  /** 案件の同梱 全件（この請求の分だけ出す） */
  enclosures: RequestEnclosureRow[]
  onChanged: () => void
  disabled?: boolean
}) {
  const supabase = createClient()
  const mine = enclosures.filter(e => e.ref_kind === refKind && e.ref_id === refId)
  const byKey = new Map(mine.filter(e => e.stock_key).map(e => [e.stock_key as string, e]))

  const add = async (s: StockRow) => {
    const { error } = await supabase.from('request_enclosures').insert({
      case_id: caseId, ref_kind: refKind, ref_id: refId, ref_label: refLabel,
      doc_name: s.name, form: s.copy ? '写し' : '原本', stock_key: s.key, quantity: 1, sort_order: mine.length,
    })
    if (error) { showToast(`追加に失敗: ${error.message}`, 'error'); return }
    onChanged()
  }
  const setQty = async (e: RequestEnclosureRow, n: number) => {
    if (n <= 0 || n === e.quantity) return
    const { error } = await supabase.from('request_enclosures').update({ quantity: n }).eq('id', e.id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onChanged()
  }
  const remove = async (id: string) => {
    const { error } = await supabase.from('request_enclosures').delete().eq('id', id)
    if (error) { showToast(`外せませんでした: ${error.message}`, 'error'); return }
    onChanged()
  }

  // 並び：入れたものが先（入れた順）、次に手元にあるもの（印鑑登録証明書 → 委任状 → 本人確認書類 → そのほか）
  const picked = mine
  const rest = sortStockForPick(stock.filter(s => !byKey.has(s.key)))
  // 原本の行に結んでいない古い同梱（前の形で自由入力したもの）も、名前だけのチップで出す
  const loose = mine.filter(e => !e.stock_key)

  if (picked.length === 0 && rest.length === 0) {
    return <span className="text-[12px] text-gray-400">手元にある資料がありません（契約手続きで受領した書類・受信簿の到着物がここに並びます）</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {picked.filter(e => e.stock_key).map(e => {
        const s = stock.find(x => x.key === e.stock_key)
        const out = enclosureOutstanding(e)
        const title = s ? (s.copy ? '写しは数えません' : `手元 ${s.onHand}（この請求で ${out} 通 出払い中${e.returned_qty > 0 ? `・${e.returned_qty} 通 戻り` : ''}）`) : ''
        return (
          <span key={e.id} title={title} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-[12.5px] font-semibold text-brand-700 bg-brand-50 border border-brand-300">
            {e.doc_name}
            <input type="text" inputMode="numeric" key={`q-${e.id}-${e.quantity}`} defaultValue={String(e.quantity)} disabled={disabled}
              onBlur={ev => void setQty(e, Number(digits(ev.target.value)))}
              className="w-9 px-1 py-0.5 text-[13px] font-normal text-right text-gray-800 bg-white border border-brand-200 outline-none focus:border-brand-500" />
            <span className="font-normal text-gray-600">通</span>
            {!disabled && <button type="button" onClick={() => void remove(e.id)} title="外す" className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>}
          </span>
        )
      })}
      {loose.map(e => (
        <span key={e.id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-[12.5px] font-semibold text-gray-700 bg-gray-50 border border-gray-300" title="原本の行に結んでいないので手元の数は変わりません">
          {e.doc_name}<span className="font-normal text-gray-500">{e.quantity}通</span>
          {!disabled && <button type="button" onClick={() => void remove(e.id)} title="外す" className="text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>}
        </span>
      ))}
      {!disabled && rest.map(s => {
        const can = s.copy || s.onHand > 0
        return (
          <button key={s.key} type="button" disabled={!can} onClick={() => void add(s)}
            title={s.copy ? '写し（数えません）' : can ? `押すと1通入ります。手元 ${s.onHand}` : '手元にありません（出払い中か納品済）'}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[12.5px] border border-gray-300 bg-white text-gray-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-300 disabled:hover:text-gray-600">
            <Plus className="w-3 h-3" />{s.name}{s.person ? `（${s.person}）` : ''}
            {!s.copy && <span className="text-[11px] text-gray-400">手元 {s.onHand}</span>}
          </button>
        )
      })}
    </div>
  )
}
