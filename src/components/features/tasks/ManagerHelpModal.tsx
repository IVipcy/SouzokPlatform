'use client'

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createManagerReviewTask, type HelpType } from '@/lib/managerReviewTask'

const OPTIONS: { key: HelpType; label: string; sub: string }[] = [
  { key: 'next_unknown', label: '次にやるべきタスクが分からない', sub: '次を教えてほしい' },
  { key: 'too_hard', label: '次は分かるが難しくてできない', sub: '巻き取ってほしい' },
  { key: 'how_to', label: '今の作業の進め方が分からない', sub: '相談したい' },
]

// 作業中に管理担当へヘルプを依頼するモーダル（状況3択＋内容）。ヘルプタスク＋アラートを生成。
export default function ManagerHelpModal({ isOpen, onClose, caseId, taskId, taskTitle, requestedBy, onSubmitted }: {
  isOpen: boolean
  onClose: () => void
  caseId: string
  taskId: string
  taskTitle: string
  requestedBy?: string | null
  onSubmitted?: () => void
}) {
  const [type, setType] = useState<HelpType>('how_to')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!content.trim()) return
    setSaving(true)
    await createManagerReviewTask({ caseId, content: content.trim(), helpType: type, fromTaskTitle: taskTitle, fromTaskId: taskId, requestedBy })
    setSaving(false)
    showToast('管理担当にヘルプを依頼しました', 'success')
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
        <div className="flex items-center gap-2 text-[12.5px] text-amber-800">
          <HelpCircle className="w-4 h-4 text-amber-600" strokeWidth={2} />
          どんな状況ですか？
        </div>
        <div className="flex flex-col gap-1.5">
          {OPTIONS.map(o => {
            const on = type === o.key
            return (
              <button key={o.key} type="button" onClick={() => setType(o.key)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${on ? 'border-2 border-amber-400 bg-amber-50' : 'border border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-semibold ${on ? 'text-amber-800' : 'text-gray-800'}`}>{o.label}</div>
                  <div className="text-[11px] text-gray-500">→ {o.sub}</div>
                </div>
              </button>
            )
          })}
        </div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={3}
          placeholder="具体的に困っていること（例：評価証明の請求先が複数市区町村にまたがる。どう進める？）"
          className="w-full px-2.5 py-2 text-[13px] border border-gray-300 rounded-lg outline-none focus:border-amber-400"
        />
      </div>
    </Modal>
  )
}
