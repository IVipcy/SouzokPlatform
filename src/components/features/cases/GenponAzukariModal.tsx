'use client'

// 原本預かり証の作成モーダル。
//
// お客様から原本をお預かりしたときにお渡しする控え。載せる書類は「原本管理」（到着物と原本管理タブ）の行から
// チェックして選ぶ。原本管理が親なので、契約時に預かったものも、あとから持ち込まれて受信簿で受けたものも、同じ表から選べる。
//   ・初期チェック＝お客様から預かったもの（契約時に受領した書類・手で足した原本）。届いた戸籍は外れているが付けられる
//   ・通数は手元の数まで。写しは載せない（原本ではない）
//   ・ひな型の「記」は7行なので、8件以上は自動で2枚目に分ける
//   ・作ったら、載せた行に「預かり証に載せた日」を残す（原本管理の「載せた書類」に出る）

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import HintTip from '@/components/ui/HintTip'
import { createClient } from '@/lib/supabase/client'
import { isIkiikiContract } from '@/lib/constants'
import { useOriginalStock } from '@/lib/useOriginalStock'
import { md, type StockRow } from '@/lib/originals'
import { todayJstYmd } from '@/lib/today'
import type { CaseRow, ContractDocumentRow, HeirRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  /** 旧：契約手続きの受領書類。いまは原本管理の行から選ぶので使わない（呼び出し側の互換のため残す） */
  contractDocuments?: ContractDocumentRow[]
  heirs?: HeirRow[]
  /** タスク詳細から作成する際に紐づけるタスクID */
  defaultTaskId?: string
  onSaved?: () => void
}

/** ひな型の「記」は7行ぶん。1枚に載る上限 */
const MAX_ITEMS = 7

const SENDERS = [
  { key: 'gyosei', label: '行政書士法人オーシャン' },
  { key: 'shiho', label: '司法書士法人オーシャン' },
  { key: 'both', label: '行政＋司法（連名）' },
  { key: 'ikiiki', label: '一般社団法人いきいきライフ協会' },
] as const
type SenderKey = (typeof SENDERS)[number]['key']

const inp = 'w-full px-2.5 py-1.5 text-[13px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white'
const digits = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '')

export default function GenponAzukariModal({ isOpen, onClose, caseData, heirs = [], defaultTaskId, onSaved }: Props) {
  if (!isOpen) return null
  return <AzukariBody caseData={caseData} heirs={heirs} defaultTaskId={defaultTaskId} onSaved={onSaved} onClose={onClose} />
}

