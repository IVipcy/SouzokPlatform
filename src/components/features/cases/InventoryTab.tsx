'use client'

// 財産目録（＝財産・債務一覧表）。
//
// 実際に使っているエクセル「★財産目録」の〈分割案4名まで【日付2つ】〉シートと同じ区分・列で並べる。
//   （土地）（建物）（預貯金）（有価証券）（その他財産）（債務） → 各小計 → 取得合計 → 参考：法定相続分
//
// 中身は財産調査タブの入力そのもの（不動産／金融資産／その他財産・相続債務・その他費用）。
// ここで入れ直すことはせず、直すのは財産調査タブ。画面に出ているものがそのまま Excel に出る。
//
// 取得者（誰が取るか）はこの画面では扱わない。遺産分割タブで決める。

import { useState } from 'react'
import { Calculator, FileSpreadsheet, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { computeLegalShares, fracValue, type Frac } from '@/lib/legalShare'
import { buildInventorySections, buildEvidence, inventoryNet, type SourceTable } from '@/lib/inventorySheet'
import { MoneyInput } from './FinancialAssetsTable'
import type { FinancialAssetRow, RealEstatePropertyRow, CaseOtherAssetRow, HeirRow } from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()

export default function InventoryTab({ caseId, financialAssets, properties, otherAssets = [], heirs = [], onRefresh }: {
  caseId: string
  financialAssets: FinancialAssetRow[]
  properties: RealEstatePropertyRow[]
  otherAssets?: CaseOtherAssetRow[]
  heirs?: HeirRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const [heirRows, setHeirRows] = useState<HeirRow[]>(heirs)
  const [busy, setBusy] = useState(false)

  // 元データ（財産調査の入力）を手元に持って、目録から直したらここも書き換える。
  // 画面のちらつきを防ぐため、保存とローカル反映を同時にやる。
  const [props, setProps] = useState(properties)
  const [fins, setFins] = useState(financialAssets)
  const [others, setOthers] = useState(otherAssets)

  const sections = buildInventorySections(props, fins, others)
  const evidence = buildEvidence(fins)
  const net = inventoryNet(sections)

  // 目録で直した内容は元テーブル（財産調査）へ書き戻す。目録に写しは作らない。
  const patch = async (table: SourceTable, id: string, field: string, value: string | number | null) => {
    if (table === 'real_estate_properties') setProps(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))
    else if (table === 'financial_assets') setFins(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as FinancialAssetRow : r)))
    else setOthers(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as CaseOtherAssetRow : r)))
    const { error } = await supabase.from(table).update({ [field]: value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  // 法定相続人だけを参考欄に出す（前妻・前夫は is_legal_heir=false なので出ない）
  const takers = heirRows.filter(h => h.is_legal_heir)
  const shareOf = (h: HeirRow): Frac | null =>
    h.legal_share_num && h.legal_share_den ? { num: h.legal_share_num, den: h.legal_share_den } : null

  // 法定相続分を続柄から計算して heirs に入れる。代襲・放棄があれば手で直す前提の初期値。
  const calcLegalShares = async () => {
    setBusy(true)
    const shares = computeLegalShares(heirRows)
    const next: HeirRow[] = []
    for (const h of heirRows) {
      const f = shares[h.id]
      const patch = { legal_share_num: f?.num ?? null, legal_share_den: f?.den ?? null }
      await supabase.from('heirs').update(patch).eq('id', h.id)
      next.push({ ...h, ...patch })
    }
    setHeirRows(next)
    setBusy(false)
    showToast('法定相続分を計算しました', 'success')
    onRefresh?.()
  }
  const saveShare = async (h: HeirRow, num: string, den: string) => {
    const patch = { legal_share_num: num ? Number(num) : null, legal_share_den: den ? Number(den) : null }
    setHeirRows(prev => prev.map(x => (x.id === h.id ? { ...x, ...patch } : x)))
    const { error } = await supabase.from('heirs').update(patch).eq('id', h.id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const TH = 'px-2.5 py-1.5 text-left font-semibold whitespace-nowrap'
  const cellInput = 'w-full min-w-[80px] px-1.5 py-1 text-[12.5px] border border-transparent rounded bg-transparent hover:border-gray-200 focus:border-brand-500 focus:bg-white outline-none'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[11.5px] text-gray-500 flex-1 min-w-[280px] leading-relaxed">
          財産調査の入力をそのまま並べています。<strong>ここで直すと財産調査タブにも反映されます</strong>（写しは作りません）。
          ここに出ている内容がそのままExcelに出ます。
        </p>
        <a href={`/api/documents/inventory?caseId=${caseId}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700">
          <FileSpreadsheet className="w-3.5 h-3.5" /> 財産目録をExcelで出力
        </a>
      </div>

      {sections.map(sec => {
        return (
          <div key={sec.key} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className={`px-3 py-2 text-[13px] font-bold border-b ${sec.negative ? 'bg-red-50/60 text-red-800 border-red-100' : 'bg-brand-50/60 text-brand-800 border-brand-100'}`}>
              （{sec.title}）
              <span className="ml-2 text-[11px] font-normal text-gray-500">{sec.rows.length}件</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 720 }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-600">
                    <th className={`${TH} w-10 text-center`}>番号</th>
                    {sec.headers.map(h => <th key={h} className={TH}>{h}</th>)}
                    <th className={`${TH} w-36 text-right`}>{sec.amountHeader}</th>
                    <th className={TH}>備考</th>
                    <th className={`${TH} w-40`}>根拠資料</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sec.rows.length === 0 ? (
                    <tr><td colSpan={sec.headers.length + 4} className="px-3 py-5 text-center text-[12px] text-gray-400">この区分の登録はありません</td></tr>
                  ) : sec.rows.map((r, i) => (
                    <tr key={r.source.id} className="hover:bg-gray-50/60">
                      <td className="px-2.5 py-1.5 text-center text-gray-500">{i + 1}</td>
                      {r.cells.map((c, ci) => (
                        <td key={ci} className="px-2.5 py-1.5 text-gray-800 align-top">
                          {c.field ? (
                            <input type="text" defaultValue={c.value == null ? '' : String(c.value)}
                              onBlur={e => {
                                const v = e.target.value.trim()
                                const cur = c.value == null ? '' : String(c.value)
                                if (v === cur) return
                                patch(r.source.table, r.source.id, c.field!, v === '' ? null : (c.numeric ? Number(v) : v))
                              }}
                              className={cellInput} />
                          ) : (
                            c.value === '' || c.value == null ? <span className="text-gray-300">—</span> : String(c.value)
                          )}
                          {/* 建物は所在の下に家屋番号（実物のエクセルと同じ2段組み） */}
                          {ci === 0 && r.subField && (
                            <input type="text" defaultValue={(r.subLine ?? '').replace('家屋番号　', '')}
                              onBlur={e => {
                                const v = e.target.value.trim()
                                if (v === (r.subLine ?? '').replace('家屋番号　', '')) return
                                patch(r.source.table, r.source.id, r.subField!, v === '' ? null : v)
                              }}
                              placeholder="家屋番号"
                              className={`${cellInput} mt-1 text-[11.5px]`} />
                          )}
                        </td>
                      ))}
                      <td className="px-2.5 py-1.5 align-top">
                        <MoneyInput value={r.amount} onCommit={v => patch(r.source.table, r.source.id, r.amountField, v === '' ? null : Number(v))} />
                      </td>
                      <td className="px-2.5 py-1.5 align-top">
                        <input type="text" defaultValue={r.note}
                          onBlur={e => { if (e.target.value.trim() !== r.note) patch(r.source.table, r.source.id, r.noteField, e.target.value.trim() || null) }}
                          className={cellInput} />
                      </td>
                      <td className="px-2.5 py-1.5 text-gray-600 align-top">{(evidence[sec.key] ?? [])[i] || <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50/70 font-semibold text-gray-700">
                    <td className="px-2.5 py-1.5" colSpan={sec.headers.length + 1}>小計</td>
                    <td className={`px-2.5 py-1.5 text-right tabular-nums ${sec.negative ? 'text-red-700' : ''}`}>
                      {sec.negative ? `− ${yen(sec.total)}` : yen(sec.total)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}

      {/* 取得合計（プラス財産 − 債務） */}
      <div className="rounded-lg border border-brand-300 bg-brand-50/70 px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-[13px] font-bold text-brand-900">取得合計</span>
        <span className="text-[11px] text-gray-500">プラス財産 − 債務</span>
        <span className="ml-auto text-[16px] font-bold text-brand-900 tabular-nums">{yen(net)}</span>
      </div>

      {/* 参考：法定相続割合・法定相続分（実物のエクセルの一番下と同じ） */}
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[12.5px] font-semibold text-brand-800">参考：法定相続割合</span>
          <button type="button" onClick={calcLegalShares} disabled={busy || takers.length === 0}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700 border border-brand-300 rounded px-2 py-1 disabled:opacity-50">
            <Calculator className="w-3 h-3" />続柄から自動計算
          </button>
          <span className="text-[11px] text-gray-400">代襲・相続放棄などがあれば手で直してください</span>
        </div>
        {takers.length === 0 ? (
          <p className="text-[12px] text-gray-400">相続人が未登録です。相続人調査タブで登録すると、ここに法定相続分が出ます。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 420 }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-600">
                  <th className={TH}>相続人</th>
                  <th className={`${TH} w-40`}>法定相続割合</th>
                  <th className={`${TH} w-36 text-right`}>法定相続分</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {takers.map(h => (
                  <tr key={h.id}>
                    <td className="px-2.5 py-1.5 text-gray-800">{h.name || '（氏名未入力）'}</td>
                    <td className="px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <input type="number" defaultValue={h.legal_share_num ?? ''} onBlur={e => saveShare(h, e.target.value, String(h.legal_share_den ?? ''))}
                          placeholder="分子" className="w-14 px-1.5 py-1 text-[12px] text-right border border-gray-200 rounded bg-white outline-none focus:border-brand-500" />
                        <span className="text-gray-400">/</span>
                        <input type="number" defaultValue={h.legal_share_den ?? ''} onBlur={e => saveShare(h, String(h.legal_share_num ?? ''), e.target.value)}
                          placeholder="分母" className="w-14 px-1.5 py-1 text-[12px] text-right border border-gray-200 rounded bg-white outline-none focus:border-brand-500" />
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-700">
                      {shareOf(h) ? yen(net * fracValue(shareOf(h)!)) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <ExternalLink className="w-3 h-3" />
        誰がどれを取得するかは「遺産分割」タブで決めます。精算書の「収入」に入るのはプラス財産だけです。
      </p>
    </div>
  )
}
