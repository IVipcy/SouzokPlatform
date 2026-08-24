'use client'

import { useState, Fragment } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow, CaseReferralRow, TaskRow } from '@/types'
import {
  Section, SectionHeading, FieldGrid, InlineSelect, InlineEdit, InlineDate, InlineCurrency, InlineTextarea,
} from '@/components/ui/InlineFields'
import { REFERRAL_PARTNER_TYPES, REFERRAL_BILLING_STATUSES, REAL_ESTATE_REGISTRATION_OPTIONS, TAX_ADVISOR_BUSINESS_OPTIONS, TAX_FILING_OPTIONS, REAL_ESTATE_APPRAISAL_RANKS, TAX_ADVISOR_REFERRAL_REASONS, OTHER_REFERRAL_PARTNERS, TAX_ADVISOR_COMPANIES } from '@/lib/constants'
import TabHeader from './TabHeader'
import TabTasksSection from './TabTasksSection'
import { WorkContentField } from './WorkContentField'
import ProgressSummary from './ProgressSummary'
import SelectOrTextField from './SelectOrTextField'

type Props = {
  caseData: CaseRow
  referrals: CaseReferralRow[]
  onRefresh?: () => void
  tasks?: TaskRow[]
  // オーダーシート埋め込み時は報酬請求状態を出さない（請求は個別タブ/請求機能で管理）
  orderSheetMode?: boolean
}

/**
 * 他事業者紹介タブ
 * 業者別（税理士/弁護士/不動産/遺品整理）の紹介情報を内部サブタブで管理する。
 * サブタブは「紹介あり（case_referrals 行が存在する）業者」だけ表示し、「＋業者追加」で増やせる（B-1）。
 * 各業者: 紹介先法人名 / 紹介日付 / 紹介内容 / 見込み報酬 / 報酬請求状態。
 */
// 紹介先の法人名。付き合いのある法人の一覧から選べて、無ければそのまま打てる。
// オーダーシートと案件詳細の両方で同じ見た目にする。
// ※ 親の中で定義すると再レンダーのたびに別部品になり、入力中にフォーカスが外れるのでモジュール直下に置く。
function FirmNameField({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => void }) {
  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[12.5px] font-semibold text-gray-500 tracking-wide mb-1">{label}</div>
      <SelectOrTextField
        value={value ?? null}
        options={TAX_ADVISOR_COMPANIES}
        onSave={onSave}
        placeholder="法人名を入力"
        className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-lg"
      />
    </div>
  )
}

