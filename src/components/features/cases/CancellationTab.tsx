'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { Section } from '@/components/ui/InlineFields'
import { relatedTasksFor } from '@/lib/relatedTasks'
import RelatedTaskChips from './RelatedTaskChips'
import TabHeader from './TabHeader'
import { WorkContentField } from './WorkContentField'
import CancellationSection from './CancellationSection'
import type { FinancialAssetRow, CaseRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

const CANCEL = ['有', '無', '確認中']

const SUBTABS: { key: string; kind: string; label: string }[] = [
  { key: 'deposit', kind: '預貯金', label: '預金' },
  { key: 'securities', kind: '証券', label: '証券' },
  { key: 'trust', kind: '信託銀行', label: '信託' },
]

type Props = {
  caseId?: string
  caseData?: CaseRow
  financialAssets: FinancialAssetRow[]
  onRefresh?: () => void
  // 受信簿（解約書類の受領→着手タスクへの「関連タスク」リンク用）
  receipts?: TimelineReceipt[]
  /** オーダーシート埋め込み時は TabHeader を出さない */
  orderSheetMode?: boolean
}

/**
 * 解約手続タブ
 * 財産調査で登録した金融機関を 預金/証券/信託 の子タブで表示し、機関ごとに
 * 「いつ解約するか（解約予定日）・終わったか（解約完了）」の進捗を管理する。
 * 解約書類の請求・到着は財産調査／受信簿の領分のため持たず、受領状況は read-only バッジで参照する。
 */
export default function CancellationTab({ caseId, caseData, financialAssets, onRefresh, receipts = [], orderSheetMode = false }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<FinancialAssetRow[]>(financialAssets)
  // 財産調査で金融機関が追加/削除されたら（router.refresh で props 更新）一覧へ反映。
  // オーダーシート等で常時マウントされる場合に初期 props のまま固まるのを防ぐ。
  useEffect(() => { setRows(financialAssets) }, [financialAssets])

  const save = async (id: string, field: keyof FinancialAssetRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as FinancialAssetRow : r)))
    const { error } = await supabase.from('financial_assets').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  // 1種別（預貯金／証券／信託）ぶんの解約テーブル。オーダーシートでは全種別を縦積み表示。
  const renderKindBlock = (st: typeof SUBTABS[number]) => {
    const klist = rows.filter(r => r.asset_type === st.kind)
    return (
      <Section key={st.key} title={`${st.label}の解約手続`}>
        {klist.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-gray-400">
            財産調査タブで{st.label}を登録すると、ここで解約手続を管理できます。
          </div>
        ) : (
          <>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-[13px] border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                  <th className="px-2.5 py-2 text-left font-semibold">{st.kind === '預貯金' ? '金融機関名' : st.kind === '証券' ? '証券会社' : '信託銀行名'}</th>
                  <th className="px-2.5 py-2 text-left font-semibold w-24">解約有無</th>
                  <th className="px-2.5 py-2 text-left font-semibold w-32">解約予定日</th>
                  <th className="px-2.5 py-2 text-left font-semibold w-36">関連タスク</th>
                  <th className="px-2.5 py-2 text-left font-semibold">禁止事項</th>
                </tr>
              </thead>
              <tbody>
                {klist.map((r, i) => (
                  <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-2.5 py-2 font-semibold text-gray-800">{r.institution_name || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2.5 py-1.5">
                      <select value={r.cancellation_required ?? ''} onChange={e => save(r.id, 'cancellation_required', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                        <option value="">—</option>
                        {CANCEL.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <DateCell value={r.cancellation_date} onSave={v => save(r.id, 'cancellation_date', v || null)} />
                    <td className="px-2.5 py-1.5"><RelatedTaskChips tasks={relatedTasksFor(receipts, 'financial_asset', r.id, 'cancellation_arrival_date')} /></td>
                    <TextCell value={r.cancellation_restrictions} onSave={v => save(r.id, 'cancellation_restrictions', v)} placeholder="例：相続人全員の同意が必要 等" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* スマホ: カード表示（1口座＝1カード） */}
          <div className="sm:hidden space-y-2.5">
            {klist.map(r => (
              <div key={r.id} className="border border-gray-200 rounded-xl p-3">
                <div className="text-[14px] font-semibold text-gray-900 mb-2.5">{r.institution_name || '未入力'}</div>
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div><div className="text-[11px] text-gray-500 mb-1">解約有無</div><select value={r.cancellation_required ?? ''} onChange={e => save(r.id, 'cancellation_required', e.target.value)} className="w-full h-10 px-2 text-[13px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-500"><option value="">—</option>{CANCEL.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                    <div><div className="text-[11px] text-gray-500 mb-1">解約予定日</div><input type="date" defaultValue={r.cancellation_date ?? ''} onBlur={e => { if (e.target.value !== (r.cancellation_date ?? '')) save(r.id, 'cancellation_date', e.target.value || null) }} className="w-full h-10 px-2.5 text-[13px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-brand-500 focus:bg-white" /></div>
                  </div>
                  <div><div className="text-[11px] text-gray-500 mb-1">禁止事項</div><input type="text" defaultValue={r.cancellation_restrictions ?? ''} onBlur={e => { if (e.target.value !== (r.cancellation_restrictions ?? '')) save(r.id, 'cancellation_restrictions', e.target.value) }} placeholder="例：相続人全員の同意が必要 等" className="w-full h-10 px-2.5 text-[13px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-brand-500 focus:bg-white" /></div>
                  <div><div className="text-[11px] text-gray-500 mb-1">関連タスク</div><RelatedTaskChips tasks={relatedTasksFor(receipts, 'financial_asset', r.id, 'cancellation_arrival_date')} /></div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </Section>
    )
  }

  return (
    <div>
      {!orderSheetMode && <TabHeader title="解約手続" description="預貯金・証券・信託の解約手続き、入金確認・名義書換の管理" />}
      {!orderSheetMode && caseData && (
        <div className="mb-3.5 rounded-lg border border-gray-200 bg-white px-3.5 py-3">
          <WorkContentField caseData={caseData} gyomu="cancellation" patchCase={async p => { await supabase.from('cases').update(p).eq('id', caseData.id); onRefresh?.() }} label="作業内容（フリー・オーダーシートと共有）" />
        </div>
      )}

      {!orderSheetMode && caseId ? (
        // 案件詳細（実務）：金融機関単位の左レール＋カード
        <CancellationSection caseId={caseId} financialAssets={financialAssets} onRefresh={onRefresh} receipts={receipts} />
      ) : (
        // オーダーシート：預貯金／証券／信託の解約をサブタブ廃止で全展開
        <div className="space-y-4">
          {SUBTABS.map(renderKindBlock)}
        </div>
      )}
    </div>
  )
}

function DateCell({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  return (
    <td className="px-2.5 py-1.5">
      <input type="date" defaultValue={value ?? ''} onBlur={e => { if (e.target.value !== (value ?? '')) onSave(e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
    </td>
  )
}

function TextCell({ value, onSave, placeholder }: { value: string | null; onSave: (v: string) => void; placeholder?: string }) {
  return (
    <td className="px-2.5 py-1.5">
      <input type="text" defaultValue={value ?? ''} onBlur={e => { if (e.target.value !== (value ?? '')) onSave(e.target.value) }} placeholder={placeholder} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
    </td>
  )
}
