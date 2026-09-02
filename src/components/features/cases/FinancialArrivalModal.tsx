'use client'

// 「到着処理」ウィンドウ。1件の請求について、明細ごとに到着・残高・不備を入れる。
//
//   請求日 … 準備中で保存した請求に、あとから入れる（入れた瞬間に「請求中」）
//   明細ごと … 到着日（受信簿のW-Checkで自動で入る。手でも直せる）
//              残高証明なら、その明細の口座ごとの「証明書記載残高」。
//              入れた金額は口座の残高（財産目録の出所）にも書く。
//              処理状況 … 正常 / 要確認 / 再請求中。要確認と再請求中は追加の欄が開く。
//
// 状態（請求中・取得済・要確認…）はここで選ばない。入力値から financialWorkflow が出す。

import { useState } from 'react'
import FloatingWindow from '@/components/ui/FloatingWindow'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { MoneyCell } from './PracticeTableCells'
import { IRREGULAR_STATUSES, IRREGULAR_TYPES, itemConditionLabel, itemStatus, requestStatus } from '@/lib/financialWorkflow'
import type { FinancialAssetRow, FinancialRequestRow, FinancialRequestItemRow } from '@/types'

const STATUS_CLS: Record<string, string> = {
  '請求準備中': 'text-gray-500 border border-gray-300',
  '請求中': 'text-brand-700 bg-brand-50 border border-brand-200',
  '一部取得': 'text-brand-700 bg-brand-50 border border-brand-200',
  '取得済': 'text-emerald-700 bg-emerald-50 border border-emerald-200',
  '要確認': 'text-amber-700 bg-amber-50 border border-amber-200',
  '再請求中': 'text-red-700 bg-red-50 border border-red-200',
}
export const StatusChip = ({ s }: { s: string }) => (
  <span className={`inline-block text-[10.5px] px-2 py-[1px] rounded-full font-semibold ${STATUS_CLS[s] ?? 'text-gray-500 border border-gray-200'}`}>{s}</span>
)

