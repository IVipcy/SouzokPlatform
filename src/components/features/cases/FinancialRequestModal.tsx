'use client'

// 「請求を登録」ウィンドウ。金融機関へ一度に提出するまとまりを1件の請求として登録する。
//
//   1 請求日 … 空欄のまま「準備中として保存」できる。来店の前に内容だけ作っておき、
//              当日に来店日を請求日として入れる使い方のため。
//   2 残高証明 … 指定日ごとに1行。日付を指定するか「直近日」。行ごとに対象口座を選ぶ。
//   3 取引履歴 … 取得期間ごとに1行。行ごとに対象口座を選ぶ。証券会社では顧客勘定元帳。
//
// 証券会社・株主名簿管理人は口座を持たない（銘柄で管理）ので、対象口座の選択は出さない。
// 株主名簿管理人の書類は 所有株式数証明書（基準日ごと）／未受領配当金明細書（期間）。
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

export default function FinancialRequestModal({ isOpen, onClose, institution, accounts, onSaved, defaultBalanceDate = null, sealInfo }: {
  isOpen: boolean
  /** 指定日1の既定。ほぼ必ず頼む「相続開始日（死亡日）時点」を最初から入れておく */
  defaultBalanceDate?: string | null
  /** 依頼者の印鑑登録証明書の手元の通数・期限（原本を同封するか決めるときに要る） */
  sealInfo?: string
  onClose: () => void
  institution: FinancialInstitutionRow
  /** この調査先の口座（預金のとき） */
  accounts: FinancialAssetRow[]
  onSaved: () => void
}) {
  const isSec = institution.kind === '証券'
  const isAdmin = institution.kind === '株主名簿管理人'
  const noAccounts = isSec || isAdmin
  const balanceDoc = isAdmin ? '所有株式数証明書' : '残高証明'
  const historyDoc = isAdmin ? '未受領配当金明細書' : isSec ? '顧客勘定元帳' : '取引履歴'
  const allIds = useMemo(() => accounts.map(a => a.id), [accounts])
  const [requestDate, setRequestDate] = useState('')
  const [sealSent, setSealSent] = useState(false)   // 依頼者の印鑑登録証明書の原本を同封（来店なら持参）
  // 残高証明の初期値：オーダーシートの口座の指定（相続開始日／直近日／任意の日付）から行を作る。同じ指定の口座は1行にまとめる
  const [balanceLines, setBalanceLines] = useState<BalanceLine[]>(() => {
    const fallback: BalanceLine[] = [{ id: 1, recent: false, date: defaultBalanceDate ?? '', accountIds: allIds }]
    if (noAccounts) return fallback
    const lines: BalanceLine[] = []
    let seq = 1
    const onDeath = accounts.filter(a => a.balance_cert_on_death).map(a => a.id)
    const recent = accounts.filter(a => a.balance_cert_recent).map(a => a.id)
    if (onDeath.length > 0) lines.push({ id: seq++, recent: false, date: defaultBalanceDate ?? '', accountIds: onDeath })
    if (recent.length > 0) lines.push({ id: seq++, recent: true, date: '', accountIds: recent })
    const byDate = new Map<string, string[]>()
    for (const a of accounts) for (const d of a.balance_cert_dates ?? []) { if (!d) continue; byDate.set(d, [...(byDate.get(d) ?? []), a.id]) }
    for (const [d, ids] of byDate) lines.push({ id: seq++, recent: false, date: d, accountIds: ids })
    return lines.length > 0 ? lines : fallback
  })
  // オーダーシートで付けた指定（実務が読んでいなかったもの）。請求の中身を決めるときに見える所へ出す
  const osNotes = (() => {
    const out: string[] = []
    if (accounts.some(a => a.all_branch_survey === '要')) out.push('全店調査 要')
    if (accounts.some(a => a.accrued_interest_required === '要')) out.push('経過利息 要')
    if (accounts.some(a => a.share_cert_required === '要')) out.push('所有株式数証明 要')
    if (accounts.some(a => a.unclaimed_dividend_required === '要')) out.push('未受領配当金 要')
    const pri = accounts.map(a => a.survey_priority).find(p => p && p !== '通常')
    if (pri) out.push(`優先度 ${pri}`)
    return out
  })()
  // 取引履歴の初期値：オーダーシート（口座の「取引明細の取得期間」）に入っている期間をそのまま行にする。
  // 同じ期間を持つ口座はひとつの行にまとめ、その口座だけを対象にする。
  const [historyLines, setHistoryLines] = useState<HistoryLine[]>(() => {
    if (noAccounts) return []
    const m = new Map<string, HistoryLine>()
    let seq = 1
    for (const a of accounts) {
      for (const p of a.transaction_periods ?? []) {
        if (!p.start || !p.end) continue
        const k = `${p.start}~${p.end}`
        const cur = m.get(k)
        if (cur) cur.accountIds.push(a.id)
        else m.set(k, { id: seq++, start: p.start, end: p.end, accountIds: [a.id] })
      }
    }
    return [...m.values()]
  })
  // 「5年分」＝相続開始日−5年 〜 相続開始日（相続開始日が未入力なら押せない）
  const fiveYears = (() => {
    if (!defaultBalanceDate) return null
    const d = new Date(`${defaultBalanceDate}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - 5)
    return { start: d.toISOString().slice(0, 10), end: defaultBalanceDate }
  })()
  const [saving, setSaving] = useState(false)

  const validBalance = balanceLines.filter(l => (l.recent || l.date) && (noAccounts || l.accountIds.length > 0))
  const validHistory = historyLines.filter(l => l.start && l.end && (noAccounts || l.accountIds.length > 0))
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
      .insert({ case_id: institution.case_id, institution_id: institution.id, request_date: requestDate || null, seal_original_sent: sealSent })
      .select('id').single()
    if (error || !req) { setSaving(false); showToast(`請求の登録に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    const requestId = (req as { id: string }).id
    const items = [
      ...validBalance.map((l, i) => ({ case_id: institution.case_id, request_id: requestId, doc_type: balanceDoc, balance_date: l.recent ? null : l.date, balance_recent: l.recent, sort_order: i, _accounts: l.accountIds })),
      ...validHistory.map((l, i) => ({ case_id: institution.case_id, request_id: requestId, doc_type: historyDoc, history_start: l.start, history_end: l.end, sort_order: 100 + i, _accounts: l.accountIds })),
    ]
    for (const it of items) {
      const { _accounts, ...row } = it
      const { data: created, error: ie } = await supabase.from('financial_request_items').insert(row).select('id').single()
      if (ie || !created) { showToast(`明細の登録に失敗しました: ${ie?.message ?? ''}`, 'error'); continue }
      if (!noAccounts && _accounts.length > 0) {
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
    noAccounts ? (
      <div className="text-[11px] text-gray-500 mt-1.5">{isAdmin ? '対象：この管理人が管理する銘柄全体（特別口座）' : '対象：この証券会社の保有口座全体'}</div>
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
    <FloatingWindow isOpen={isOpen} onClose={onClose} title={`${isAdmin ? '所有株式数証明書等' : isSec ? '残高証明等' : '残高証明・取引履歴'}の請求を登録 ─ ${institution.name}`} width={640} height={600} resizable fitContent
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
          <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
            <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} />
            {!requestDate && <span className="text-[11px] text-gray-500">空欄＝請求準備中。来店当日に来店日を入れる使い方ができます</span>}
            {/* 原本の所在はここから出す（選ばせない）。戻ったら到着処理で返却日を入れる */}
            <label className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-gray-700 cursor-pointer">
              <input type="checkbox" checked={sealSent} onChange={e => setSealSent(e.target.checked)} className="w-4 h-4 accent-brand-600" />
              依頼者の印鑑登録証明書の原本を同封（来店なら持参）
            </label>
            {sealInfo && <span className="w-full text-[10.5px] text-gray-500 text-right">印鑑登録証明書：{sealInfo}</span>}
            {osNotes.length > 0 && <span className="w-full text-[11px] text-brand-800 bg-brand-50 border border-brand-100 px-2 py-1">オーダーシートの指定：{osNotes.join('・')}</span>}
          </div>
        </section>

        {/* 2 残高証明 */}
        <section className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
            <span className="w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
            <span className="text-[12px] font-semibold text-gray-700">{balanceDoc}</span>
            <span className="text-[10.5px] text-gray-400">{isAdmin ? '基準日（相続開始日など）ごとに1行' : noAccounts ? '指定日ごとに1行' : '指定日ごとに対象口座を選ぶ'}</span>
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
            <span className="text-[12px] font-semibold text-gray-700">{isAdmin ? '未受領配当金明細書（任意）' : isSec ? '取引資料（任意）' : '取引履歴'}</span>
            <span className="text-[10.5px] text-gray-400">{isAdmin ? '未払いの配当がありそうなときだけ、期間を入れて足す' : isSec ? '入出金の確認が要るときだけ、顧客勘定元帳を足す' : 'オーダーシートの取得期間が最初から入っています。「5年分」で相続開始日まで5年'}</span>
          </div>
          <div className="px-3 py-2 space-y-2">
            {historyLines.map((l, i) => (
              <div key={l.id} className="rounded-md border border-gray-200 bg-gray-50/60 px-2.5 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold text-gray-700">取得期間 {i + 1}</span>
                  <input type="date" value={l.start} onChange={e => setHistoryLines(prev => prev.map(x => (x.id === l.id ? { ...x, start: e.target.value } : x)))} className={inp} />
                  <span className="text-gray-400 text-[11px]">〜</span>
                  <input type="date" value={l.end} onChange={e => setHistoryLines(prev => prev.map(x => (x.id === l.id ? { ...x, end: e.target.value } : x)))} className={inp} />
                  <button type="button" disabled={!fiveYears} onClick={() => { if (fiveYears) setHistoryLines(prev => prev.map(x => (x.id === l.id ? { ...x, start: fiveYears.start, end: fiveYears.end } : x))) }}
                    title={fiveYears ? `相続開始日まで5年（${fiveYears.start}〜${fiveYears.end}）` : '相続開始日が未入力です'}
                    className={`px-2 py-0.5 text-[11px] font-semibold border ${fiveYears && l.start === fiveYears.start && l.end === fiveYears.end ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-brand-700 border-brand-300 hover:bg-brand-50'} disabled:opacity-40 disabled:cursor-not-allowed`}>5年分</button>
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