// 開くたびに作り直す（初期値を useState の初期化だけで決められる）
function AzukariBody({ caseData, heirs, defaultTaskId, onSaved, onClose }: {
  caseData: CaseRow; heirs: HeirRow[]; defaultTaskId?: string; onSaved?: () => void; onClose: () => void
}) {
  const supabase = createClient()
  const { stock, loading, reload } = useOriginalStock(caseData.id)
  const rows = stock.filter(r => !r.copy)
  const [receivedDate, setReceivedDate] = useState(() => todayJstYmd())
  const clientName = (caseData.clients?.name ?? '').trim()
  const nameOptions = [...new Set([clientName, ...heirs.filter(h => h.is_client).map(h => (h.name ?? '').trim())].filter(Boolean))]
  const [addressee, setAddressee] = useState(nameOptions[0] ?? '')
  const [sender, setSender] = useState<SenderKey>(isIkiikiContract(caseData.contract_type) ? 'ikiiki' : 'gyosei')
  const [notes, setNotes] = useState<string[]>(['', ''])
  const [busy, setBusy] = useState(false)
  // 選んだ行と通数。初期チェックは読み込み後に決めるので、「まだ触っていない」を null で表す
  const [picked, setPicked] = useState<Map<string, number> | null>(null)

  const isClientProvided = (r: StockRow) => r.origin === 'contract' || r.origin === 'manual'
  const effective: Map<string, number> = picked ?? new Map(
    rows.filter(r => isClientProvided(r) && !r.override?.azukari_issued_on && r.onHand > 0).map(r => [r.key, r.onHand]),
  )
  const setQty = (r: StockRow, n: number | null) => {
    const next = new Map(effective)
    if (n == null || n <= 0) next.delete(r.key)
    else next.set(r.key, Math.min(n, Math.max(1, r.onHand)))
    setPicked(next)
  }
  const selected = rows.filter(r => effective.has(r.key))
  const sheets = Math.max(1, Math.ceil(selected.length / MAX_ITEMS))
  const valid = selected.length > 0 && addressee.trim() !== '' && !!receivedDate

  const generate = async () => {
    setBusy(true)
    try {
      const items = selected.map(r => ({ name: r.name + (r.person ? `（${r.person}）` : ''), quantity: effective.get(r.key) ?? 1 }))
      for (let i = 0; i < items.length; i += MAX_ITEMS) {
        const chunk = items.slice(i, i + MAX_ITEMS)
        const res = await fetch('/api/documents/genpon-azukari', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId: caseData.id, receivedDate, addressee: addressee.trim(), sender, items: chunk, notes, taskId: defaultTaskId ?? null }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({} as { error?: string }))
          throw new Error(j.error || '作成に失敗しました')
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `原本預かり証_${caseData.case_number ?? ''}_${receivedDate}${items.length > MAX_ITEMS ? `_${i / MAX_ITEMS + 1}` : ''}.xlsx`
        document.body.appendChild(a); a.click(); a.remove()
        URL.revokeObjectURL(url)
      }
      // 載せた行に日付を残す（原本管理の「載せた書類」）
      const ups = selected.map(r => ({
        case_id: caseData.id, stock_key: r.key, azukari_issued_on: receivedDate, updated_at: new Date().toISOString(),
        ...(r.auto ? {} : { doc_name: r.name, person: r.person }),
      }))
      const { error } = await supabase.from('original_doc_overrides').upsert(ups, { onConflict: 'case_id,stock_key' })
      if (error) showToast(`作りましたが、原本管理への記録に失敗: ${error.message}`, 'error')
      reload()
      showToast(sheets > 1 ? `原本預かり証を${sheets}枚作成しました` : '原本預かり証を作成しました', 'success')
      onSaved?.()
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '作成に失敗しました', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="原本預かり証を作成"
      maxWidth="max-w-3xl"
      footer={
        <>
          <span className="text-[12px] text-gray-400 mr-auto">お客様から原本をお預かりしたときに、その場でお渡しする控えです。</span>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
          <button onClick={generate} disabled={busy || !valid}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? '作成中...' : sheets > 1 ? `Excelを作成（${sheets}枚）` : 'Excelを作成'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] font-bold text-gray-500 mb-1.5">お預かりした日</div>
            <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} className={inp} />
          </div>
          <div>
            <div className="text-[12px] font-bold text-gray-500 mb-1.5">宛名<span className="font-normal text-gray-400 ml-1">「様」は自動で付きます</span></div>
            <input type="text" list="azukari-names" value={addressee} onChange={e => setAddressee(e.target.value)} placeholder="お客様のお名前" className={inp} />
            <datalist id="azukari-names">{nameOptions.map(n => <option key={n} value={n} />)}</datalist>
          </div>
        </div>

        <div>
          <div className="text-[12px] font-bold text-gray-500 mb-1.5">
            <span className="inline-flex items-center gap-1">差出人
              <HintTip text="どの法人の名前でお預かりするかです。住所は選んだ法人のものが自動で入ります。行政と司法の両方で受任している案件は「連名」を使ってください。" />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {SENDERS.map(s => (
              <label key={s.key} className={`flex items-center gap-2 px-2.5 py-1.5 text-[13px] border rounded cursor-pointer transition ${sender === s.key ? 'border-brand-400 bg-brand-50 text-brand-800 font-semibold' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <input type="radio" name="azukari-sender" checked={sender === s.key} onChange={() => setSender(s.key)} className="accent-brand-600" />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[12px] font-bold text-gray-500 mb-1.5 flex items-center gap-2">
            <span>お預かりする書類</span>
            <span className="font-normal text-gray-400">原本管理の行から選びます。{selected.length}件{selected.length > MAX_ITEMS ? `（7件ごとに分けて ${sheets} 枚）` : ''}</span>
          </div>
          {loading && rows.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-gray-400">読み込み中…</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-gray-400 border border-dashed border-gray-200 rounded">
              原本がありません。契約手続きの受領書類を「その場で受領」にするか、到着物と原本管理タブの原本管理で足してください。
            </div>
          ) : (
            <div className="border border-gray-200 rounded overflow-hidden">
              <div className="grid grid-cols-[2rem_minmax(0,1fr)_3.5rem_7rem_minmax(0,1fr)] gap-x-3 items-center px-2.5 py-1.5 bg-gray-50 text-[11.5px] text-gray-500">
                <span /><span>原本</span><span className="text-right">手元</span><span>載せる通数</span><span>備考</span>
              </div>
              {rows.map(r => {
                const on = effective.has(r.key)
                const can = r.onHand > 0
                const issued = r.override?.azukari_issued_on
                return (
                  <label key={r.key} className={`grid grid-cols-[2rem_minmax(0,1fr)_3.5rem_7rem_minmax(0,1fr)] gap-x-3 items-center px-2.5 py-1.5 border-t border-gray-100 ${can ? 'cursor-pointer hover:bg-gray-50/60' : 'opacity-50'}`}>
                    <input type="checkbox" checked={on} disabled={!can} onChange={e => setQty(r, e.target.checked ? r.onHand : null)} className="w-4 h-4 accent-brand-600" />
                    <span className="text-[13px] text-gray-800 truncate">{r.name}{r.person ? <span className="text-gray-500">（{r.person}）</span> : null}</span>
                    <span className="text-right tabular-nums text-[13px]">{r.onHand}</span>
                    <span className="inline-flex items-center gap-1">
                      <input type="text" inputMode="numeric" key={`${r.key}-${effective.get(r.key) ?? 0}`} defaultValue={on ? String(effective.get(r.key)) : ''} disabled={!on}
                        onClick={e => e.preventDefault()}
                        onBlur={e => { const n = Number(digits(e.target.value)); if (on) setQty(r, n > 0 ? n : 1) }}
                        className="w-12 px-2 py-0.5 text-[13px] text-right bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 disabled:bg-transparent disabled:border-transparent" />
                      <span className="text-[12px] text-gray-400">通</span>
                    </span>
                    <span className="text-[11.5px] text-gray-500 truncate">
                      {r.source}{issued ? `・預かり証 ${md(issued)} 済` : ''}{!can ? '・手元にありません' : ''}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
          <p className="mt-1.5 text-[11.5px] text-gray-400">最初に付いているのは、お客様から預かったもの（契約時に受領・手で足した原本）です。届いた戸籍なども付けられます。通数は手元の数まで。</p>
        </div>

        <div>
          <div className="text-[12px] font-bold text-gray-500 mb-1.5">備考<span className="font-normal text-gray-400 ml-1">任意・2行まで（「以上」の上に入ります）</span></div>
          <div className="space-y-1.5">
            {[0, 1].map(i => (
              <input key={i} type="text" value={notes[i] ?? ''} onChange={e => setNotes(ns => ns.map((v, idx) => (idx === i ? e.target.value : v)))}
                placeholder={i === 0 ? '例）お手続き完了後にご返却いたします。' : ''} className={inp} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