export default function FinancialArrivalModal({ isOpen, onClose, request, items, accounts, onSaved }: {
  isOpen: boolean
  onClose: () => void
  request: FinancialRequestRow
  items: FinancialRequestItemRow[]
  accounts: FinancialAssetRow[]
  onSaved: () => void
}) {
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const accountOf = (id: string) => accounts.find(a => a.id === id)
  const accountLabel = (id: string) => {
    const a = accountOf(id)
    return a ? [a.branch_name, a.account_type, a.account_number].map(v => (v ?? '').trim()).filter(Boolean).join('｜') : '口座'
  }

  const saveRequest = async (patch: Partial<FinancialRequestRow>) => {
    const { error } = await supabase.from('financial_requests').update(patch).eq('id', request.id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onSaved()
  }
  const saveItem = async (id: string, patch: Partial<FinancialRequestItemRow>) => {
    const { error } = await supabase.from('financial_request_items').update(patch).eq('id', id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    onSaved()
  }
  // 証明書記載残高。明細×口座に残し、口座の残高（財産目録の出所）にも書く。
  const saveAmount = async (itemId: string, assetId: string, raw: string) => {
    if (busy) return
    setBusy(true)
    const amount = raw === '' ? null : Number(raw)
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('financial_request_item_accounts').update({ amount }).eq('item_id', itemId).eq('asset_id', assetId),
      supabase.from('financial_assets').update({ balance_amount: amount }).eq('id', assetId),
    ])
    setBusy(false)
    if (e1 || e2) { showToast(`残高の保存に失敗: ${(e1 ?? e2)?.message ?? ''}`, 'error'); return }
    onSaved()
  }

  const inp = 'px-2 py-1 text-[12.5px] border border-gray-300 rounded bg-white outline-none focus:border-brand-500'
  const st = requestStatus(request, items)

  return (
    <FloatingWindow isOpen={isOpen} onClose={onClose} title={`到着処理 ─ ${request.request_date ? `${request.request_date.replace(/-/g, '/')}請求` : '請求準備中'}`} width={640} height={620} resizable fitContent
      footer={<div className="flex justify-end w-full"><Button variant="primary" onClick={onClose}>閉じる</Button></div>}>
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-[11.5px] text-gray-500">請求日
            <input type="date" defaultValue={request.request_date ?? ''} key={`rd-${request.request_date ?? ''}`}
              onBlur={e => { if (e.target.value !== (request.request_date ?? '')) void saveRequest({ request_date: e.target.value || null }) }} className={inp} />
          </label>
          <StatusChip s={st} />
          {!request.request_date && <span className="text-[11px] text-gray-500">請求日を入れると「請求中」になります</span>}
          <label className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-gray-600 cursor-pointer">
            <input type="checkbox" checked={request.seal_original_sent} onChange={e => void saveRequest({ seal_original_sent: e.target.checked, ...(e.target.checked ? {} : { seal_original_returned_date: null }) })} className="w-4 h-4 accent-brand-600" />
            印鑑登録証明書の原本を同封
          </label>
        </div>
        {/* 原本を出した請求だけ、返却の欄。入れると所在から消える */}
        {request.seal_original_sent && (
          <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5">
            <span className="text-[11.5px] text-gray-600">依頼者の印鑑登録証明書の原本を出しています。</span>
            <label className="flex items-center gap-2 text-[11.5px] text-gray-500">返却日
              <input type="date" defaultValue={request.seal_original_returned_date ?? ''} key={`sr-${request.seal_original_returned_date ?? ''}`}
                onBlur={e => { if (e.target.value !== (request.seal_original_returned_date ?? '')) void saveRequest({ seal_original_returned_date: e.target.value || null }) }} className={inp} />
            </label>
            {!request.seal_original_returned_date && <span className="text-[10.5px] text-gray-400">戻ってきたら入れる</span>}
          </div>
        )}

        {items.map(it => {
          const s = itemStatus(it, request)
          const accIds = (it.financial_request_item_accounts ?? []).map(a => a.asset_id)
          return (
            <section key={it.id} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
                <span className="text-[12px] font-semibold text-gray-700">{it.doc_type}</span>
                <span className="text-[11.5px] text-gray-600">{itemConditionLabel(it)}</span>
                {accIds.length > 0 && <span className="text-[10.5px] text-gray-400 truncate max-w-[300px]">{accIds.map(accountLabel).join(' ・ ')}</span>}
                <span className="ml-auto"><StatusChip s={s} /></span>
              </div>
              <div className="px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-[11.5px] text-gray-500">到着日
                    <input type="date" defaultValue={it.arrival_date ?? ''} key={`ad-${it.id}-${it.arrival_date ?? ''}`}
                      onBlur={e => { if (e.target.value !== (it.arrival_date ?? '')) void saveItem(it.id, { arrival_date: e.target.value || null }) }} className={inp} />
                  </label>
                  <span className="text-[10.5px] text-gray-400">受信簿のW-Checkで自動で入ります</span>
                  <label className="flex items-center gap-2 text-[11.5px] text-gray-500 ml-auto">処理状況
                    <select value={it.irregular_status} onChange={e => void saveItem(it.id, { irregular_status: e.target.value })} style={{ fontFamily: 'inherit' }} className={inp}>
                      {IRREGULAR_STATUSES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                </div>

                {/* 残高証明が届いたら、口座ごとの証明書記載残高。財産目録の残高にそのまま入る */}
                {it.doc_type === '残高証明' && it.arrival_date && accIds.length > 0 && (
                  <div className="rounded-md border border-dashed border-gray-300 px-2.5 py-2">
                    <div className="text-[10.5px] text-gray-500 mb-1.5">証明書記載残高（財産目録の残高に入ります）</div>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'minmax(0,1fr) 160px' }}>
                      {accIds.map(id => (
                        <div key={id} className="contents">
                          <span className="text-[12px] text-gray-700 font-mono self-center">{accountLabel(id)}</span>
                          <MoneyCell value={(it.financial_request_item_accounts ?? []).find(a => a.asset_id === id)?.amount ?? accountOf(id)?.balance_amount ?? null}
                            onCommit={v => void saveAmount(it.id, id, v)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {it.irregular_status === '要確認' && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2 flex items-end gap-3 flex-wrap">
                    <label className="text-[10.5px] text-amber-800">確認事項
                      <select value={it.irregular_type ?? ''} onChange={e => void saveItem(it.id, { irregular_type: e.target.value || null })} style={{ fontFamily: 'inherit' }} className={`block mt-0.5 ${inp}`}>
                        <option value="">—</option>{IRREGULAR_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </label>
                    <label className="text-[10.5px] text-amber-800">確認期限
                      <input type="date" defaultValue={it.follow_up_deadline ?? ''} key={`fd-${it.id}-${it.follow_up_deadline ?? ''}`} onBlur={e => { if (e.target.value !== (it.follow_up_deadline ?? '')) void saveItem(it.id, { follow_up_deadline: e.target.value || null }) }} className={`block mt-0.5 ${inp}`} />
                    </label>
                    <label className="text-[10.5px] text-amber-800 flex-1 min-w-[200px]">確認内容・次の対応
                      <input type="text" defaultValue={it.irregular_note ?? ''} key={`in-${it.id}-${it.irregular_note ?? ''}`} onBlur={e => { if (e.target.value !== (it.irregular_note ?? '')) void saveItem(it.id, { irregular_note: e.target.value || null }) }} placeholder="金融機関への確認事項と次の対応" className={`block mt-0.5 w-full ${inp}`} />
                    </label>
                  </div>
                )}
                {it.irregular_status === '再請求中' && (
                  <div className="rounded-md bg-red-50 border border-red-200 px-2.5 py-2 flex items-end gap-3 flex-wrap">
                    <label className="text-[10.5px] text-red-800">再請求日
                      <input type="date" defaultValue={it.re_request_date ?? ''} key={`rr-${it.id}-${it.re_request_date ?? ''}`} onBlur={e => { if (e.target.value !== (it.re_request_date ?? '')) void saveItem(it.id, { re_request_date: e.target.value || null }) }} className={`block mt-0.5 ${inp}`} />
                    </label>
                    <label className="text-[10.5px] text-red-800">再到着予定日
                      <input type="date" defaultValue={it.re_request_deadline ?? ''} key={`rl-${it.id}-${it.re_request_deadline ?? ''}`} onBlur={e => { if (e.target.value !== (it.re_request_deadline ?? '')) void saveItem(it.id, { re_request_deadline: e.target.value || null }) }} className={`block mt-0.5 ${inp}`} />
                    </label>
                    <label className="text-[10.5px] text-red-800 flex-1 min-w-[200px]">再請求理由
                      <input type="text" defaultValue={it.irregular_note ?? ''} key={`rn-${it.id}-${it.irregular_note ?? ''}`} onBlur={e => { if (e.target.value !== (it.irregular_note ?? '')) void saveItem(it.id, { irregular_note: e.target.value || null }) }} placeholder="例：指定日の誤り、対象口座の漏れ" className={`block mt-0.5 w-full ${inp}`} />
                    </label>
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </FloatingWindow>
  )
}
