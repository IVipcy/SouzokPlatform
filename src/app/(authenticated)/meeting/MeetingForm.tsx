'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, User, FileText, CheckCircle2, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import BirthdayPicker from '@/components/ui/BirthdayPicker'
import type { SelectedCase } from './MeetingPageClient'
import { STEPS, INITIAL_DATA, EMPTY_CLIENT, type FormData, type ClientPerson } from './formData'
import {
  MEETING_SELECTABLE_STATUSES, getCaseStatusLabel,
  LOST_REASONS, REFERRAL_PARTNER_TYPES, MAILING_DESTINATIONS,
  ORDER_ROUTES, ORDER_ROUTE_CODES, PAST_CLIENT_ROUTE,
  CONSIDERATION_PERIODS, considerationDueMax,
} from '@/lib/constants'
import {
  ORDER_CATEGORIES, REFERRAL_ONLY_CATEGORY, KENIN_CATEGORY, KENIN_COMBO_SECONDARY,
  categoriesOf, gyomuForCategories, tasksForCategories, seedRolesForCategories,
} from '@/lib/serviceMaster'
import ReferralSourceLookup from '@/components/features/cases/ReferralSourceLookup'
import PastClientLookup from '@/components/features/cases/PastClientLookup'
import { IntakeRolesEditor, IntakeDocsEditor, type RoleRow } from '@/components/features/cases/ProcedureIntakeSection'

type Props = {
  selectedCase: NonNullable<SelectedCase>
  // 案件作成者（受注担当として自動セット）
  currentMemberId: string | null
}

// 案件作成は面談完了後のため「面談設定済」は選択肢から除外
const STATUS_OPTIONS = MEETING_SELECTABLE_STATUSES.filter(k => k !== '面談設定済').map(k => ({ key: k, label: getCaseStatusLabel(k) }))
// お客様回答予定日が必須になるステータス
const RESPONSE_DUE_REQUIRED = new Set(['検討中', '検討中（契約書待ち）'])
// 依頼者特徴（案件詳細の依頼者タブと同じ。1つ選択）
const TRAIT_OPTIONS: { key: 'smile' | 'neutral' | 'angry'; emoji: string; label: string }[] = [
  { key: 'smile',   emoji: '😊', label: '笑顔' },
  { key: 'neutral', emoji: '😐', label: '真顔' },
  { key: 'angry',   emoji: '😡', label: '怖い顔' },
]

