'use client'

// 金融資産（実務タブ）：預金/証券/信託。左タブ＝金融機関ごと、中身＝その機関の口座を表で表示（横スクロールで全項目）。
// TOP（一覧）＝この種別の全口座を集計（残高・受信状況）。入力した残高はそのまま財産目録に載る。

import { useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { LeftRail } from './LeftRail'
import { SectionHeading } from '@/components/ui/InlineFields'
import ProgressSummary from './ProgressSummary'
import FinancialAssetsTable from './FinancialAssetsTable'
import SecuritiesHoldingsTable from './SecuritiesHoldingsTable'
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

        {/* TOP（一覧）：この種別の全口座を集計（読み取り専用） */}
        {sub === 'top' && (
          <div>
            <SectionHeading title="口座一覧（各金融機関の集計）" hint="残高の入力は各金融機関タブで行います。ここに出ている口座はそのまま財産目録に載ります。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse" style={{ minWidth: 680 }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600 tracking-[0.04em]">
                    <th className="px-2.5 py-2 text-left font-semibold">金融機関</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-40">支店/銘柄</th>
                    <th className="px-2.5 py-2 text-left font-semibold">進捗/メモ</th>
                    <th className="px-2.5 py-2 text-right font-semibold w-36">{balanceLabel}</th>
                    <th className="px-2.5 py-2 text-center font-semibold w-20">受信済</th>
                  </tr>
                </thead>
                <tbody>
                  {kindAssets.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-gray-400">登録されていません</td></tr>
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
                    </tr>
                  ))}
                </tbody>
                {kindAssets.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-gray-700">
                      <td className="px-2.5 py-2 text-right" colSpan={3}>{balanceLabel} 合計<span className="ml-1 font-normal text-[11px] text-gray-400">{kindAssets.length}件</span></td>
                      <td className="px-2.5 py-2 text-right">{yen(kindAssets.reduce((s, a) => s + (a.balance_amount ?? 0), 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
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
              <ProgressSummary caseId={caseId} scopeKey={`${scopePrefix}_inst_${instKey || 'unset'}`} title={`進捗/結果（${t.label}）`} />
              <div className="bg-white border border-gray-200 rounded-lg p-3.5">
                <SectionHeading title="口座一覧（残高の入力）" hint="各項目は横スクロールで見られます。表の上で直接編集できます。入力した残高はそのまま財産目録に載ります。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
                <FinancialAssetsTable caseId={caseId} kind={kind} assets={assets} onRefresh={onRefresh} progressMode roles={roles} receipts={receipts} tasks={tasks} contractDocs={contractDocs} institutionFilter={instKey} />
              </div>
              {/* 有価証券は1つの証券会社に複数銘柄がぶら下がる。財産目録の「合計評価額」＝明細の合計、
                  「備考」＝株数×1株評価額（基準日）なので、銘柄の明細をここで持つ。 */}
              {(kind === '証券' || kind === '信託銀行') && (
                <div className="bg-white border border-gray-200 rounded-lg p-3.5">
                  <SectionHeading title="銘柄明細（財産目録の評価額の内訳）" hint="株数と1株あたりの評価額を入れると評価額を自動計算します。合計は「口座の評価額に反映」で口座側の残高に書き戻せます。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
                  <SecuritiesHoldingsTable
                    caseId={caseId}
                    assets={assets.filter(a => a.asset_type === kind && (a.institution_name ?? '').trim() === instKey.trim())}
                    onRefresh={onRefresh}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
