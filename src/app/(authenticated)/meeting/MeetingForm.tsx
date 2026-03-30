'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SelectedCase } from './MeetingPageClient'
import { STEPS, INITIAL_DATA, type FormData, type Heir, type PropertyDetail, type BankAccount, type Division } from './formData'

type Props = {
  selectedCase: NonNullable<SelectedCase>
  onBack: () => void
}

// ── Shared UI helpers ──
function Card({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-4 mb-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-gray-200">
      <div className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-2.5 flex items-center gap-1.5">
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
                ? (multi ? 'bg-blue-700 border-blue-700 text-white' : 'bg-blue-600 border-blue-600 text-white')
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
      className="w-full bg-gray-50 border-[1.5px] border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 focus:bg-white transition"
    />
  )
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-50 border-[1.5px] border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 focus:bg-white transition resize-y min-h-[80px] leading-relaxed"
    />
  )
}

function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-lg flex-shrink-0">{icon}</div>
      <div>
        <div className="text-lg font-bold text-gray-900">{title}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function MeetingForm({ selectedCase, onBack }: Props) {
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
      init.deceasedName = selectedCase.name.replace(' 様 相続案件', '')
    }
    return init
  })
  const [showSuccess, setShowSuccess] = useState(false)

  const update = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])

  const saveToDatabase = useCallback(async (formData: FormData) => {
    // Compute tax status inline
    const legalHeirCount = formData.heirs.filter(h => h.isLegalHeir).length
    const basicDeduction = 3000 + 600 * legalHeirCount
    const assetMan = parseFloat(formData.totalAssetEstimate) || 0
    const taxable = assetMan - basicDeduction
    const taxStatus = formData.totalAssetEstimate ? (taxable > 0 ? '要' : '不要') : '確認中'
    let taxDeadline = ''
    if (formData.dateOfDeath) {
      const d = new Date(formData.dateOfDeath)
      d.setMonth(d.getMonth() + 10)
      taxDeadline = d.toISOString().split('T')[0]
    }
    // Compute property rank inline
    const { areaRating, residentStatus, buildingAge } = formData
    let propRank = '確認中'
    if (areaRating || residentStatus || buildingAge) {
      if (areaRating === '人気エリア' && residentStatus === '空き家' && buildingAge <= 20) propRank = 'S'
      else if (areaRating === '人気エリア' || (residentStatus === '空き家' && buildingAge <= 30)) propRank = 'A'
      else if (areaRating === '標準') propRank = 'B'
      else if (areaRating === '不人気エリア' || buildingAge > 40) propRank = 'C'
      else propRank = 'B'
    }
    setSaving(true)
    setSaveError('')
    const supabase = createClient()

    try {
      const isNew = selectedCase.id === 'new'
      let caseId = isNew ? '' : selectedCase.id
      let clientId = ''

      // 1. Upsert client
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
        const { data: newClient, error: clientErr } = await supabase.from('clients').insert(clientPayload).select('id').single()
        if (clientErr) throw new Error(`依頼者の保存に失敗: ${clientErr.message}`)
        clientId = newClient.id
      } else {
        // Update existing client
        const { data: existingCase } = await supabase.from('cases').select('client_id').eq('id', caseId).single()
        if (existingCase?.client_id) {
          clientId = existingCase.client_id
          await supabase.from('clients').update(clientPayload).eq('id', clientId)
        } else {
          const { data: newClient, error: clientErr } = await supabase.from('clients').insert(clientPayload).select('id').single()
          if (clientErr) throw new Error(`依頼者の保存に失敗: ${clientErr.message}`)
          clientId = newClient.id
        }
      }

      // 2. Difficulty mapping
      const diffMap: Record<string, string> = { '高': '難', '中': '普', '低': '易' }
      const difficulty = diffMap[formData.difficulty] || null

      // 3. Asset estimate (万円 → 円)
      const assetEstimate = formData.totalAssetEstimate ? parseFloat(formData.totalAssetEstimate) * 10000 : null

      // 4. Upsert case
      const casePayload = {
        client_id: clientId,
        deal_name: `${formData.deceasedName || formData.clientName} 様 相続案件`,
        status: '受注' as string,
        deceased_name: formData.deceasedName || null,
        date_of_death: formData.dateOfDeath || null,
        order_date: formData.orderDate || null,
        difficulty,
        procedure_type: formData.procedureType.length > 0 ? formData.procedureType : null,
        additional_services: formData.additionalServices.length > 0 ? formData.additionalServices : null,
        tax_filing_required: taxStatus as '要' | '不要' | '確認中',
        tax_filing_deadline: taxDeadline || null,
        property_rank: (propRank || '確認中') as 'S' | 'A' | 'B' | 'C' | '確認中',
        total_asset_estimate: assetEstimate,
        notes: formData.importantNotes || null,
      }

      if (isNew) {
        // Generate case number
        const { count } = await supabase.from('cases').select('*', { count: 'exact', head: true })
        const caseNumber = `R7-A${String((count ?? 0) + 1).padStart(5, '0')}`
        const { data: newCase, error: caseErr } = await supabase.from('cases').insert({ ...casePayload, case_number: caseNumber }).select('id').single()
        if (caseErr) throw new Error(`案件の保存に失敗: ${caseErr.message}`)
        caseId = newCase.id
      } else {
        const { error: caseErr } = await supabase.from('cases').update(casePayload).eq('id', caseId)
        if (caseErr) throw new Error(`案件の更新に失敗: ${caseErr.message}`)
      }

      setSaving(false)
      router.refresh()
      return true
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : '保存に失敗しました')
      setSaving(false)
      return false
    }
  }, [selectedCase, router])

  const nextStep = useCallback(async () => {
    setCompletedSteps(prev => new Set(prev).add(step))
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      window.scrollTo(0, 0)
    } else {
      // Final step: save to DB
      const success = await saveToDatabase(data)
      if (success) {
        setShowSuccess(true)
      }
    }
  }, [step, data, saveToDatabase])

  const prevStep = useCallback(() => {
    if (step > 0) {
      setStep(step - 1)
      window.scrollTo(0, 0)
    }
  }, [step])

  // Tax calculation
  const taxCalc = useMemo(() => {
    const legalHeirCount = data.heirs.filter(h => h.isLegalHeir).length
    const basicDeduction = 3000 + 600 * legalHeirCount
    const assetMan = parseFloat(data.totalAssetEstimate) || 0
    const taxable = assetMan - basicDeduction
    const status = data.totalAssetEstimate ? (taxable > 0 ? '要' : '不要') : '確認中'
    let deadline = ''
    if (data.dateOfDeath) {
      const d = new Date(data.dateOfDeath)
      d.setMonth(d.getMonth() + 10)
      deadline = d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
    }
    return { legalHeirCount, basicDeduction, assetMan, taxable, status, deadline }
  }, [data.heirs, data.totalAssetEstimate, data.dateOfDeath])

  // Property rank
  const propertyRank = useMemo(() => {
    const { areaRating, residentStatus, buildingAge } = data
    if (!areaRating && !residentStatus && !buildingAge) return '確認中'
    if (areaRating === '人気エリア' && residentStatus === '空き家' && buildingAge <= 20) return 'S'
    if (areaRating === '人気エリア' || (residentStatus === '空き家' && buildingAge <= 30)) return 'A'
    if (areaRating === '標準') return 'B'
    if (areaRating === '不人気エリア' || buildingAge > 40) return 'C'
    return 'B'
  }, [data.areaRating, data.residentStatus, data.buildingAge])

  if (showSuccess) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-[72px] h-[72px] bg-gradient-to-br from-green-500 to-green-700 rounded-full flex items-center justify-center text-3xl text-white mx-auto mb-6 shadow-lg">✓</div>
        <div className="text-[22px] font-bold text-gray-900 mb-2">入力完了！</div>
        <div className="text-sm text-gray-500 leading-relaxed mb-8">
          {data.deceasedName || '—'} 様の相続案件<br />
          担当：{data.salesOwner || '—'}
        </div>
        <button
          onClick={onBack}
          className="w-full py-3.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition shadow-md mb-3"
        >
          案件選択に戻る
        </button>
        <button
          onClick={() => { setShowSuccess(false); setStep(0); setCompletedSteps(new Set()) }}
          className="w-full py-3.5 rounded-xl border-[1.5px] border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition"
        >
          🔄 編集を続ける
        </button>
      </div>
    )
  }

  const progressPct = ((step + 1) / STEPS.length) * 100

  const renderStep = () => {
    switch (STEPS[step].id) {
      case 'basic': return (
        <div className="max-w-[800px]">
          <SectionHeader icon="📋" title="基本情報" sub="面談開始時に確認する項目" />
          <Card label="面談日" required><Input type="date" value={data.orderDate} onChange={v => update('orderDate', v)} /></Card>
          <Card label="受注担当" required><Input value={data.salesOwner} onChange={v => update('salesOwner', v)} placeholder="担当者名を入力" /></Card>
          <Card label="難易度"><Pills value={data.difficulty} options={['高', '中', '低']} onChange={v => update('difficulty', v as string)} /></Card>
          <Card label="受注ルート"><Pills value={data.leadSource} options={['LP', '公益社', 'はせがわ', 'その他']} onChange={v => update('leadSource', v as string)} /></Card>
          {data.leadSource === 'LP' && (
            <Card label="LP名・担当者">
              <div className="grid gap-2.5">
                <Input value={data.lpPartnerName} onChange={v => update('lpPartnerName', v)} placeholder="LP会社名" />
                <Input value={data.partnerRep} onChange={v => update('partnerRep', v)} placeholder="担当者名" />
              </div>
            </Card>
          )}
        </div>
      )
      case 'client': return (
        <div className="max-w-[800px]">
          <SectionHeader icon="👤" title="依頼者情報" sub="面談にご来所された方の情報" />
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
      case 'deceased': return (
        <div className="max-w-[800px]">
          <SectionHeader icon="📁" title="被相続人情報" sub="お亡くなりになった方の情報" />
          <Card label="氏名" required>
            <div className="grid gap-2.5">
              <Input value={data.deceasedName} onChange={v => update('deceasedName', v)} placeholder="田中 花子" />
              <Input value={data.deceasedKana} onChange={v => update('deceasedKana', v)} placeholder="たなか はなこ" />
            </div>
          </Card>
          <Card label="生年月日"><Input type="date" value={data.deceasedBirthday} onChange={v => update('deceasedBirthday', v)} /></Card>
          <Card label="死亡日（相続開始日）" required><Input type="date" value={data.dateOfDeath} onChange={v => update('dateOfDeath', v)} /></Card>
          <Card label="住所"><Input value={data.deceasedAddress} onChange={v => update('deceasedAddress', v)} placeholder="〒000-0000 都道府県 市区町村 番地" /></Card>
          <Card label="本籍"><Input value={data.deceasedDomicile} onChange={v => update('deceasedDomicile', v)} placeholder="本籍地を入力" /></Card>
        </div>
      )
      case 'heirs': return (
        <div className="max-w-[800px]">
          <SectionHeader icon="👨‍👩‍👧" title="相続人情報" sub="法定相続人数は基礎控除の計算に使用" />
          {data.heirs.map((h, i) => (
            <div key={i} className="border-[1.5px] border-gray-200 rounded-xl p-4 mb-3 bg-gray-50 relative">
              <div className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-3">相続人 {i + 1}</div>
              <button onClick={() => { const arr = [...data.heirs]; arr.splice(i, 1); update('heirs', arr) }} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-sm hover:bg-red-100 transition">✕</button>
              <div className="grid gap-2.5">
                <Input value={h.name} onChange={v => { const arr = [...data.heirs]; arr[i] = { ...arr[i], name: v }; update('heirs', arr) }} placeholder="氏名" />
                <Input value={h.kana} onChange={v => { const arr = [...data.heirs]; arr[i] = { ...arr[i], kana: v }; update('heirs', arr) }} placeholder="ふりがな" />
                <Pills
                  value={h.relationship}
                  options={['配偶者', '子', '父母', '兄弟姉妹', '代襲相続人', 'その他']}
                  onChange={v => { const arr = [...data.heirs]; arr[i] = { ...arr[i], relationship: v as string }; update('heirs', arr) }}
                />
                <button
                  onClick={() => { const arr = [...data.heirs]; arr[i] = { ...arr[i], isLegalHeir: !arr[i].isLegalHeir }; update('heirs', arr) }}
                  className={`self-start px-4 py-2 rounded-full border-[1.5px] text-[13px] font-medium transition ${h.isLegalHeir ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                >
                  {h.isLegalHeir ? '✓ ' : ''}法定相続人
                </button>
                <Input type="date" value={h.birthday} onChange={v => { const arr = [...data.heirs]; arr[i] = { ...arr[i], birthday: v }; update('heirs', arr) }} />
                <Input value={h.phone} onChange={v => { const arr = [...data.heirs]; arr[i] = { ...arr[i], phone: v }; update('heirs', arr) }} placeholder="電話番号" type="tel" />
              </div>
            </div>
          ))}
          <button
            onClick={() => update('heirs', [...data.heirs, { name: '', kana: '', relationship: '', isLegalHeir: true, birthday: '', address: '', domicile: '', phone: '', email: '' } as Heir])}
            className="w-full py-3.5 border-2 border-dashed border-gray-200 rounded-xl text-blue-600 text-sm font-semibold hover:border-blue-400 hover:bg-blue-50 transition"
          >
            ＋ 相続人を追加
          </button>
        </div>
      )
      case 'order': return (
        <div className="max-w-[800px]">
          <SectionHeader icon="📝" title="受注内容" sub="受任する業務の範囲を確認" />
          <Card label="手続区分" required><Pills value={data.procedureType} options={['手続一式', '登記', '遺言', '放棄']} onChange={v => update('procedureType', v as string[])} multi /></Card>
          <Card label="付帯サービス"><Pills value={data.additionalServices} options={['相続税申告', '不動産売却', '生命保険']} onChange={v => update('additionalServices', v as string[])} multi /></Card>
          <Card label="特記事項・備考"><Textarea value={data.importantNotes} onChange={v => update('importantNotes', v)} placeholder="特別な事情・注意事項があれば記入" /></Card>
        </div>
      )
      case 'property': return (
        <div className="max-w-[800px]">
          <SectionHeader icon="🏠" title="不動産" sub="不動産評価ランクが売却スピードに影響します" />
          <Card label="物件種別"><Pills value={data.propertyType} options={['戸建', 'マンション', '土地', '収益物件', 'その他']} onChange={v => update('propertyType', v as string)} /></Card>
          <Card label="住人有無"><Pills value={data.residentStatus} options={['空き家', '居住中（相続人）', '居住中（第三者）']} onChange={v => update('residentStatus', v as string)} /></Card>
          <Card label="エリア評価"><Pills value={data.areaRating} options={['人気エリア', '標準', '不人気エリア']} onChange={v => update('areaRating', v as string)} /></Card>
          <Card label="築年数">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center border-[1.5px] border-gray-200 rounded-lg overflow-hidden bg-gray-50 w-40">
                <button onClick={() => update('buildingAge', Math.max(0, data.buildingAge - 5))} className="w-11 h-11 text-lg text-blue-600 hover:bg-blue-50 transition">−</button>
                <input type="number" value={data.buildingAge} onChange={e => update('buildingAge', parseInt(e.target.value) || 0)} className="flex-1 text-center text-lg font-bold font-mono bg-transparent border-none outline-none w-14" />
                <button onClick={() => update('buildingAge', data.buildingAge + 5)} className="w-11 h-11 text-lg text-blue-600 hover:bg-blue-50 transition">＋</button>
              </div>
              <span className="text-sm text-gray-400">年</span>
            </div>
          </Card>
          <Card label="不動産評価ランク（自動判定）">
            <div className="flex items-center gap-4 mt-1">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black font-mono flex-shrink-0 ${
                propertyRank === 'S' ? 'bg-amber-100 text-amber-700 shadow-md' :
                propertyRank === 'A' ? 'bg-blue-100 text-blue-700 shadow-md' :
                propertyRank === 'B' ? 'bg-green-100 text-green-700 shadow-md' :
                propertyRank === 'C' ? 'bg-orange-100 text-orange-700 shadow-md' :
                'bg-gray-200 text-gray-500'
              }`}>{propertyRank}</div>
              <div className="text-[13px] text-gray-500">
                {propertyRank === 'S' ? '最優先で査定・売却推進' :
                 propertyRank === 'A' ? '早めの査定推進' :
                 propertyRank === 'B' ? '通常対応' :
                 propertyRank === 'C' ? '慎重に判断' : 'エリア・築年数を確認してください'}
              </div>
            </div>
          </Card>
          <Card label="売却意向"><Pills value={data.propertySale} options={['あり', 'なし', '検討中']} onChange={v => update('propertySale', v as string)} /></Card>
          <Card label="売却緊急度"><Pills value={data.saleUrgency} options={['高（即対応）', '中', '低']} onChange={v => update('saleUrgency', v as string)} /></Card>
          <Card label="不動産備考"><Textarea value={data.propertyGeneralNotes} onChange={v => update('propertyGeneralNotes', v)} placeholder="同居状況・特記事項など" /></Card>
        </div>
      )
      case 'finance': return (
        <div className="max-w-[800px]">
          <SectionHeader icon="💴" title="金融資産・相続税" sub="資産合計から相続税申告の要否を自動判定" />
          <Card label="金融機関（判明分）"><Textarea value={data.bankNames} onChange={v => update('bankNames', v)} placeholder="例：きらぼし銀行、三菱UFJ銀行、野村証券" /></Card>
          <Card label="通帳の状況"><Pills value={data.passbookStatus} options={['即日預かり', '送ってもらう', '紛失']} onChange={v => update('passbookStatus', v as string)} /></Card>
          <Card label="解約サポート"><Pills value={data.cancellationSupport} options={['受注', '受注していない', '検討中', '未提案']} onChange={v => update('cancellationSupport', v as string)} /></Card>
          <Card label="資産合計概算（万円）">
            <input
              type="number"
              value={data.totalAssetEstimate}
              onChange={e => update('totalAssetEstimate', e.target.value)}
              placeholder="例：3500"
              className="w-full bg-gray-50 border-[1.5px] border-gray-200 rounded-lg px-3.5 py-3 text-[22px] font-bold font-mono text-gray-900 outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 focus:bg-white transition"
            />
          </Card>
          {/* Tax calc box */}
          <div className="bg-gradient-to-br from-[#1E3A5F] to-[#0F2440] rounded-xl p-4 text-white mb-3">
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-xs text-white/50">法定相続人数</span>
              <span className="font-mono text-base text-blue-300">{taxCalc.legalHeirCount} 名</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-xs text-white/50">基礎控除額</span>
              <span className="font-mono text-base text-blue-300">{taxCalc.basicDeduction.toLocaleString()} 万円</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-white/10">
              <span className="text-xs text-white/50">資産合計（概算）</span>
              <span className="font-mono text-base text-blue-300">{taxCalc.assetMan ? taxCalc.assetMan.toLocaleString() + ' 万円' : '未入力'}</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-xs text-white/50">課税見込額</span>
              <span className={`font-mono text-base ${taxCalc.taxable > 0 ? 'text-red-300' : 'text-blue-300'}`}>
                {taxCalc.assetMan ? (taxCalc.taxable > 0 ? '+' : '') + taxCalc.taxable.toLocaleString() + ' 万円' : '—'}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-[13px] font-bold ${
                taxCalc.status === '要' ? 'bg-red-400 text-white' :
                taxCalc.status === '不要' ? 'bg-green-500 text-white' :
                'bg-white/20 text-white/70'
              }`}>
                申告　{taxCalc.status}
              </span>
              {taxCalc.deadline && <span className="text-xs text-white/40">申告期限：{taxCalc.deadline}</span>}
            </div>
          </div>
          <Card label="税理士紹介"><Pills value={data.taxAdvisorReferral} options={['有', '無', '検討中']} onChange={v => update('taxAdvisorReferral', v as string)} /></Card>
          {data.taxAdvisorReferral === '有' && (
            <Card label="税理士名・事務所"><Input value={data.taxAdvisorName} onChange={v => update('taxAdvisorName', v)} placeholder="税理士名・事務所名" /></Card>
          )}
        </div>
      )
      case 'division': return (
        <div className="max-w-[800px]">
          <SectionHeader icon="⚖️" title="遺産分割・遺言" sub="分割方針と遺言の有無を確認" />
          <Card label="依頼者の意向"><Textarea value={data.clientIntention} onChange={v => update('clientIntention', v)} placeholder="例：長男が不動産を取得し、残りを3人で均等に分けたい" /></Card>
          <Card label="分配方針"><Pills value={data.distributionPolicy} options={['法定相続', '2次相続を踏まえて', 'その他']} onChange={v => update('distributionPolicy', v as string)} /></Card>
          <Card label="分配方針の提案"><Pills value={data.distributionProposal} options={['あり', 'なし']} onChange={v => update('distributionProposal', v as string)} /></Card>
          <Card label="協議書の調印方法"><Pills value={data.agreementSigning} options={['依頼者から各相続人へ', 'OCから各相続人へ', 'オーシャンで調印', 'その他']} onChange={v => update('agreementSigning', v as string)} /></Card>
          <Card label="財産目録の記載区分"><Pills value={data.inventoryItems} options={['不動産', '金融資産', '債務・負債', '諸費用・経費', '生命保険', 'その他']} onChange={v => update('inventoryItems', v as string[])} multi /></Card>
          <div className="h-px bg-gray-200 my-4" />
          <SectionHeader icon="📜" title="遺言" sub="遺言がある場合・遺言作成業務がある場合" />
          <Card label="遺言種別"><Pills value={data.willType} options={['自筆', '公正証書', 'その他']} onChange={v => update('willType', v as string)} /></Card>
          <Card label="遺言保管"><Pills value={data.willStorage} options={['お客様保管', 'ご案内していない', 'ご案内済(検討中)', 'ご依頼']} onChange={v => update('willStorage', v as string)} /></Card>
          <Card label="遺言執行"><Pills value={data.willExecution} options={['執行不要', 'ご案内していない', 'ご案内済(検討中)', 'ご依頼']} onChange={v => update('willExecution', v as string)} /></Card>
          <Card label="遺留分リスク / 遺贈">
            <div className="flex flex-wrap gap-2">
              <Pills value={data.iryubunRisk} options={['有', '無']} onChange={v => update('iryubunRisk', v as string)} />
            </div>
          </Card>
          <div className="h-px bg-gray-200 my-4" />
          <SectionHeader icon="🛡️" title="生命保険" sub="生命保険の照会・提案" />
          <Card label="生命保険提案"><Pills value={data.insuranceProposal} options={['提案した', '提案しない']} onChange={v => update('insuranceProposal', v as string)} /></Card>
          {data.insuranceProposal === '提案した' && (
            <Card label="保険会社・種類">
              <div className="grid gap-2.5">
                <Input value={data.insuranceCompany} onChange={v => update('insuranceCompany', v)} placeholder="保険会社名" />
                <Input value={data.insuranceDetail} onChange={v => update('insuranceDetail', v)} placeholder="保険種類・金額" />
              </div>
            </Card>
          )}
        </div>
      )
      case 'confirm': return (
        <div className="max-w-[800px]">
          <SectionHeader icon="✅" title="入力内容の確認" sub="内容を確認して「送信・確定」してください" />
          {saveError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">{saveError}</div>}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <ConfirmSection title="基本情報">
              <ConfirmRow label="面談日" value={data.orderDate} />
              <ConfirmRow label="受注担当" value={data.salesOwner} />
              <ConfirmRow label="難易度" value={data.difficulty} />
              <ConfirmRow label="受注ルート" value={data.leadSource} />
            </ConfirmSection>
            <ConfirmSection title="依頼者">
              <ConfirmRow label="氏名" value={data.clientName} />
              <ConfirmRow label="TEL" value={data.clientPhone || data.clientMobile} />
              <ConfirmRow label="連絡先希望" value={data.contactPreference.join(', ')} />
            </ConfirmSection>
            <ConfirmSection title="被相続人">
              <ConfirmRow label="氏名" value={data.deceasedName} />
              <ConfirmRow label="死亡日" value={data.dateOfDeath} />
              <ConfirmRow label="住所" value={data.deceasedAddress} />
            </ConfirmSection>
            <ConfirmSection title="相続人">
              {data.heirs.length === 0
                ? <div className="text-sm text-gray-300 italic py-2">未入力</div>
                : data.heirs.map((h, i) => <ConfirmRow key={i} label={`相続人${i + 1}`} value={`${h.name} （${h.relationship}）${h.isLegalHeir ? '　✓法定' : ''}`} />)}
            </ConfirmSection>
            <ConfirmSection title="受注内容">
              <ConfirmRow label="手続区分" value={data.procedureType.join(', ')} />
              <ConfirmRow label="付帯サービス" value={data.additionalServices.join(', ')} />
            </ConfirmSection>
            <ConfirmSection title="不動産">
              <ConfirmRow label="売却意向" value={data.propertySale} />
              <ConfirmRow label="評価ランク" value={propertyRank} />
            </ConfirmSection>
            <ConfirmSection title="資産・相続税">
              <ConfirmRow label="資産合計概算" value={data.totalAssetEstimate ? data.totalAssetEstimate + '万円' : ''} />
              <ConfirmRow label="法定相続人数" value={taxCalc.legalHeirCount + '名'} />
              <ConfirmRow label="相続税申告" value={taxCalc.status} />
              {taxCalc.deadline && <ConfirmRow label="申告期限" value={taxCalc.deadline} />}
            </ConfirmSection>
            <ConfirmSection title="遺産分割">
              <ConfirmRow label="分配方針" value={data.distributionPolicy} />
              <ConfirmRow label="遺言種別" value={data.willType} />
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
              i === step ? 'bg-blue-600 text-white font-semibold' :
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
        <div className="h-full bg-blue-600 rounded-full transition-all duration-400" style={{ width: `${progressPct}%` }} />
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
              : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25'
          }`}
        >
          {step === STEPS.length - 1 ? (saving ? '保存中...' : '✓ 送信・確定') : '次へ →'}
        </button>
      </div>
    </div>
  )
}

function ConfirmSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[10px] font-bold text-gray-400 tracking-widest uppercase pb-2 mb-3 border-b-[1.5px] border-gray-200">{title}</div>
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
