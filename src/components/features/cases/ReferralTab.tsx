'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow, CaseReferralRow } from '@/types'
import {
  Section, FieldGrid, InlineSelect, InlineDate, InlineCurrency, InlineEdit, InlineTextarea,
} from '@/components/ui/InlineFields'
import { REFERRAL_PARTNER_TYPES, REFERRAL_BILLING_STATUSES, REAL_ESTATE_REGISTRATION_OPTIONS, TAX_ADVISOR_BUSINESS_OPTIONS } from '@/lib/constants'

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

  return (
    <div className="space-y-3.5">
      <Section title="紹介業者">
        {/* サブタブ：登録済み業者＋追加 */}
        <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-3 flex-wrap">
          {rows.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveType(r.partner_type)}
              className={`px-3.5 py-1.5 text-[13px] font-semibold rounded-md transition-colors ${
                active === r.partner_type ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
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
          <div>
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
              <InlineEdit label="紹介先法人名" value={activeRow.firm_name} onSave={saveReferralField(activeRow.id, 'firm_name')} fullWidth />
              <InlineDate label="紹介日付" value={activeRow.referred_date} onSave={saveReferralField(activeRow.id, 'referred_date')} />
              {!orderSheetMode && (
                <InlineSelect label="報酬請求状態" value={activeRow.billing_status} options={[...REFERRAL_BILLING_STATUSES]} onSave={saveReferralField(activeRow.id, 'billing_status')} />
              )}
              <InlineCurrency label="見込み報酬" value={activeRow.estimated_fee} onSave={saveReferralField(activeRow.id, 'estimated_fee')} />
              {/* 依頼内容（旧称：紹介内容）。税理士/不動産は選択肢、それ以外はフリー入力。
                  この値は LP案件一覧の「税理士業務」「不動産登記」列にも反映される（同一データ）。 */}
              {activeRow.partner_type === '税理士' ? (
                <InlineSelect label="依頼内容" value={activeRow.content} options={[...TAX_ADVISOR_BUSINESS_OPTIONS]} onSave={saveReferralField(activeRow.id, 'content')} fullWidth />
              ) : activeRow.partner_type === '不動産' ? (
                <InlineSelect label="依頼内容" value={activeRow.content} options={[...REAL_ESTATE_REGISTRATION_OPTIONS]} onSave={saveReferralField(activeRow.id, 'content')} fullWidth />
              ) : (
                <InlineTextarea label="依頼内容" value={activeRow.content} onSave={saveReferralField(activeRow.id, 'content')} fullWidth />
              )}
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
