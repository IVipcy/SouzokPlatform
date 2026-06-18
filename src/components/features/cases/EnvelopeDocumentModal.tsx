'use client'

import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import { ENVELOPE_VARIANTS } from '@/lib/envelopeVariants'
import type { CaseRow, TaskRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  tasks: TaskRow[]
  defaultTaskId?: string
  onSaved?: () => void
}

export default function EnvelopeDocumentModal({ isOpen, onClose, caseData, tasks, defaultTaskId, onSaved }: Props) {
  const [variantKey, setVariantKey] = useState<string>('naga3_white')
  const [taskId, setTaskId] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setVariantKey('naga3_white')
    setTaskId(defaultTaskId ?? '')
  }, [isOpen, defaultTaskId])

  const variant = ENVELOPE_VARIANTS.find(v => v.key === variantKey)

  const handleGenerate = async () => {
    if (!caseData.clients?.address) {
      showToast('依頼者の住所が未入力です（依頼者タブで設定してください）', 'error')
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/documents/envelope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: caseData.id, variant: variantKey, taskId: taskId || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '生成に失敗しました' }))
        showToast(`生成に失敗: ${err.error ?? '不明なエラー'}`, 'error')
        return
      }
      const blob = await res.blob()
      const filename = `封筒_${variant?.label ?? ''}_${caseData.case_number ?? ''}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      showToast('封筒を生成しました', 'success')
      onSaved?.()
      onClose()
    } catch (e) {
      showToast(`通信エラー: ${(e as Error).message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="封筒（宛名）を作成"
      maxWidth="max-w-lg"
      footer={
        <>
          <button onClick={onClose} disabled={generating} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50">キャンセル</button>
          <button onClick={handleGenerate} disabled={generating} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50">{generating ? '生成中…' : 'Excelで出力'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">封筒の種類</label>
          <div className="flex flex-col gap-2">
            {ENVELOPE_VARIANTS.map(v => (
              <button key={v.key} type="button" onClick={() => setVariantKey(v.key)}
                className={`text-left text-sm px-3 py-2 rounded-lg border transition-colors ${variantKey === v.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'}`}>
                {v.label}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1.5">
          <div className="flex gap-3"><span className="text-gray-500 w-16 flex-shrink-0">宛名</span><span className="text-gray-800">{caseData.clients?.name ?? '（未設定）'} 様</span></div>
          <div className="flex gap-3"><span className="text-gray-500 w-16 flex-shrink-0">郵便番号</span><span className="text-gray-800">{caseData.clients?.postal_code ?? '（未設定）'}</span></div>
          <div className="flex gap-3"><span className="text-gray-500 w-16 flex-shrink-0">住所</span><span className="text-gray-800">{caseData.clients?.address ?? '（未設定）'}</span></div>
        </section>

        {/* 作成タスク */}
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">作成タスク（任意）</label>
          <select value={taskId} onChange={e => setTaskId(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400">
            <option value="">案件全体（タスク未指定）</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </section>

        <p className="text-[12px] text-gray-400">差出人（オーシャン）はテンプレートに既設です。郵便番号・住所・宛名を依頼者情報から流し込みます。</p>
      </div>
    </Modal>
  )
}
