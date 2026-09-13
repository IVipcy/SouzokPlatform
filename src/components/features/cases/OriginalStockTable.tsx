'use client'

// 到着物と原本管理タブ「原本管理」：手元にある原本と、いまどこに出ているか。
//   行は契約時受領の書類・受信簿の到着物から自動。受領の数は棚卸しで直せる。
//   出払い中＝請求カードの「同梱する資料」で原本を選んだもの（＋金融の請求に出した印鑑登録証明書）。
//   戻ってきたら受信簿で「原本の返却」として受ける（ここでは戻さない）。お客様へ返した／納品した数はここで入れる。

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import HintTip from '@/components/ui/HintTip'
import { useOriginalStock } from '@/lib/useOriginalStock'
import { md, stockKey, type StockRow } from '@/lib/originals'

const inp = 'input-flat w-full px-2 py-1 text-[13px] text-gray-800 outline-none text-right'

export default function OriginalStockTable({ caseId, canEdit = true }: { caseId: string; canEdit?: boolean }) {
  const supabase = createClient()
  const { stock: allStock, loading, reload } = useOriginalStock(caseId)
  // 写し（本人確認書類の写しなど）は数えないので、この表には出さない
  const stock = allStock.filter(r => !r.copy)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('1')

  const upsert = async (row: StockRow, p: { received_qty?: number | null; delivered_qty?: number; delivered_on?: string | null; notes?: string | null }) => {
    const base = { case_id: caseId, stock_key: row.key, updated_at: new Date().toISOString(), ...(row.auto ? {} : { doc_name: row.name, person: row.person }) }
    const { error } = await supabase.from('original_doc_overrides').upsert({ ...base, ...p }, { onConflict: 'case_id,stock_key' })
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    reload()
  }
  const addManual = async () => {
    const name = newName.trim()
    if (!name) return
    const id = crypto.randomUUID()
    const { error } = await supabase.from('original_doc_overrides').insert({ case_id: caseId, stock_key: stockKey('manual', id), doc_name: name, received_qty: Math.max(1, Number(newQty) || 1) })
    if (error) { showToast(`追加に失敗: ${error.message}`, 'error'); return }
    setNewName(''); setNewQty('1'); setAdding(false); reload()
  }
  const removeManual = async (row: StockRow) => {
    if (row.auto || !row.override) return
    const { error } = await supabase.from('original_doc_overrides').delete().eq('id', row.override.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    reload()
  }
  const digits = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '')

  return (
    <div>
      {loading && stock.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12.5px] text-gray-400">読み込み中…</p>
      ) : stock.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12.5px] text-gray-400">原本がまだありません。契約手続きで受領した書類と、受信簿で届いた到着物がここに並びます。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th className="px-2.5 py-2 text-left font-semibold">原本</th>
                <th className="px-2.5 py-2 text-right font-semibold w-20"><span className="inline-flex items-center gap-1">受領<HintTip text="受領した通数。契約時受領は1通（印鑑登録証明書は契約手続きの通数）、到着物は受信簿の通数。数が違えばここで直せます（棚卸し）。" /></span></th>
                <th className="px-2.5 py-2 text-right font-semibold w-20">出払い中</th>
                <th className="px-2.5 py-2 text-right font-semibold w-20"><span className="inline-flex items-center gap-1">返却・納品<HintTip text="お客様へ返した／納品した数。手元から外れます。" /></span></th>
                <th className="px-2.5 py-2 text-right font-semibold w-16">手元</th>
                <th className="px-2.5 py-2 text-left font-semibold">出先（どの請求に）</th>
                <th className="px-2.5 py-2 text-left font-semibold w-40"><span className="inline-flex items-center gap-1">載せた書類<HintTip text="原本預かり証・原本受領証に載せた日と、納品タブでの扱い（対象／対象外／納品済）。預かり証は書類作成メニュー、受領証と納品は納品タブから。" /></span></th>
                <th className="px-2.5 py-2 text-left font-semibold w-40">受領のもと</th>
                <th className="px-2.5 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {stock.map((r, i) => (
                <tr key={r.key} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-2.5 py-1.5 font-medium text-gray-800">{r.name}{r.person ? <span className="ml-1 text-gray-500 font-normal">（{r.person}）</span> : null}</td>
                  <td className="px-2.5 py-1.5">
                    {canEdit
                      ? <input type="text" inputMode="numeric" key={`rq-${r.key}-${r.received}`} defaultValue={String(r.received)}
                          onBlur={e => { const n = Number(digits(e.target.value)); if (e.target.value !== '' && n !== r.received) void upsert(r, { received_qty: n }) }} className={inp} />
                      : <span className="block text-right tabular-nums">{r.received}</span>}
                  </td>
                  <td className={`px-2.5 py-1.5 text-right tabular-nums ${r.outstanding > 0 ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>{r.outstanding}</td>
                  <td className="px-2.5 py-1.5">
                    {canEdit
                      ? <input type="text" inputMode="numeric" key={`dq-${r.key}-${r.delivered}`} defaultValue={String(r.delivered)}
                          onBlur={e => { const n = Number(digits(e.target.value)); if (e.target.value !== '' && n !== r.delivered) void upsert(r, { delivered_qty: n, delivered_on: n > 0 ? new Date().toLocaleDateString('sv-SE') : null }) }} className={inp} />
                      : <span className="block text-right tabular-nums">{r.delivered}</span>}
                  </td>
                  <td className={`px-2.5 py-1.5 text-right tabular-nums font-semibold ${r.onHand > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{r.onHand}</td>
                  <td className="px-2.5 py-1.5 text-[12px] text-gray-700">
                    {r.outs.length === 0 ? <span className="text-gray-300">—</span> : (
                      <ul className="space-y-0.5">
                        {r.outs.map((o, k) => <li key={k}>{o.label}{o.since ? <span className="text-gray-400">（{md(o.since)} から）</span> : null}{o.qty > 1 ? <span className="text-gray-500"> ×{o.qty}</span> : null}</li>)}
                      </ul>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-[11px]">
                    <span className="flex flex-wrap gap-1">
                      {r.override?.azukari_issued_on && <span className="px-1.5 py-0.5 border border-brand-200 bg-brand-50 text-brand-700">預かり証 {md(r.override.azukari_issued_on)}</span>}
                      {r.override?.juryosho_issued_on && <span className="px-1.5 py-0.5 border border-emerald-200 bg-emerald-50 text-emerald-700">受領証 {md(r.override.juryosho_issued_on)}</span>}
                      {r.delivered > 0 ? <span className="px-1.5 py-0.5 border border-emerald-200 bg-emerald-50 text-emerald-700">納品済</span>
                        : r.override?.delivery_target === true ? <span className="px-1.5 py-0.5 border border-gray-300 bg-white text-gray-600">納品対象</span>
                        : r.override?.delivery_target === false ? <span className="px-1.5 py-0.5 border border-gray-200 bg-gray-50 text-gray-400">納品対象外</span> : null}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 text-[12px] text-gray-500">{r.source}</td>
                  <td className="px-2.5 py-1.5 text-right">
                    {canEdit && !r.auto && <button type="button" onClick={() => void removeManual(r)} title="この行を消す" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {adding ? (
            <>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="原本の名前（例：遺言書 原本）" autoFocus className="input-flat px-2 py-1 text-[13px] outline-none w-64" onKeyDown={e => { if (e.key === 'Enter') void addManual() }} />
              <input type="text" inputMode="numeric" value={newQty} onChange={e => setNewQty(digits(e.target.value))} className="input-flat px-2 py-1 text-[13px] outline-none w-14 text-right" />通
              <button type="button" onClick={() => void addManual()} disabled={!newName.trim()} className="px-2.5 py-1 text-[12px] font-semibold text-white bg-brand-600 rounded-md disabled:opacity-40">追加</button>
              <button type="button" onClick={() => { setAdding(false); setNewName('') }} className="px-2 py-1 text-[12px] text-gray-500">やめる</button>
            </>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"><Plus className="w-3.5 h-3.5" />原本を手で足す</button>
          )}
          <span className="text-[11.5px] text-gray-400">出払い中は請求カードの「同梱する資料」で原本を選ぶと増え、受信簿で「原本の返却」を登録すると戻ります。</span>
        </div>
      )}
    </div>
  )
}
