'use client'

// 評価証明（物件ごと）の別表（エクセルR69準拠）。名寄帳とは表を分ける。
// 物件種別・所在地は物件一覧から表示（読み取り）、家屋番号・近傍宅地価格・年度をここで入力する。
// 保存先は real_estate_properties（kaoku_bango / near_land_price / eval_cert_year。年度は migration 193）。
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { ACQUIRERS, acquirerLabel } from '@/lib/acquirer'
import type { RealEstatePropertyRow } from '@/types'

const NEAR_LAND = ['あり', 'なし']

// 和暦の年度候補（今年度・前年度）。例: 令和6年度 / 令和5年度。
function warekiYears(): string[] {
  const y = new Date().getFullYear()
  const reiwa = (yy: number) => `令和${yy - 2018}年度`
  return [reiwa(y), reiwa(y - 1)]
}

type Props = {
  caseId: string
  properties: RealEstatePropertyRow[]   // この市区町村の物件（親でフィルタ済み）
  requestTo?: string                     // 請求先（市区町村役所名）。表示のみ
  onRefresh?: () => void
}

export default function EvalCertTable({ properties, requestTo, onRefresh }: Props) {
  const supabase = createClient()
  const years = warekiYears()

  const save = async (id: string, field: keyof RealEstatePropertyRow, value: string | null) => {
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value || null }).eq('id', id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  if (properties.length === 0) {
    return <p className="text-[12px] text-gray-400">先に物件一覧で物件を登録してください。</p>
  }

  return (
    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
      <table className="w-full text-[13px] border-collapse" style={{ minWidth: 840 }}>
        <thead>
          <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
            <th className="px-2.5 py-2 text-left font-semibold w-28">取得区分</th>
            <th className="px-2.5 py-2 text-left font-semibold w-40">請求先</th>
            <th className="px-2.5 py-2 text-left font-semibold w-24">物件種別</th>
            <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
            <th className="px-2.5 py-2 text-left font-semibold w-32">家屋番号</th>
            <th className="px-2.5 py-2 text-left font-semibold w-28">近傍宅地価格</th>
            <th className="px-2.5 py-2 text-left font-semibold w-32">年度</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p, i) => {
            // 依頼者取得のときは 自社の請求入力（家屋番号・近傍宅地・年度）は不要 → 非活性で薄く。
            const isClient = (p.acquirer ?? '自社') === '依頼者'
            const dim = isClient ? 'opacity-40 pointer-events-none' : ''
            return (
            <tr key={p.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
              <td className="px-2.5 py-1.5">
                <select value={p.acquirer ?? '自社'} onChange={e => save(p.id, 'acquirer', e.target.value)} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                  {ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}
                </select>
              </td>
              <td className={`px-2.5 py-2 text-gray-600 ${dim}`}>{requestTo || <span className="text-gray-300">市区町村役所</span>}</td>
              <td className="px-2.5 py-2 text-gray-700">{p.property_type || <span className="text-gray-300">—</span>}</td>
              <td className="px-2.5 py-2 font-medium text-gray-800">{p.address || <span className="text-gray-300">—</span>}</td>
              <td className={`px-2.5 py-1.5 ${dim}`}>
                <input type="text" defaultValue={p.kaoku_bango ?? ''} onBlur={e => { if (e.target.value !== (p.kaoku_bango ?? '')) save(p.id, 'kaoku_bango', e.target.value) }} placeholder="家屋番号" className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
              </td>
              <td className={`px-2.5 py-1.5 ${dim}`}>
                <select value={p.near_land_price ?? ''} onChange={e => save(p.id, 'near_land_price', e.target.value)} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                  <option value="">—</option>
                  {NEAR_LAND.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
              <td className={`px-2.5 py-1.5 ${dim}`}>
                <select value={p.eval_cert_year && !years.includes(p.eval_cert_year) ? '__other__' : (p.eval_cert_year ?? '')} onChange={e => { if (e.target.value !== '__other__') save(p.id, 'eval_cert_year', e.target.value) }} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                  <option value="">—</option>
                  {years.map(o => <option key={o} value={o}>{o}</option>)}
                  {p.eval_cert_year && !years.includes(p.eval_cert_year) && <option value="__other__">{p.eval_cert_year}</option>}
                </select>
              </td>
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  )
}
