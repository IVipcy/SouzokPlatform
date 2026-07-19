'use client'

import { useState, useEffect } from 'react'
import { Trash2, Plus, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow, ContractDocumentRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  contractDocuments: ContractDocumentRow[]
  /** タスク詳細から作成する際に紐づけるタスクID */
  defaultTaskId?: string
  onSaved?: () => void
}

type ListOps = { set: (i: number, v: string) => void; add: () => void; del: (i: number) => void }

// 書類名リスト編集UI。※親コンポーネント内に定義すると毎レンダーで型が変わり
//   入力ごとに input が再マウントされてフォーカスが外れるため、モジュールレベルに置く。
function ListEditor({ label, hint, list, ops }: { label: string; hint?: string; list: string[]; ops: ListOps }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-gray-500 mb-1.5">{label}{hint && <span className="font-normal text-gray-400 ml-1">{hint}</span>}</div>
      <div className="space-y-1.5">
        {list.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[12px] text-gray-400 w-5 text-right tabular-nums">{i + 1}</span>
            <input
              type="text"
              value={v}
              onChange={e => ops.set(i, e.target.value)}
              placeholder="書類名"
              className="flex-1 px-2.5 py-1.5 text-[13px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
            />
            <button type="button" onClick={() => ops.del(i)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      {list.length < 10 && (
        <button type="button" onClick={ops.add} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
          <Plus className="w-3.5 h-3.5" /> 行を追加
        </button>
      )}
    </div>
  )
}

/**
 * 郵送書類確認票の生成モーダル。
 * 「ご返送書類一覧」は契約残手続き(contract_documents)の「不要」以外を初期表示し、編集して生成する。
 * 生成は /api/documents/mailing-confirmation（テンプレ xlsx 流し込み）。
 */
export default function MailingConfirmationModal({ isOpen, onClose, caseData, contractDocuments, defaultTaskId, onSaved }: Props) {
  const [returnDocs, setReturnDocs] = useState<string[]>([])
  const [sendDocs, setSendDocs] = useState<string[]>(['契約書一式'])
  const [shipDate, setShipDate] = useState('')
  const [clientStaff, setClientStaff] = useState('')
  const [busy, setBusy] = useState(false)

  // 開いたら契約残手続きの返送分（不要以外）で初期化。
  // 契約残手続きが未登録 or 該当0件の場合は既定の4点を初期表示（ユーザー編集可）。
  useEffect(() => {
    if (!isOpen) return
    const names = contractDocuments.filter(d => d.status !== '不要').map(d => (d.name ?? '').trim()).filter(Boolean)
    setReturnDocs(names.length ? names : ['契約書', '委任状', '本人確認書類', '印鑑証明書'])
    setSendDocs(['契約書一式'])
    setShipDate(''); setClientStaff('')
  }, [isOpen, contractDocuments])

  const editList = (list: string[], set: (v: string[]) => void) => ({
    set: (i: number, v: string) => set(list.map((x, idx) => idx === i ? v : x)),
    add: () => set([...list, '']),
    del: (i: number) => set(list.filter((_, idx) => idx !== i)),
  })
  const ret = editList(returnDocs, setReturnDocs)
  const snd = editList(sendDocs, setSendDocs)

  const generate = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/documents/mailing-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          returnDocs: returnDocs.map(s => s.trim()).filter(Boolean),
          sendDocs: sendDocs.map(s => s.trim()).filter(Boolean),
          shipDate: shipDate || null,
          clientStaff: clientStaff || null,
          taskId: defaultTaskId ?? null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error || '生成に失敗しました')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `郵送書類確認票_${caseData.case_number ?? ''}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      showToast('郵送書類確認票を作成しました', 'success')
      onSaved?.()
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '生成に失敗しました', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="郵送書類確認票を作成"
      maxWidth="max-w-2xl"
      footer={
        <>
          <span className="text-[12px] text-gray-400 mr-auto">契約書と同封してお客様へ郵送する確認票（Excel）を生成します。</span>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
          <button onClick={generate} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {busy ? '生成中...' : 'Excelを生成'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ListEditor label="ご返送書類一覧" hint="お客様に返送してもらう書類です（契約残手続きの内容が最初に入ります）" list={returnDocs} ops={ret} />
        <ListEditor label="送付書類一覧" hint="こちらから送る書類（任意）" list={sendDocs} ops={snd} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] font-bold text-gray-500 mb-1.5">発送日<span className="font-normal text-gray-400 ml-1">任意</span></div>
            <input type="date" value={shipDate} onChange={e => setShipDate(e.target.value)} className="w-full px-2.5 py-1.5 text-[13px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
          </div>
          <div>
            <div className="text-[12px] font-bold text-gray-500 mb-1.5">お客様担当<span className="font-normal text-gray-400 ml-1">任意</span></div>
            <input type="text" value={clientStaff} onChange={e => setClientStaff(e.target.value)} placeholder="担当者名" className="w-full px-2.5 py-1.5 text-[13px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
          </div>
        </div>
      </div>
    </Modal>
  )
}
