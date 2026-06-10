'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, User, FileText, CheckCircle2, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { SelectedCase } from './MeetingPageClient'
import { STEPS, INITIAL_DATA, type FormData } from './formData'
import {
  MEETING_SELECTABLE_STATUSES, getCaseStatusLabel,
  MEETING_PLACES, LOST_REASONS, PROCEDURE_TYPES, REFERRAL_PARTNER_TYPES,
} from '@/lib/constants'

type Props = {
  selectedCase: NonNullable<SelectedCase>
  // 案件作成者（受注担当として自動セット）
  currentMemberId: string | null
}

// 案件作成は面談完了後のため「面談設定済」は選択肢から除外
const STATUS_OPTIONS = MEETING_SELECTABLE_STATUSES.filter(k => k !== '面談設定済').map(k => ({ key: k, label: getCaseStatusLabel(k) }))
// お客様回答予定日が必須になるステータス
const RESPONSE_DUE_REQUIRED = new Set(['検討中', '検討中（契約書待ち）'])

// ── Shared UI helpers ──
function Card({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-4 mb-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-gray-200">
      <div className="text-[13px] font-bold text-gray-400 tracking-wider uppercase mb-2.5 flex items-center gap-1.5">
        {required && <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />}
        {label}
      </div>
      {children}
    </div>
  )
}

