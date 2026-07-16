'use client'

import { useState } from 'react'
import { Trash2, Plus, Lock, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useIsManager } from '@/components/providers/AuthProvider'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { ACQUIRERS, acquirerLabel } from '@/lib/acquirer'
import type { FinancialAssetRow, CaseRow, TaskRow, ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'
import { relatedTasksFor, receiptFilesFor } from '@/lib/relatedTasks'
import RelatedTaskChips from './RelatedTaskChips'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'
import ContractReceivedBlock from './ContractReceivedBlock'

const REQ = ['要', '不要', '確認中']
const CANCEL = ['有', '無', '確認中']

type Kind = '預貯金' | '証券' | '信託銀行'
type ColType = 'text' | 'req' | 'cancel'
type Col = { key: keyof FinancialAssetRow; label: string; type: ColType; width?: string }

// 種別ごとの列定義（調査期間・備考・進捗列は共通で末尾に付与）
const COLUMNS: Record<Kind, Col[]> = {
  '預貯金': [
    { key: 'institution_name', label: '金融機関名', type: 'text' },
    { key: 'branch_name', label: '支店', type: 'text', width: 'w-28' },
    { key: 'all_branch_survey', label: '全店調査', type: 'req', width: 'w-24' },
    { key: 'balance_cert_required', label: '残高証明', type: 'req', width: 'w-24' },
    { key: 'accrued_interest_required', label: '経過利息', type: 'req', width: 'w-24' },
    // 解約有無（cancellation_required）。同じ行を解約タブと共有するため、ここで「有」にすると解約手続タブに出る。
    { key: 'cancellation_required', label: '解約', type: 'cancel', width: 'w-24' },
  ],
  '証券': [
    { key: 'institution_name', label: '証券会社', type: 'text' },
    { key: 'branch_name', label: '支店名', type: 'text', width: 'w-28' },
    { key: 'stock_name', label: '銘柄名', type: 'text' },
    { key: 'balance_cert_required', label: '残高証明', type: 'req', width: 'w-24' },
    { key: 'transaction_detail_required', label: '取引明細', type: 'req', width: 'w-24' },
  ],
  '信託銀行': [
    { key: 'institution_name', label: '信託銀行名', type: 'text' },
    { key: 'stock_name', label: '銘柄名', type: 'text' },
    { key: 'share_cert_required', label: '所有株式数証明', type: 'req', width: 'w-28' },
    { key: 'unclaimed_dividend_required', label: '未受領配当金', type: 'req', width: 'w-28' },
  ],
}

type Props = {
  caseId: string
  kind: Kind
  assets: FinancialAssetRow[]
  onRefresh?: () => void
  /** 対応中タブ（進捗管理）で「請求日・到着日」列を表示。オーダーシートでは false */
  progressMode?: boolean
  // 役割分担（取得区分の一括反映用）
  roles?: CaseRow['intake_roles']
  // 受信簿＋タスク（受信トリガーで着手したタスクへの「関連タスク」リンク用）
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  // 契約時にお客様から受領した金融関係書類（区分=財産のうち金融分）。表の先頭に受領済として表示。
  contractDocs?: ContractDocumentRow[]
  /** 金融機関タブで使用：この金融機関の口座だけ表示し、新規行もこの金融機関にする */
  institutionFilter?: string
  /** 口座タブで使用：この口座(id)だけ表示 */
  accountId?: string
  /** 口座タブで使用：表ではなく1行1項目のカードで表示 */
  cardLayout?: boolean
  /** 金融機関タブで使用：残高確定トグル列を表示（管理担当のみ操作可） */
  showConfirmed?: boolean
}

/** 金融機関の表（預金/証券/信託で列が変わる）。インライン編集・行追加。 */
export default function FinancialAssetsTable({ caseId, kind, assets, onRefresh, progressMode = false, receipts = [], contractDocs = [], institutionFilter, accountId, cardLayout = false, showConfirmed = false }: Props) {
  const supabase = createClient()
  const isManager = useIsManager()  // 凍結確認・残高確定のチェックは管理担当のみ
  const memberId = useCurrentMember(null)
  const [rows, setRows] = useState<FinancialAssetRow[]>(() => assets.filter(a => a.asset_type === kind))
  const [busy, setBusy] = useState(false)
  const cols = COLUMNS[kind]
  const visibleRows = accountId != null ? rows.filter(r => r.id === accountId)
    : institutionFilter != null ? rows.filter(r => (r.institution_name ?? '') === institutionFilter) : rows

  // 残高確定のトグル（管理担当のみ）。確定→TOP一覧・財産目録へ反映。
  const toggleBalanceConfirmed = async (row: FinancialAssetRow) => {
    if (!isManager) return
    const next = !row.balance_confirmed
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, balance_confirmed: next } : r))
    const { error } = await supabase.from('financial_assets')
      .update({ balance_confirmed: next, balance_confirmed_by: next ? memberId : null, balance_confirmed_at: next ? new Date().toISOString() : null })
      .eq('id', row.id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  // 凍結確認のトグル（管理担当のみ）。確認済→調査・解約タスクが着手可になる。
  const toggleFreeze = async (row: FinancialAssetRow) => {
    if (!isManager) return
    const next = !row.freeze_confirmed
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, freeze_confirmed: next } : r))
    const { error } = await supabase.from('financial_assets')
      .update({ freeze_confirmed: next, freeze_confirmed_by: next ? memberId : null, freeze_confirmed_at: next ? new Date().toISOString() : null })
      .eq('id', row.id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    onRefresh?.()
  }

  const setLocal = (id: string, field: keyof FinancialAssetRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as FinancialAssetRow : r)))

  const commit = async (id: string, field: keyof FinancialAssetRow, value: string) => {
    const { error } = await supabase.from('financial_assets').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }
  const save = (id: string, field: keyof FinancialAssetRow, value: string) => { setLocal(id, field, value); commit(id, field, value) }

  const addRow = async () => {
    setBusy(true)
    // 取得区分の既定は常に「自社取得」。役割分担には引っ張られない。
    const { data, error } = await supabase.from('financial_assets').insert({ case_id: caseId, asset_type: kind, institution_name: institutionFilter ?? '', acquirer: '自社' }).select('*').single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as FinancialAssetRow])
    onRefresh?.()
  }

  const delRow = async (row: FinancialAssetRow) => {
    if (!confirm(`「${row.institution_name || '未入力'}」を削除しますか？`)) return
    const { error } = await supabase.from('financial_assets').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  // 凍結確認(progressMode時のみ) +列 +残高 +確定済(showConfirmed) +取得区分 +調査期間 +備考 +備考結果(progressMode) (+請求/到着予定/到着/受信/関連タスク) +削除
  const colCount = (progressMode ? 1 : 0) + cols.length + 1 + (showConfirmed ? 1 : 0) + 6 + (progressMode ? 4 : 0) + (progressMode ? 1 : 0) + 1

  // 口座1件＝1カード（口座タブ／スマホ表示で共用）。請求日・到着日・備考結果は progressMode のみ。
  const renderCard = (r: FinancialAssetRow) => (
    <div key={r.id} className="rounded-xl border border-gray-200 bg-white">
      {progressMode && (
        <CardRow label="凍結確認（管理担当）">
          {r.freeze_confirmed
            ? <button type="button" onClick={() => toggleFreeze(r)} disabled={!isManager} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 disabled:cursor-default"><Check className="w-3 h-3" />確認済</button>
            : isManager ? <button type="button" onClick={() => toggleFreeze(r)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-500 bg-white border border-gray-300"><Lock className="w-3 h-3" />未確認</button>
            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200">調査不可</span>}
        </CardRow>
      )}
      {cols.map(c => (
        <CardRow key={c.key} label={c.label}>
          {c.type === 'text'
            ? <TextInput value={(r[c.key] as string) ?? null} onChange={v => setLocal(r.id, c.key, v)} onCommit={v => commit(r.id, c.key, v)} />
            : <SmallSelect value={(r[c.key] as string) ?? ''} options={c.type === 'cancel' ? CANCEL : REQ} onChange={v => save(r.id, c.key, v)} />}
        </CardRow>
      ))}
      <CardRow label="残高/評価額"><MoneyInput value={r.balance_amount} onCommit={v => commit(r.id, 'balance_amount', v)} /></CardRow>
      {showConfirmed && (
        <CardRow label="確定済（管理担当）">
          {r.balance_confirmed
            ? <button type="button" onClick={() => toggleBalanceConfirmed(r)} disabled={!isManager} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 disabled:cursor-default"><Check className="w-3 h-3" />確定済</button>
            : isManager ? <button type="button" onClick={() => toggleBalanceConfirmed(r)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-500 bg-white border border-gray-300"><Lock className="w-3 h-3" />未確定</button>
            : <span className="text-[11px] text-gray-400">未確定</span>}
        </CardRow>
      )}
      <CardRow label="取得区分">
        <select value={r.acquirer ?? '自社'} onChange={e => save(r.id, 'acquirer', e.target.value)} className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
          {ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}
        </select>
      </CardRow>
      <CardRow label="調査禁止期間 開始"><input type="date" defaultValue={r.survey_prohibited_start ?? ''} onBlur={e => { if (e.target.value !== (r.survey_prohibited_start ?? '')) commit(r.id, 'survey_prohibited_start', e.target.value) }} className="w-full px-2 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></CardRow>
      <CardRow label="調査禁止期間 終了"><input type="date" defaultValue={r.survey_prohibited_end ?? ''} onBlur={e => { if (e.target.value !== (r.survey_prohibited_end ?? '')) commit(r.id, 'survey_prohibited_end', e.target.value) }} className="w-full px-2 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></CardRow>
      <CardRow label="調査禁止理由"><TextInput value={r.survey_prohibited_reason} onChange={v => setLocal(r.id, 'survey_prohibited_reason', v)} onCommit={v => commit(r.id, 'survey_prohibited_reason', v)} placeholder="禁止理由" /></CardRow>
      {progressMode && <CardRow label="請求日"><input type="date" defaultValue={r.request_date ?? ''} onBlur={e => { if (e.target.value !== (r.request_date ?? '')) commit(r.id, 'request_date', e.target.value) }} className="w-full px-2 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></CardRow>}
      {progressMode && (
        <CardRow label="到着日（受信簿）">
          {r.arrival_date
            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200"><Check className="w-3 h-3" />受信済 {r.arrival_date}</span>
            : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200">未受信</span>}
        </CardRow>
      )}
      <CardRow label="備考"><TextInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="特記事項" /></CardRow>
      {progressMode && <CardRow label="備考・結果"><TextInput value={r.survey_result} onChange={v => setLocal(r.id, 'survey_result', v)} onCommit={v => commit(r.id, 'survey_result', v)} placeholder="この口座で分かったこと" /></CardRow>}
      <div className="flex justify-end px-3 py-2">
        <button type="button" onClick={() => delRow(r)} className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" />この口座を削除</button>
      </div>
    </div>
  )

  // 口座カード（口座タブ用・1口座）。
  if (cardLayout) {
    const r = visibleRows[0]
    if (!r) return <div className="rounded-md border border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-[12px] text-gray-400">口座がありません。</div>
    return renderCard(r)
  }

  return (
    <div>
      {/* 契約時にお客様から受領済の書類（依頼者取得分）は別ブロックで上に表示。新規請求の表とは分ける。 */}
      <ContractReceivedBlock docs={contractDocs} caseId={caseId} onRefresh={onRefresh} />
      {/* 表示：PC(sm以上)は表・スマホはカード。案件詳細/オーダーシート共通（表に統一・横スクロール）。 */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="text-[13px] border-collapse" style={{ minWidth: progressMode ? 2560 : 1300, width: 'max-content' }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              {progressMode && <th className="px-2 py-2 text-center font-semibold w-24">凍結確認済<span className="block text-[10px] font-normal text-gray-400">管理担当のみ</span></th>}
              {cols.map(c => <th key={c.key} className={`px-2 py-2 text-left font-semibold ${c.width ?? ''}`}>{c.label}</th>)}
              <th className="px-2 py-2 text-right font-semibold w-32">残高/評価額</th>
              {showConfirmed && <th className="px-2 py-2 text-center font-semibold w-24">確定済<span className="block text-[10px] font-normal text-gray-400">管理担当のみ</span></th>}
              <th className="px-2 py-2 text-left font-semibold w-28">取得区分</th>
              <th className="px-2 py-2 text-left font-semibold w-52">調査期間</th>
              <th className="px-2 py-2 text-left font-semibold w-28">調査禁止 開始</th>
              <th className="px-2 py-2 text-left font-semibold w-28">調査禁止 終了</th>
              <th className="px-2 py-2 text-left font-semibold w-40">禁止理由</th>
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-28">請求日</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-28">到着日</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-20">受信</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-36">関連タスク</th>}
              <th className="px-2 py-2 text-left font-semibold">備考</th>
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-56">備考・結果</th>}
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-[13px] text-gray-400">登録されていません</td></tr>
            ) : (
              visibleRows.map(r => (
                <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${progressMode && !r.freeze_confirmed ? 'bg-amber-50/30' : ''}`}>
                  {/* 凍結確認済（一番左・管理担当のみチェック可。オーダーシートでは非表示） */}
                  {progressMode && (
                  <td className="px-2 py-1.5 text-center">
                    {r.freeze_confirmed ? (
                      <button type="button" onClick={() => toggleFreeze(r)} disabled={!isManager} title={isManager ? '凍結確認を取消' : '凍結確認は管理担当のみ'} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 disabled:cursor-default hover:bg-emerald-100 disabled:hover:bg-emerald-50">
                        <Check className="w-3 h-3" strokeWidth={2.5} />確認済
                      </button>
                    ) : isManager ? (
                      <button type="button" onClick={() => toggleFreeze(r)} title="口座凍結を確認したらチェック（調査・解約タスクが着手可になる）" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-500 bg-white border border-gray-300 hover:border-emerald-400 hover:text-emerald-700">
                        <Lock className="w-3 h-3" strokeWidth={2} />未確認
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200" title="凍結未確認のため調査不可">調査不可</span>
                    )}
                  </td>
                  )}
                  {cols.map(c => (
                    <td key={c.key} className="px-2 py-1.5">
                      {c.type === 'text' ? (
                        <TextInput value={(r[c.key] as string) ?? null} onChange={v => setLocal(r.id, c.key, v)} onCommit={v => commit(r.id, c.key, v)} />
                      ) : (
                        <SmallSelect value={(r[c.key] as string) ?? ''} options={c.type === 'cancel' ? CANCEL : REQ} onChange={v => save(r.id, c.key, v)} />
                      )}
                    </td>
                  ))}
                  {/* 残高/評価額（目録・精算書の収入の源泉） */}
                  <td className="px-2 py-1.5">
                    <MoneyInput value={r.balance_amount} onCommit={v => commit(r.id, 'balance_amount', v)} />
                  </td>
                  {showConfirmed && (
                    <td className="px-2 py-1.5 text-center">
                      {r.balance_confirmed ? (
                        <button type="button" onClick={() => toggleBalanceConfirmed(r)} disabled={!isManager} title={isManager ? '確定を取消' : '確定は管理担当のみ'} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 disabled:cursor-default hover:bg-emerald-100 disabled:hover:bg-emerald-50">
                          <Check className="w-3 h-3" strokeWidth={2.5} />確定済
                        </button>
                      ) : isManager ? (
                        <button type="button" onClick={() => toggleBalanceConfirmed(r)} title="残高を確定したらチェック（TOP一覧・財産目録へ反映）" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-500 bg-white border border-gray-300 hover:border-emerald-400 hover:text-emerald-700">
                          <Lock className="w-3 h-3" strokeWidth={2} />未確定
                        </button>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200">未確定</span>
                      )}
                    </td>
                  )}
                  {/* 取得区分 */}
                  <td className="px-2 py-1.5">
                    <select value={r.acquirer ?? '自社'} onChange={e => save(r.id, 'acquirer', e.target.value)} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      {ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}
                    </select>
                  </td>
                  {/* 調査期間（任意指定の文字が潰れないよう固定幅＋折返し可） */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1 flex-wrap">
                      <SmallSelect value={r.survey_period_type ?? ''} options={['相続開始日', '任意指定']} onChange={v => save(r.id, 'survey_period_type', v)} placeholder="—" className="w-[88px] flex-none" />
                      {r.survey_period_type === '任意指定' && (
                        <input type="date" value={r.survey_date ?? ''} onChange={e => setLocal(r.id, 'survey_date', e.target.value)} onBlur={e => commit(r.id, 'survey_date', e.target.value)} className="w-[130px] flex-none px-1 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" />
                      )}
                    </div>
                  </td>
                  {/* 財産調査 禁止期間・理由（口座単位） */}
                  <td className="px-2 py-1.5"><input type="date" value={r.survey_prohibited_start ?? ''} onChange={e => setLocal(r.id, 'survey_prohibited_start', e.target.value)} onBlur={e => commit(r.id, 'survey_prohibited_start', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" /></td>
                  <td className="px-2 py-1.5"><input type="date" value={r.survey_prohibited_end ?? ''} onChange={e => setLocal(r.id, 'survey_prohibited_end', e.target.value)} onBlur={e => commit(r.id, 'survey_prohibited_end', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" /></td>
                  <td className="px-2 py-1.5"><TextInput value={r.survey_prohibited_reason} onChange={v => setLocal(r.id, 'survey_prohibited_reason', v)} onCommit={v => commit(r.id, 'survey_prohibited_reason', v)} placeholder="禁止理由" /></td>
                  {progressMode && (
                    <td className="px-2 py-1.5"><input type="date" value={r.request_date ?? ''} onChange={e => setLocal(r.id, 'request_date', e.target.value)} onBlur={e => commit(r.id, 'request_date', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" /></td>
                  )}
                  {progressMode && (
                    <td className="px-2 py-1.5"><input type="date" value={r.arrival_date ?? ''} onChange={e => setLocal(r.id, 'arrival_date', e.target.value)} onBlur={e => commit(r.id, 'arrival_date', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" /></td>
                  )}
                  {progressMode && (
                    <td className="px-2 py-1.5">
                      {r.arrival_date
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">受信済</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受信</span>}
                    </td>
                  )}
                  {progressMode && (
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col gap-1 items-start">
                        <RelatedTaskChips tasks={relatedTasksFor(receipts, 'financial_asset', r.id)} />
                        {receiptFilesFor(receipts, 'financial_asset', r.id).map((f, i) => (
                          <OpenStorageFile key={i} bucket={f.bucket} path={f.path} name={f.name} label="受領ファイル" />
                        ))}
                      </div>
                    </td>
                  )}
                  <td className="px-2 py-1.5"><TextInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="特記事項" /></td>
                  {progressMode && <td className="px-2 py-1.5"><TextInput value={r.survey_result} onChange={v => setLocal(r.id, 'survey_result', v)} onCommit={v => commit(r.id, 'survey_result', v)} placeholder="この口座で分かったこと" /></td>}
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r)} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* カード表示（1口座＝1カード）。スマホのみ（PCは上の表）。 */}
      <div className="sm:hidden space-y-2.5">
        {visibleRows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-gray-400">登録されていません</div>
        ) : (
          visibleRows.map(renderCard)
        )}
      </div>

      <div className="mt-2">
        <button type="button" onClick={addRow} disabled={busy} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> 追加
        </button>
      </div>
    </div>
  )
}

function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  // 上にラベル・下に入力欄（他セクションのカードとテイストを統一）
  return (
    <div className="px-3 py-2 border-b border-gray-100 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-600 mb-1">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function TextInput({ value, onChange, onCommit, placeholder }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      placeholder={placeholder}
      className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
    />
  )
}

export function MoneyInput({ value, onCommit, placeholder }: { value: number | null | undefined; onCommit: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value != null ? String(value) : '')
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={e => setText(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={() => onCommit(text)}
      placeholder={placeholder ?? '0'}
      className="w-full px-1.5 py-1.5 text-[12px] text-right bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition tabular-nums"
    />
  )
}

function SmallSelect({ value, options, onChange, placeholder, className }: { value: string; options: readonly string[]; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`${className ?? 'w-full'} px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500`}>
      <option value="">{placeholder ?? '—'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
