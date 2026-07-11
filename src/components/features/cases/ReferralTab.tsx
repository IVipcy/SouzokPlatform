'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow, CaseReferralRow } from '@/types'
import {
  Section, FieldGrid, InlineSelect, InlineDate, InlineCurrency, InlineTextarea,
} from '@/components/ui/InlineFields'
import { REFERRAL_PARTNER_TYPES, REFERRAL_BILLING_STATUSES, REAL_ESTATE_REGISTRATION_OPTIONS, TAX_ADVISOR_BUSINESS_OPTIONS, TAX_FILING_OPTIONS } from '@/lib/constants'
import TabHeader from './TabHeader'
import { WorkContentField } from './WorkContentField'
import ProgressSummary from './ProgressSummary'

type Props = {
  caseData: CaseRow
  referrals: CaseReferralRow[]
  onRefresh?: () => void
  // オーダーシート埋め込み時は報酬請求状態を出さない（請求は個別タブ/請求機能で管理）
  orderSheetMode?: boolean
}

/**
 * 他事業者紹介タブ
 * 業者別（税理士/弁護士/不動産/遺品整理）の紹介情報を内部サブタブで管理する。
 * サブタブは「紹介あり（case_referrals 行が存在する）業者」だけ表示し、「＋業者追加」で増やせる（B-1）。
 * 各業者: 紹介先法人名 / 紹介日付 / 紹介内容 / 見込み報酬 / 報酬請求状態。
 */
export default function ReferralTab({ caseData, referrals, onRefresh, orderSheetMode = false }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<CaseReferralRow[]>(referrals)
  const [activeType, setActiveType] = useState<string | null>(referrals[0]?.partner_type ?? null)
  const [busy, setBusy] = useState(false)

  const types = rows.map(r => r.partner_type)
  const active = activeType && types.includes(activeType) ? activeType : (types[0] ?? null)
  const activeRow = rows.find(r => r.partner_type === active) ?? null
  const remaining = REFERRAL_PARTNER_TYPES.filter(t => !types.includes(t))

  const addPartner = async (partnerType: string) => {
    setBusy(true)
    const { data, error } = await supabase
      .from('case_referrals')
      .insert({ case_id: caseData.id, partner_type: partnerType })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as CaseReferralRow])
    setActiveType(partnerType)
    onRefresh?.()
  }

  const deletePartner = async (row: CaseReferralRow) => {
    if (!confirm(`「${row.partner_type}」の紹介情報を削除しますか？`)) return
    const { error } = await supabase.from('case_referrals').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    setActiveType(null)
    onRefresh?.()
  }

  // case_referrals の1フィールドを更新（楽観的反映）
  const saveReferralField = (id: string, field: keyof CaseReferralRow) => async (value: unknown) => {
    const v = value === '' ? null : value
    setRows(prev => prev.map(r => (r.id === id ? ({ ...r, [field]: v } as CaseReferralRow) : r)))
    const { error } = await supabase.from('case_referrals').update({ [field]: v }).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); throw new Error(error.message) }
  }

  // cases 本体の1フィールドを更新（相続税申告要否など。保存後に親を再取得）
  const saveCaseField = (field: keyof CaseRow) => async (value: unknown) => {
    const v = value === '' ? null : value
    const { error } = await supabase.from('cases').update({ [field]: v }).eq('id', caseData.id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); throw new Error(error.message) }
    onRefresh?.()
  }

  return (
    <div className="space-y-3.5">
      {!orderSheetMode && <TabHeader title="他事業者紹介" description="税理士・弁護士・不動産・遺品整理など、自社外への紹介と依頼内容の管理" />}
      {!orderSheetMode && (
        <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-3">
          <WorkContentField caseData={caseData} gyomu="referral" patchCase={async p => { await supabase.from('cases').update(p).eq('id', caseData.id); onRefresh?.() }} label="作業内容（フリー・オーダーシートと共有）" />
        </div>
      )}
      <Section title="紹介業者">
        {/* サブタブ：登録済み業者＋追加 */}
        <div className="inline-flex items-center gap-0.5 bg-gray-100 rounded p-0.5 mb-3 flex-wrap">
          {rows.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveType(r.partner_type)}
              className={`px-3.5 py-1.5 text-[13px] font-semibold rounded-[3px] transition-colors ${
                active === r.partner_type ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {r.partner_type}
            </button>
          ))}
          {remaining.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => addPartner(t)}
              disabled={busy}
              className="px-2.5 py-1.5 text-[12px] text-gray-400 hover:text-brand-600 rounded-md disabled:opacity-50"
              title={`${t}の紹介を追加`}
            >
              ＋{t}
            </button>
          ))}
        </div>

        {activeRow ? (
          <div className="space-y-3">
            {!orderSheetMode && <ProgressSummary caseId={caseData.id} scopeKey={`referral_${activeRow.partner_type}`} title={`進捗/結果（${activeRow.partner_type}）`} />}
            <div className="flex justify-end mb-1">
              <button
                type="button"
                onClick={() => deletePartner(activeRow)}
                className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> この業者を削除
              </button>
            </div>
            <FieldGrid>
              <InlineDate label="紹介日付" value={activeRow.referred_date} onSave={saveReferralField(activeRow.id, 'referred_date')} />
              {!orderSheetMode && (
                <InlineSelect label="報酬請求状態" value={activeRow.billing_status} options={[...REFERRAL_BILLING_STATUSES]} onSave={saveReferralField(activeRow.id, 'billing_status')} />
              )}
              {/* 弁護士は紹介料が発生しないため見込み報酬は入力不可（非表示） */}
              {activeRow.partner_type !== '弁護士' && (
                <InlineCurrency label="見込み報酬" value={activeRow.estimated_fee} onSave={saveReferralField(activeRow.id, 'estimated_fee')} />
              )}
              {/* 依頼内容（旧称：紹介内容）。税理士/不動産は選択肢、それ以外はフリー入力。
                  この値は LP案件一覧の「税理士業務」「不動産登記」列にも反映される（同一データ）。
                  詳細内容には、具体的な依頼内容や、お客様から紹介先の指定がある場合に記載する。 */}
              {activeRow.partner_type === '税理士' && (
                <>
                  {/* 相続税申告要否＝相続税申告あり判定の正（cases.tax_filing_required）。ダッシュボード集計・案件ヘッダーのバッジもこの値を参照。 */}
                  <InlineSelect label="相続税申告要否" value={caseData.tax_filing_required} options={[...TAX_FILING_OPTIONS]} onSave={saveCaseField('tax_filing_required')} />
                  <InlineSelect label="依頼内容" value={activeRow.content} options={[...TAX_ADVISOR_BUSINESS_OPTIONS]} onSave={saveReferralField(activeRow.id, 'content')} fullWidth />
                </>
              )}
              {activeRow.partner_type === '不動産' && (
                <InlineSelect label="依頼内容" value={activeRow.content} options={[...REAL_ESTATE_REGISTRATION_OPTIONS]} onSave={saveReferralField(activeRow.id, 'content')} fullWidth />
              )}
              <InlineTextarea label="詳細内容" value={activeRow.content_detail} onSave={saveReferralField(activeRow.id, 'content_detail')} fullWidth placeholder="詳細の依頼内容や、紹介先はお客様から指定がある場合はこちらに記載してください。" />
            </FieldGrid>
          </div>
        ) : (
          <div className="py-8 text-center text-[13px] text-gray-400">
            紹介した業者がありません。上の「＋」から業者を追加してください。
          </div>
        )}
      </Section>
    </div>
  )
}
