'use client'

// 金融資産（実務タブ）：預金/証券/信託。左タブ＝金融機関ごと、中身＝その機関の口座を表で表示（横スクロールで全項目）。
// TOP（一覧）＝この種別の全口座を集計（残高・確定済バッジ）。財産目録へ反映は確定済のみ。

import { useState } from 'react'
import { Plus, Check, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { LeftRail } from './LeftRail'
import { SectionHeading } from '@/components/ui/InlineFields'
import ProgressSummary from './ProgressSummary'
import FinancialAssetsTable from './FinancialAssetsTable'
import RowTaskChip from '@/components/features/tasks/RowTaskChip'
import type { FinancialAssetRow, TaskRow, ContractDocumentRow, CaseRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Kind = '預貯金' | '証券' | '信託銀行'

type Props = {
  caseId: string
  kind: Kind
  scopePrefix: string
  assets: FinancialAssetRow[]
  onRefresh?: () => void
  roles?: CaseRow['intake_roles']
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  contractDocs?: ContractDocumentRow[]
  focus?: string | null   // タスク詳細からの着地：金融機関名。該当機関タブを初期選択（この種別に該当する場合のみ）。
}

const yen = (n: number | null) => (n == null ? '—' : `¥${n.toLocaleString('ja-JP')}`)
const collator = new Intl.Collator('ja')

export default function FinancialSection({ caseId, kind, scopePrefix, assets, onRefresh, roles = [], receipts = [], tasks = [], contractDocs = [], focus }: Props) {
  const supabase = createClient()
  const [sub, setSub] = useState<string>(() => (focus && assets.some(a => a.asset_type === kind && (a.institution_name ?? '').trim() === focus)) ? focus : 'top')

  const kindAssets = assets.filter(a => a.asset_type === kind)
  // 金額列のラベル：証券は「評価額」、預貯金・信託は「残高」。
  const balanceLabel = kind === '証券' ? '評価額' : '残高'
  // 金融機関ごとにグループ（空は「未設定」に集約）
  const institutions = [...new Set(kindAssets.map(a => (a.institution_name ?? '').trim()).filter(Boolean))].sort(collator.compare)
  const hasUnset = kindAssets.some(a => !(a.institution_name ?? '').trim())

  const railItems = [
    { key: 'top', label: '一覧（TOP）' },
    ...institutions.map(inst => ({ key: inst, label: inst, received: kindAssets.some(a => (a.institution_name ?? '').trim() === inst && !!a.arrival_date) })),
    ...(hasUnset ? [{ key: '__unset__', label: '金融機関 未設定' }] : []),
  ]

  // 「＋金融機関」：名称を受け取り、その機関の空口座を1件作成 → タブが増える
  const addInstitution = async () => {
    const name = window.prompt('追加する金融機関名（例: みずほ銀行）')?.trim()
    if (!name) return
    const { error } = await supabase.from('financial_assets').insert({ case_id: caseId, asset_type: kind, institution_name: name, acquirer: '自社' })
    if (error) { showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    setSub(name)
    onRefresh?.()
  }

  // グループ一括削除：その金融機関の口座（この種別）をまとめて削除
  const deleteInstitution = async (key: string) => {
    const instKey = key === '__unset__' ? '' : key
    const targets = kindAssets.filter(a => (a.institution_name ?? '').trim() === instKey)
    const label = key === '__unset__' ? '金融機関 未設定' : key
    if (targets.length === 0) return
    if (!window.confirm(`「${label}」の口座${targets.length}件をすべて削除します。よろしいですか？（オーダーシート・解約タブからも消えます）`)) return
    const { error } = await supabase.from('financial_assets').delete().in('id', targets.map(a => a.id))
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    if (sub === key) setSub('top')
    showToast(`「${label}」を削除しました`, 'success')
    onRefresh?.()
  }

  return (
    <div className="flex gap-3 items-start">
      <LeftRail items={railItems} active={sub} onChange={setSub} onDelete={deleteInstitution} extra={
        <button type="button" onClick={addInstitution} className="mt-1 text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-brand-700 hover:border-brand-300 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> 金融機関
        </button>
      } />
      <div className="flex-1 min-w-0 space-y-3.5">

        {/* TOP（一覧）：この種別の全口座を確定済バッジ付きで集計（読み取り専用） */}
        {sub === 'top' && (
          <div>
            <SectionHeading title="口座一覧（各金融機関の集計）" hint="財産目録へ反映されるのは「確定済」の口座のみです。残高の入力・確定は各金融機関タブで行います。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse" style={{ minWidth: 680 }}>
                <thead>
                  <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                    <th className="px-2.5 py-2 text-left font-semibold">金融機関</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-40">支店/銘柄</th>
                    <th className="px-2.5 py-2 text-left font-semibold">進捗/メモ</th>
                    <th className="px-2.5 py-2 text-right font-semibold w-36">{balanceLabel}</th>
                    <th className="px-2.5 py-2 text-center font-semibold w-20">受信済</th>
                    <th className="px-2.5 py-2 text-center font-semibold w-24">確定済</th>
                  </tr>
                </thead>
                <tbody>
                  {kindAssets.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-[13px] text-gray-400">登録されていません</td></tr>
                  ) : kindAssets.map((a, i) => (
                    <tr key={a.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-2.5 py-2 font-medium text-gray-800">{(a.institution_name ?? '').trim() || <span className="text-gray-300">未設定</span>}</td>
                      <td className="px-2.5 py-2 text-gray-700">{a.branch_name || a.stock_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-2.5 py-2 text-gray-500 text-[11px] max-w-[220px] truncate" title={a.survey_result ?? ''}>{a.survey_result || <span className="text-gray-300">—</span>}</td>
                      <td className="px-2.5 py-2 text-right">{yen(a.balance_amount)}</td>
                      <td className="px-2.5 py-2 text-center">
                        {a.arrival_date
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200"><Check className="w-3 h-3" strokeWidth={2.5} />受信済</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200">未受信</span>}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        {a.balance_confirmed
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200"><Check className="w-3 h-3" strokeWidth={2.5} />確定済</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200"><Lock className="w-3 h-3" />未確定</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {kindAssets.length > 0 && (() => {
                  const conf = kindAssets.filter(a => a.balance_confirmed)
                  const confSum = conf.reduce((s, a) => s + (a.balance_amount ?? 0), 0)
                  const unconfSum = kindAssets.filter(a => !a.balance_confirmed).reduce((s, a) => s + (a.balance_amount ?? 0), 0)
                  return (
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold text-gray-700">
                        <td className="px-2.5 py-2 text-right" colSpan={3}>{balanceLabel} 合計（確定済）{unconfSum > 0 && <span className="ml-1 font-normal text-[11px] text-gray-400">／未確定 {yen(unconfSum)}</span>}</td>
                        <td className="px-2.5 py-2 text-right text-emerald-700">{yen(confSum)}</td>
                        <td className="px-2.5 py-2 text-center text-[11px] text-gray-500" colSpan={2}>確定 {conf.length}/{kindAssets.length}件</td>
                      </tr>
                    </tfoot>
                  )
                })()}
              </table>
            </div>
          </div>
        )}

        {/* 金融機関タブ：その機関の口座を表で表示（横スクロールで全項目） */}
        {railItems.filter(t => t.key !== 'top').map(t => {
          if (sub !== t.key) return null
          const instKey = t.key === '__unset__' ? '' : t.key
          return (
            <div key={t.key} className="space-y-3.5">
              {(() => {
                const instTasks = tasks.filter(x => x.source_rid === `fin:${instKey}` || x.source_rid === `fin-read:${instKey}`)
                if (instTasks.length === 0) return null
                return (
                  <div className="flex items-center gap-2 flex-wrap bg-brand-50/60 border border-brand-100 rounded-lg px-3 py-2">
                    <span className="text-[11.5px] font-semibold text-brand-700">関連タスク（{t.label}）</span>
                    {instTasks.map(x => <RowTaskChip key={x.id} task={x} onRefresh={onRefresh} />)}
                  </div>
                )
              })()}
              <ProgressSummary caseId={caseId} scopeKey={`${scopePrefix}_inst_${instKey || 'unset'}`} title={`進捗/結果（${t.label}）`} />
              <div className="bg-white border border-gray-200 rounded-lg p-3.5">
                <SectionHeading title="口座一覧（残高の入力・確定）" hint="各項目は横スクロールで表示し、その場で直接編集できます。財産目録へ反映されるのは確定済の口座のみです。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
                <FinancialAssetsTable caseId={caseId} kind={kind} assets={assets} onRefresh={onRefresh} progressMode roles={roles} receipts={receipts} tasks={tasks} contractDocs={contractDocs} institutionFilter={instKey} showConfirmed />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
