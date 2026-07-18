'use client'

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createManagerReviewTask } from '@/lib/managerReviewTask'

// 作業中に管理担当へヘルプを依頼するモーダル。
// 作業中の相談＝「今の作業の進め方が分からない（相談したい）」の1本に固定。
// （「次を教えて／巻き取り」は完了モーダル側で扱う）
export default function ManagerHelpModal({ isOpen, onClose, caseId, taskId, taskTitle, requestedBy, onSubmitted }: {
  isOpen: boolean
  onClose: () => void
  caseId: string
  taskId: string
  taskTitle: string
  requestedBy?: string | null
  onSubmitted?: () => void
}) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!content.trim()) return
    setSaving(true)
    const res = await createManagerReviewTask({ caseId, content: content.trim(), helpType: 'how_to', fromTaskTitle: taskTitle, fromTaskId: taskId, requestedBy })
    setSaving(false)
    if (res.notified > 0) showToast(`管理担当${res.notified}名にヘルプを依頼しました`, 'success')
    else showToast(res.error ?? 'ヘルプ依頼の通知に失敗しました', 'error')
    onSubmitted?.()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="管理担当にヘルプを依頼"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={submit} disabled={!content.trim() || saving}>
            {saving ? '依頼中...' : '管理担当に依頼する'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <HelpCircle className="w-4 h-4 text-amber-600 flex-none mt-0.5" strokeWidth={2} />
          <span>今の作業の進め方が分からないとき、管理担当に相談できます。（次のタスクの相談・巻き取りは「完了する」時に依頼できます）</span>
        </div>
        <div>
          <div className="text-[12px] font-semibold text-gray-500 mb-1">困っていること <span className="text-red-500">*</span></div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            placeholder="例：評価証明の請求先が複数市区町村にまたがる。どう進める？"
            className="w-full px-2.5 py-2 text-[13px] border border-gray-300 rounded-lg outline-none focus:border-amber-400"
          />
        </div>
      </div>
    </Modal>
  )
}
