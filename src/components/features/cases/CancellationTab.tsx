'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { SubTabs } from '@/components/ui/SubTabs'
import { Section } from '@/components/ui/InlineFields'
import { relatedTasksFor } from '@/lib/relatedTasks'
import RelatedTaskChips from './RelatedTaskChips'
import TabHeader from './TabHeader'
import type { FinancialAssetRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

const CANCEL = ['有', '無', '確認中']

const SUBTABS: { key: string; kind: string; label: string }[] = [
  { key: 'deposit', kind: '預貯金', label: '預金' },
  { key: 'securities', kind: '証券', label: '証券' },
  { key: 'trust', kind: '信託銀行', label: '信託' },
]

type Props = {
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
export default function CancellationTab({ financialAssets, onRefresh, receipts = [], orderSheetMode = false }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<FinancialAssetRow[]>(financialAssets)
  // 財産調査で金融機関が追加/削除されたら（router.refresh で props 更新）一覧へ反映。
  // オーダーシート等で常時マウントされる場合に初期 props のまま固まるのを防ぐ。
  useEffect(() => { setRows(financialAssets) }, [financialAssets])
  const [sub, setSub] = useState('deposit')
  const kind = SUBTABS.find(t => t.key === sub)?.kind ?? '預貯金'
  const list = rows.filter(r => r.asset_type === kind)

  const save = async (id: string, field: keyof FinancialAssetRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as FinancialAssetRow : r)))
    const { error } = await supabase.from('financial_assets').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  return (
    <div>
      {!orderSheetMode && <TabHeader title="解約手続" description="預貯金・証券・信託の解約手続き、入金確認・名義書換の管理" />}
      <SubTabs tabs={SUBTABS} active={sub} onChange={setSub} className="mb-3" />

      {list.length === 0 ? (
        <Section title={`${SUBTABS.find(t => t.key === sub)?.label ?? ''}の解約手続`}>
          <div className="px-4 py-6 text-center text-[13px] text-gray-400">
            財産調査タブで{SUBTABS.find(t => t.key === sub)?.label}を登録すると、ここで解約手続を管理できます。
          </div>
        </Section>
      ) : (
        <Section title={`${SUBTABS.find(t => t.key === sub)?.label ?? ''}の解約手続`}>
          <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse" style={{ minWidth: 980 }}>
            <thead>
              <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <th className="px-2.5 py-2 text-left font-semibold">{kind === '預貯金' ? '金融機関名' : kind === '証券' ? '証券会社' : '信託銀行名'}</th>
                <th className="px-2.5 py-2 text-left font-semibold w-24">解約有無</th>
                <th className="px-2.5 py-2 text-left font-semibold w-32">解約予定日</th>
                <th className="px-2.5 py-2 text-left font-semibold w-36">解約書類</th>
                <th className="px-2.5 py-2 text-center font-semibold w-20">解約完了</th>
                <th className="px-2.5 py-2 text-left font-semibold w-36">関連タスク</th>
                <th className="px-2.5 py-2 text-left font-semibold">禁止事項</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-2.5 py-2 font-semibold text-gray-800">{r.institution_name || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2.5 py-1.5">
                    <select value={r.cancellation_required ?? ''} onChange={e => save(r.id, 'cancellation_required', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {CANCEL.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <DateCell value={r.cancellation_date} onSave={v => save(r.id, 'cancellation_date', v || null)} />
                  {/* 解約書類の受領状況（read-only。請求・到着は財産調査／受信簿で管理） */}
                  <td className="px-2.5 py-1.5">
                    {r.cancellation_arrival_date ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title="解約書類の受領（財産調査・受信簿で管理）">受領済 {r.cancellation_arrival_date}</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-50 text-gray-400 border border-gray-200" title="解約書類は財産調査・受信簿で受領管理します">未受領</span>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-center">
                    <input type="checkbox" checked={!!r.cancellation_done} onChange={e => save(r.id, 'cancellation_done', e.target.checked)} className="w-4 h-4 accent-brand-600 cursor-pointer" />
                  </td>
                  {/* 解約書類(cancellation_arrival_date)の受領→着手した解約タスク */}
                  <td className="px-2.5 py-1.5"><RelatedTaskChips tasks={relatedTasksFor(receipts, 'financial_asset', r.id, 'cancellation_arrival_date')} /></td>
                  <TextCell value={r.cancellation_restrictions} onSave={v => save(r.id, 'cancellation_restrictions', v)} placeholder="例：相続人全員の同意が必要 等" />
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Section>
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
