'use client'

// 「請求を登録」ウィンドウ。金融機関へ一度に提出するまとまりを1件の請求として登録する。
//
//   1 請求日 … 空欄のまま「準備中として保存」できる。来店の前に内容だけ作っておき、
//              当日に来店日を請求日として入れる使い方のため。
//   2 残高証明 … 指定日ごとに1行。日付を指定するか「直近日」。行ごとに対象口座を選ぶ。
//   3 取引履歴 … 取得期間ごとに1行。行ごとに対象口座を選ぶ。証券会社では顧客勘定元帳。
//
// 証券会社は口座を持たない（銘柄で管理）ので、対象口座の選択は出さない。
// 移動できるウィンドウにしているのは、オーダーシートの予定や受領書類を見ながら入れるため。

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import FloatingWindow from '@/components/ui/FloatingWindow'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import type { FinancialAssetRow, FinancialInstitutionRow } from '@/types'

type BalanceLine = { id: number; recent: boolean; date: string; accountIds: string[] }
type HistoryLine = { id: number; start: string; end: string; accountIds: string[] }

const accountLabel = (a: FinancialAssetRow) =>
  [a.branch_name, a.account_type, a.account_number].map(v => (v ?? '').trim()).filter(Boolean).join('｜') || '口座（番号未入力）'