function Pills({ value, options, onChange, multi }: { value: string | string[]; options: string[]; onChange: (v: string | string[]) => void; multi?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const selected = multi ? (value as string[]).includes(o) : value === o
        return (
          <button
            key={o}
            type="button"
            onClick={() => {
              if (multi) {
                const arr = value as string[]
                onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])
              } else {
                onChange(value === o ? '' : o)
              }
            }}
            className={`px-4 py-2 rounded-full border-[1.5px] text-[13px] font-medium transition select-none ${
              selected
                ? (multi ? 'bg-brand-700 border-brand-700 text-white' : 'bg-brand-600 border-brand-600 text-white')
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-50 border-[1.5px] border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/10 focus:bg-white transition"
    />
  )
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-50 border-[1.5px] border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/10 focus:bg-white transition resize-y min-h-[80px] leading-relaxed"
    />
  )
}

function StatusPills({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {STATUS_OPTIONS.map(o => {
        const selected = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`px-4 py-2 rounded-full border-[1.5px] text-[13px] font-medium transition select-none ${
              selected ? 'bg-brand-600 border-brand-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function SectionHeader({ Icon, title, sub }: { Icon: LucideIcon; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-brand-600 to-brand-800 shadow-sm">
        <Icon className="w-5 h-5 text-white" strokeWidth={2} />
      </div>
      <div>
        <div className="text-lg font-bold text-gray-900">{title}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function MeetingForm({ selectedCase, currentMemberId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [data, setData] = useState<FormData>(() => {
    const init = { ...INITIAL_DATA }
    if (selectedCase.id !== 'new') {
      init.clientName = selectedCase.client
      init.clientPhone = selectedCase.phone
    }
    return init
  })

  const update = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])

  const saveToDatabase = useCallback(async (formData: FormData) => {
    setSaving(true)
    setSaveError('')
    const supabase = createClient()

    try {
      const isNew = selectedCase.id === 'new'
      let caseId = isNew ? '' : selectedCase.id
      let clientId = ''

      // 1. 依頼者 upsert
      const clientPayload = {
        name: formData.clientName.trim(),
        furigana: formData.clientKana || null,
        phone: formData.clientPhone || formData.clientMobile || null,
        email: formData.clientEmail || null,
        postal_code: formData.clientZip || null,
        address: formData.clientAddress || null,
        relationship_to_deceased: null as string | null,
        notes: formData.contactPreference.length > 0 ? `連絡先希望: ${formData.contactPreference.join(', ')}` : null,
      }

      if (isNew) {
        const { data: newClient, error } = await supabase.from('clients').insert(clientPayload).select('id').single()
        if (error) throw new Error(`依頼者の保存に失敗: ${error.message}`)
        clientId = newClient.id
      } else {
        const { data: existingCase } = await supabase.from('cases').select('client_id').eq('id', caseId).single()
        if (existingCase?.client_id) {
          clientId = existingCase.client_id
          await supabase.from('clients').update(clientPayload).eq('id', clientId)
        } else {
          const { data: newClient, error } = await supabase.from('clients').insert(clientPayload).select('id').single()
          if (error) throw new Error(`依頼者の保存に失敗: ${error.message}`)
          clientId = newClient.id
        }
      }

      // 2. 難易度マッピング（高/中/低 → 難/普/易）
      const diffMap: Record<string, string> = { '高': '難', '中': '普', '低': '易' }
      const difficulty = diffMap[formData.difficulty] || null

      // 3. 案件 upsert（面談情報のみ。遺産系詳細はオーダーシートで入力）
      const casePayload = {
        client_id: clientId,
        deal_name: `${formData.clientName || '無題'} 様 相続案件`,
        status: formData.caseStatus || '検討中',
        difficulty,
        procedure_type: formData.procedureType.length > 0 ? formData.procedureType : null,
        client_response_due_date: formData.clientResponseDueDate || null,
        meeting_executed_date: formData.meetingDate || null,
        meeting_place: formData.meetingPlace || null,
        meeting_hearing_memo: formData.hearingMemo || null,
        meeting_other_notes: formData.otherNotes || null,
        lost_reason: formData.lostReason || null,
      }

      if (isNew) {
        let caseNumber = formData.caseNumber.trim()
        if (!caseNumber) {
          const { count } = await supabase.from('cases').select('*', { count: 'exact', head: true })
          caseNumber = `R7-A${String((count ?? 0) + 1).padStart(5, '0')}`
        }
        const { data: newCase, error } = await supabase.from('cases').insert({ ...casePayload, case_number: caseNumber }).select('id').single()
        if (error) throw new Error(`案件の保存に失敗: ${error.message}`)
        caseId = newCase.id
        // 受注担当＝案件作成者を自動セット
        if (currentMemberId) {
          await supabase.from('case_members').insert({ case_id: caseId, member_id: currentMemberId, role: 'sales' })
        }
      } else {
        const { error } = await supabase.from('cases').update(casePayload).eq('id', caseId)
        if (error) throw new Error(`案件の更新に失敗: ${error.message}`)
      }

      // 4. 他事業者紹介要否 → case_referrals（チェック分をupsert。未チェックの削除はタブ側で実施）
      if (formData.referralPartners.length > 0) {
        const rows = formData.referralPartners.map(p => ({ case_id: caseId, partner_type: p }))
        await supabase.from('case_referrals').upsert(rows, { onConflict: 'case_id,partner_type', ignoreDuplicates: true })
      }

      setSaving(false)
      return caseId
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : '保存に失敗しました')
      setSaving(false)
      return null
    }
  }, [selectedCase, currentMemberId])

  const nextStep = useCallback(async () => {
    // 基本情報: 検討中／検討中（契約書待ち）はお客様回答予定日が必須
    if (STEPS[step].id === 'basic' && RESPONSE_DUE_REQUIRED.has(data.caseStatus) && !data.clientResponseDueDate) {
      setSaveError('お客様回答予定日を入力してください')
      return
    }
    setSaveError('')
    setCompletedSteps(prev => new Set(prev).add(step))
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      window.scrollTo(0, 0)
    } else {
      const caseId = await saveToDatabase(data)
      if (caseId) {
        showToast('案件を保存しました', 'success')
        router.push(`/cases/${caseId}`)
      }
    }
  }, [step, data, saveToDatabase, router])

  const prevStep = useCallback(() => {
    if (step > 0) {
      setStep(step - 1)
      window.scrollTo(0, 0)
    }
  }, [step])

  const progressPct = ((step + 1) / STEPS.length) * 100

  const renderStep = () => {
    switch (STEPS[step].id) {
      case 'basic': return (
        <div className="max-w-[800px]">
          <SectionHeader Icon={ClipboardList} title="基本情報" sub="面談開始時に確認する項目" />
          <Card label="案件管理番号"><Input value={data.caseNumber} onChange={v => update('caseNumber', v)} placeholder="空欄なら自動採番（例：R7-A00129）" /></Card>
          <Card label="案件ステータス" required><StatusPills value={data.caseStatus} onChange={v => update('caseStatus', v)} /></Card>
          {RESPONSE_DUE_REQUIRED.has(data.caseStatus) && (
            <Card label="お客様回答予定日" required><Input type="date" value={data.clientResponseDueDate} onChange={v => update('clientResponseDueDate', v)} /></Card>
          )}
          <Card label="面談実施日" required><Input type="date" value={data.meetingDate} onChange={v => update('meetingDate', v)} /></Card>
          <Card label="面談場所"><Pills value={data.meetingPlace} options={[...MEETING_PLACES]} onChange={v => update('meetingPlace', v as string)} /></Card>
        </div>
      )
      case 'client': return (
        <div className="max-w-[800px]">
          <SectionHeader Icon={User} title="依頼者情報" sub="面談にご来所された方の情報" />
          <Card label="氏名" required>
            <div className="grid gap-2.5">
              <Input value={data.clientName} onChange={v => update('clientName', v)} placeholder="山田 太郎" />
              <Input value={data.clientKana} onChange={v => update('clientKana', v)} placeholder="やまだ たろう" />
            </div>
          </Card>
          <Card label="生年月日"><Input type="date" value={data.clientBirthday} onChange={v => update('clientBirthday', v)} /></Card>
          <Card label="連絡先">
            <div className="grid gap-2.5">
              <Input value={data.clientPhone} onChange={v => update('clientPhone', v)} placeholder="03-0000-0000" type="tel" />
              <Input value={data.clientMobile} onChange={v => update('clientMobile', v)} placeholder="090-0000-0000" type="tel" />
              <Input value={data.clientEmail} onChange={v => update('clientEmail', v)} placeholder="example@email.com" type="email" />
            </div>
          </Card>
          <Card label="連絡先希望"><Pills value={data.contactPreference} options={['自宅TEL', '携帯', 'メール']} onChange={v => update('contactPreference', v as string[])} multi /></Card>
          <Card label="住所">
            <div className="grid gap-2.5">
              <Input value={data.clientZip} onChange={v => update('clientZip', v)} placeholder="〒000-0000" />
              <Input value={data.clientAddress} onChange={v => update('clientAddress', v)} placeholder="都道府県 市区町村 番地" />
            </div>
          </Card>
          <Card label="外字有無"><Pills value={data.clientGaiji} options={['あり', 'なし']} onChange={v => update('clientGaiji', v as string)} /></Card>
          <Card label="郵送先"><Pills value={data.mailingDestination} options={['依頼者住所', 'その他']} onChange={v => update('mailingDestination', v as string)} /></Card>
          {data.mailingDestination === 'その他' && (
            <Card label="郵送先住所"><Input value={data.altMailingAddress} onChange={v => update('altMailingAddress', v)} placeholder="郵送先住所を入力" /></Card>
          )}
        </div>
      )
      case 'meeting': return (
        <div className="max-w-[800px]">
          <SectionHeader Icon={FileText} title="面談内容" sub="面談で確認した内容・受注見込み" />
          <Card label="ヒアリング内容メモ"><Textarea value={data.hearingMemo} onChange={v => update('hearingMemo', v)} placeholder="面談で聞き取った内容" /></Card>
          <Card label="受注見込み手続き区分"><Pills value={data.procedureType} options={[...PROCEDURE_TYPES]} onChange={v => update('procedureType', v as string[])} multi /></Card>
          <Card label="他事業者紹介要否"><Pills value={data.referralPartners} options={[...REFERRAL_PARTNER_TYPES]} onChange={v => update('referralPartners', v as string[])} multi /></Card>
          <Card label="難易度"><Pills value={data.difficulty} options={['高', '中', '低']} onChange={v => update('difficulty', v as string)} /></Card>
          <Card label="失注理由"><Pills value={data.lostReason} options={[...LOST_REASONS]} onChange={v => update('lostReason', v as string)} /></Card>
          <Card label="その他備考"><Textarea value={data.otherNotes} onChange={v => update('otherNotes', v)} placeholder="その他特記事項があれば記入" /></Card>
        </div>
      )
      case 'confirm': return (
        <div className="max-w-[800px]">
          <SectionHeader Icon={CheckCircle2} title="入力内容の確認" sub="内容を確認して「完了」してください" />
          {saveError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">{saveError}</div>}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <ConfirmSection title="基本情報">
              <ConfirmRow label="案件管理番号" value={data.caseNumber || '（自動採番）'} />
              <ConfirmRow label="案件ステータス" value={getCaseStatusLabel(data.caseStatus)} />
              {RESPONSE_DUE_REQUIRED.has(data.caseStatus) && <ConfirmRow label="お客様回答予定日" value={data.clientResponseDueDate} />}
              <ConfirmRow label="面談実施日" value={data.meetingDate} />
              <ConfirmRow label="面談場所" value={data.meetingPlace} />
            </ConfirmSection>
            <ConfirmSection title="依頼者">
              <ConfirmRow label="氏名" value={data.clientName} />
              <ConfirmRow label="TEL" value={data.clientPhone || data.clientMobile} />
              <ConfirmRow label="連絡先希望" value={data.contactPreference.join(', ')} />
            </ConfirmSection>
            <ConfirmSection title="面談内容">
              <ConfirmRow label="受注見込み手続き区分" value={data.procedureType.join(', ')} />
              <ConfirmRow label="他事業者紹介" value={data.referralPartners.join(', ')} />
              <ConfirmRow label="難易度" value={data.difficulty} />
              <ConfirmRow label="失注理由" value={data.lostReason} />
            </ConfirmSection>
          </div>
        </div>
      )
      default: return null
    }
  }

  return (
    <div>
      {/* Step tabs */}
      <div className="bg-white border border-gray-200 rounded-xl p-1 flex gap-0.5 overflow-x-auto mb-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setStep(i)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition relative ${
              i === step ? 'bg-brand-600 text-white font-semibold' :
              completedSteps.has(i) ? 'text-green-600 hover:bg-gray-50' :
              'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.label}{completedSteps.has(i) && i !== step ? ' ✓' : ''}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-brand-600 rounded-full transition-all duration-400" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Form content */}
      {renderStep()}

      {/* Bottom nav */}
      <div className="flex justify-end gap-2.5 pt-4 mt-2 border-t border-gray-200">
        {step > 0 && (
          <button onClick={prevStep} className="px-5 py-3 rounded-lg border-[1.5px] border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition">
            ← 戻る
          </button>
        )}
        <button
          onClick={nextStep}
          className={`px-8 py-3 rounded-lg text-sm font-bold text-white flex items-center gap-2 transition shadow-sm ${
            step === STEPS.length - 1
              ? 'bg-green-600 hover:bg-green-700 shadow-green-500/25'
              : 'bg-brand-600 hover:bg-brand-700 shadow-brand-500/25'
          }`}
        >
          {step === STEPS.length - 1 ? (saving ? '保存中...' : '完了') : '次へ →'}
        </button>
      </div>
    </div>
  )
}

function ConfirmSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[12px] font-bold text-gray-400 tracking-widest uppercase pb-2 mb-3 border-b-[1.5px] border-gray-200">{title}</div>
      {children}
    </div>
  )
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  const empty = !value
  return (
    <div className="flex py-1.5 gap-3 border-b border-gray-50">
      <div className="text-xs text-gray-400 flex-shrink-0 w-[140px] pt-0.5">{label}</div>
      <div className={`text-sm font-medium flex-1 ${empty ? 'text-gray-200 italic' : 'text-gray-800'}`}>
        {empty ? '未入力' : value}
      </div>
    </div>
  )
}
