'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { User, FileText, CheckCircle2, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import BirthdayPicker from '@/components/ui/BirthdayPicker'
import { toKatakana } from '@/lib/kana'
import { lookupPostalAddress } from '@/lib/postal'
import type { SelectedCase } from './MeetingPageClient'
import { STEPS, INITIAL_DATA, EMPTY_CLIENT, type FormData, type ClientPerson } from './formData'
import {
  MEETING_SELECTABLE_STATUSES, getCaseStatusLabel,
  REFERRAL_PARTNER_TYPES, MAILING_DESTINATIONS, CONTRACT_TYPES, HEIR_RELATIONSHIPS,
  LP_FOLLOWUP_METHODS, REAL_ESTATE_REGISTRATION_OPTIONS, TAX_ADVISOR_BUSINESS_OPTIONS,
  CONSIDERATION_DECLINE_REASONS,
  ORDER_ROUTES, ORDER_ROUTE_CODES, PAST_CLIENT_ROUTE,
  FUNERAL_COMPANIES, TAX_ADVISOR_COMPANIES, HP_SOURCES,
  CONSIDERATION_PERIODS, considerationDueMax, HEARING_MEMO_SAMPLE,
} from '@/lib/constants'
import {
  ORDER_CATEGORIES, REFERRAL_ONLY_CATEGORY,
  gyomuForCategories, tasksForCategories, seedRolesForCategories, kindForTask, isOptionalTask,
} from '@/lib/serviceMaster'
import { buildParts, partRank } from '@/lib/serviceParts'
import ReferralSourceLookup from '@/components/features/cases/ReferralSourceLookup'
import PastClientLookup from '@/components/features/cases/PastClientLookup'
import { IntakeRolesEditor, IntakeDocsEditor, clientReflectCandidates, type RoleRow } from '@/components/features/cases/ProcedureIntakeSection'
import ClientDocsReflectModal from '@/components/features/cases/ClientDocsReflectModal'

type Props = {
  selectedCase: NonNullable<SelectedCase>
  // 案件作成者（受注担当として自動セット）
  currentMemberId: string | null
  // スマホ独立ルート（/register）用：登録後に案件詳細へ遷移せず「完了画面」を出す
  standalone?: boolean
  // 完了画面「案件選択に戻る」用
  onBack?: () => void
}

// 案件作成は面談完了後のため「面談設定済」は選択肢から除外
const STATUS_OPTIONS = MEETING_SELECTABLE_STATUSES.filter(k => k !== '面談設定済').map(k => ({ key: k, label: getCaseStatusLabel(k) }))
// お客様回答予定日が必須になるステータス
const RESPONSE_DUE_REQUIRED = new Set(['検討中', '検討中（契約書待ち）'])
// 「検討中・不受託理由」を表示する面談結果（不受託のステータスキーは '失注'）
const DECLINE_REASON_REQUIRED = new Set(['検討中', '失注'])
// 「LPによる追いかけ可否」を表示する面談結果（検討中(契約書待ち)は受注確定済のため不要）
const LP_FOLLOWUP_VISIBLE = new Set(['検討中'])
// 契約確定系（役割分担／契約手続き／契約形態／難易度／完了予定日）を表示する面談結果。※ステータスのキーで判定（受託のキーは'受注'）。
const CONTRACT_FIELDS_VISIBLE = new Set(['受注', '検討中（契約書待ち）'])
// 他事業者紹介を表示する面談結果。上記＋「紹介のみ」（紹介先を埋めるため）。
const REFERRAL_FIELDS_VISIBLE = new Set(['受注', '検討中（契約書待ち）', '紹介のみ'])
// 依頼者特徴（案件詳細の依頼者タブと同じ。1つ選択）
const TRAIT_OPTIONS: { key: 'smile' | 'neutral' | 'angry'; emoji: string; label: string }[] = [
  { key: 'smile',   emoji: '😊', label: '笑顔' },
  { key: 'neutral', emoji: '😐', label: '真顔' },
  { key: 'angry',   emoji: '😡', label: '怖い顔' },
]

// 生年月日から年齢を算出
// 被相続人の年齢（享年）＝生年月日から死亡日時点の満年齢を算出
function ageAtDeath(birthday: string, deathDate: string): number | null {
  if (!birthday || !deathDate) return null
  const b = new Date(birthday), d = new Date(deathDate)
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null
  let age = d.getFullYear() - b.getFullYear()
  const m = d.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--
  return age >= 0 ? age : null
}

function calcAge(birthday: string): number | null {
  if (!birthday) return null
  const b = new Date(birthday)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 ? age : null
}

// ── Shared UI helpers ──
function Card({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded p-4 mb-3 border border-gray-200">
      <div className="text-[11.5px] font-medium text-gray-500 tracking-[0.02em] mb-2 flex items-center gap-1.5">
        {required && <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />}
        {label}
      </div>
      {children}
    </div>
  )
}

