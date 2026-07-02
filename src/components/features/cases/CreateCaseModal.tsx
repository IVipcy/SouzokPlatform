'use client'

// 新規面談登録（報告書式の項目・1行1項目のシンプル縦リスト）。
// 詳細は案件詳細（面談タブ／オーダーシート）で入力する前提で、ここは面談報告の最小項目だけ。

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { useAuth } from '@/components/providers/AuthProvider'
import { generateCaseNumber } from '@/lib/stationIntegration'

type Props = { isOpen: boolean; onClose: () => void; onSaved: () => void }

const MEETING_RESULTS = ['検討中', '即受注', '失注'] as const
const RESULT_TO_STATUS: Record<string, string> = { '検討中': '検討中', '即受注': '受注', '失注': '失注' }
const CONSIDERATION_PERIODS = ['1週間', '2週間', '1ヶ月', '見込み不明'] as const
const PROCEDURES = ['相続登記', '遺産整理（預貯金等）', '遺言', '相続放棄・限定承認', 'その他'] as const

export default function CreateCaseModal({ isOpen, onClose, onSaved }: Props) {
  const user = useAuth()
  const [form, setForm] = useState({
    referrer: '',                 // 紹介元（必須）
    client_name: '',              // 顧客名（＝依頼者名）
    meeting_type: '新規面談',      // 面談内容（フリー）
    meeting_result: '検討中' as string,
    procedures: [] as string[],   // 手続内容（受注区分の暫定）
    consideration_period: '',
    response_due: '',
    proposal_note: '',
    expected_completion: '',
    realestate_sale: '',          // 不動産売却（フリー）→他事業者紹介(不動産)
    tax_advisor: '',              // 税理士（フリー）→他事業者紹介(税理士)
    decline_reason: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.referrer.trim()) { setError('紹介元は必須です'); return }
    if (!form.client_name.trim()) { setError('顧客名は必須です'); return }
    setSaving(true); setError('')
    const supabase = createClient()

    // 依頼者（顧客）作成
    const { data: client, error: clientErr } = await supabase.from('clients').insert({ name: form.client_name.trim() }).select('id').single()
    if (clientErr) { setError(`顧客作成に失敗: ${clientErr.message}`); setSaving(false); return }

    // 案件番号の自動採番（YYMM + LP + 当日連番）
    const now = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const { count } = await supabase.from('cases').select('id', { count: 'exact', head: true }).gte('created_at', dayStart)
    const caseNumber = generateCaseNumber(now, count ?? 0)

    const { data: created, error: caseErr } = await supabase.from('cases').insert({
      case_number: caseNumber,
      deal_name: form.client_name.trim(),
      client_id: client.id,
      status: RESULT_TO_STATUS[form.meeting_result] ?? '面談設定済',
      order_route_detail: form.referrer.trim(),         // 紹介元（葬儀社名等）
      meeting_owner_id: user?.memberId ?? null,          // 面談担当＝ログイン者を自動設定
      meeting_type: form.meeting_type.trim() || null,
      order_category: form.procedures.length ? form.procedures : null,
      consideration_period: form.consideration_period || null,
      client_response_due_date: form.response_due || null,
      proposal_note: form.proposal_note.trim() || null,
      expected_completion_date: form.expected_completion || null,
      consideration_decline_reason_detail: form.decline_reason.trim() || null,
    }).select('id').single()
    if (caseErr || !created) { setError(`案件作成に失敗: ${caseErr?.message ?? ''}`); setSaving(false); return }

    // 不動産売却・税理士 → 他事業者紹介（依頼内容詳細にフリーテキスト）
    const refs: { case_id: string; partner_type: string; content_detail: string }[] = []
    if (form.realestate_sale.trim()) refs.push({ case_id: created.id, partner_type: '不動産', content_detail: form.realestate_sale.trim() })
    if (form.tax_advisor.trim()) refs.push({ case_id: created.id, partner_type: '税理士', content_detail: form.tax_advisor.trim() })
    if (refs.length) await supabase.from('case_referrals').insert(refs)

    setSaving(false)
    showToast('面談を登録しました', 'success')
    onSaved()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="＋ 新規面談登録" footer={
      <>
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" onClick={handleSubmit} loading={saving}>{saving ? '登録中...' : '登録'}</Button>
      </>
    }>
      <form onSubmit={handleSubmit} className="relative">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-[13px] rounded-lg p-2.5 mb-2">{error}</div>}
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          <Row label="紹介元" required hint="連携で自動。手入力可">
            <input value={form.referrer} onChange={e => set('referrer', e.target.value)} placeholder="例: お仏壇のはせがわ" className={inp} />
          </Row>
          <Row label="面談担当"><div className="px-2 py-1.5 text-[12.5px] text-gray-500 bg-gray-50 border border-gray-200 rounded">{user?.memberName ?? 'ログイン者を自動設定'}</div></Row>
          <Row label="顧客名" required><input value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="例: 服部 雅弘" className={inp} /></Row>
          <Row label="面談内容"><input value={form.meeting_type} onChange={e => set('meeting_type', e.target.value)} placeholder="新規面談" className={inp} /></Row>
          <Row label="面談結果">
            <select value={form.meeting_result} onChange={e => set('meeting_result', e.target.value)} className={inp}>
              {MEETING_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Row>
          <Row label="手続内容" hint="受注区分（暫定）">
            <div className="flex flex-wrap gap-1.5">
              {PROCEDURES.map(p => {
                const on = form.procedures.includes(p)
                return <button key={p} type="button" onClick={() => set('procedures', on ? form.procedures.filter(x => x !== p) : [...form.procedures, p])}
                  className={`px-2.5 py-1 rounded-full text-[11.5px] border ${on ? 'bg-brand-50 text-brand-700 border-brand-300 font-semibold' : 'bg-white text-gray-500 border-gray-200'}`}>{p}</button>
              })}
            </div>
          </Row>
          <Row label="検討期間">
            <div className="flex flex-wrap gap-1.5">
              {CONSIDERATION_PERIODS.map(p => (
                <button key={p} type="button" onClick={() => set('consideration_period', form.consideration_period === p ? '' : p)}
                  className={`px-2.5 py-1 rounded-full text-[11.5px] border ${form.consideration_period === p ? 'bg-brand-50 text-brand-700 border-brand-300 font-semibold' : 'bg-white text-gray-500 border-gray-200'}`}>{p}</button>
              ))}
            </div>
          </Row>
          <Row label="お客様回答予定日"><input type="date" value={form.response_due} onChange={e => set('response_due', e.target.value)} className={inp} /></Row>
          <Row label="提案金額"><input value={form.proposal_note} onChange={e => set('proposal_note', e.target.value)} placeholder="例: 提案せず / 330,000円" className={inp} /></Row>
          <Row label="完了予定日"><input type="date" value={form.expected_completion} onChange={e => set('expected_completion', e.target.value)} className={inp} /></Row>
          <Row label="不動産売却" hint="他事業者紹介(不動産)へ"><input value={form.realestate_sale} onChange={e => set('realestate_sale', e.target.value)} placeholder="なし / 内容を記載" className={inp} /></Row>
          <Row label="税理士" hint="他事業者紹介(税理士)へ"><input value={form.tax_advisor} onChange={e => set('tax_advisor', e.target.value)} placeholder="なし / 内容を記載" className={inp} /></Row>
          <Row label="検討・失注の理由" top><textarea value={form.decline_reason} onChange={e => set('decline_reason', e.target.value)} rows={3} placeholder="理由・面談メモ" className={`${inp} resize-none`} /></Row>
        </div>
      </form>
    </Modal>
  )
}

const inp = 'w-full border border-gray-300 rounded px-2 py-1.5 text-[12.5px] focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white'

function Row({ label, required, hint, top, children }: { label: string; required?: boolean; hint?: string; top?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 px-3 py-2 ${top ? 'items-start' : 'items-center'}`}>
      <div className="flex-none w-32 pt-0.5">
        <div className="text-[11.5px] text-gray-600">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</div>
        {hint && <div className="text-[10px] text-gray-400">{hint}</div>}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