export default function FinancialRequestModal({ isOpen, onClose, institution, accounts, onSaved }: {
  isOpen: boolean
  onClose: () => void
  institution: FinancialInstitutionRow
  /** この調査先の口座（預金のとき） */
  accounts: FinancialAssetRow[]
  onSaved: () => void
}) {
  const isSec = institution.kind === '証券'
  const allIds = useMemo(() => accounts.map(a => a.id), [accounts])
  const [requestDate, setRequestDate] = useState('')
  const [balanceLines, setBalanceLines] = useState<BalanceLine[]>([{ id: 1, recent: false, date: '', accountIds: allIds }])
  const [historyLines, setHistoryLines] = useState<HistoryLine[]>([])
  const [saving, setSaving] = useState(false)

  const validBalance = balanceLines.filter(l => (l.recent || l.date) && (isSec || l.accountIds.length > 0))
  const validHistory = historyLines.filter(l => l.start && l.end && (isSec || l.accountIds.length > 0))
  const count = validBalance.length + validHistory.length

  const toggleAccount = (kind: 'b' | 'h', lineId: number, accountId: string) => {
    const flip = (ids: string[]) => (ids.includes(accountId) ? ids.filter(x => x !== accountId) : [...ids, accountId])
    if (kind === 'b') setBalanceLines(prev => prev.map(l => (l.id === lineId ? { ...l, accountIds: flip(l.accountIds) } : l)))
    else setHistoryLines(prev => prev.map(l => (l.id === lineId ? { ...l, accountIds: flip(l.accountIds) } : l)))
  }

  const submit = async () => {
    if (count === 0 || saving) return
    setSaving(true)
    const supabase = createClient()
    const { data: req, error } = await supabase.from('financial_requests')
      .insert({ case_id: institution.case_id, institution_id: institution.id, request_date: requestDate || null })
      .select('id').single()
    if (error || !req) { setSaving(false); showToast(`請求の登録に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    const requestId = (req as { id: string }).id
    const items = [
      ...validBalance.map((l, i) => ({ case_id: institution.case_id, request_id: requestId, doc_type: '残高証明', balance_date: l.recent ? null : l.date, balance_recent: l.recent, sort_order: i, _accounts: l.accountIds })),
      ...validHistory.map((l, i) => ({ case_id: institution.case_id, request_id: requestId, doc_type: isSec ? '顧客勘定元帳' : '取引履歴', history_start: l.start, history_end: l.end, sort_order: 100 + i, _accounts: l.accountIds })),
    ]
    for (const it of items) {
      const { _accounts, ...row } = it
      const { data: created, error: ie } = await supabase.from('financial_request_items').insert(row).select('id').single()
      if (ie || !created) { showToast(`明細の登録に失敗しました: ${ie?.message ?? ''}`, 'error'); continue }
      if (!isSec && _accounts.length > 0) {
        await supabase.from('financial_request_item_accounts').insert(_accounts.map(asset_id => ({ item_id: (created as { id: string }).id, asset_id })))
      }
    }
    setSaving(false)
    showToast(requestDate ? '請求を登録しました' : '請求準備中として保存しました', 'success')
    onSaved()
    onClose()
  }

  const inp = 'px-2 py-1 text-[12.5px] border border-gray-300 rounded bg-white outline-none focus:border-brand-500'
  const AccountPicker = ({ kind, line }: { kind: 'b' | 'h'; line: { id: number; accountIds: string[] } }) => (
    isSec ? (
      <div className="text-[11px] text-gray-500 mt-1.5">対象：この証券会社の保有口座全体</div>
    ) : (
      <div className="mt-1.5">
        <div className="text-[10.5px] text-gray-400 mb-1">対象口座（支店｜種別｜口座番号）</div>
        {accounts.length === 0
          ? <div className="text-[11px] text-red-600">口座が登録されていません。先に「口座」タブで口座を足してください</div>
          : (
            <div className="flex flex-wrap gap-1.5">
              {accounts.map(a => {
                const on = line.accountIds.includes(a.id)
                return (
                  <button key={a.id} type="button" onClick={() => toggleAccount(kind, line.id, a.id)}
                    className={`px-2 py-1 rounded border text-[11.5px] font-mono ${on ? 'bg-brand-50 text-brand-700 border-brand-300 font-semibold' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    {accountLabel(a)}
                  </button>
                )
              })}
            </div>
          )}
      </div>
    )
  )

  return (
    <FloatingWindow isOpen={isOpen} onClose={onClose} title={`請求を登録 ─ ${institution.name}`} width={640} height={600} resizable fitContent
      footer={
        <div className="flex items-center gap-3 w-full">
          <span className="text-[11px] text-gray-500 flex-1 min-w-0 truncate">
            {count === 0 ? '書類を1つ以上入れると登録できます' : `${count}件の書類を1件の請求として登録します${requestDate ? '' : '（請求日が空なので「請求準備中」）'}`}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={count === 0}>{requestDate ? '請求を登録' : '準備中として保存'}</Button>
        </div>
      }>
      <div className="space-y-3">
        {/* 1 請求日 */}
        <section className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
            <span className="w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
            <span className="text-[12px] font-semibold text-gray-700">請求日</span>
            <span className="text-[10.5px] text-gray-400">請求前に内容だけ保存するときは空欄のまま</span>
          </div>
          <div className="px-3 py-2.5 flex items-center gap-3">
            <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} />
            {!requestDate && <span className="text-[11px] text-gray-500">空欄＝請求準備中。来店当日に来店日を入れる使い方ができます</span>}
          </div>
        </section>

        {/* 2 残高証明 */}
        <section className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
            <span className="w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
            <span className="text-[12px] font-semibold text-gray-700">残高証明</span>
            <span className="text-[10.5px] text-gray-400">指定日ごとに対象口座を選ぶ</span>
          </div>
          <div className="px-3 py-2 space-y-2">
            {balanceLines.map((l, i) => (
              <div key={l.id} className="rounded-md border border-gray-200 bg-gray-50/60 px-2.5 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold text-gray-700">指定日 {i + 1}</span>
                  <select value={l.recent ? 'recent' : 'date'} onChange={e => setBalanceLines(prev => prev.map(x => (x.id === l.id ? { ...x, recent: e.target.value === 'recent' } : x)))} style={{ fontFamily: 'inherit' }} className={inp}>
                    <option value="date">日付を指定</option>
                    <option value="recent">直近日</option>
                  </select>
                  {l.recent
                    ? <span className="text-[11px] text-gray-500">金融機関が発行できる直近時点</span>
                    : <input type="date" value={l.date} onChange={e => setBalanceLines(prev => prev.map(x => (x.id === l.id ? { ...x, date: e.target.value } : x)))} className={inp} />}
                  {balanceLines.length > 1 && (
                    <button type="button" onClick={() => setBalanceLines(prev => prev.filter(x => x.id !== l.id))} className="ml-auto text-gray-300 hover:text-red-500" title="この指定日を外す"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
                <AccountPicker kind="b" line={l} />
              </div>
            ))}
            <button type="button" onClick={() => setBalanceLines(prev => [...prev, { id: Date.now(), recent: false, date: '', accountIds: allIds }])}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3 h-3" strokeWidth={2.5} />指定日を追加</button>
          </div>
        </section>

        {/* 3 取引履歴 */}
        <section className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
            <span className="w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">3</span>
            <span className="text-[12px] font-semibold text-gray-700">{isSec ? '取引資料（任意）' : '取引履歴'}</span>
            <span className="text-[10.5px] text-gray-400">{isSec ? '入出金の確認が要るときだけ、顧客勘定元帳を足す' : '取得期間ごとに対象口座を選ぶ'}</span>
          </div>
          <div className="px-3 py-2 space-y-2">
            {historyLines.map((l, i) => (
              <div key={l.id} className="rounded-md border border-gray-200 bg-gray-50/60 px-2.5 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold text-gray-700">取得期間 {i + 1}</span>
                  <input type="date" value={l.start} onChange={e => setHistoryLines(prev => prev.map(x => (x.id === l.id ? { ...x, start: e.target.value } : x)))} className={inp} />
                  <span className="text-gray-400 text-[11px]">〜</span>
                  <input type="date" value={l.end} onChange={e => setHistoryLines(prev => prev.map(x => (x.id === l.id ? { ...x, end: e.target.value } : x)))} className={inp} />
                  <button type="button" onClick={() => setHistoryLines(prev => prev.filter(x => x.id !== l.id))} className="ml-auto text-gray-300 hover:text-red-500" title="この期間を外す"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <AccountPicker kind="h" line={l} />
              </div>
            ))}
            <button type="button" onClick={() => setHistoryLines(prev => [...prev, { id: Date.now(), start: '', end: '', accountIds: allIds }])}
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-600 hover:text-brand-700"><Plus className="w-3 h-3" strokeWidth={2.5} />取得期間を追加</button>
          </div>
        </section>
      </div>
    </FloatingWindow>
  )
}
