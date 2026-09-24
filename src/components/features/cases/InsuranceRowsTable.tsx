'use client'

// 生命保険の行（financial_assets の asset_type='生命保険'）。面談シート・オーダーシート・実務タブで同じ表。
//   面談で分かるのは「保険会社名」まで。複数社あるのが普通なので1行1社。受取人・保険金は備考に。
//   会社が分からないときの「生命保険協会への契約照会」は案件に1つ（cases.life_insurance_inquiry。呼び出し側で出す）。

import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useRowsFrom } from '@/lib/useRowsFrom'
import type { FinancialAssetRow } from '@/types'

export default function InsuranceRowsTable({ caseId, assets, onRefresh, ensureCaseId }: {
  caseId: string
  /** 案件の金融資産（全部。ここで生命保険だけに絞る） */
  assets: FinancialAssetRow[]
  onRefresh?: () => void
  ensureCaseId?: () => Promise<string>
}) {
  const supabase = createClient()
  // useRowsFrom に渡す配列は識別子が安定していること。filter をそのまま渡すと描画のたびに新しい配列になり、
  // 「前回と違う→入れ直す（setState）→再描画→また違う」で無限ループ（Too many re-renders）になっていた。
  // 受注系の案件でオーダーシートが出た瞬間に案件詳細が落ちていた原因
  const insurance = useMemo(() => assets.filter(a => a.asset_type === '生命保険'), [assets])
  const [rows, setRows] = useRowsFrom(insurance)
  const inp = 'input-flat w-full px-2 py-1 text-[13px] text-gray-800 outline-none'

  // 入力中はローカルだけ更新し、欄を離れた（blur）ときに1回書く。1文字ごとにDBへ書いていた
  const edit = (id: string, field: 'institution_name' | 'notes', v: string) => setRows(p => p.map(r => (r.id === id ? { ...r, [field]: v } : r)))
  const save = async (id: string, field: 'institution_name' | 'notes', v: string) => {
    const { error } = await supabase.from('financial_assets').update({ [field]: v || (field === 'institution_name' ? '' : null) }).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error')
  }
  const add = async () => {
    const cid = ensureCaseId ? await ensureCaseId() : caseId
    const { data, error } = await supabase.from('financial_assets').insert({ case_id: cid, asset_type: '生命保険', institution_name: '', acquirer: '自社' }).select('*').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setRows(p => [...p, data as FinancialAssetRow]); onRefresh?.()
  }
  const del = async (id: string) => {
    const { error } = await supabase.from('financial_assets').delete().eq('id', id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    setRows(p => p.filter(r => r.id !== id)); onRefresh?.()
  }

  return (
    <div className="text-[13px]">
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_1.5rem] gap-x-3 items-center pb-1 text-[11.5px] text-gray-400"><span>保険会社名</span><span>備考（受取人・保険金など分かれば）</span><span /></div>
          {rows.map(r => (
            <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_1.5rem] gap-x-3 items-center py-1 border-t border-gray-100">
              <input type="text" value={r.institution_name ?? ''} onChange={e => edit(r.id, 'institution_name', e.target.value)} onBlur={e => void save(r.id, 'institution_name', e.target.value)} placeholder="例：日本生命" className={inp} />
              <input type="text" value={r.notes ?? ''} onChange={e => edit(r.id, 'notes', e.target.value)} onBlur={e => void save(r.id, 'notes', e.target.value)} placeholder="例：受取人 長男・証券は手元にある" className={inp} />
              <button type="button" onClick={() => void del(r.id)} title="この保険会社を外す" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </>
      )}
      <button type="button" onClick={() => void add()} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3.5 h-3.5" />保険会社を追加</button>
    </div>
  )
}
