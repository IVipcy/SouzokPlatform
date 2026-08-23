'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import HintTip from '@/components/ui/HintTip'
import { isIkiikiContract } from '@/lib/constants'
import type { CaseRow, ContractDocumentRow, HeirRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  contractDocuments: ContractDocumentRow[]
  heirs?: HeirRow[]
  /** タスク詳細から作成する際に紐づけるタスクID */
  defaultTaskId?: string
  onSaved?: () => void
}

/** ひな型の「記」は7行ぶん。1枚に載る上限。 */
const MAX_ITEMS = 7

const SENDERS = [
  { key: 'gyosei', label: '行政書士法人オーシャン' },
  { key: 'shiho', label: '司法書士法人オーシャン' },
  { key: 'both', label: '行政＋司法（連名）' },
  { key: 'ikiiki', label: '一般社団法人いきいきライフ協会' },
] as const
type SenderKey = (typeof SENDERS)[number]['key']

type Line = { name: string; quantity: number }

const inp = 'w-full px-2.5 py-1.5 text-[13px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white'

/**
 * 原本預かり証の作成モーダル。
 *
 * お客様から原本をお預かりしたその場でお渡しする控え。
 * 候補は契約手続きタブの受領書類から拾い、「お客様預かり書類」（印鑑証明書・本人確認書類など）は
 * 最初からチェックを入れておく。ここで足したものは書面に載るだけで、受領書類の登録は変えない。
 */
export default function GenponAzukariModal({ isOpen, onClose, caseData, contractDocuments, heirs = [], defaultTaskId, onSaved }: Props) {
  const [receivedDate, setReceivedDate] = useState('')
  const [addressee, setAddressee] = useState('')
  const [sender, setSender] = useState<SenderKey>('gyosei')
  const [lines, setLines] = useState<Line[]>([])
  const [notes, setNotes] = useState<string[]>(['', ''])
  const [busy, setBusy] = useState(false)

  // 宛名の候補：依頼者と、依頼者になっている相続人
  const clientName = (caseData.clients?.name ?? '').trim()
  const nameOptions = [...new Set([clientName, ...heirs.filter(h => h.is_client).map(h => (h.name ?? '').trim())].filter(Boolean))]

  useEffect(() => {
    if (!isOpen) return
    setReceivedDate(new Date().toISOString().slice(0, 10))
    setAddressee(nameOptions[0] ?? '')
    // 差出人の初期値：いきいきの案件はいきいき。それ以外は行政（実務上いちばん多い）
    setSender(isIkiikiContract(caseData.contract_type) ? 'ikiiki' : 'gyosei')

    // お預かりする書類の初期値＝区分「お客様預かり書類」。無ければその場で受領した書類。
    const azukari = contractDocuments.filter(d => d.category === 'お客様預かり書類' && d.status !== '不要')
    const onSite = contractDocuments.filter(d => d.status === 'その場で受領' && d.category !== 'お客様預かり書類')
    const picked = (azukari.length ? azukari : onSite).map(d => (d.name ?? '').trim()).filter(Boolean)
    setLines(picked.slice(0, MAX_ITEMS).map(name => ({ name, quantity: 1 })))
    setNotes(['', ''])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contractDocuments, caseData.contract_type])

  // 候補（まだ行に入っていない受領書類）。押すと行として足せる。
  const suggestions = [...new Set(
    contractDocuments.filter(d => d.status !== '不要').map(d => (d.name ?? '').trim()).filter(Boolean),
  )].filter(n => !lines.some(l => l.name === n))

  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLine = (name = '') => setLines(ls => (ls.length >= MAX_ITEMS ? ls : [...ls, { name, quantity: 1 }]))
  const delLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i))

  const valid = lines.some(l => l.name.trim())

  const generate = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/documents/genpon-azukari', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          receivedDate,
          addressee: addressee.trim(),
          sender,
          items: lines.filter(l => l.name.trim()).map(l => ({ name: l.name.trim(), quantity: l.quantity })),
          notes,
          taskId: defaultTaskId ?? null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error || '作成に失敗しました')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `原本預かり証_${caseData.case_number ?? ''}_${receivedDate}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      showToast('原本預かり証を作成しました', 'success')
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
      isOpen={isOpen}
      onClose={onClose}
      title="原本預かり証を作成"
      maxWidth="max-w-2xl"
      footer={
        <>
          <span className="text-[12px] text-gray-400 mr-auto">お客様から原本をお預かりしたときに、その場でお渡しする控えです。</span>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
          <button onClick={generate} disabled={busy || !valid}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? '作成中...' : 'Excelを作成'}
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
            <div className="text-[12px] font-bold text-gray-500 mb-1.5">
              宛名<span className="font-normal text-gray-400 ml-1">「様」は自動で付きます</span>
            </div>
            <input type="text" list="azukari-names" value={addressee} onChange={e => setAddressee(e.target.value)}
              placeholder="お客様のお名前" className={inp} />
            <datalist id="azukari-names">{nameOptions.map(n => <option key={n} value={n} />)}</datalist>
          </div>
        </div>

        <div>
          <div className="text-[12px] font-bold text-gray-500 mb-1.5">
            <span className="inline-flex items-center gap-1">
              差出人
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
          <div className="text-[12px] font-bold text-gray-500 mb-1.5">
            お預かりする書類
            <span className="font-normal text-gray-400 ml-1">ひな型が7行までなので、7件を超える場合は分けてください（{lines.length}/{MAX_ITEMS}）</span>
          </div>
          {lines.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-gray-400 border border-dashed border-gray-200 rounded">
              下の候補から選ぶか、「行を追加」で入力してください。
            </div>
          ) : (
            <div className="space-y-1.5">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[12px] text-gray-400 w-5 text-right tabular-nums">{i + 1}</span>
                  <input type="text" value={l.name} onChange={e => setLine(i, { name: e.target.value })}
                    placeholder="書類名（例：印鑑証明書）" className={`flex-1 ${inp}`} />
                  <input type="number" min={1} value={l.quantity}
                    onChange={e => setLine(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-16 px-2 py-1.5 text-[13px] text-right bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
                  <span className="text-[12px] text-gray-400">通</span>
                  <button type="button" onClick={() => delLine(i)} className="text-gray-300 hover:text-red-500" title="削除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {lines.length < MAX_ITEMS && (
            <button type="button" onClick={() => addLine()} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              <Plus className="w-3.5 h-3.5" /> 行を追加
            </button>
          )}
          {suggestions.length > 0 && lines.length < MAX_ITEMS && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-400">契約手続きの受領書類から：</span>
              {suggestions.map(n => (
                <button key={n} type="button" onClick={() => addLine(n)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] text-gray-600 bg-gray-50 border border-gray-200 rounded hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700">
                  <Plus className="w-3 h-3" />{n}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-[12px] font-bold text-gray-500 mb-1.5">備考<span className="font-normal text-gray-400 ml-1">任意・2行まで（「以上」の上に入ります）</span></div>
          <div className="space-y-1.5">
            {[0, 1].map(i => (
              <input key={i} type="text" value={notes[i] ?? ''}
                onChange={e => setNotes(ns => ns.map((v, idx) => (idx === i ? e.target.value : v)))}
                placeholder={i === 0 ? '例）お手続き完了後にご返却いたします。' : ''} className={inp} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
