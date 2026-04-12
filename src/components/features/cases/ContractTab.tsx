'use client'

import { useState, useEffect } from 'react'
import type { CaseRow, PartnerRow } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { Section, FieldGrid, Field, InlineSelect, InlineCurrency, InlineDate, InlineTextarea } from '@/components/ui/InlineFields'
import { CONTRACT_TYPES } from '@/lib/constants'

type Props = {
  caseData: CaseRow
  onRefresh: () => void
}

const yen = (v: number | null | undefined) =>
  v != null ? `¥${v.toLocaleString()}` : '未設定'

export default function ContractTab({ caseData, onRefresh }: Props) {
  const [partner, setPartner] = useState<PartnerRow | null>(null)

  useEffect(() => {
    if (!caseData.partner_id) {
      setPartner(null)
      return
    }
    const fetchPartner = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('partners')
        .select('*')
        .eq('id', caseData.partner_id!)
        .single()
      setPartner(data)
    }
    fetchPartner()
  }, [caseData.partner_id])

  const saveCaseField = async (field: string, value: string) => {
    const supabase = createClient()
    await supabase.from('cases').update({ [field]: value || null }).eq('id', caseData.id)
    onRefresh()
  }

  const saveCaseNumberField = async (field: string, value: number | null) => {
    const supabase = createClient()
    await supabase.from('cases').update({ [field]: value }).eq('id', caseData.id)
    onRefresh()
  }

  // Computed values
  const totalRevenue =
    (caseData.fee_administrative ?? 0) +
    (caseData.fee_judicial ?? 0) +
    (caseData.fee_real_estate ?? 0) +
    (caseData.fee_tax_referral ?? 0)

  const feeSubtotal = (caseData.fee_administrative ?? 0) + (caseData.fee_judicial ?? 0)
  const kickbackRate = partner?.kickback_rate ?? 0
  const partnerCompensation = Math.round(feeSubtotal * kickbackRate / 100)

  const revenueRows = [
    { label: '確定金額合計', value: feeSubtotal },
    { label: '不動産手数料見込', value: caseData.fee_real_estate },
    { label: '税理士紹介手数料', value: caseData.fee_tax_referral },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      {/* Left column */}
      <div className="space-y-3.5">
        {/* 契約・報酬 */}
        <Section title="契約・報酬" icon="📄">
          <FieldGrid>
            <InlineSelect
              label="契約形態"
              value={caseData.contract_type}
              options={[...CONTRACT_TYPES]}
              onSave={v => saveCaseField('contract_type', v)}
              required
            />
            <InlineDate
              label="契約日"
              value={caseData.contract_date}
              onSave={v => saveCaseField('contract_date', v)}
            />
            <Field label="立替実費（司法）" value={yen(caseData.fee_judicial)} mono />
            <Field label="確定金額（行政）" value={yen(caseData.fee_administrative)} mono />
            <Field label="確定金額（司法）" value={yen(caseData.fee_judicial)} mono />
          </FieldGrid>
          <FieldGrid cols={1}>
            <InlineTextarea
              label="特記事項"
              value={caseData.notes}
              onSave={v => saveCaseField('notes', v)}
              fullWidth
            />
          </FieldGrid>
        </Section>

        {/* 付帯収益 */}
        <Section title="付帯収益" icon="💹">
          <FieldGrid>
            <InlineCurrency
              label="不動産売却手数料見込"
              value={caseData.fee_real_estate}
              onSave={v => saveCaseNumberField('fee_real_estate', v)}
            />
            <InlineCurrency
              label="税理士紹介手数料"
              value={caseData.fee_tax_referral}
              onSave={v => saveCaseNumberField('fee_tax_referral', v)}
            />
          </FieldGrid>
          <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
            <span className="text-gray-500 font-medium text-sm">案件トータル収益見込</span>
            <span className="text-blue-600 font-bold text-base">{yen(totalRevenue || null)}</span>
          </div>
        </Section>
      </div>

      {/* Right column */}
      <div className="space-y-3.5">
        {/* Revenue gradient card */}
        <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
          <div className="text-[10px] font-semibold opacity-70 tracking-wider uppercase mb-1.5">案件トータル収益見込</div>
          <div className="text-[26px] font-extrabold tracking-tight mb-2.5">
            {totalRevenue > 0 ? `¥${totalRevenue.toLocaleString()}` : '—'}
          </div>
          <div className="space-y-1.5">
            {revenueRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-[11px]">
                <span className="opacity-80">{r.label}</span>
                <span className="font-semibold">
                  {r.value != null && r.value > 0 ? `¥${r.value.toLocaleString()}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* パートナー報酬 */}
        <Section title="パートナー報酬" icon="🤝">
          <div className="space-y-0">
            <Field
              label="パートナー企業"
              value={partner ? partner.name : caseData.partner_id ? '読み込み中...' : '未設定'}
            />
            <Field
              label="パートナー報酬割合"
              value={partner ? `${kickbackRate}%` : undefined}
            />
            <Field
              label="パートナー報酬額"
              value={partner ? yen(partnerCompensation) : undefined}
              mono
            />
          </div>
        </Section>
      </div>
    </div>
  )
}
