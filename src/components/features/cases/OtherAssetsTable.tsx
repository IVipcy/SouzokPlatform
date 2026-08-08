'use client'

// その他財産／相続債務／その他費用の表（case_other_assets）。
// 面談シート・オーダーシート・実務タブで同じデータを扱い、出す列だけを変える。
//   面談シート/オーダーシート … 項目・金額のみ（面談中に根拠資料まで詰めるのは現実的でないため）
//   実務タブ                 … ＋根拠資料・精算チェック・立替者・備考
// 金額は常に正で保存し、マイナス表示（相続債務・その他費用）は kind から判断する。

import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { isNegativeKind, needsPayer } from '@/lib/constants'
import { MoneyInput } from './FinancialAssetsTable'
import { useRowsFrom } from '@/lib/useRowsFrom'
import type { CaseOtherAssetRow, HeirRow } from '@/types'

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`

type Props = {
  caseId: string
  kind: string
  rows: CaseOtherAssetRow[]
  /** 立替者の選択肢（その他費用のみ使用）。未登録ならフリー入力で受ける */
  heirs?: HeirRow[]
  onRefresh?: () => void
  /** true で 根拠資料・精算・立替者・備考 まで出す（実務タブ）。既定は項目・金額のみ */
  detailed?: boolean
  /** 下書き案件で、書き込み前に案件を作る */
  ensureCaseId?: () => Promise<string>
}

export default function OtherAssetsTable({ caseId, kind, rows: initial, heirs = [], onRefresh, detailed = false, ensureCaseId }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useRowsFrom(initial)

  const negative = isNegativeKind(kind)
  const withPayer = detailed && needsPayer(kind)
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0)

  const save = (id: string, patch: Partial<CaseOtherAssetRow>) => {
    setRows(p => p.map(r => (r.id === id ? { ...r, ...patch } : r)))
    supabase.from('case_other_assets').update(patch).eq('id', id).then(({ error }) => {
      if (error) showToast(`保存に失敗: ${error.message}`, 'error')
    })
  }
  const add = async () => {
    const cid = ensureCaseId ? await ensureCaseId() : caseId
    const { data, error } = await supabase.from('case_other_assets')
      .insert({ case_id: cid, kind, sort_order: rows.length }).select('*').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setRows(p => [...p, data as CaseOtherAssetRow]); onRefresh?.()
  }
  const del = async (id: string) => {
    const { error } = await supabase.from('case_other_assets').delete().eq('id', id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    setRows(p => p.filter(r => r.id !== id)); onRefresh?.()
  }

  // 立替者：相続人が登録済みならそこから選ぶ。未登録・一覧に無い人はフリー入力（payer_name）。
  const payerValue = (r: CaseOtherAssetRow) => r.payer_heir_id ?? (r.payer_name ? '__free__' : '')
  const onPayerSelect = (r: CaseOtherAssetRow, v: string) => {
    if (v === '__free__') save(r.id, { payer_heir_id: null, payer_name: r.payer_name ?? '' })
    else if (v === '') save(r.id, { payer_heir_id: null, payer_name: null })
    else save(r.id, { payer_heir_id: v, payer_name: null })
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse" style={{ minWidth: detailed ? 640 : 360 }}>
          <thead>
            <tr className="text-[11px] text-gray-500 border-b border-gray-200">
              <th className="px-2 py-1.5 text-left font-medium">項目</th>
              <th className="px-2 py-1.5 text-right font-medium w-36">金額</th>
              {withPayer && <th className="px-2 py-1.5 text-left font-medium w-40">立替者</th>}
              {detailed && <th className="px-2 py-1.5 text-center font-medium w-24">精算する<span className="block text-[10px] font-normal text-gray-400">遺産分割時</span></th>}
              {detailed && <th className="px-2 py-1.5 text-center font-medium w-20">根拠資料</th>}
              {detailed && <th className="px-2 py-1.5 text-left font-medium">備考・根拠資料</th>}
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={detailed ? (withPayer ? 7 : 6) : 3} className="px-2 py-4 text-center text-[11.5px] text-gray-400">「行を追加」で入力してください</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-b border-gray-50 last:border-b-0">
                <td className="px-2 py-1.5">
                  <input type="text" value={r.label ?? ''} onChange={e => setRows(p => p.map(x => x.id === r.id ? { ...x, label: e.target.value } : x))}
                    onBlur={e => save(r.id, { label: e.target.value || null })}
                    placeholder={kind === '相続債務' ? '例：◯◯カード 残債' : kind === 'その他費用' ? '例：葬儀費用' : '例：ゴルフ会員権'}
                    className="w-full px-1.5 py-1 border border-gray-200 rounded bg-white outline-none focus:border-brand-400" />
                </td>
                <td className="px-2 py-1.5">
                  <MoneyInput value={r.amount} onCommit={v => save(r.id, { amount: v === '' ? null : Number(v) })} />
                </td>
                {withPayer && (
                  <td className="px-2 py-1.5">
                    <select value={payerValue(r)} onChange={e => onPayerSelect(r, e.target.value)}
                      className="w-full px-1 py-1 text-[11.5px] border border-gray-200 rounded bg-white outline-none focus:border-brand-400">
                      <option value="">—</option>
                      {heirs.map(h => <option key={h.id} value={h.id}>{h.name || '（氏名未入力）'}</option>)}
                      <option value="__free__">その他（手入力）</option>
                    </select>
                    {payerValue(r) === '__free__' && (
                      <input type="text" value={r.payer_name ?? ''} onChange={e => setRows(p => p.map(x => x.id === r.id ? { ...x, payer_name: e.target.value } : x))}
                        onBlur={e => save(r.id, { payer_name: e.target.value || null })}
                        placeholder="氏名" className="w-full mt-1 px-1.5 py-1 text-[11.5px] border border-gray-200 rounded bg-white outline-none focus:border-brand-400" />
                    )}
                  </td>
                )}
                {detailed && (
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={r.settle_between_heirs} onChange={e => save(r.id, { settle_between_heirs: e.target.checked })} className="w-4 h-4 accent-brand-600" />
                  </td>
                )}
                {detailed && (
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={r.has_evidence} onChange={e => save(r.id, { has_evidence: e.target.checked })} className="w-4 h-4 accent-brand-600" />
                  </td>
                )}
                {detailed && (
                  <td className="px-2 py-1.5">
                    <input type="text" value={r.note ?? ''} onChange={e => setRows(p => p.map(x => x.id === r.id ? { ...x, note: e.target.value } : x))}
                      onBlur={e => save(r.id, { note: e.target.value || null })}
                      placeholder="領収書 等" className="w-full px-1.5 py-1 border border-gray-200 rounded bg-white outline-none focus:border-brand-400" />
                  </td>
                )}
                <td className="px-1 py-1.5 text-center">
                  <button type="button" onClick={() => del(r.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className={`border-t font-semibold ${negative ? 'border-red-200 bg-red-50/50 text-red-800' : 'border-brand-200 bg-brand-50/40 text-brand-800'}`}>
                <td className="px-2 py-1.5">小計</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{negative ? `− ${yen(total)}` : yen(total)}</td>
                <td colSpan={(withPayer ? 1 : 0) + (detailed ? 3 : 0) + 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
        <Plus className="w-3.5 h-3.5" />行を追加
      </button>
    </div>
  )
}
