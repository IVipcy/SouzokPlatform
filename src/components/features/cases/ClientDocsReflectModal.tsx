'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import type { ReflectCandidate } from './ProcedureIntakeSection'

type Row = ReflectCandidate & { checked: boolean }

type Props = {
  isOpen: boolean
  onClose: () => void
  candidates: ReflectCandidate[]
  /** 既に契約残手続きにある書類名（重複追加を避ける）。 */
  existingNames?: string[]
  onConfirm: (docs: { name: string; category: string }[]) => void | Promise<void>
}

/**
 * 役割分担で「依頼者」にした業務を、契約時にもらう書類として契約残手続きに反映するチェックリスト。
 * 郵送で受け取るものだけチェック（戸籍/不動産/金融資産は既定チェック、他は任意）。書類名は編集可。
 * 反映すると受領状況=後日郵送で追加され、到着待ちとして管理できる。
 */
export default function ClientDocsReflectModal({ isOpen, onClose, candidates, existingNames = [], onConfirm }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)

  // 開いたとき候補で初期化（既存と同名は既定チェックを外す）
  useEffect(() => {
    if (!isOpen) return
    const existing = new Set(existingNames)
    setRows(candidates.map(c => ({ ...c, checked: c.defaultChecked && !existing.has(c.name) })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const checkedCount = rows.filter(r => r.checked && r.name.trim()).length

  const confirm = async () => {
    const docs = rows.filter(r => r.checked && r.name.trim()).map(r => ({ name: r.name.trim(), category: r.category }))
    if (docs.length === 0) { onClose(); return }
    setBusy(true)
    await onConfirm(docs)
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="依頼者取得分を契約残手続きに反映"
      maxWidth="max-w-xl"
      footer={
        <>
          <span className="text-[12px] text-gray-400 mr-auto">{checkedCount}件を後日郵送として追加</span>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
          <button onClick={confirm} disabled={busy || checkedCount === 0} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busy ? '反映中...' : '反映する'}
          </button>
        </>
      }
    >
      <p className="text-[12px] text-gray-500 mb-3">
        郵送で受け取るものだけチェックしてください（受領状況「後日郵送」で追加され、到着待ちとして管理できます）。書類名は編集できます。
      </p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-gray-400 text-center py-6">役割分担で「依頼者」にした業務がありません。</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.gyomu} className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={r.checked}
                onChange={e => setRow(i, { checked: e.target.checked })}
                className="w-4 h-4 accent-brand-600 flex-shrink-0"
              />
              <span className="inline-block text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 w-24 text-center flex-shrink-0 truncate">{r.gyomu}</span>
              <input
                type="text"
                value={r.name}
                onChange={e => setRow(i, { name: e.target.value })}
                placeholder="書類名"
                className="flex-1 px-2.5 py-1.5 text-[13px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white"
              />
              <span className="text-[11px] text-gray-400 w-10 text-right flex-shrink-0">{r.category}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
