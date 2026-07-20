// 常時表示のヒント（青カレット）。灰色ベタ文字をやめ、薄い青背景＋iアイコンで読みやすく。
// 「ここで何をするか」を常に見せたい説明に使う。詳細・例外はHintTip（?マーク）に畳む。
import { Info } from 'lucide-react'

export default function HintNote({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-2 bg-brand-50 rounded-lg px-3 py-2 ${className}`}>
      <Info className="w-3.5 h-3.5 flex-none text-brand-500 mt-[3px]" strokeWidth={2.25} aria-hidden="true" />
      <p className="text-[12px] leading-relaxed text-brand-800">{children}</p>
    </div>
  )
}
