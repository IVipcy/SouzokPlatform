'use client'

// 確認依頼コントロール（依頼→確認モデル・A案）。実務タブの各行に置く小さな状態表示。
//   ① 未依頼 → 「◯◯を依頼」ボタン（押すと確認簿の受信箱に上がる）
//   ② 確認待ち → 依頼済みピル＋「取消」（確認前なら依頼を取り消せる）
//   ③ 確認済 → 緑チェック＋確認者
// 完了は止めない・軽い促し。確認（✓）は確認簿側で押す。
import { Send, Clock } from 'lucide-react'
import HankoStamp from '@/components/ui/HankoStamp'

export default function CheckRequestControl({
  label, requestedAt, checkedAt, checkedName, onRequest, onCancel, disabled = false,
}: {
  label: string
  requestedAt: string | null | undefined
  checkedAt: string | null | undefined
  checkedName?: string | null
  onRequest: () => void
  onCancel: () => void
  disabled?: boolean
}) {
  // ③ 確認済（ハンコ）
  if (checkedAt) {
    return <HankoStamp name={checkedName} at={checkedAt} size="sm" />
  }
  // ② 確認待ち（依頼済み・未確認）
  if (requestedAt) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-[10.5px] font-medium bg-amber-50 text-amber-800">
          <Clock className="w-3 h-3" strokeWidth={2} />確認待ち
        </span>
        <button type="button" onClick={onCancel} disabled={disabled} className="text-[10px] text-gray-400 hover:text-gray-600 underline disabled:opacity-50">取消</button>
      </span>
    )
  }
  // ① 未依頼
  return (
    <button
      type="button"
      onClick={onRequest}
      disabled={disabled}
      className="inline-flex items-center gap-1 h-[24px] px-2 rounded-md text-[11px] font-medium bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 hover:-translate-y-px transition disabled:opacity-50 disabled:hover:translate-y-0 whitespace-nowrap"
    >
      <Send className="w-3 h-3" strokeWidth={2} />{label}
    </button>
  )
}
