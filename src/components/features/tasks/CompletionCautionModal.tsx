'use client'

// タスク完了ボタンを押した直後、完了モーダルの前に軽く挟む注意ポップアップ。
// 「今すぐ依頼」で確認依頼をその場で出して完了へ／「このまま完了へ」で注意だけ見て進む。止めない。
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { AlertTriangle, Send, ArrowRight } from 'lucide-react'
import type { CompletionCaution } from '@/lib/completionCaution'

export default function CompletionCautionModal({ caution, busy, onRequest, onProceed, onClose }: {
  caution: CompletionCaution
  busy: boolean
  onRequest: () => void
  onProceed: () => void
  onClose: () => void
}) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="完了する前に、ひとつ確認"
      maxWidth="max-w-sm"
      footer={
        <>
          {caution.requestLabel && (
            <Button variant="secondary" onClick={onRequest} loading={busy}>
              <Send className="w-4 h-4" />{caution.requestLabel}
            </Button>
          )}
          <Button variant="primary" onClick={onProceed} disabled={busy}>
            このまま完了へ<ArrowRight className="w-4 h-4" />
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-none">
          <AlertTriangle className="w-5 h-5 text-amber-600" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-gray-800 leading-snug">{caution.title}</div>
          <p className="text-[12.5px] text-gray-500 mt-1 leading-relaxed">{caution.note}</p>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 text-center mt-3">確認していなくても完了はできます（念のための確認です）</p>
    </Modal>
  )
}
