'use client'

import { useState, useEffect } from 'react'
import { Loader2, Landmark, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import {
  DISSOLUTION_STATUSES,
  PASSBOOK_STATUSES,
  ODD_LOT_HANDLING_OPTIONS,
  UNCLAIMED_DIVIDEND_OPTIONS,
} from '@/lib/constants'

type AssetKind = '預貯金' | '証券' | '信託銀行'

type Props = {
  caseId: string
  kind: AssetKind
  onCancel: () => void
  onSaved: () => void
}

const TITLE: Record<AssetKind, string> = {
  '預貯金':  '預貯金を追加',
  '証券':    '証券を追加',
  '信託銀行': '信託銀行を追加',
}

const PLACEHOLDER_INST: Record<AssetKind, string> = {
  '預貯金':  '例: 三菱UFJ銀行',
  '証券':    '例: 野村證券',
  '信託銀行': '例: 三井住友信託銀行',
}

const initialForm = () => ({
  institution_name: '',
  branch_name: '',
  existence_check: '' as '' | '要' | '不要',
  balance_cert_date: '',
  transaction_history_period: '',
  safe_deposit_box: '' as '' | '有' | '無',
  dissolution_status: '',
  passbook_status: '',
  new_account_found_date: '',
  stock_name: '',
  houri_inquiry: false,
  odd_lot_handling: '',
  unclaimed_dividend: '',
  notes: '',
})

export default function CreateFinancialAssetForm({ caseId, kind, onCancel, onSaved }: Props) {
  const [form, setForm] = useState(initialForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => { setForm(initialForm()) }, [kind])

  const set = <K extends keyof ReturnType<typeof initialForm>>(key: K, value: ReturnType<typeof initialForm>[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const canSave = form.institution_name.trim().length > 0

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const supabase = createClient()
      const payload: Record<string, unknown> = {
        case_id: caseId,
        asset_type: kind,
        institution_name: form.institution_name.trim(),
        branch_name: form.branch_name.trim() || null,
      }

      // 共通: 預貯金 / 信託銀行
      if (kind === '預貯金' || kind === '信託銀行') {
        payload.existence_check = form.existence_check || null
        payload.balance_cert_date = form.balance_cert_date || null
        payload.transaction_history_period = form.transaction_history_period.trim() || null
        payload.safe_deposit_box = form.safe_deposit_box || null
        payload.dissolution_status = form.dissolution_status || null
      }

      // 預貯金 専用
      if (kind === '預貯金') {
        payload.passbook_status = form.passbook_status || null
        payload.new_account_found_date = form.new_account_found_date || null
      }

      // 信託銀行 専用
      if (kind === '信託銀行') {
        payload.stock_name = form.stock_name.trim() || null
      }

      // 証券 専用
      if (kind === '証券') {
        payload.houri_inquiry = form.houri_inquiry
        payload.odd_lot_handling = form.odd_lot_handling || null
        payload.unclaimed_dividend = form.unclaimed_dividend || null
      }

      payload.notes = form.notes.trim() || null

      const { error } = await supabase.from('financial_assets').insert(payload)
      if (error) throw error
      showToast(`${kind}を登録しました`, 'success')
      onSaved()
      onCancel()
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : '登録に失敗しました'
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-brand-100 bg-brand-50/30 pt-4 mt-3 -mx-4 px-4 pb-4 -mb-3">
      <div className="flex items-center gap-2 mb-3">
        <Landmark className="w-4 h-4 text-brand-600" />
        <h4 className="text-[14px] font-bold text-brand-700">{TITLE[kind]}</h4>
        <button
          onClick={onCancel}
          disabled={saving}
          className="ml-auto p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-white"
          title="閉じる"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* 基本情報 */}
        <FormSection title="基本情報">
          <Grid2>
            <Field label="金融機関名">
              <input
                type="text"
                placeholder={PLACEHOLDER_INST[kind]}
                value={form.institution_name}
                onChange={e => set('institution_name', e.target.value)}
                disabled={saving}
                autoFocus
                className={inputCls}
              />
            </Field>
            <Field label="支店名">
              <input
                type="text"
                placeholder="例: 渋谷支店"
                value={form.branch_name}
                onChange={e => set('branch_name', e.target.value)}
                disabled={saving}
                className={inputCls}
              />
            </Field>
            {kind === '信託銀行' && (
              <Field label="銘柄名" colSpan={2}>
                <input
                  type="text"
                  value={form.stock_name}
                  onChange={e => set('stock_name', e.target.value)}
                  disabled={saving}
                  className={inputCls}
                />
              </Field>
            )}
          </Grid2>
        </FormSection>

        {/* 預貯金・信託銀行 共通: 残高・取引履歴 */}
        {(kind === '預貯金' || kind === '信託銀行') && (
          <FormSection title="残高証明・取引履歴">
            <Grid2>
              <Field label="現存確認要否">
                <Select
                  value={form.existence_check}
                  onChange={v => set('existence_check', v as typeof form.existence_check)}
                  options={['要', '不要']}
                  disabled={saving}
                />
              </Field>
              <Field label="残高証明基準日">
                <input
                  type="date"
                  value={form.balance_cert_date}
                  onChange={e => set('balance_cert_date', e.target.value)}
                  disabled={saving}
                  className={inputCls + ' font-mono'}
                />
              </Field>
              <Field label="取引履歴期間">
                <input
                  type="text"
                  placeholder="例: 過去3年分"
                  value={form.transaction_history_period}
                  onChange={e => set('transaction_history_period', e.target.value)}
                  disabled={saving}
                  className={inputCls}
                />
              </Field>
              <Field label="貸金庫有無">
                <Select
                  value={form.safe_deposit_box}
                  onChange={v => set('safe_deposit_box', v as typeof form.safe_deposit_box)}
                  options={['有', '無']}
                  disabled={saving}
                />
              </Field>
            </Grid2>
          </FormSection>
        )}

        {/* 預貯金・信託銀行 共通: 解約 */}
        {(kind === '預貯金' || kind === '信託銀行') && (
          <FormSection title="解約・運用">
            <Grid2>
              <Field label="解約受注状況">
                <Select
                  value={form.dissolution_status}
                  onChange={v => set('dissolution_status', v)}
                  options={[...DISSOLUTION_STATUSES]}
                  disabled={saving}
                />
              </Field>
              {kind === '預貯金' && (
                <>
                  <Field label="通帳取り扱い">
                    <Select
                      value={form.passbook_status}
                      onChange={v => set('passbook_status', v)}
                      options={[...PASSBOOK_STATUSES]}
                      disabled={saving}
                    />
                  </Field>
                  <Field label="新口座判明日">
                    <input
                      type="date"
                      value={form.new_account_found_date}
                      onChange={e => set('new_account_found_date', e.target.value)}
                      disabled={saving}
                      className={inputCls + ' font-mono'}
                    />
                  </Field>
                </>
              )}
            </Grid2>
          </FormSection>
        )}

        {/* 証券 専用 */}
        {kind === '証券' && (
          <FormSection title="証券詳細">
            <Grid2>
              <Field label="端株処理">
                <Select
                  value={form.odd_lot_handling}
                  onChange={v => set('odd_lot_handling', v)}
                  options={[...ODD_LOT_HANDLING_OPTIONS]}
                  disabled={saving}
                />
              </Field>
              <Field label="未受領配当金">
                <Select
                  value={form.unclaimed_dividend}
                  onChange={v => set('unclaimed_dividend', v)}
                  options={[...UNCLAIMED_DIVIDEND_OPTIONS]}
                  disabled={saving}
                />
              </Field>
              <Field label="ほふり照会" colSpan={2}>
                <Check label="照会済み" value={form.houri_inquiry} onChange={v => set('houri_inquiry', v)} />
              </Field>
            </Grid2>
          </FormSection>
        )}

        {/* メモ */}
        <FormSection title="メモ">
          <textarea
            placeholder="補足など"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            disabled={saving}
            rows={2}
            className={inputCls + ' resize-y'}
          />
        </FormSection>
      </div>

      <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-brand-100">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md hover:bg-white"
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Landmark className="w-3.5 h-3.5" />}
          登録する
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────
const inputCls = 'w-full px-2.5 py-1.5 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none bg-white'

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-[3px] h-4 bg-brand-600 rounded-full" />
        <h5 className="text-[13px] font-semibold text-gray-900">{title}</h5>
      </div>
      <div className="pl-3">{children}</div>
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-2">{children}</div>
}

function Field({ label, children, colSpan }: { label: string; children: React.ReactNode; colSpan?: number }) {
  return (
    <div className={colSpan === 2 ? 'col-span-2' : ''}>
      <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">{label}</label>
      {children}
    </div>
  )
}

function Select({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={inputCls}
    >
      <option value="">選択してください</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 px-2.5 py-1 border border-gray-200 bg-white rounded-md hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  )
}
