'use client'

// 財産目録（＝財産・債務一覧表）。実物のエクセルと同じく、目録と分割案を1枚にする。
//   ・分類ごとにグループ化して小計を出す
//   ・各行に相続人ごとの「取得者」列があり、そこへ金額を割り振る
//   ・下に 取得合計 と 法定相続分（参考）・差額 を出す
// 取込元は 預金/証券/信託(financial_assets)・不動産(real_estate_properties)・
// その他財産/相続債務/その他費用(case_other_assets)。
// 合計は協議書「分割内容」・精算書「収入」へ（精算書の収入はプラス財産のみ）。

import { useState } from 'react'
import { Trash2, Plus, DownloadCloud, Calculator, FileSpreadsheet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { MoneyInput } from './FinancialAssetsTable'
import {
  INVENTORY_CLASSES, INVENTORY_LEGACY_CLASSES, isNegativeClass,
  inventoryClassOfAsset, inventoryClassOfProperty, shareRatio,
} from '@/lib/constants'
import { computeLegalShares, fracValue, type Frac } from '@/lib/legalShare'
import type {
  AssetInventoryRow, FinancialAssetRow, RealEstatePropertyRow, CaseOtherAssetRow, HeirRow,
} from '@/types'

const yen = (n: number) => '¥' + Math.round(n).toLocaleString()

export default function InventoryTab({ caseId, rows: initial, financialAssets, properties, otherAssets = [], heirs = [], onRefresh }: {
  caseId: string
  rows: AssetInventoryRow[]
  financialAssets: FinancialAssetRow[]
  properties: RealEstatePropertyRow[]
  otherAssets?: CaseOtherAssetRow[]
  heirs?: HeirRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<AssetInventoryRow[]>(initial)
  const [heirRows, setHeirRows] = useState<HeirRow[]>(heirs)
  const [busy, setBusy] = useState(false)

  // 取得者の候補＝法定相続人。前妻・前夫は is_legal_heir=false なのでここに出ない。
  const takers = heirRows.filter(h => h.is_legal_heir)
  const shareOf = (h: HeirRow): Frac | null =>
    h.legal_share_num && h.legal_share_den ? { num: h.legal_share_num, den: h.legal_share_den } : null

  // 分類ごとにまとめる。未知の区分（旧データ・手入力）は最後にその区分のまま並べる。
  const classOrder = [...INVENTORY_CLASSES, ...INVENTORY_LEGACY_CLASSES] as readonly string[]
  const usedClasses = Array.from(new Set(rows.map(r => r.asset_class ?? '（未分類）')))
    .sort((a, b) => {
      const ia = classOrder.indexOf(a), ib = classOrder.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  const rowsOf = (cls: string) => rows.filter(r => (r.asset_class ?? '（未分類）') === cls)
  const sumOf = (cls: string) => rowsOf(cls).reduce((s, r) => s + (r.amount ?? 0), 0)
  // 取得者ごとの割付（allocations）は遺産分割タブへ移した。目録は財産・債務と金額の一覧に専念する。

  const positive = rows.filter(r => !isNegativeClass(r.asset_class)).reduce((s, r) => s + (r.amount ?? 0), 0)
  const negative = rows.filter(r => isNegativeClass(r.asset_class)).reduce((s, r) => s + (r.amount ?? 0), 0)
  const netTotal = positive - negative

  const setLocal = (id: string, field: keyof AssetInventoryRow, value: unknown) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } as AssetInventoryRow : r))
  const commit = async (id: string, field: keyof AssetInventoryRow, value: unknown) => {
    const { error } = await supabase.from('asset_inventory').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  // 立替者（債務・費用を既に払った相続人）。ここが入っていないと精算の向きが出せない。
  const savePayer = async (r: AssetInventoryRow, v: string) => {
    const patch = v === '' ? { payer_heir_id: null } : { payer_heir_id: v }
    setLocal(r.id, 'payer_heir_id', patch.payer_heir_id)
    const { error } = await supabase.from('asset_inventory').update(patch).eq('id', r.id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async (cls?: string) => {
    setBusy(true)
    const { data, error } = await supabase.from('asset_inventory').insert({ case_id: caseId, asset_class: cls ?? '預金', sort_order: rows.length }).select('*').single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as AssetInventoryRow])
  }

  const delRow = async (id: string) => {
    const { error } = await supabase.from('asset_inventory').delete().eq('id', id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  // 財産表（金融資産・不動産・その他）の金額を取り込む。既存の同名行は作らず、未登録分だけ追加。
  const importFromAssets = async () => {
    setBusy(true)
    // 旧区分（金融/不動産）で取り込み済みの行があるため、詳細だけでも重複判定する。
    const existingKeys = new Set(rows.map(r => `${r.asset_class}|${r.detail}`))
    const existingDetails = new Set(rows.map(r => (r.detail ?? '').trim()).filter(Boolean))
    const newRows: Array<{ case_id: string; asset_class: string; detail: string; amount: number | null; sort_order: number; payer_heir_id?: string | null; payer_name?: string | null }> = []
    let order = rows.length
    const push = (asset_class: string, detail: string, amount: number | null, payer?: { id: string | null; name: string | null }) => {
      if (existingKeys.has(`${asset_class}|${detail}`) || existingDetails.has(detail.trim())) return
      existingKeys.add(`${asset_class}|${detail}`); existingDetails.add(detail.trim())
      newRows.push({ case_id: caseId, asset_class, detail, amount, sort_order: order++, payer_heir_id: payer?.id ?? null, payer_name: payer?.name ?? null })
    }
    // 財産目録へ反映するのは「確定済」（管理担当が残高・評価額を確定したもの）のみ。
    for (const a of financialAssets) {
      if (!a.balance_confirmed || a.balance_amount == null) continue
      const detail = [a.institution_name, a.branch_name, a.account_type, a.account_number].filter(Boolean).join(' ') || a.asset_type || '金融資産'
      push(inventoryClassOfAsset(a.asset_type), detail, a.balance_amount)
    }
    for (const p of properties) {
      if (!p.confirmed || p.appraisal_value == null) continue
      const detail = [p.address, p.lot_number || p.kaoku_bango].filter(Boolean).join(' ') || p.property_type || '不動産'
      // 持分がある物件は 評価額×持分 が被相続人の取り分。未入力なら全部所有として扱う。
      const ratio = shareRatio(p.share_numerator, p.share_denominator)
      push(inventoryClassOfProperty(p.property_type), detail, Math.round(p.appraisal_value * ratio))
    }
    // その他財産・相続債務・その他費用は「確定済」の概念が無いので、金額が入っていれば取り込む。
    for (const o of otherAssets) {
      if (o.amount == null) continue
      // 立替者はそのまま引き継ぐ。相続人間の精算（誰が誰にいくら）の計算に使う。
      push(o.kind, o.label || o.kind, o.amount, { id: o.payer_heir_id, name: o.payer_name })
    }
    if (newRows.length === 0) { setBusy(false); showToast('取り込む金額がありません（各タブで残高・評価額を入力し「確定済」にしてください）', 'info'); return }
    const { data, error } = await supabase.from('asset_inventory').insert(newRows).select('*')
    setBusy(false)
    if (error) { showToast(`取込に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => [...prev, ...((data ?? []) as AssetInventoryRow[])])
    showToast(`${newRows.length}件を取り込みました`, 'success')
    onRefresh?.()
  }

  // 法定相続分を自動計算して heirs に入れる。代襲・放棄などがあれば個別に上書きする前提の初期値。
  const calcLegalShares = async () => {
    const shares = computeLegalShares(heirRows)
    if (Object.keys(shares).length === 0) { showToast('続柄が入っていないため計算できません', 'info'); return }
    setBusy(true)
    await Promise.all(Object.entries(shares).map(([id, f]) =>
      supabase.from('heirs').update({ legal_share_num: f.num, legal_share_den: f.den }).eq('id', id)))
    setHeirRows(prev => prev.map(h => shares[h.id]
      ? { ...h, legal_share_num: shares[h.id].num, legal_share_den: shares[h.id].den } : h))
    setBusy(false)
    showToast('法定相続分を計算しました', 'success')
    onRefresh?.()
  }
  const saveShare = async (h: HeirRow, num: string, den: string) => {
    const n = num.trim() === '' ? null : Number(num)
    const d = den.trim() === '' ? null : Number(den)
    setHeirRows(prev => prev.map(x => x.id === h.id ? { ...x, legal_share_num: n, legal_share_den: d } : x))
    const { error } = await supabase.from('heirs').update({ legal_share_num: n, legal_share_den: d }).eq('id', h.id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }


  const colCount = 4

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={importFromAssets} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-brand-700 bg-white border border-brand-300 rounded-md hover:bg-brand-50 disabled:opacity-50">
          <DownloadCloud className="w-3.5 h-3.5" /> 財産表から取込
        </button>
        {/* 実物のエクセル（財産・債務一覧表）と同じ体裁で書き出す。中身は財産調査の入力から組み立てる。 */}
        <a href={`/api/documents/inventory?caseId=${caseId}`}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700">
          <FileSpreadsheet className="w-3.5 h-3.5" /> 財産目録をExcelで出力
        </a>
        <span className="text-[11px] text-gray-400">「確定済」にした残高・評価額と、その他財産／相続債務／その他費用を取り込みます（不動産は持分を掛けた額）</span>
      </div>

      {/* 参考：法定相続割合。エクセルの一番下にある手入力の定数にあたる。 */}
      {takers.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12.5px] font-semibold text-brand-800">法定相続割合</span>
            <button type="button" onClick={calcLegalShares} disabled={busy} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700 border border-brand-300 rounded px-2 py-1 disabled:opacity-50">
              <Calculator className="w-3 h-3" />続柄から自動計算
            </button>
            <span className="text-[11px] text-gray-400">代襲・相続放棄などがあれば手で直してください</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {takers.map(h => (
              <div key={h.id} className="flex items-center gap-1.5">
                <span className="text-[12px] text-gray-600 min-w-16">{h.name || '（氏名未入力）'}</span>
                <input type="number" defaultValue={h.legal_share_num ?? ''} onBlur={e => saveShare(h, e.target.value, String(h.legal_share_den ?? ''))}
                  placeholder="分子" className="w-16 px-1.5 py-1 text-[12px] text-right border border-gray-200 rounded bg-white outline-none focus:border-brand-500" />
                <span className="text-gray-400">/</span>
                <input type="number" defaultValue={h.legal_share_den ?? ''} onBlur={e => saveShare(h, String(h.legal_share_num ?? ''), e.target.value)}
                  placeholder="分母" className="w-16 px-1.5 py-1 text-[12px] text-right border border-gray-200 rounded bg-white outline-none focus:border-brand-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 640 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2.5 py-2 text-left font-semibold w-40">財産区分</th>
              <th className="px-2.5 py-2 text-left font-semibold">詳細</th>
              <th className="px-2.5 py-2 text-right font-semibold w-36">金額</th>
              <th className="px-2.5 py-2 w-8" />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-[13px] text-gray-400">目録がありません。「財産表から取込」または手動で追加してください。</td></tr>
            </tbody>
          ) : usedClasses.map(cls => {
            const neg = isNegativeClass(cls)
            const groupRows = rowsOf(cls)
            return (
              <tbody key={cls}>
                <tr className={neg ? 'bg-red-50/60' : 'bg-gray-50'}>
                  <td colSpan={colCount} className={`px-2.5 py-1.5 text-[11.5px] font-semibold ${neg ? 'text-red-800' : 'text-gray-600'}`}>
                    {cls}
                    <span className="ml-2 font-normal text-gray-400">{groupRows.length}件</span>
                  </td>
                </tr>
                {groupRows.map(r => {
                  return (
                    <tr key={r.id} className="border-b border-gray-100">
                      <td className="px-2.5 py-1.5">
                        <select value={r.asset_class ?? ''} onChange={e => { setLocal(r.id, 'asset_class', e.target.value); commit(r.id, 'asset_class', e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                          <option value="">—</option>
                          {INVENTORY_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                          <optgroup label="旧区分">
                            {INVENTORY_LEGACY_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                          </optgroup>
                        </select>
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input type="text" defaultValue={r.detail ?? ''} onBlur={e => commit(r.id, 'detail', e.target.value)} placeholder="詳細（金融機関名・所在地・品目 など）" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
                        {neg && takers.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[11px] text-gray-400 whitespace-nowrap">立替者</span>
                            <select value={r.payer_heir_id ?? ''} onChange={e => savePayer(r, e.target.value)}
                              className="px-1.5 py-1 text-[11.5px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500"
                              title="この費用を既に払った相続人。入れると下の「相続人間の精算」に反映されます">
                              <option value="">未払い（これから払う）</option>
                              {takers.map(h => <option key={h.id} value={h.id}>{h.name || '（氏名未入力）'} が立替済</option>)}
                            </select>
                            {r.payer_name && !r.payer_heir_id && <span className="text-[11px] text-gray-400">（{r.payer_name}）</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5">
                        <MoneyInput value={r.amount} onCommit={v => { setLocal(r.id, 'amount', v === '' ? null : Number(v)); commit(r.id, 'amount', v) }} />
                      </td>
                      <td className="px-2.5 py-1.5 text-center"><button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  )
                })}
                <tr className="border-b border-gray-200">
                  <td className="px-2.5 py-1.5 text-[11.5px] text-gray-500" colSpan={2}>{cls} 小計</td>
                  <td className={`px-2.5 py-1.5 text-right tabular-nums text-[12.5px] font-semibold ${neg ? 'text-red-700' : 'text-gray-700'}`}>
                    {neg ? `− ${yen(sumOf(cls))}` : yen(sumOf(cls))}
                  </td>
                  <td />
                </tr>
              </tbody>
            )
          })}
          <tfoot>
            <tr className="border-t border-brand-200 bg-brand-50/40 font-semibold text-brand-800">
              <td className="px-2.5 py-2" colSpan={2}>プラス財産 合計</td>
              <td className="px-2.5 py-2 text-right tabular-nums">{yen(positive)}</td>
              <td colSpan={1} />
            </tr>
            {negative > 0 && (
              <tr className="bg-red-50/40 font-semibold text-red-800">
                <td className="px-2.5 py-2" colSpan={2}>控除（相続債務・その他費用）</td>
                <td className="px-2.5 py-2 text-right tabular-nums">− {yen(negative)}</td>
                <td colSpan={1} />
              </tr>
            )}
            <tr className="border-t border-brand-300 bg-brand-50/70 font-bold text-brand-900">
              <td className="px-2.5 py-2" colSpan={2}>正味財産／取得合計</td>
              <td className="px-2.5 py-2 text-right tabular-nums">{yen(netTotal)}</td>
              <td />
            </tr>
            {takers.some(h => shareOf(h)) && (
              <tr className="text-gray-500 border-b border-gray-200">
                <td className="px-2.5 py-1.5 text-[11.5px]" colSpan={2}>参考：法定相続分どおりなら</td>
                <td className="px-2.5 py-1.5 text-[11.5px] text-right" colSpan={2}>
                  {takers.filter(h => shareOf(h)).map(h => `${h.name || '相続人'} ${yen(netTotal * fracValue(shareOf(h)!))}`).join('　／　')}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      <button type="button" onClick={() => addRow()} disabled={busy} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
        <Plus className="w-3.5 h-3.5" /> 行を追加
      </button>

      {/* 相続人間の精算。取り分が合っていても、立て替えた人へ戻す現金の動きは別に出る。
          例）葬儀費用を長男が立替 → 二男は自分の負担分を長男に渡す。 */}
      <p className="text-[11px] text-gray-400">※ 精算書の「収入」に取り込まれるのはプラス財産だけです（相続債務・その他費用は遺産分割時の精算で扱います）。</p>
    </div>
  )
}