export default function ReferralTab({ caseData, referrals, onRefresh, tasks = [], orderSheetMode = false }: Props) {
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

  // 相談案件登録と同じ構成（オーダーシート）用：業者行の有無トグル。
  const rowOf = (type: string) => rows.find(r => r.partner_type === type) ?? null
  const togglePartner = async (type: string, yes: boolean) => {
    const existing = rowOf(type)
    if (yes && !existing) {
      const { data, error } = await supabase.from('case_referrals').insert({ case_id: caseData.id, partner_type: type }).select('*').single()
      if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
      setRows(prev => [...prev, data as CaseReferralRow])
      onRefresh?.()
    } else if (!yes && existing) {
      const { error } = await supabase.from('case_referrals').delete().eq('id', existing.id)
      if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
      setRows(prev => prev.filter(r => r.id !== existing.id))
      onRefresh?.()
    }
  }

  // 1業者ぶんの入力欄。オーダーシートは全業者を縦積み、案件詳細はサブタブで1業者ずつ表示。
  const renderPartnerBody = (row: CaseReferralRow) => (
    <div className="space-y-3">
      {!orderSheetMode && <ProgressSummary caseId={caseData.id} scopeKey={`referral_${row.partner_type}`} title={`進捗/結果（${row.partner_type}）`} />}
      <div className="flex justify-end mb-1">
        <button
          type="button"
          onClick={() => deletePartner(row)}
          className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> この業者を削除
        </button>
      </div>
      {/* 並びは 依頼内容 → 相続税申告要否 → 紹介先法人名 → 見込み報酬 → 報酬請求状態 → 紹介日付 → 詳細内容。
          何を頼んだかが先で、日付や請求まわりは後ろ。 */}
      <FieldGrid>
        {row.partner_type === '税理士' && (
          <>
            <InlineSelect label="依頼内容" value={row.content} options={[...TAX_ADVISOR_BUSINESS_OPTIONS]} onSave={saveReferralField(row.id, 'content')} fullWidth />
            <InlineSelect label="相続税申告要否" value={caseData.tax_filing_required} options={[...TAX_FILING_OPTIONS]} onSave={saveCaseField('tax_filing_required')} />
            <FirmNameField label="紹介先税理士法人名" value={row.firm_name} onSave={v => { void saveReferralField(row.id, 'firm_name')(v) }} />
          </>
        )}
        {row.partner_type === '不動産' && (
          <InlineSelect label="依頼内容" value={row.content} options={[...REAL_ESTATE_REGISTRATION_OPTIONS]} onSave={saveReferralField(row.id, 'content')} fullWidth />
        )}
        {row.partner_type !== '弁護士' && (
          <InlineCurrency label="見込み報酬" value={row.estimated_fee} onSave={saveReferralField(row.id, 'estimated_fee')} />
        )}
        {!orderSheetMode && (
          <InlineSelect label="報酬請求状態" value={row.billing_status} options={[...REFERRAL_BILLING_STATUSES]} onSave={saveReferralField(row.id, 'billing_status')} />
        )}
        <InlineDate label="紹介日付" value={row.referred_date} onSave={saveReferralField(row.id, 'referred_date')} />
        {row.partner_type === '税理士' && (
          <InlineSelect label="紹介理由" value={row.referral_reason} options={[...TAX_ADVISOR_REFERRAL_REASONS]} onSave={saveReferralField(row.id, 'referral_reason')} fullWidth />
        )}
        <InlineTextarea label="詳細内容" value={row.content_detail} onSave={saveReferralField(row.id, 'content_detail')} fullWidth placeholder="詳細の依頼内容や、紹介先はお客様から指定がある場合はこちらに記載してください。" />
      </FieldGrid>
    </div>
  )

  // オーダーシート：相談案件登録と同じ構成（不動産査定→税理士紹介→その他紹介）
  if (orderSheetMode) {
    const reRow = rowOf('不動産')
    const taxRow = rowOf('税理士')
    return (
      <div className="space-y-3.5">
        <Section title="不動産査定">
          <FieldGrid>
            <InlineSelect label="紹介" value={reRow ? 'あり' : 'なし'} options={['あり', 'なし']} onSave={async v => { await togglePartner('不動産', v === 'あり') }} width="compact" />
            {reRow && <InlineSelect label="査定ランク" value={reRow.content} options={[...REAL_ESTATE_APPRAISAL_RANKS]} onSave={saveReferralField(reRow.id, 'content')} width="md" />}
            {reRow && <InlineTextarea label="備考" value={reRow.content_detail} onSave={saveReferralField(reRow.id, 'content_detail')} fullWidth />}
          </FieldGrid>
        </Section>
        <Section title="税理士紹介">
          <FieldGrid>
            <InlineSelect label="相続税申告要否" value={caseData.tax_filing_required} options={[...TAX_FILING_OPTIONS]} onSave={saveCaseField('tax_filing_required')} width="md" />
            <InlineSelect label="紹介" value={taxRow ? 'あり' : 'なし'} options={['あり', 'なし']} onSave={async v => { await togglePartner('税理士', v === 'あり') }} width="compact" />
            {/* 紹介先の税理士法人。面談結果登録の「紹介元（税理士経由）」と同じ一覧から選ぶ。
                付き合いのない法人へ紹介することもあるので、一覧に無ければそのまま打てる。 */}
            {taxRow && <FirmNameField label="紹介先税理士法人名" value={taxRow.firm_name} onSave={v => { void saveReferralField(taxRow.id, 'firm_name')(v) }} />}
            {/* 依頼内容は面談結果登録・実務タブと同じ選択肢。紹介理由は別項目（同じ列に入れると依頼内容が化ける）。 */}
            {taxRow && <InlineSelect label="依頼内容" value={taxRow.content} options={[...TAX_ADVISOR_BUSINESS_OPTIONS]} onSave={saveReferralField(taxRow.id, 'content')} fullWidth />}
            {taxRow && <InlineSelect label="紹介理由" value={taxRow.referral_reason} options={[...TAX_ADVISOR_REFERRAL_REASONS]} onSave={saveReferralField(taxRow.id, 'referral_reason')} fullWidth />}
            {taxRow && <InlineTextarea label="備考" value={taxRow.content_detail} onSave={saveReferralField(taxRow.id, 'content_detail')} fullWidth />}
          </FieldGrid>
        </Section>
        <Section title="その他紹介" collapsible defaultOpen={OTHER_REFERRAL_PARTNERS.some(p => !!rowOf(p.key))}>
          <FieldGrid>
            {OTHER_REFERRAL_PARTNERS.map(p => {
              const row = rowOf(p.key)
              return (
                <Fragment key={p.key}>
                  <InlineSelect label={p.label} value={row ? 'あり' : 'なし'} options={['あり', 'なし']} onSave={async v => { await togglePartner(p.key, v === 'あり') }} width="compact" />
                  {row ? <InlineEdit label="備考" value={row.content} onSave={saveReferralField(row.id, 'content')} /> : <div className="py-1.5" />}
                </Fragment>
              )
            })}
          </FieldGrid>
        </Section>
      </div>
    )
  }

  return (
    <div className="space-y-3.5">
      {!orderSheetMode && <TabHeader title="他事業者紹介" description="税理士・弁護士・不動産・遺品整理など、外部へ紹介した先と依頼内容をここに書きます。" />}
      {!orderSheetMode && <div className="mb-3.5"><TabTasksSection gyomus={['他事業者紹介']} tasks={tasks} onRefresh={onRefresh} /></div>}
      {!orderSheetMode && (
        <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-3">
          <WorkContentField caseData={caseData} gyomu="referral" patchCase={async p => { await supabase.from('cases').update(p).eq('id', caseData.id); onRefresh?.() }} label="作業内容（フリー・オーダーシートと共有）" collapsible />
        </div>
      )}
      <Section title="紹介業者">
        {/* サブタブ：登録済み業者＋追加 */}
        <div className="inline-flex items-center gap-0.5 bg-gray-100 rounded p-0.5 mb-3 flex-wrap">
          {!orderSheetMode && rows.map(r => (
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

        {rows.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-gray-400">
            紹介した業者がありません。上の「＋」から業者を追加してください。
          </div>
        ) : orderSheetMode ? (
          // オーダーシート：サブタブ廃止で全業者を縦積み表示
          <div className="space-y-4">
            {rows.map(r => (
              <div key={r.id}>
                <SectionHeading title={r.partner_type} className="mb-2.5 pb-1.5 border-b border-gray-200" />
                {renderPartnerBody(r)}
              </div>
            ))}
          </div>
        ) : activeRow ? (
          renderPartnerBody(activeRow)
        ) : null}
      </Section>
    </div>
  )
}
