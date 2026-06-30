'use client'

// 相続登記（実務）：市区町村単位の左レール＋カード。TOP＝物件別の登記状況。
// 物件は財産調査(real_estate_properties)を共有。確定費用＝登録免許税＋申請時ダブルチェック。

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { SectionHeading, FieldGrid, InlineSelect, InlineMultiSelect, InlineEdit, InlineDate, InlineTextarea } from '@/components/ui/InlineFields'
import { REGISTRATION_TYPES, REGISTRATION_CAUSES, REGISTRATION_STATUSES } from '@/lib/constants'
import ProgressSummary from './ProgressSummary'
import { LeftRail } from './LeftRail'
import { CostBlock, DoubleCheck } from './CostAndCheck'
import type { RealEstatePropertyRow } from '@/types'

const collator = new Intl.Collator('ja')

export default function RegistrationSection({ caseId, properties, onRefresh }: {
  caseId: string
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const [sub, setSub] = useState('top')
  const [statuses, setStatuses] = useState<Record<string, string>>({})

  const munis = [...new Set(properties.map(p => (p.municipality ?? '').trim()).filter(Boolean))].sort(collator.compare)
  const hasUnset = properties.some(p => !(p.municipality ?? '').trim())

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('progress_summaries').select('scope_key, status').eq('case_id', caseId).like('scope_key', 'registration_%')
      if (!alive || !data) return
      const map: Record<string, string> = {}
      for (const d of data as { scope_key: string; status: string | null }[]) map[d.scope_key.replace('registration_', '')] = d.status ?? '未着手'
      setStatuses(map)
    })()
    return () => { alive = false }
  }, [caseId, supabase, properties.length])

  const saveField = async (id: string, field: keyof RealEstatePropertyRow, value: unknown) => {
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }
  const saveMany = async (id: string, patch: Partial<RealEstatePropertyRow>) => {
    const { error } = await supabase.from('real_estate_properties').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }

  const muniProps = (m: string) => properties.filter(p => (p.municipality ?? '').trim() === m)
  const items = [
    { key: 'top', label: '一覧（TOP）' },
    ...munis.map(m => ({ key: m, label: m, status: statuses[m] })),
    ...(hasUnset ? [{ key: '__unset__', label: '市区町村 未設定', status: statuses[''] }] : []),
  ]
  const activeMuni = sub === '__unset__' ? '' : sub
  const costTotal = properties.reduce((s, p) => s + (p.registration_cost ?? 0), 0)

  return (
    <div className="flex gap-3 items-start">
      <LeftRail items={items} active={sub} onChange={setSub} />
      <div className="flex-1 min-w-0">
        {sub === 'top' ? (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey="registration" title="進捗/結果（相続登記 全体）" />
            <div>
              <SectionHeading title="相続登記の状況" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse" style={{ minWidth: 760 }}>
                  <thead>
                    <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
                      <th className="px-2.5 py-2 text-left font-semibold w-36">市区町村</th>
                      <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-28">ステータス</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-20">申請日</th>
                      <th className="px-2.5 py-2 text-right font-semibold w-28">登録免許税</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">財産調査タブで不動産を登録すると、ここで相続登記を管理できます。</td></tr>
                    ) : properties.map((p, i) => (
                      <tr key={p.id} className={`border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-brand-50/30 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`} onClick={() => setSub((p.municipality ?? '').trim() || '__unset__')}>
                        <td className="px-2.5 py-2 text-gray-700">{(p.municipality ?? '').trim() || <span className="text-gray-300">未設定</span>}</td>
                        <td className="px-2.5 py-2 font-medium text-gray-800">{p.address || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2.5 py-2">{p.registration_status || '—'}</td>
                        <td className="px-2.5 py-2">{p.registration_apply_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2 text-right">{p.registration_cost != null ? `¥${Math.round(p.registration_cost).toLocaleString('ja-JP')}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-gray-700">
                      <td className="px-2.5 py-2 text-right" colSpan={4}>登録免許税 合計（立替実費の実績）</td>
                      <td className="px-2.5 py-2 text-right text-emerald-700">{`¥${Math.round(costTotal).toLocaleString('ja-JP')}`}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey={`registration_${activeMuni}`} title={`進捗/結果（${sub === '__unset__' ? '市区町村 未設定' : activeMuni}）`} />
            {muniProps(activeMuni).map(p => (
              <div key={p.id} className="rounded-md border border-gray-200 px-3.5 py-3 space-y-3">
                <div className="text-[12.5px] font-semibold text-gray-800">{p.property_type || '物件'}・{p.address || '—'}</div>
                <FieldGrid>
                  <InlineMultiSelect label="相続登記の種別" value={p.registration_types} options={[...REGISTRATION_TYPES]} onSave={v => saveField(p.id, 'registration_types', v.length ? v : null)} fullWidth />
                  <InlineSelect label="登記原因" value={p.registration_cause} options={[...REGISTRATION_CAUSES]} onSave={v => saveField(p.id, 'registration_cause', v)} />
                  <InlineEdit label="管轄法務局" value={p.registration_office} onSave={v => saveField(p.id, 'registration_office', v)} />
                  <InlineSelect label="ステータス" value={p.registration_status} options={[...REGISTRATION_STATUSES]} onSave={v => saveField(p.id, 'registration_status', v)} />
                  <InlineDate label="申請日" value={p.registration_apply_date} onSave={v => saveField(p.id, 'registration_apply_date', v)} />
                  <InlineDate label="完了日" value={p.registration_complete_date} onSave={v => saveField(p.id, 'registration_complete_date', v)} />
                  <InlineTextarea label="備考・結果" value={p.registration_result} onSave={v => saveField(p.id, 'registration_result', v)} fullWidth />
                </FieldGrid>
                <CostBlock budget={null} refund={null} confirmed={p.registration_cost} mode="confirmedOnly" label="登録免許税（確定費用＝立替実費の実績）"
                  onSave={(_field, v) => saveField(p.id, 'registration_cost', v === '' ? null : Number(v))} />
                <div className="flex gap-2.5 flex-wrap">
                  <DoubleCheck label="申請時ダブルチェック（自分以外）" name={p.registration_check_name} at={p.registration_check_at}
                    onSet={(name, at) => saveMany(p.id, { registration_check_name: name, registration_check_at: at })} />
                </div>
              </div>
            ))}
            {muniProps(activeMuni).length === 0 && <div className="rounded-md border border-gray-200 px-4 py-8 text-center text-[12px] text-gray-400">この市区町村の物件がありません。</div>}
          </div>
        )}
      </div>
    </div>
  )
}
