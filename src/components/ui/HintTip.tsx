'use client'

// 見出し等の横に置く「?」ヘルプ。常時表示のヘルプ文をホバー（＋フォーカス）に畳んで、画面のごちゃつきを防ぐ。
// 使い方: <HintTip text="…説明…" />  ／ 見出しに寄せる場合は <Section hint="…" /> 経由でも可。
export default function HintTip({ text, className = '', width = 224 }: { text: string; className?: string; width?: number }) {
  return (
    <span
      className={`group relative inline-flex items-center justify-center w-[15px] h-[15px] rounded-full border border-gray-300 text-gray-400 text-[10px] leading-none cursor-help align-middle select-none ${className}`}
      tabIndex={0}
      role="button"
      aria-label={text}
    >
      ?
      <span
        role="tooltip"
        style={{ width }}
        className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 absolute top-[135%] left-0 z-50 bg-white text-gray-600 border border-gray-200 rounded-lg px-2.5 py-2 text-[11px] font-normal leading-relaxed shadow-xl transition-opacity"
      >
        {text}
      </span>
    </span>
  )
}