// 生年月日から年齢を算出
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
    const init: FormData = { ...INITIAL_DATA, clients: INITIAL_DATA.clients.map(c => ({ ...c })) }
    if (selectedCase.id !== 'new') {
      init.clients[0] = { ...init.clients[0], name: selectedCase.client, phone: selectedCase.phone }
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

  // 受注区分①を選ぶ → 業務・作業を初期セット（区分変更時は入れ直し）。検認以外は②をクリア。
  const selectServiceCategory = (cat: string) => {
    if (cat === data.serviceCategory) return
    if (data.intakeRoles.length > 0 && !confirm('受注区分を変えると、業務・担当が新しい区分の初期値で入れ直されます。よろしいですか？')) return
    const newCat2 = cat === KENIN_CATEGORY ? data.serviceCategory2 : ''
    const seeded = (cat ? seedRolesForCategories(categoriesOf(cat, newCat2)) : []) as RoleRow[]
    setData(prev => ({ ...prev, serviceCategory: cat, serviceCategory2: newCat2, intakeRoles: seeded }))
  }

  // 検認①→手続き一式② の追加/解除
  const toggleFullService = (on: boolean) => {
    if (data.intakeRoles.length > 0 && !confirm('受注区分を変えると、業務・担当が入れ直されます。よろしいですか？')) return
    const newCat2 = on ? KENIN_COMBO_SECONDARY : ''
    const seeded = seedRolesForCategories(categoriesOf(data.serviceCategory, newCat2)) as RoleRow[]
    setData(prev => ({ ...prev, serviceCategory2: newCat2, intakeRoles: seeded }))
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
        difficulty,
        service_category: formData.serviceCategory || null,
        service_category_2: formData.serviceCategory2 || null,
        // 一覧表示の互換のため、受注区分①②を従来の手続区分(配列)にも反映
        procedure_type: formData.serviceCategory ? categoriesOf(formData.serviceCategory, formData.serviceCategory2) : null,
        client_response_due_date: formData.clientResponseDueDate || null,
        consideration_period: formData.considerationPeriod || null,
        meeting_executed_date: formData.meetingDate || null,
        order_route: formData.orderRoute || null,
        order_route_detail: formData.orderRouteDetail || null,
        meeting_place: formData.meetingPlace || null,
        meeting_hearing_memo: formData.hearingMemo || null,
        meeting_other_notes: formData.otherNotes || null,
        lost_reason: formData.lostReason || null,
        expected_completion_date: formData.expectedCompletionDate || null,
        intake_roles: formData.intakeRoles,
        // 郵送・書類設定／依頼者特徴（メイン依頼者）
        mailing_destination: formData.mailingDestination || null,
        mailing_address_other: formData.mailingDestination === 'その他' ? (formData.mailingAddressOther || null) : null,
        client_trait: formData.clientTrait || null,
        client_trait_detail: formData.clientTraitDetail || null,
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
        const docRows = formData.intakeDocuments
          .filter(d => d.name.trim() || d.status)
          .map((d, i) => ({
            case_id: caseId,
            name: d.name.trim() || null,
            status: d.status || null,
            expected_arrival_date: d.arrival_date || null,
            notes: d.note || null,
            sort_order: i,
          }))
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
          email: c.email || null,
          sort_order: i,
        }))
      if (clientRows.length > 0) {
        const { error } = await supabase.from('case_clients').insert(clientRows)
        if (error) throw new Error(`依頼者の保存に失敗: ${error.message}`)
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
    // 基本情報: 検討中／検討中（契約書待ち）は検討期間が必須。見込み不明以外は回答予定日も必須。
    if (STEPS[step].id === 'basic' && RESPONSE_DUE_REQUIRED.has(data.caseStatus)) {
      if (!data.considerationPeriod) { setSaveError('検討期間を選択してください'); return }
      if (data.considerationPeriod !== '見込み不明' && !data.clientResponseDueDate) {
        setSaveError('お客様回答予定日を入力してください')
        return
      }
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
        // created=1 で案件詳細を開くと、初期タスク確認ポップアップが表示される
        router.push(`/cases/${caseId}?created=1`)
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
          <SectionHeader Icon={ClipboardList} title="基本情報" sub="面談開始時に確認する項目（案件番号は自動採番）" />
          <Card label="面談実施日" required><Input type="date" value={data.meetingDate} onChange={v => update('meetingDate', v)} /></Card>
          <Card label="面談ルート">
            <Pills value={data.orderRoute} options={[...ORDER_ROUTES]} onChange={v => { update('orderRoute', v as string); update('orderRouteDetail', ''); update('pastClientId', '') }} />
            {data.orderRoute && (
              <div className="mt-3">
                {data.orderRoute === PAST_CLIENT_ROUTE ? (
                  <PastClientLookup
                    label="詳細（過去の依頼者）"
                    value={data.pastClientId}
                    displayName={data.orderRouteDetail}
                    onSelect={(id, name) => { update('pastClientId', id); update('orderRouteDetail', name) }}
                  />
                ) : (
                  <ReferralSourceLookup
                    label="詳細（紹介元）"
                    route={data.orderRoute}
                    value={data.orderRouteDetail}
                    onChange={name => update('orderRouteDetail', name)}
                  />
                )}
              </div>
            )}
          </Card>
          <Card label="面談結果" required><StatusPills value={data.caseStatus} onChange={v => update('caseStatus', v)} /></Card>
          {RESPONSE_DUE_REQUIRED.has(data.caseStatus) && (
            <>
              <Card label="検討期間" required><Pills value={data.considerationPeriod} options={[...CONSIDERATION_PERIODS]} onChange={v => selectPeriod(v as string)} /></Card>
              {data.considerationPeriod && data.considerationPeriod !== '見込み不明' && (
                <Card label="お客様回答予定日" required>
                  <Input type="date" value={data.clientResponseDueDate} onChange={v => update('clientResponseDueDate', v)} max={considerationDueMax(data.considerationPeriod) ?? undefined} />
                  <p className="mt-1 text-[11px] text-gray-400">「{data.considerationPeriod}」以内（〜{considerationDueMax(data.considerationPeriod)}）で選べます。</p>
                </Card>
              )}
            </>
          )}
        </div>
      )
      case 'client': return (
        <div className="max-w-[1000px]">
          <SectionHeader Icon={User} title="依頼者情報" sub="面談に来られた方を入力（同行者も追加できます）" />
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <table className="w-full text-[13px] border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[12px] text-gray-500">
                  <th className="px-2 py-2 text-left font-semibold w-28">優先度</th>
                  <th className="px-2 py-2 text-left font-semibold">氏名</th>
                  <th className="px-2 py-2 text-left font-semibold">ふりがな</th>
                  <th className="px-2 py-2 text-left font-semibold w-28">続柄</th>
                  <th className="px-2 py-2 text-left font-semibold">TEL</th>
                  <th className="px-2 py-2 text-left font-semibold">メール</th>
                  <th className="px-2 py-2 text-left font-semibold w-36">生年月日</th>
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
                      <td className="px-2 py-1.5"><CellInput value={c.relationship} onChange={v => updateClient(i, { relationship: v })} placeholder="長男 等" /></td>
                      <td className="px-2 py-1.5"><CellInput type="tel" value={c.phone} onChange={v => updateClient(i, { phone: v })} placeholder="090-..." /></td>
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
            <Card label="郵便番号"><Input value={data.postalCode} onChange={v => update('postalCode', v.replace(/[^0-9]/g, ''))} placeholder="4600008" /></Card>
            <Card label="依頼者住所"><Input value={data.address} onChange={v => update('address', v)} placeholder="愛知県名古屋市中区栄…" /></Card>

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
      case 'meeting': return (
        <div className="max-w-[800px]">
          <SectionHeader Icon={FileText} title="面談内容" sub="面談で確認した内容・受注見込み" />
          <Card label="ヒアリング内容メモ"><Textarea value={data.hearingMemo} onChange={v => update('hearingMemo', v)} placeholder="面談で聞き取った内容" /></Card>
          <Card label="受注区分（1つ選択）">
            <Pills value={data.serviceCategory} options={[...ORDER_CATEGORIES]} onChange={v => selectServiceCategory(v as string)} />
            {data.serviceCategory === KENIN_CATEGORY && (
              <label className="mt-2.5 flex items-center gap-2 cursor-pointer text-[13px] text-gray-700">
                <input type="checkbox" checked={data.serviceCategory2 === KENIN_COMBO_SECONDARY} onChange={e => toggleFullService(e.target.checked)} className="w-4 h-4 accent-brand-600" />
                手続き一式へ移行する（検認① → 手続き一式②。重複する業務は表示しません）
              </label>
            )}
          </Card>
          {data.serviceCategory === REFERRAL_ONLY_CATEGORY ? (
            // 紹介のみ：自社手続きなし → 業務・作業を出さず、紹介先（他事業者紹介）を埋める
            <Card label="紹介先（自社手続きはありません）">
              <p className="text-[12px] text-gray-400 mb-2">紹介のみは自社で行う相続手続きはありません。専門家への紹介先を選んでください（法人名・紹介日・見込み報酬などの詳細は案件詳細の「他事業者紹介」タブで入力）。</p>
              <Pills value={data.referralPartners} options={[...REFERRAL_PARTNER_TYPES]} onChange={v => update('referralPartners', v as string[])} multi />
            </Card>
          ) : (
            <Card label="役割分担（自社 / 依頼者 どちらが行うか）">
              {data.serviceCategory ? (
                <>
                  <p className="text-[12px] text-gray-400 mb-2">{data.serviceCategory2 ? '検認①→手続き一式②の業務が表示されます（重複は先の区分優先）。' : '受注区分の業務が全選択で表示されます。'}やらない業務は外してください。作業ごとに担当（既定=自社）を変更できます。</p>
                  <IntakeRolesEditor
                    roles={data.intakeRoles}
                    onSave={v => update('intakeRoles', v)}
                    gyomuOptions={gyomuForCategories(categoriesOf(data.serviceCategory, data.serviceCategory2))}
                    presetFor={g => tasksForCategories(categoriesOf(data.serviceCategory, data.serviceCategory2), g).map(t => t.task)}
                  />
                </>
              ) : (
                <p className="text-[12px] text-gray-400">先に「受注区分」を選んでください。</p>
              )}
            </Card>
          )}
          <Card label="契約手続き（契約関連書類の受け取り）">
            <IntakeDocsEditor docs={data.intakeDocuments} onSave={v => update('intakeDocuments', v)} />
          </Card>
          {/* 紹介のみは上の「紹介先」で選ぶため、重複する他事業者紹介要否カードは隠す */}
          {data.serviceCategory !== REFERRAL_ONLY_CATEGORY && (
            <Card label="他事業者紹介要否"><Pills value={data.referralPartners} options={[...REFERRAL_PARTNER_TYPES]} onChange={v => update('referralPartners', v as string[])} multi /></Card>
          )}
          <Card label="難易度"><Pills value={data.difficulty} options={['高', '中', '低']} onChange={v => update('difficulty', v as string)} /></Card>
          <Card label="完了予定日"><Input type="date" value={data.expectedCompletionDate} onChange={v => update('expectedCompletionDate', v)} /></Card>
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
              <ConfirmRow label="受注区分" value={data.serviceCategory} />
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