function Pills({ value, options, onChange, multi, disabled }: { value: string | string[]; options: string[]; onChange: (v: string | string[]) => void; multi?: boolean; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const selected = multi ? (value as string[]).includes(o) : value === o
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return
              if (multi) {
                const arr = value as string[]
                onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])
              } else {
                onChange(value === o ? '' : o)
              }
            }}
            className={`px-4 py-2 rounded-full border-[1.5px] text-[13px] font-medium transition select-none ${
              disabled
                ? (selected ? 'bg-gray-400 border-gray-400 text-white cursor-not-allowed' : 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed')
                : selected
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

function Select({ value, options, onChange, placeholder, noEmpty }: { value: string; options: readonly (string | { key: string; label: string })[]; onChange: (v: string) => void; placeholder?: string; noEmpty?: boolean }) {
  const opts = options.map(o => (typeof o === 'string' ? { key: o, label: o } : o))
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-gray-50 border-[1.5px] border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/10 focus:bg-white transition"
    >
      {!noEmpty && <option value="">{placeholder ?? '選択…'}</option>}
      {opts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  )
}

function Input({ value, onChange, placeholder, type = 'text', max }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; max?: string }) {
  return (
    <input
      type={type}
      max={max}
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
      onChange={e => { onChange(e.target.value); const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }}
      placeholder={placeholder}
      className="w-full bg-gray-50 border-[1.5px] border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/10 focus:bg-white transition resize-y min-h-[160px] max-h-[60vh] overflow-y-auto leading-relaxed"
    />
  )
}

function CellInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
    />
  )
}

function SectionHeader({ Icon, title, sub }: { Icon: LucideIcon; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 bg-brand-600">
        <Icon className="w-5 h-5 text-white" strokeWidth={2} />
      </div>
      <div>
        <div className="text-lg font-bold text-gray-900">{title}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function MeetingForm({ selectedCase, currentMemberId, standalone = false, onBack }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [done, setDone] = useState(false)  // スマホ独立ルート：登録完了画面
  const [data, setData] = useState<FormData>(() => {
    const init: FormData = { ...INITIAL_DATA, clients: INITIAL_DATA.clients.map(c => ({ ...c })) }
    if (selectedCase.id !== 'new') {
      // 連携①（相続ステーション）で事前登録された情報を初期値に引き継ぐ
      // 面談ルート・紹介元
      if (selectedCase.orderRoute) init.orderRoute = selectedCase.orderRoute
      if (selectedCase.orderRouteDetail) init.orderRouteDetail = selectedCase.orderRouteDetail
      // 依頼者（メイン）
      init.clients[0] = {
        ...init.clients[0],
        name: selectedCase.client,
        kana: selectedCase.clientFurigana ?? '',
        relationship: selectedCase.clientRelation ?? '',
        phone: selectedCase.phone,
        mobilePhone: selectedCase.clientMobilePhone ?? '',
        email: selectedCase.clientEmail ?? '',
      }
      if (selectedCase.clientAddress) init.address = selectedCase.clientAddress
      if (selectedCase.clientPostalCode) init.postalCode = selectedCase.clientPostalCode
      if (selectedCase.clientNotes) init.clientTraitDetail = selectedCase.clientNotes
      // 被相続人
      if (selectedCase.deceasedName) init.deceasedName = selectedCase.deceasedName
      if (selectedCase.deceasedFurigana) init.deceasedKana = selectedCase.deceasedFurigana
      if (selectedCase.deceasedBirthDate) init.deceasedBirthday = selectedCase.deceasedBirthDate
      if (selectedCase.dateOfDeath) init.dateOfDeath = selectedCase.dateOfDeath
      if (selectedCase.deceasedAddress) init.deceasedAddress = selectedCase.deceasedAddress
      if (selectedCase.deceasedRegisteredAddress) init.deceasedRegisteredAddress = selectedCase.deceasedRegisteredAddress
      // LP事前ヒアリング情報をヒアリングメモの先頭にプリセット（営業が面談時に追記する想定）
      const lpHearing: string[] = []
      if (selectedCase.hearingContent) lpHearing.push(`【LP事前ヒアリング】\n${selectedCase.hearingContent}`)
      if (selectedCase.specialNotes) lpHearing.push(`【特記事項】\n${selectedCase.specialNotes}`)
      if (selectedCase.otherNeeds) lpHearing.push(`【その他ニーズ】\n${selectedCase.otherNeeds}`)
      if (lpHearing.length > 0) init.hearingMemo = lpHearing.join('\n\n') + '\n\n---\n【面談で確認した内容】\n'
    }
    return init
  })

  const update = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])

  // 検討期間区分を選ぶ → 回答予定日を「今日＋期間」を上限にそろえる（見込み不明は上限なし）
  const selectPeriod = (p: string) => {
    const max = considerationDueMax(p)
    setData(prev => ({
      ...prev,
      considerationPeriod: p,
      // 未入力 or 上限超過なら上限に補正。見込み不明(max=null)は触らない。
      clientResponseDueDate: max && (!prev.clientResponseDueDate || prev.clientResponseDueDate > max) ? max : prev.clientResponseDueDate,
    }))
  }

  // 受注区分（複数選択）。選んだ区分を rank 順（先行→本体）に並べ、業務・作業を入れ直す。
  // 既存の担当(owner)・メモ(note)は同じ業務×作業に引き継ぐ。「紹介のみ」は自社手続きなしのため排他。
  const setServiceCategories = (keys: string[]) => {
    let next = [...new Set(keys)]
    if (next.includes(REFERRAL_ONLY_CATEGORY) && next.length > 1) {
      const justAddedReferral = !data.serviceCategories.includes(REFERRAL_ONLY_CATEGORY)
      next = justAddedReferral ? [REFERRAL_ONLY_CATEGORY] : next.filter(k => k !== REFERRAL_ONLY_CATEGORY)
    }
    const ordered = next.sort((a, b) => partRank(a) - partRank(b))
    const seeded = (ordered.length ? seedRolesForCategories(ordered) : []) as RoleRow[]
    const prevByKey = new Map(data.intakeRoles.map(r => [`${r.gyomu}|||${r.sagyou}`, r]))
    const merged = seeded.map(s => {
      const p = prevByKey.get(`${s.gyomu}|||${s.sagyou}`)
      return p ? { ...s, owner: p.owner, note: p.note } : s
    })
    setData(prev => ({ ...prev, serviceCategories: ordered, serviceCategory: ordered[0] ?? '', serviceCategory2: ordered[1] ?? '', intakeRoles: merged }))
  }

  // 「依頼者」にした業務を、チェックリストで選んで契約時にもらう書類として契約手続きへ反映
  const [reflectOpen, setReflectOpen] = useState(false)
  const addReflectedDocs = (docs: { name: string; category: string }[]) => {
    const existing = new Set(data.intakeDocuments.map(d => d.name.trim()))
    const toAdd = docs
      .filter(d => !existing.has(d.name))
      .map(d => ({ name: d.name, status: '後日郵送', arrival_date: null as string | null, note: '', category: d.category }))
    if (toAdd.length > 0) update('intakeDocuments', [...data.intakeDocuments, ...toAdd])
  }


  // 依頼者（複数人）操作
  const updateClient = (i: number, patch: Partial<ClientPerson>) =>
    update('clients', data.clients.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const addClient = () => update('clients', [...data.clients, { ...EMPTY_CLIENT }])
  const removeClient = (i: number) => update('clients', data.clients.filter((_, idx) => idx !== i))

  const saveToDatabase = useCallback(async (formData: FormData) => {
    setSaving(true)
    setSaveError('')
    const supabase = createClient()

    try {
      const isNew = selectedCase.id === 'new'
      let caseId = isNew ? '' : selectedCase.id
      let clientId = ''

      // 1. メイン依頼者を clients に upsert（互換のため cases.client_id 維持）
      const mainClient = formData.clients.find(c => c.priority === 'main') ?? formData.clients[0]
      const mainName = (mainClient?.name ?? '').trim()
      const clientPayload = {
        name: mainName || '無題',
        furigana: mainClient?.kana || null,
        // 振込名義人カナ＝入金CSV突合キー。明示入力が無ければ依頼者ふりがな（本人振込前提）を採用。
        transfer_name_kana: formData.transferNameKana.trim()
          ? toKatakana(formData.transferNameKana)
          : (mainClient?.kana ? toKatakana(mainClient.kana) : null),
        transfer_name_kana_2: formData.transferNameKana2.trim() ? toKatakana(formData.transferNameKana2) : null,
        transfer_name_kana_3: formData.transferNameKana3.trim() ? toKatakana(formData.transferNameKana3) : null,
        phone: mainClient?.phone || null,
        email: mainClient?.email || null,
        relationship_to_deceased: mainClient?.relationship || null,
        postal_code: formData.postalCode || null,
        address: formData.address || null,
      }

      if (isNew) {
        if (formData.pastClientId) {
          // 過去客経由: 既存依頼者を再利用（同一 client_id で履歴が辿れる）
          clientId = formData.pastClientId
          await supabase.from('clients').update(clientPayload).eq('id', clientId)
        } else {
          const { data: newClient, error } = await supabase.from('clients').insert(clientPayload).select('id').single()
          if (error) throw new Error(`依頼者の保存に失敗: ${error.message}`)
          clientId = newClient.id
        }
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
        deal_name: mainName || '無題',
        status: formData.caseStatus || '検討中',
        meeting_type: formData.meetingType || null,
        proposal_note: formData.proposalNote || null,
        meeting_owner_id: currentMemberId || null,
        difficulty,
        service_category: formData.serviceCategories[0] || null,
        service_category_2: formData.serviceCategories[1] || null,
        // 受注区分パート（順序付き）。一覧/旧読み取り互換のため①②と procedure_type も併せて保持。
        service_parts: formData.serviceCategories.length > 0 ? buildParts(formData.serviceCategories) : null,
        procedure_type: formData.serviceCategories.length > 0 ? formData.serviceCategories : null,
        client_response_due_date: formData.clientResponseDueDate || null,
        consideration_period: formData.considerationPeriod || null,
        meeting_executed_date: formData.meetingDate || null,
        order_route: formData.orderRoute || null,
        order_route_detail: formData.orderRouteDetail || null,
        meeting_place: formData.meetingPlace || null,
        meeting_hearing_memo: formData.hearingMemo || null,
        meeting_other_notes: formData.otherNotes || null,
        consideration_decline_reason: formData.considerationDeclineReason || null,
        consideration_decline_reason_detail: formData.considerationDeclineReasonDetail || null,
        expected_completion_date: formData.expectedCompletionDate || null,
        intake_roles: formData.intakeRoles,
        // 郵送・書類設定／依頼者特徴（メイン依頼者）
        mailing_destination: formData.mailingDestination || null,
        mailing_address_other: formData.mailingDestination === 'その他' ? (formData.mailingAddressOther || null) : null,
        client_trait: formData.clientTrait || null,
        client_trait_detail: formData.clientTraitDetail || null,
        // 被相続人情報（検討中段階で契約書・委任状にプリセット）
        deceased_name: formData.deceasedName.trim() || null,
        deceased_furigana: formData.deceasedKana.trim() || null,
        deceased_birth_date: formData.deceasedBirthday || null,
        date_of_death: formData.dateOfDeath || null,
        deceased_age: ageAtDeath(formData.deceasedBirthday, formData.dateOfDeath),
        deceased_postal_code: formData.deceasedPostalCode.trim() || null,
        deceased_address: formData.deceasedAddress.trim() || null,
        deceased_registered_address: formData.deceasedRegisteredAddress.trim() || null,
        deceased_has_special_chars: formData.deceasedHasSpecialChars,
        // 契約形態（検討中段階で設定 → 契約書・委任状のFMT推奨に使用）
        contract_type: formData.contractType || null,
        // LP担当の追いかけ運用
        lp_followup_allowed: formData.lpFollowupAllowed === '' ? null : formData.lpFollowupAllowed === '可',
        lp_followup_method: formData.lpFollowupMethod || null,
        lp_followup_method_other: formData.lpFollowupMethod === 'その他' ? (formData.lpFollowupMethodOther || null) : null,
        lp_followup_due_date: formData.lpFollowupDueDate || null,
      }

      if (isNew) {
        // 採番: YYMM + 経路コード + 当日連番4桁（経路問わず当日作成順）。例: 2606LP0001
        // 連番は「当日の既存番号の最大+1」で算出（件数+1だと削除で番号が再利用され重複するため）。
        const now = new Date()
        const yy = String(now.getFullYear()).slice(2)
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        const routeCode = ORDER_ROUTE_CODES[formData.orderRoute] ?? 'XX'
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
        const { data: todayCases } = await supabase.from('cases').select('case_number').gte('created_at', startOfDay)
        let seq = (todayCases ?? []).reduce((max, c) => {
          const n = parseInt(String(c.case_number ?? '').slice(-4), 10)
          return Number.isFinite(n) && n > max ? n : max
        }, 0) + 1

        // 一意制約(case_number)に当たったら連番を上げて自動リトライ（同時作成・削除ギャップ対策）
        let newCaseId: string | null = null
        let lastErrMsg = '不明なエラー'
        for (let attempt = 0; attempt < 20; attempt++) {
          const caseNumber = `${yy}${mm}${routeCode}${String(seq).padStart(4, '0')}`
          const { data: newCase, error } = await supabase.from('cases').insert({ ...casePayload, case_number: caseNumber }).select('id').single()
          if (!error && newCase) { newCaseId = newCase.id; break }
          lastErrMsg = error?.message ?? lastErrMsg
          if (error?.code === '23505') { seq += 1; continue }  // 番号重複 → 次の連番で再試行
          break  // それ以外のエラーは中断
        }
        if (!newCaseId) throw new Error(`案件の保存に失敗: ${lastErrMsg}`)
        caseId = newCaseId
        // 受注担当＝案件作成者を自動セット
        if (currentMemberId) {
          await supabase.from('case_members').insert({ case_id: caseId, member_id: currentMemberId, role: 'sales' })
        }
        // 契約手続きの受領書類（①）を contract_documents へ。入力済み（書類名 or 受領状況あり）のみ。
        // 「その場で受領」は面談当日に受領済とみなし、到着日(arrival_date)を面談実施日で埋める。
        // それ以外（後日郵送／依頼者が取得）は到着予定日(expected_arrival_date)として扱う。
        const onSpotDate = formData.meetingDate || new Date().toISOString().slice(0, 10)
        const docRows = formData.intakeDocuments
          .filter(d => d.name.trim() || d.status)
          .map((d, i) => {
            const onSpot = d.status === 'その場で受領'
            return {
              case_id: caseId,
              name: d.name.trim() || null,
              status: d.status || null,
              category: d.category || null,
              arrival_date: onSpot ? onSpotDate : null,
              expected_arrival_date: onSpot ? null : (d.arrival_date || null),
              notes: d.note || null,
              sort_order: i,
            }
          })
        if (docRows.length > 0) {
          await supabase.from('contract_documents').insert(docRows)
        }
      } else {
        const { error } = await supabase.from('cases').update(casePayload).eq('id', caseId)
        if (error) throw new Error(`案件の更新に失敗: ${error.message}`)
      }

      // 3-b. 依頼者（同行者含む）を case_clients に保存（全置換）
      await supabase.from('case_clients').delete().eq('case_id', caseId)
      const clientRows = formData.clients
        .filter(c => c.name.trim())
        .map((c, i) => ({
          case_id: caseId,
          name: c.name.trim(),
          furigana: c.kana || null,
          priority: c.priority,
          birth_date: c.birthday || null,
          relationship: c.relationship || null,
          phone: c.phone || null,
          mobile_phone: c.mobilePhone || null,
          email: c.email || null,
          sort_order: i,
        }))
      if (clientRows.length > 0) {
        const { error } = await supabase.from('case_clients').insert(clientRows)
        if (error) throw new Error(`依頼者の保存に失敗: ${error.message}`)
      }

      // 4. 他事業者紹介要否 → case_referrals（チェック分をupsert。未チェックの削除はタブ側で実施）
      //    税理士/不動産は依頼内容(content)も同時に保存（LP案件一覧の該当列のソースとなる）
      if (formData.referralPartners.length > 0) {
        const rows = formData.referralPartners.map(p => {
          const row: { case_id: string; partner_type: string; content?: string | null; content_detail?: string | null } = { case_id: caseId, partner_type: p }
          if (p === '税理士' && formData.taxAdvisorBusinessType) { row.content = formData.taxAdvisorBusinessType; row.content_detail = formData.taxAdvisorBusinessType }
          if (p === '不動産' && formData.realEstateRegistrationType) { row.content = formData.realEstateRegistrationType; row.content_detail = formData.realEstateRegistrationType }
          return row
        })
        await supabase.from('case_referrals').upsert(rows, { onConflict: 'case_id,partner_type' })
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
    // 基本情報: 検討中／検討中（契約書待ち）は検討期間が必須。見込み不明以外は回答予定日も必須。
    if (STEPS[step].id === 'basic' && RESPONSE_DUE_REQUIRED.has(data.caseStatus)) {
      if (!data.considerationPeriod) { setSaveError('検討期間を選択してください'); return }
      if (data.considerationPeriod !== '見込み不明' && !data.clientResponseDueDate) {
        setSaveError('お客様回答予定日を入力してください')
        return
      }
    }
    setSaveError('')
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      window.scrollTo(0, 0)
    } else {
      const caseId = await saveToDatabase(data)
      if (caseId) {
        showToast('案件を保存しました', 'success')
        if (standalone) {
          // スマホ独立ルート：案件詳細（初期対応タスクのポップアップ）には遷移せず完了画面を出す
          setDone(true)
          window.scrollTo(0, 0)
        } else {
          // created=1 で案件詳細を開くと、初期タスク確認ポップアップが表示される
          router.push(`/cases/${caseId}?created=1`)
        }
      }
    }
  }, [step, data, saveToDatabase, router, standalone])

  const prevStep = useCallback(() => {
    if (step > 0) {
      setStep(step - 1)
      window.scrollTo(0, 0)
    }
  }, [step])


  const renderStep = () => {
    switch (STEPS[step].id) {
      case 'basic': return (
        <div className="max-w-[800px]">
          <p className="text-[12px] text-gray-400 mb-3">面談報告の項目（案件番号は自動採番。詳細はオーダーシートで入力）</p>
          <Card label="面談ルート（紹介元）">
            {(() => {
              const isLpLinked = selectedCase.id !== 'new'
              const routeOptions = isLpLinked ? [...ORDER_ROUTES] : ORDER_ROUTES.filter(r => r !== 'LP経由')
              return <Pills value={data.orderRoute} options={routeOptions} onChange={v => { update('orderRoute', v as string); update('orderRouteDetail', ''); update('pastClientId', '') }} disabled={isLpLinked} />
            })()}
            {data.orderRoute && (
              <div className="mt-3">
                {selectedCase.id !== 'new' ? (
                  <div className="py-1.5">
                    <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">詳細（紹介元）</div>
                    <div className="w-full bg-gray-100 border-[1.5px] border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-500 cursor-not-allowed">{data.orderRouteDetail || '未設定'}</div>
                  </div>
                ) : data.orderRoute === PAST_CLIENT_ROUTE ? (
                  <PastClientLookup
                    label="詳細（過去の依頼者）"
                    value={data.pastClientId}
                    displayName={data.orderRouteDetail}
                    onSelect={(id, name) => { update('pastClientId', id); update('orderRouteDetail', name) }}
                  />
                ) : data.orderRoute === 'HP経由' ? (
                  <div className="py-1.5">
                    <div className="text-[12px] font-semibold text-gray-400 tracking-wide mb-1">詳細（紹介元）</div>
                    <Select value={data.orderRouteDetail} options={[...HP_SOURCES]} onChange={name => update('orderRouteDetail', name)} placeholder="HP経由の紹介元を選択" />
                  </div>
                ) : (
                  <ReferralSourceLookup
                    label="詳細（紹介元）"
                    route={data.orderRoute}
                    value={data.orderRouteDetail}
                    onChange={name => update('orderRouteDetail', name)}
                    staticOptions={data.orderRoute === '葬儀社経由' ? [...FUNERAL_COMPANIES] : data.orderRoute === '税理士経由' ? [...TAX_ADVISOR_COMPANIES] : undefined}
                  />
                )}
              </div>
            )}
          </Card>
          <Card label="顧客名（依頼者名）" required>
            <Input value={data.clients[0]?.name ?? ''} onChange={v => updateClient(0, { name: v })} placeholder="例: 服部 雅弘" />
          </Card>
          <Card label="面談内容"><Input value={data.meetingType} onChange={v => update('meetingType', v)} placeholder="新規面談" /></Card>
          <Card label="面談結果" required><Select value={data.caseStatus} options={STATUS_OPTIONS} onChange={v => update('caseStatus', v)} noEmpty /></Card>

          {/* 検討中・検討中(契約書待ち)のときだけ、面談結果の直下に検討期間→理由→(LP経由なら)追いかけ を表示 */}
          {RESPONSE_DUE_REQUIRED.has(data.caseStatus) && (
            <>
              <Card label="検討期間" required><Select value={data.considerationPeriod} options={[...CONSIDERATION_PERIODS]} onChange={v => selectPeriod(v)} placeholder="検討期間を選択" /></Card>
              {data.considerationPeriod && data.considerationPeriod !== '見込み不明' && (
                <Card label="お客様回答予定日" required>
                  <Input type="date" value={data.clientResponseDueDate} onChange={v => update('clientResponseDueDate', v)} max={considerationDueMax(data.considerationPeriod) ?? undefined} />
                  <p className="mt-1 text-[11px] text-gray-400">「{data.considerationPeriod}」以内（〜{considerationDueMax(data.considerationPeriod)}）で選べます。</p>
                </Card>
              )}
            </>
          )}
          {/* 検討中・不受託理由: 検討中 / 不受託 で表示（旧 失注理由の置換） */}
          {DECLINE_REASON_REQUIRED.has(data.caseStatus) && (
            <>
              <Card label={data.caseStatus === '失注' ? '不受託理由' : '検討中理由'}>
                <Select
                  value={data.considerationDeclineReason}
                  options={CONSIDERATION_DECLINE_REASONS.filter(r => r.startsWith(data.caseStatus === '失注' ? '【不受託】' : '【検討】'))}
                  onChange={v => update('considerationDeclineReason', v)}
                  placeholder="理由を選択"
                />
              </Card>
              <Card label="備考">
                <Textarea value={data.considerationDeclineReasonDetail} onChange={v => update('considerationDeclineReasonDetail', v)} placeholder="理由の詳細を自由に入力（任意）" />
              </Card>
            </>
          )}
          {/* LP担当追いかけ運用: 検討中系 かつ LP経由 のときだけ。理由の下に表示。 */}
          {LP_FOLLOWUP_VISIBLE.has(data.caseStatus) && data.orderRoute === 'LP経由' && (
            <>
              <Card label="LPによる追いかけ可否">
                <Select value={data.lpFollowupAllowed} options={['可', '不可']} onChange={v => update('lpFollowupAllowed', v as '' | '可' | '不可')} placeholder="未設定" />
                <p className="mt-1 text-[11px] text-gray-400">LP担当がこの案件を電話等で追いかけて良いかどうか。</p>
              </Card>
              {data.lpFollowupAllowed === '可' && (
                <>
                  <Card label="連絡方法">
                    <Select value={data.lpFollowupMethod} options={[...LP_FOLLOWUP_METHODS]} onChange={v => update('lpFollowupMethod', v)} placeholder="連絡方法を選択" />
                  </Card>
                  <Card label="追いかけ期限日">
                    <Input type="date" value={data.lpFollowupDueDate} onChange={v => update('lpFollowupDueDate', v)} />
                  </Card>
                </>
              )}
            </>
          )}

          <Card label="手続内容（受注区分）">
            <Pills multi value={data.serviceCategories} options={data.caseStatus === '検討中' ? [...ORDER_CATEGORIES, '提案できず'] : [...ORDER_CATEGORIES]} onChange={v => setServiceCategories(v as string[])} />
          </Card>
          <Card label="提案金額"><Input value={data.proposalNote} onChange={v => update('proposalNote', v)} placeholder="例: 提案せず / 330,000円" /></Card>
          {/* 完了予定日は受注/検討中（契約書待ち）のときだけ */}
          {CONTRACT_FIELDS_VISIBLE.has(data.caseStatus) && (
            <Card label="完了予定日"><Input type="date" value={data.expectedCompletionDate} onChange={v => update('expectedCompletionDate', v)} /></Card>
          )}
          <Card label="不動産売却（他事業者紹介・不動産）">
            <div className="flex gap-2 items-start">
              <div className="w-28 flex-none"><Select value={data.referralPartners.includes('不動産') ? 'あり' : 'なし'} options={['あり', 'なし']} noEmpty onChange={v => update('referralPartners', v === 'あり' ? [...new Set([...data.referralPartners, '不動産'])] : data.referralPartners.filter(x => x !== '不動産'))} /></div>
              <div className="flex-1"><Input value={data.realEstateRegistrationType} onChange={v => update('realEstateRegistrationType', v)} placeholder="備考を記載" /></div>
            </div>
          </Card>
          <Card label="税理士（他事業者紹介・税理士）">
            <div className="flex gap-2 items-start">
              <div className="w-28 flex-none"><Select value={data.referralPartners.includes('税理士') ? 'あり' : 'なし'} options={['あり', 'なし']} noEmpty onChange={v => update('referralPartners', v === 'あり' ? [...new Set([...data.referralPartners, '税理士'])] : data.referralPartners.filter(x => x !== '税理士'))} /></div>
              <div className="flex-1"><Input value={data.taxAdvisorBusinessType} onChange={v => update('taxAdvisorBusinessType', v)} placeholder="備考を記載" /></div>
            </div>
          </Card>
        </div>
      )
      case 'client': return (
        <div className="max-w-[1240px]">
          <SectionHeader Icon={User} title="依頼者情報" sub="面談に来られた方を入力（同行者も追加できます）" />
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <table className="w-full text-[13px] border-collapse" style={{ minWidth: 1180 }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
                  <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 110 }}>優先度</th>
                  <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 120 }}>氏名</th>
                  <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 120 }}>ふりがな</th>
                  <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 90 }}>続柄</th>
                  <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 120 }}>固定電話</th>
                  <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 120 }}>携帯電話</th>
                  <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 130 }}>メール</th>
                  <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 270 }}>生年月日</th>
                  <th className="px-2 py-2 text-center font-semibold w-14">年齢</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {data.clients.map((c, i) => {
                  const age = calcAge(c.birthday)
                  return (
                    <tr key={i} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-2 py-1.5">
                        <select value={c.priority} onChange={e => updateClient(i, { priority: e.target.value as ClientPerson['priority'] })} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-400">
                          <option value="main">メイン依頼人</option>
                          <option value="companion">同行者</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><CellInput value={c.name} onChange={v => updateClient(i, { name: v })} placeholder="山田 太郎" /></td>
                      <td className="px-2 py-1.5"><CellInput value={c.kana} onChange={v => updateClient(i, { kana: v })} placeholder="やまだ たろう" /></td>
                      <td className="px-2 py-1.5">
                        <select value={c.relationship} onChange={e => updateClient(i, { relationship: e.target.value })} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-400">
                          <option value="">続柄</option>
                          {HEIR_RELATIONSHIPS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><CellInput type="tel" value={c.phone} onChange={v => updateClient(i, { phone: v })} placeholder="03-..." /></td>
                      <td className="px-2 py-1.5"><CellInput type="tel" value={c.mobilePhone} onChange={v => updateClient(i, { mobilePhone: v })} placeholder="090-..." /></td>
                      <td className="px-2 py-1.5"><CellInput type="email" value={c.email} onChange={v => updateClient(i, { email: v })} placeholder="mail@..." /></td>
                      <td className="px-2 py-1.5"><BirthdayPicker value={c.birthday} onChange={v => updateClient(i, { birthday: v })} /></td>
                      <td className="px-2 py-1.5 text-center font-mono text-gray-700">{age != null ? `${age}` : <span className="text-gray-300">—</span>}</td>
                      <td className="px-2 py-1.5 text-center">
                        {data.clients.length > 1 && (
                          <button type="button" onClick={() => removeClient(i)} className="text-gray-300 hover:text-red-500 transition-colors" title="削除">✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addClient}
            className="mt-3 w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-brand-600 text-sm font-semibold hover:border-brand-400 hover:bg-brand-50 transition"
          >
            ＋ 依頼者を追加
          </button>

          {/* メイン依頼者の住所（書類・請求で使う正本） */}
          <div className="mt-6 max-w-[800px]">
            <SectionHeader Icon={User} title="メイン依頼者の住所・郵送・特徴" sub="メイン依頼者の住所と郵送先・特徴を登録" />
            <Card label="郵便番号">
              <Input
                value={data.postalCode}
                onChange={async v => {
                  const z = v.replace(/[^0-9]/g, '')
                  update('postalCode', z)
                  // 7桁入力で住所を自動補完（入れ直したら上書き。番地・建物は追記）
                  if (z.length === 7) {
                    const addr = await lookupPostalAddress(z)
                    if (addr) update('address', addr)
                  }
                }}
                placeholder="4600008（7桁入力で住所自動入力）"
              />
            </Card>
            <Card label="依頼者住所"><Input value={data.address} onChange={v => update('address', v)} placeholder="愛知県名古屋市中区栄…" /></Card>
            {/* 振込名義人（カナ）＝入金CSV突合キー。最大3つ。1つ目だけ「依頼者と同じ」ボタン。
                「検討中」段階では入金が発生しないため表示しない（受注後に入力）。 */}
            {data.caseStatus !== '検討中' && (
              <Card label="振込名義人（カナ・最大3つ）">
                <Input value={data.transferNameKana} onChange={v => update('transferNameKana', v)} placeholder="ヤマダ タロウ（カタカナ）／入金CSV突合に使用" />
                {(data.clients.find(c => c.priority === 'main') ?? data.clients[0])?.kana && (
                  <button
                    type="button"
                    onClick={() => update('transferNameKana', toKatakana((data.clients.find(c => c.priority === 'main') ?? data.clients[0])?.kana ?? ''))}
                    className="mt-1.5 text-[11px] font-medium text-brand-600 hover:text-brand-700 px-1.5 py-0.5 rounded border border-brand-200 bg-brand-50"
                  >依頼者と同じ</button>
                )}
                <div className="mt-2 space-y-2">
                  <Input value={data.transferNameKana2} onChange={v => update('transferNameKana2', v)} placeholder="2つ目（任意）" />
                  <Input value={data.transferNameKana3} onChange={v => update('transferNameKana3', v)} placeholder="3つ目（任意）" />
                </div>
              </Card>
            )}

            {/* 郵送・書類設定 */}
            <Card label="顧客郵送先"><Pills value={data.mailingDestination} options={[...MAILING_DESTINATIONS]} onChange={v => update('mailingDestination', v as string)} /></Card>
            {data.mailingDestination === '依頼者住所' ? (
              <Card label="郵送先住所（メイン依頼者・自動）">
                <div className="text-[13px] text-gray-600 px-1 py-1.5">{[data.postalCode, data.address].filter(Boolean).join('　') || <span className="text-gray-400">住所未登録（上のメイン依頼者の住所で入力）</span>}</div>
              </Card>
            ) : data.mailingDestination === 'その他' ? (
              <Card label="郵送先住所（その他）"><Input value={data.mailingAddressOther} onChange={v => update('mailingAddressOther', v)} placeholder="送付先の住所" /></Card>
            ) : null}

            {/* 依頼者特徴 */}
            <Card label="特徴">
              <div className="flex items-center gap-2">
                {TRAIT_OPTIONS.map(t => {
                  const active = data.clientTrait === t.key
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => update('clientTrait', active ? '' : t.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[13px] transition-all ${
                        active
                          ? 'bg-brand-50 border-brand-300 text-brand-700 font-semibold ring-2 ring-brand-200'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      title={active ? `${t.label}（クリックで解除）` : t.label}
                    >
                      <span className="text-[18px] leading-none">{t.emoji}</span>
                      <span>{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </Card>
            <Card label="依頼者特徴詳細"><Textarea value={data.clientTraitDetail} onChange={v => update('clientTraitDetail', v)} placeholder="例：この人はこういう性格だから、連絡はまめに取った方がいい。" /></Card>
          </div>
        </div>
      )
      case 'deceased': return (
        <div className="max-w-[800px]">
          <SectionHeader Icon={User} title="被相続人情報" sub="検討中の段階で契約書・委任状に氏名・住所等をプリセットするため、面談時に入力" />
          <Card label="被相続人氏名"><Input value={data.deceasedName} onChange={v => update('deceasedName', v)} placeholder="山田 花子" /></Card>
          <Card label="被相続人ふりがな"><Input value={data.deceasedKana} onChange={v => update('deceasedKana', v)} placeholder="やまだ はなこ" /></Card>
          <Card label="被相続人生年月日"><BirthdayPicker value={data.deceasedBirthday} onChange={v => update('deceasedBirthday', v)} /></Card>
          <Card label="相続開始日（死亡日）"><BirthdayPicker value={data.dateOfDeath} onChange={v => update('dateOfDeath', v)} /></Card>
          <Card label="被相続人年齢（享年・自動計算）">
            <div className="text-[14px] text-gray-800 px-1 py-1.5">
              {ageAtDeath(data.deceasedBirthday, data.dateOfDeath) != null
                ? `${ageAtDeath(data.deceasedBirthday, data.dateOfDeath)} 歳`
                : <span className="text-gray-400 text-[13px]">生年月日と死亡日を入力すると自動計算されます</span>}
            </div>
          </Card>
          <Card label="被相続人郵便番号"><Input value={data.deceasedPostalCode} onChange={async v => {
            const z = v.replace(/[^0-9]/g, '')
            update('deceasedPostalCode', z)
            if (z.length === 7) {
              const addr = await lookupPostalAddress(z)
              if (addr) update('deceasedAddress', addr)
            }
          }} placeholder="1000131（7桁入力で住所自動入力）" /></Card>
          <Card label="被相続人住所"><Input value={data.deceasedAddress} onChange={v => update('deceasedAddress', v)} placeholder="被相続人の最後の住所" /></Card>
          <Card label="被相続人本籍"><Input value={data.deceasedRegisteredAddress} onChange={v => update('deceasedRegisteredAddress', v)} placeholder="被相続人の本籍" /></Card>
          <Card label="被相続人外字有無">
            <label className="flex items-center gap-2 cursor-pointer text-[13px] text-gray-700">
              <input type="checkbox" checked={data.deceasedHasSpecialChars} onChange={e => update('deceasedHasSpecialChars', e.target.checked)} className="w-4 h-4 accent-brand-600" />
              外字あり
            </label>
          </Card>
        </div>
      )
      case 'meeting': return (
        <div className="max-w-[800px]">
          <SectionHeader Icon={FileText} title="面談内容" sub="面談で確認した内容・受注見込み" />
          <Card label="ヒアリング内容メモ"><Textarea value={data.hearingMemo} onChange={v => update('hearingMemo', v)} placeholder={HEARING_MEMO_SAMPLE} /></Card>
          {/* 受注区分は受注確定時に決まる情報。検討中では非表示（後で面談情報タブで入力） */}
          {REFERRAL_FIELDS_VISIBLE.has(data.caseStatus) && (
            <Card label="受注区分（複数選択できます）">
              <Pills value={data.serviceCategories} options={[...ORDER_CATEGORIES]} onChange={v => setServiceCategories(v as string[])} multi />
              {data.serviceCategories.length > 1 && (
                <p className="mt-2.5 text-[12px] text-gray-500">
                  進行順：{data.serviceCategories.map((k, i) => `${'①②③④⑤'[i] ?? `(${i + 1})`} ${k}`).join(' → ')}（先行→本体で自動・前から順に進みます）
                </p>
              )}
            </Card>
          )}
          {/* 受託確定前(検討中/不受託)では契約・業務関連項目を隠す。
              検討中→受託に変わった後は、案件詳細のオーダーシートで入力する想定。 */}
          {REFERRAL_FIELDS_VISIBLE.has(data.caseStatus) && (
            <>
              {data.serviceCategories.includes(REFERRAL_ONLY_CATEGORY) ? (
                // 紹介のみ：自社手続きなし → 業務・作業を出さず、紹介先（他事業者紹介）を埋める
                <Card label="紹介先（自社手続きはありません）">
                  <p className="text-[12px] text-gray-400 mb-2">紹介のみは自社で行う相続手続きはありません。専門家への紹介先を選んでください（法人名・紹介日・見込み報酬などの詳細は案件詳細の「他事業者紹介」タブで入力）。</p>
                  <Pills value={data.referralPartners} options={[...REFERRAL_PARTNER_TYPES]} onChange={v => update('referralPartners', v as string[])} multi />
                </Card>
              ) : CONTRACT_FIELDS_VISIBLE.has(data.caseStatus) ? (
                <Card label="役割分担（自社 / 依頼者 どちらが行うか）">
                  {data.serviceCategories.length > 0 ? (
                    <>
                      <p className="text-[12px] text-gray-400 mb-2">{data.serviceCategories.length > 1 ? '選んだ区分の業務がまとめて表示されます（重複する業務は1つ）。' : '受注区分の業務が全選択で表示されます。'}やらない業務は外してください。作業ごとに担当（既定=自社）を変更できます。</p>
                      <IntakeRolesEditor
                        roles={data.intakeRoles}
                        onSave={v => update('intakeRoles', v)}
                        gyomuOptions={gyomuForCategories(data.serviceCategories)}
                        presetFor={g => tasksForCategories(data.serviceCategories, g).filter(t => !isOptionalTask(t.task)).map(t => t.task)}
                        addableFor={g => tasksForCategories(data.serviceCategories, g).map(t => ({ task: t.task, kind: kindForTask(data.serviceCategories, g, t.task) }))}
                        kindFor={(g, s) => kindForTask(data.serviceCategories, g, s)}
                      />
                    </>
                  ) : (
                    <p className="text-[12px] text-gray-400">先に「受注区分」を選んでください。</p>
                  )}
                </Card>
              ) : null}
              {CONTRACT_FIELDS_VISIBLE.has(data.caseStatus) && (
              <Card label="契約手続き（契約関連書類の受け取り）">
                {!data.serviceCategories.includes(REFERRAL_ONLY_CATEGORY) && clientReflectCandidates(data.intakeRoles).length > 0 && (
                  <div className="mb-2.5">
                    <button type="button" onClick={() => setReflectOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100">
                      ＋ 依頼者取得分を契約手続きに反映
                    </button>
                    <span className="ml-2 text-[11px] text-gray-400">役割分担で依頼者にした業務を、契約時にもらう書類として選んで追加</span>
                  </div>
                )}
                <IntakeDocsEditor docs={data.intakeDocuments} onSave={v => update('intakeDocuments', v)} />
                <ClientDocsReflectModal
                  isOpen={reflectOpen}
                  onClose={() => setReflectOpen(false)}
                  candidates={clientReflectCandidates(data.intakeRoles)}
                  existingNames={data.intakeDocuments.map(d => d.name.trim())}
                  onConfirm={addReflectedDocs}
                />
              </Card>
              )}
              {/* 紹介のみは上の「紹介先」で選ぶため、重複する他事業者紹介要否カードは隠す */}
              {!data.serviceCategories.includes(REFERRAL_ONLY_CATEGORY) && (
                <Card label="他事業者紹介要否"><Pills value={data.referralPartners} options={[...REFERRAL_PARTNER_TYPES]} onChange={v => update('referralPartners', v as string[])} multi /></Card>
              )}
              {/* 税理士／不動産が選ばれた場合、依頼内容（リスト選択）を入力。
                  この値は LP案件一覧の「税理士業務」「不動産登記」列にも反映される（同一データ）。 */}
              {data.referralPartners.includes('税理士') && (
                <Card label="税理士業務（依頼内容）">
                  <Pills value={data.taxAdvisorBusinessType} options={[...TAX_ADVISOR_BUSINESS_OPTIONS]} onChange={v => update('taxAdvisorBusinessType', v as string)} />
                  <p className="mt-1 text-[11px] text-gray-400">LP案件一覧の「税理士業務」列にもこの値が表示されます。</p>
                </Card>
              )}
              {data.referralPartners.includes('不動産') && (
                <Card label="不動産登記（依頼内容）">
                  <Pills value={data.realEstateRegistrationType} options={[...REAL_ESTATE_REGISTRATION_OPTIONS]} onChange={v => update('realEstateRegistrationType', v as string)} />
                  <p className="mt-1 text-[11px] text-gray-400">LP案件一覧の「不動産登記」列にもこの値が表示されます。</p>
                </Card>
              )}
              {CONTRACT_FIELDS_VISIBLE.has(data.caseStatus) && (
                <>
                  <Card label="契約形態"><Pills value={data.contractType} options={[...CONTRACT_TYPES]} onChange={v => update('contractType', v as string)} /></Card>
                  <Card label="難易度"><Pills value={data.difficulty} options={['高', '中', '低']} onChange={v => update('difficulty', v as string)} /></Card>
                  <Card label="完了予定日"><Input type="date" value={data.expectedCompletionDate} onChange={v => update('expectedCompletionDate', v)} /></Card>
                </>
              )}
            </>
          )}
          <Card label="その他備考"><Textarea value={data.otherNotes} onChange={v => update('otherNotes', v)} placeholder="その他特記事項があれば記入" /></Card>
        </div>
      )
      case 'confirm': return (
        <div className="max-w-[800px]">
          <SectionHeader Icon={CheckCircle2} title="入力内容の確認" sub="内容を確認して「完了」してください" />
          {saveError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">{saveError}</div>}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <ConfirmSection title="基本情報">
              <ConfirmRow label="案件管理番号" value="（保存時に自動採番）" />
              <ConfirmRow label="面談実施日" value={data.meetingDate} />
              <ConfirmRow label="面談ルート" value={data.orderRoute + (data.orderRouteDetail ? `（${data.orderRouteDetail}）` : '')} />
              <ConfirmRow label="面談結果" value={getCaseStatusLabel(data.caseStatus)} />
              {RESPONSE_DUE_REQUIRED.has(data.caseStatus) && <ConfirmRow label="検討期間" value={data.considerationPeriod} />}
              {RESPONSE_DUE_REQUIRED.has(data.caseStatus) && data.considerationPeriod !== '見込み不明' && <ConfirmRow label="お客様回答予定日" value={data.clientResponseDueDate} />}
            </ConfirmSection>
            <ConfirmSection title="依頼者">
              <ConfirmRow label="メイン依頼人" value={(data.clients.find(c => c.priority === 'main') ?? data.clients[0])?.name ?? ''} />
              <ConfirmRow label="人数" value={`${data.clients.filter(c => c.name.trim()).length}名`} />
              <ConfirmRow label="メイン依頼者の住所" value={[data.postalCode, data.address].filter(Boolean).join('　')} />
              <ConfirmRow label="顧客郵送先" value={data.mailingDestination === 'その他' ? `その他（${data.mailingAddressOther}）` : data.mailingDestination} />
              <ConfirmRow label="依頼者特徴" value={TRAIT_OPTIONS.find(t => t.key === data.clientTrait)?.label ?? ''} />
            </ConfirmSection>
            <ConfirmSection title="面談内容">
              <ConfirmRow label="受注区分" value={data.serviceCategories.join('・') || '（未選択）'} />
              <ConfirmRow label="他事業者紹介" value={data.referralPartners.join(', ')} />
              <ConfirmRow label="難易度" value={data.difficulty} />
              <ConfirmRow label="検討中・不受託理由" value={data.considerationDeclineReason} />
            </ConfirmSection>
          </div>
        </div>
      )
      default: return null
    }
  }

  // スマホ独立ルートの登録完了画面
  if (done) {
    return (
      <div className="max-w-[520px] mx-auto text-center py-10">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-50 border border-green-200 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-9 h-9 text-green-600" strokeWidth={2} />
        </div>
        <div className="text-lg font-bold text-gray-900 mb-1">登録が完了しました</div>
        <p className="text-[13px] text-gray-500 mb-7">相談案件を登録しました。続けて登録する場合は案件選択へ戻ってください。</p>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => { onBack?.(); window.scrollTo(0, 0) }}
            className="w-full py-3 rounded-lg bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition"
          >
            案件選択画面に戻る
          </button>
          <button
            type="button"
            onClick={() => { window.close(); window.location.href = '/register' }}
            className="w-full py-3 rounded-lg border-[1.5px] border-gray-200 bg-white text-gray-600 text-sm font-semibold hover:bg-gray-50 transition"
          >
            アプリを閉じる
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 1ページ構成（ステップバー・プログレスは廃止） */}
      {renderStep()}

      {/* Bottom nav（モバイルは全幅で押しやすく） */}
      <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2.5 pt-4 mt-2 border-t border-gray-200">
        {step > 0 && (
          <button onClick={prevStep} className="w-full md:w-auto px-5 py-3 rounded-lg border-[1.5px] border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition">
            ← 戻る
          </button>
        )}
        <button
          onClick={nextStep}
          className={`w-full md:w-auto px-8 py-3 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 transition shadow-sm ${
            step === STEPS.length - 1
              ? 'bg-green-600 hover:bg-green-700 shadow-green-500/25'
              : 'bg-brand-600 hover:bg-brand-700 shadow-brand-500/25'
          }`}
        >
          {step === STEPS.length - 1 ? (saving ? '保存中...' : '登録する') : '次へ →'}
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
