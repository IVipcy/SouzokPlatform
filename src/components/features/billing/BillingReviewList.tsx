'use client'

// 要確認フィルタ専用ビュー。needs_review の請求を、確認依頼→回答(確認結果＋対応)→対応まで1行で回す。
//   経理: 「要確認の内容」を編集(review_reason)→チェックで確認依頼／確認済(回答済)を見て入金確定 or 返金確定
//   受注/管理: 確認依頼中の自分の案件に「確認結果」記入＋「対応」選択で回答
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { billingPatternOf } from '@/lib/constants'
import { RESOLUTIONS, resolutionOf } from '@/lib/billingRequests'

export type ReviewInvoice = {
  id: string; case_id: string; amount: number; review_reason: string | null; billing_pattern: string
  caseNumber: string; dealName: string
  members: Array<{ role: string; member_id: string }>
}
export type ConfirmReq = {
  id: string; status: string; request_note: string | null; result_note: string | null; resolution: string | null; requester_id: string | null
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`
const today = () => new Date().toISOString().slice(0, 10)
const stateOf = (req: ConfirmReq | undefined) => !req ? '未依頼' : req.status === '依頼中' ? '確認依頼中' : '確認済'

export default function BillingReviewList({ invoices, confirmByInvoice, canReconcile, currentMemberId, onChanged }: {
  invoices: ReviewInvoice[]
  confirmByInvoice: Map<string, ConfirmReq>
  canReconcile: boolean
  currentMemberId: string | null
  onChanged: () => void
}) {
  const [sub, setSub] = useState<'all' | '未依頼' | '確認依頼中' | '確認済'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState<Record<string, string>>({})   // review_reason 編集（未依頼）
  const [answer, setAnswer] = useState<Record<string, { note: string; resolution: string }>>({})  // 回答（確認依頼中）
  const [busy, setBusy] = useState(false)

  const rows = invoices.filter(inv => sub === 'all' || stateOf(confirmByInvoice.get(inv.id)) === sub)
  const counts = {
    未依頼: invoices.filter(inv => stateOf(confirmByInvoice.get(inv.id)) === '未依頼').length,
    確認依頼中: invoices.filter(inv => stateOf(confirmByInvoice.get(inv.id)) === '確認依頼中').length,
    確認済: invoices.filter(inv => stateOf(confirmByInvoice.get(inv.id)) === '確認済').length,
  }
  const selectableUnsent = rows.filter(inv => stateOf(confirmByInvoice.get(inv.id)) === '未依頼')

  const supabase = () => createClient()
  const notify = async (memberIds: string[], type: string, caseId: string, title: string, body: string) => {
    const ids = [...new Set(memberIds.filter(Boolean))]
    if (ids.length > 0) await supabase().from('notifications').insert(ids.map(mid => ({ member_id: mid, type, case_id: caseId, title, body })))
  }

  // 要確認の内容（review_reason）をインライン保存（経理・未依頼）
  const saveReason = async (inv: ReviewInvoice, v: string) => {
    if (v === (inv.review_reason ?? '')) return
    await supabase().from('invoices').update({ review_reason: v }).eq('id', inv.id)
    onChanged()
  }
  // 選択した未依頼に確認依頼を送信（経理）
  const sendRequests = async () => {
    const targets = invoices.filter(inv => selected.has(inv.id) && stateOf(confirmByInvoice.get(inv.id)) === '未依頼')
    if (targets.length === 0) { showToast('未依頼の行を選んでください', 'error'); return }
    setBusy(true)
    for (const inv of targets) {
      const note = reason[inv.id] ?? inv.review_reason ?? ''
      const primaryConfirmer = inv.members.find(m => m.role === 'manager')?.member_id ?? inv.members.find(m => m.role === 'sales')?.member_id ?? null
      await supabase().from('payment_check_requests').insert({ invoice_id: inv.id, case_id: inv.case_id, requester_id: currentMemberId, confirmer_id: primaryConfirmer, kind: 'confirm', status: '依頼中', requested_date: today(), request_note: note })
      await notify(inv.members.filter(m => m.role === 'sales' || m.role === 'manager').map(m => m.member_id), 'billing_confirm_request', inv.case_id, '入金の確認依頼', `${inv.caseNumber} ${inv.dealName}：${note || '内容を確認してください'}`)
    }
    setBusy(false); setSelected(new Set())
    showToast(`${targets.length}件に確認依頼を送りました`, 'success'); onChanged()
  }
  // 受注/管理の回答（確認結果＋対応）→ 確認済(回答済)
  const answerReq = async (inv: ReviewInvoice, req: ConfirmReq) => {
    const a = answer[inv.id]
    if (!a?.resolution) { showToast('対応を選んでください', 'error'); return }
    setBusy(true)
    await supabase().from('payment_check_requests').update({ status: '回答済', result_note: a.note?.trim() || null, resolution: a.resolution, confirmed_date: today() }).eq('id', req.id)
    if (req.requester_id) await notify([req.requester_id], 'billing_confirm_answered', inv.case_id, '確認依頼に回答', `${inv.caseNumber} ${inv.dealName}：${RESOLUTIONS.find(r => r.value === a.resolution)?.label ?? ''}／${a.note?.trim() || '（コメントなし）'}`)
    setBusy(false)
    showToast('回答しました（経理へ通知）', 'success'); onChanged()
  }
  // 経理の対応：入金確定でOK→完了 / 要返金→返金確定（マイナス入金）。いずれも要確認フラグを解消。
  const finishOk = async (inv: ReviewInvoice, req: ConfirmReq) => {
    setBusy(true)
    await supabase().from('payment_check_requests').update({ status: '完了', confirmer_id: currentMemberId, confirmed_date: today() }).eq('id', req.id)
    await supabase().from('invoices').update({ needs_review: false, review_reason: null }).eq('id', inv.id)
    setBusy(false); showToast('完了にしました', 'success'); onChanged()
  }
  const doRefund = async (inv: ReviewInvoice, req: ConfirmReq) => {
    const input = window.prompt('返金額を入力してください（円）', '')
    const amt = Number((input ?? '').replace(/[^\d]/g, ''))
    if (!amt) return
    setBusy(true)
    const { error } = await supabase().from('payments').insert({ invoice_id: inv.id, amount: -amt, payment_date: today(), payment_method: '振込', is_refund: true, matched_by: 'human', match_note: `過入金の返金（確認依頼より）` })
    if (error) { showToast(`返金記録に失敗: ${error.message}`, 'error'); setBusy(false); return }
    await supabase().from('payment_check_requests').update({ status: '完了', confirmer_id: currentMemberId, confirmed_date: today() }).eq('id', req.id)
    await supabase().from('invoices').update({ needs_review: false, review_reason: null }).eq('id', inv.id)
    setBusy(false); showToast('返金を確定しました', 'success'); onChanged()
  }

  const chip = (key: typeof sub, label: string, n: number) =>
    <button type="button" onClick={() => setSub(key)} className={`text-[11px] px-3 py-1 rounded-full ${sub === key ? 'bg-brand-600 text-white font-semibold' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>{label} {n}</button>

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-semibold text-gray-900">要確認（CSV突合②③）</span>
        {chip('all', 'すべて', invoices.length)}
        {chip('未依頼', '未依頼', counts.未依頼)}
        {chip('確認依頼中', '確認依頼中', counts.確認依頼中)}
        {chip('確認済', '確認済', counts.確認済)}
        {canReconcile && selectableUnsent.length > 0 && (
          <button type="button" disabled={busy || selected.size === 0} onClick={sendRequests} className="ml-auto text-[12px] px-3 py-1.5 rounded-md bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-40">選択に確認依頼（{[...selected].filter(id => selectableUnsent.some(i => i.id === id)).length}）</button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 900 }}>
          <thead><tr className="bg-amber-50 text-amber-800 border-b border-amber-100">
            {canReconcile && <th className="px-2 py-2 w-8" />}
            <th className="px-2.5 py-2 text-left font-semibold w-40">案件</th>
            <th className="px-2.5 py-2 text-left font-semibold w-24">請求パターン</th>
            <th className="px-2.5 py-2 text-left font-semibold">要確認の内容<span className="block text-[10px] font-normal opacity-70">AI初期・経理が編集</span></th>
            <th className="px-2.5 py-2 text-left font-semibold">確認結果<span className="block text-[10px] font-normal opacity-70">受注/管理が記入</span></th>
            <th className="px-2.5 py-2 text-left font-semibold w-40">対応</th>
            <th className="px-2.5 py-2 text-left font-semibold w-24">状態</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={canReconcile ? 7 : 6} className="px-3 py-8 text-center text-gray-400">該当する要確認はありません</td></tr>
            ) : rows.map(inv => {
              const req = confirmByInvoice.get(inv.id)
              const st = stateOf(req)
              const p = billingPatternOf(inv.billing_pattern)
              const res = resolutionOf(req?.resolution)
              return (
                <tr key={inv.id} className="border-b border-gray-100 last:border-b-0 align-top">
                  {canReconcile && <td className="px-2 py-2 text-center">{st === '未依頼' && <input type="checkbox" checked={selected.has(inv.id)} onChange={() => setSelected(s => { const n = new Set(s); if (n.has(inv.id)) n.delete(inv.id); else n.add(inv.id); return n })} className="accent-brand-600" />}</td>}
                  <td className="px-2.5 py-2"><Link href={`/cases/${inv.case_id}`} className="font-mono text-brand-700 hover:underline">{inv.caseNumber}</Link> <span className="text-gray-800">{inv.dealName}</span><div className="text-[11px] text-gray-400">{yen(inv.amount)}</div></td>
                  <td className="px-2.5 py-2"><span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] border bg-brand-50 text-brand-700 border-brand-100">{p.no}</span></td>
                  <td className="px-2.5 py-2">
                    {canReconcile && st === '未依頼'
                      ? <textarea defaultValue={inv.review_reason ?? ''} onBlur={e => saveReason(inv, e.target.value)} onChange={e => setReason(r => ({ ...r, [inv.id]: e.target.value }))} rows={2} className="w-full text-[12px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-brand-400 resize-none" />
                      : <span className="text-gray-700">{req?.request_note ?? inv.review_reason ?? '—'}</span>}
                  </td>
                  <td className="px-2.5 py-2">
                    {st === '確認依頼中'
                      ? <textarea defaultValue={req?.result_note ?? ''} onChange={e => setAnswer(a => ({ ...a, [inv.id]: { note: e.target.value, resolution: a[inv.id]?.resolution ?? '' } }))} rows={2} placeholder="確認結果を記入" className="w-full text-[12px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-brand-400 resize-none" />
                      : <span className="text-gray-700">{req?.result_note ?? '—'}</span>}
                  </td>
                  <td className="px-2.5 py-2">
                    {st === '確認依頼中' ? (
                      <div className="space-y-1">
                        <div className="flex gap-1 flex-wrap">
                          {RESOLUTIONS.map(r => <button key={r.value} type="button" onClick={() => setAnswer(a => ({ ...a, [inv.id]: { note: a[inv.id]?.note ?? req?.result_note ?? '', resolution: r.value } }))} className={`text-[10.5px] px-2 py-0.5 rounded border ${answer[inv.id]?.resolution === r.value ? `${r.cls} font-semibold` : 'bg-white text-gray-500 border-gray-200'}`}>{r.label}</button>)}
                        </div>
                        <button type="button" disabled={busy} onClick={() => req && answerReq(inv, req)} className="text-[11px] px-2.5 py-0.5 rounded bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-40">回答</button>
                      </div>
                    ) : st === '確認済' ? (
                      <div className="space-y-1">
                        {res && <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${res.cls}`}>{res.label}</span>}
                        {canReconcile && req && (res?.value === 'need_refund'
                          ? <button type="button" disabled={busy} onClick={() => doRefund(inv, req)} className="block text-[11px] px-2.5 py-0.5 rounded bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-40">返金確定</button>
                          : <button type="button" disabled={busy} onClick={() => finishOk(inv, req)} className="block text-[11px] px-2.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 disabled:opacity-40">完了</button>)}
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2.5 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${st === '未依頼' ? 'bg-gray-50 text-gray-500 border-gray-200' : st === '確認依頼中' ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{st}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
