'use client'

// 解約（実務）：金融機関単位の左レール＋カード。TOP＝機関別の解約状況一覧。
// 口座は財産調査(financial_assets)を共有。ここでは解約有無・解約完了日(実績)・備考を管理する。
// 完了は独立フラグ(cancellation_done)ではなく、解約完了日(cancellation_date)が入っていれば完了扱い。

import { useState, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { SectionHeading } from '@/components/ui/InlineFields'
import ProgressSummary from './ProgressSummary'
import { LeftRail } from './LeftRail'
import type { FinancialAssetRow, FinancialInstitutionRow, TaskRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'
import { cancelOptionsOf } from '@/lib/constants'

const collator = new Intl.Collator('ja')

export default function CancellationSection({ caseId, financialAssets, institutions: institutionRows = [], onRefresh, focus }: {
  caseId: string
  financialAssets: FinancialAssetRow[]
  /** 調査先。凍結確認（解約のゲート）は口座ではなく調査先が持つ（migration 271） */
  institutions?: FinancialInstitutionRow[]
  onRefresh?: () => void
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  focus?: string | null   // タスク詳細からの着地：金融機関名。該当機関サブタブを初期選択。
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<FinancialAssetRow[]>(financialAssets)
  useEffect(() => { setRows(financialAssets) }, [financialAssets])
  // タスク詳細から ?focus=金融機関名 で来たら該当機関サブタブを初期選択（その機関の口座がある場合のみ）。
  const [sub, setSub] = useState(() => (focus && financialAssets.some(a => (a.institution_name ?? '').trim() === focus)) ? focus : 'top')

  const institutions = [...new Set(rows.map(r => (r.institution_name ?? '').trim()).filter(Boolean))].sort(collator.compare)
  const hasUnset = rows.some(r => !(r.institution_name ?? '').trim())

  const save = async (id: string, field: keyof FinancialAssetRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as FinancialAssetRow : r)))
    const { error } = await supabase.from('financial_assets').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }

  const instRows = (inst: string) => rows.filter(r => (r.institution_name ?? '').trim() === inst)
  // その口座の調査先が凍結確認済みか。調査先が見つからない口座は止めない（解約だけ登録した機関もある）
  const freezeOk = (r: FinancialAssetRow) => {
    const inst = institutionRows.find(i => i.id === r.institution_id) ?? institutionRows.find(i => i.name.trim() === (r.institution_name ?? '').trim())
    return inst ? inst.freeze_confirmed : true
  }

  // 受信済＝解約書類を受信簿で受領（cancellation_arrival_date）
  const instReceived = (inst: string) => instRows(inst).some(r => !!r.cancellation_arrival_date)
  const items = [
    { key: 'top', label: '一覧（TOP）' },
    ...institutions.map(i => ({ key: i, label: i, received: instReceived(i) })),
    ...(hasUnset ? [{ key: '__unset__', label: '機関名 未設定', received: rows.some(r => !(r.institution_name ?? '').trim() && !!r.cancellation_arrival_date) }] : []),
  ]
  const activeInst = sub === '__unset__' ? '' : sub

  return (
    <div className="flex gap-3 items-start">
      <LeftRail items={items} active={sub} onChange={setSub} />
      <div className="flex-1 min-w-0">
        {sub === 'top' ? (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey="cancellation" title="進捗/結果（解約 全体）" />
            <div>
              <SectionHeading title="解約の状況" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse" style={{ minWidth: 680 }}>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-300 text-[12px] text-gray-600">
                      <th className="px-2.5 py-2 text-left font-semibold">金融機関</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-28">支店/銘柄</th>
                      <th className="px-2.5 py-2 text-center font-semibold w-20">解約有無</th>
                      <th className="px-2.5 py-2 text-center font-semibold w-20">書類受領</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-24">解約完了日</th>
                      <th className="px-2.5 py-2 text-left font-semibold">進捗/メモ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">財産調査タブで金融機関を登録すると、ここで解約手続を管理できます。</td></tr>
                    ) : rows.map((r, i) => (
                      <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-brand-50/30 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`} onClick={() => setSub((r.institution_name ?? '').trim() || '__unset__')}>
                        <td className="px-2.5 py-2 font-medium text-gray-800">{(r.institution_name ?? '').trim() || <span className="text-gray-300">未設定</span>}</td>
                        <td className="px-2.5 py-2 text-gray-700">{r.branch_name || r.stock_name || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2.5 py-2 text-center">{r.cancellation_required || '—'}</td>
                        <td className="px-2.5 py-2 text-center">{r.cancellation_arrival_date ? <span className="text-emerald-600">受領</span> : <span className="text-gray-300">—</span>}</td>
                        <td className="px-2.5 py-2">{r.cancellation_date ? <span className="text-emerald-700 font-medium">{r.cancellation_date}</span> : <span className="text-gray-300">未完了</span>}</td>
                        <td className="px-2.5 py-2 text-gray-500 text-[12px] max-w-[220px] truncate" title={r.cancellation_result ?? ''}>{r.cancellation_result || <span className="text-gray-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey={`cancellation_${activeInst}`} title={`進捗/結果（${sub === '__unset__' ? '機関名 未設定' : activeInst}）`} />
            {instRows(activeInst).length === 0 ? (
              <div className="rounded-md border border-gray-200 px-4 py-8 text-center text-[12px] text-gray-400">この金融機関の口座がありません。</div>
            ) : (
              <div className="bg-white p-3.5">
                <SectionHeading title="解約手続（口座ごと／横スクロールで全項目）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] border-collapse" style={{ minWidth: 840 }}>
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-300 text-[12px] text-gray-600">
                        <th className="px-2.5 py-2 text-left font-semibold w-32">支店/銘柄</th>
                        <th className="px-2.5 py-2 text-left font-semibold w-24">解約有無</th>
                        <th className="px-2.5 py-2 text-left font-semibold w-28">解約書類</th>
                        <th className="px-2.5 py-2 text-left font-semibold w-36">解約完了日<span className="block text-[12px] font-normal text-brand-700">日付を入れると完了</span></th>
                        <th className="px-2.5 py-2 text-left font-semibold">備考</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instRows(activeInst).map((r, i) => { const locked = !freezeOk(r); const lock = locked ? 'pointer-events-none opacity-50' : ''; return (
                        <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${locked ? 'bg-gray-100/60' : i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-2.5 py-1.5 font-medium text-gray-800">{r.branch_name || r.stock_name || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2.5 py-1.5">
                            {locked
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200" title="凍結確認済になると解約手続を編集できます"><Lock className="w-3 h-3" strokeWidth={2} />凍結確認待ち</span>
                              : <select value={r.cancellation_required ?? ''} onChange={e => save(r.id, 'cancellation_required', e.target.value)} className="input-flat w-full px-1 py-1 text-[14px] text-gray-800 outline-none cursor-pointer">
                                  <option value="">—</option>{cancelOptionsOf(r.asset_type).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>}
                          </td>
                          <td className="px-2.5 py-1.5">
                            {r.cancellation_arrival_date
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">受領済</span>
                              : <span className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受領</span>}
                          </td>
                          <td className={`px-2.5 py-1.5 ${lock}`}>
                            <input type="date" defaultValue={r.cancellation_date ?? ''} onBlur={e => { if (e.target.value !== (r.cancellation_date ?? '')) save(r.id, 'cancellation_date', e.target.value || null) }} title="日付を入れると解約完了扱いになります" className="input-flat w-full px-1 py-1 text-[14px] text-gray-800 outline-none" />
                          </td>
                          <td className={`px-2.5 py-1.5 ${lock}`}>
                            <input type="text" defaultValue={r.cancellation_restrictions ?? ''} onBlur={e => { if (e.target.value !== (r.cancellation_restrictions ?? '')) save(r.id, 'cancellation_restrictions', e.target.value || null) }} placeholder="特記事項・備考（例：相続人全員の同意が必要 等）" className="input-flat w-full px-1 py-1 text-[14px] text-gray-800 outline-none" />
                          </td>
                        </tr>
                      ) })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
