'use client'

// 不動産（実務タブ）：所在地（都道府県＋市区町村）単位でサブタブ化。
// TOP（一覧）＝各市区町村タブの物件を集計（確定済バッジ）。財産目録へ反映されるのは確定済のみ。
// 各市区町村タブ＝進捗サマリー／物件一覧（評価額・確定済）／取得資料①市区町村請求→②物件取得。

import { useState, useEffect } from 'react'
import { Plus, Check, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { LeftRail } from './LeftRail'
import { SectionHeading } from '@/components/ui/InlineFields'
import ProgressSummary from './ProgressSummary'
import RealEstateTable from './RealEstateTable'
import RealEstateAcquisitionsTable from './RealEstateAcquisitionsTable'
import type { RealEstatePropertyRow, RealEstateAcquisitionRow, TaskRow, ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Props = {
  caseId: string
  properties: RealEstatePropertyRow[]
  acquisitions: RealEstateAcquisitionRow[]
  onRefresh?: () => void
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  contractDocs?: ContractDocumentRow[]
}

const yen = (n: number | null) => (n == null ? '—' : `¥${n.toLocaleString('ja-JP')}`)
const collator = new Intl.Collator('ja')

// 市区町村キー：明示の municipality があればそれ、無ければ所在地から「都道府県＋市区町村」を抽出。
export function municipalityOf(p: { municipality: string | null; address: string | null }): string {
  const m = (p.municipality ?? '').trim()
  if (m) return m
  const a = (p.address ?? '').trim()
  const match = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/)
  return match ? `${match[1] ?? ''}${match[2]}` : ''
}

export default function RealEstateSection({ caseId, properties, acquisitions, onRefresh, receipts = [], tasks = [], contractDocs = [] }: Props) {
  const supabase = createClient()
  const [sub, setSub] = useState('top')
  const [statuses, setStatuses] = useState<Record<string, string>>({})

  // 市区町村の一覧（空は「未設定」に集約）
  const munis = [...new Set(properties.map(p => municipalityOf(p)).filter(Boolean))].sort(collator.compare)
  const hasUnset = properties.some(p => !municipalityOf(p))

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('progress_summaries').select('scope_key, status').eq('case_id', caseId).like('scope_key', 'asset_re_%')
      if (!alive || !data) return
      const map: Record<string, string> = {}
      for (const d of data as { scope_key: string; status: string | null }[]) map[d.scope_key.replace('asset_re_', '')] = d.status ?? '未着手'
      setStatuses(map)
    })()
    return () => { alive = false }
  }, [caseId, supabase, properties.length])

  const tabs = [
    { key: 'top', label: '一覧' },
    ...munis.map(m => ({ key: m, label: m })),
    ...(hasUnset ? [{ key: '__unset__', label: '市区町村 未設定' }] : []),
  ]
  // 受信済＝その市区町村の取得資料を受信簿で受領（acquisition.arrival_date）
  const propMuniById = new Map(properties.map(p => [p.id, municipalityOf(p)]))
  const muniReceived = (m: string) => acquisitions.some(a => !!a.arrival_date && (
    (a.target_municipality ?? '').trim() === m || (a.target_property_id != null && propMuniById.get(a.target_property_id) === m)
  ))
  const railItems = [
    { key: 'top', label: '一覧（TOP）' },
    ...munis.map(m => ({ key: m, label: m, status: statuses[m], received: muniReceived(m) })),
    ...(hasUnset ? [{ key: '__unset__', label: '市区町村 未設定', status: statuses['unset'], received: muniReceived('') }] : []),
  ]

  // 「＋市区町村」：名称を受け取り、その市区町村の空物件を1件作成 → タブが増える
  const addMunicipality = async () => {
    const name = window.prompt('追加する市区町村名（都道府県＋市区町村。例: 東京都墨田区）')?.trim()
    if (!name) return
    const { error } = await supabase.from('real_estate_properties').insert({ case_id: caseId, municipality: name })
    if (error) { showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    setSub(name)
    onRefresh?.()
  }

  return (
    <div className="flex gap-3 items-start">
      <LeftRail items={railItems} active={sub} onChange={setSub} extra={
        <button type="button" onClick={addMunicipality} className="mt-1 text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-brand-700 hover:border-brand-300 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> 市区町村
        </button>
      } />
      <div className="flex-1 min-w-0 space-y-3.5">

      {/* TOP（一覧）：確定済を集計した読み取り専用一覧 */}
      {sub === 'top' && (
        <div className="space-y-3.5">
          <div>
            <SectionHeading title="物件一覧（各市区町村タブの集計）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                    <th className="px-2.5 py-2 text-left font-semibold w-40">市区町村</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-28">物件種別</th>
                    <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
                    <th className="px-2.5 py-2 text-right font-semibold w-36">評価額</th>
                    <th className="px-2.5 py-2 text-center font-semibold w-24">確定済</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-gray-400">物件が登録されていません</td></tr>
                  ) : properties.map((p, i) => (
                    <tr key={p.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-2.5 py-2 text-gray-700">{municipalityOf(p) || <span className="text-gray-300">未設定</span>}</td>
                      <td className="px-2.5 py-2">{p.property_type || <span className="text-gray-300">—</span>}</td>
                      <td className="px-2.5 py-2 font-medium text-gray-800">{p.address || <span className="text-gray-300">—</span>}</td>
                      <td className="px-2.5 py-2 text-right">{yen(p.appraisal_value)}</td>
                      <td className="px-2.5 py-2 text-center">
                        {p.confirmed
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200"><Check className="w-3 h-3" strokeWidth={2.5} />確定済</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200"><Lock className="w-3 h-3" />未確定</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">財産目録へ反映されるのは「確定済」の物件のみです。評価額の入力・確定は各市区町村タブで行います。</p>
          </div>
        </div>
      )}

      {/* 市区町村タブ */}
      {tabs.filter(t => t.key !== 'top').map(t => {
        const muniKey = t.key === '__unset__' ? '' : t.key
        if (sub !== t.key) return null
        return (
          <div key={t.key} className="space-y-4">
            <ProgressSummary caseId={caseId} scopeKey={`asset_re_${muniKey || 'unset'}`} title={`進捗/結果（${t.label}）`} />
            {/* 3つの表はそれぞれ枠付きカードに入れて境目をはっきりさせる */}
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <SectionHeading title="物件一覧（評価額の入力・確定）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <RealEstateTable caseId={caseId} properties={properties} onRefresh={onRefresh} municipalityFilter={muniKey} showConfirmed />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <SectionHeading title="① 市区町村へ請求（名寄帳・評価証明）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <RealEstateAcquisitionsTable caseId={caseId} acquisitions={acquisitions} properties={properties} onRefresh={onRefresh} receipts={receipts} tasks={tasks} contractDocs={contractDocs} scope="municipality" municipalityFilter={muniKey} />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <SectionHeading title="② 物件ごとに取得（登記情報・所有者事項・公図・地積測量図・路線価）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <RealEstateAcquisitionsTable caseId={caseId} acquisitions={acquisitions} properties={properties} onRefresh={onRefresh} receipts={receipts} tasks={tasks} scope="property" municipalityFilter={muniKey} />
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}
