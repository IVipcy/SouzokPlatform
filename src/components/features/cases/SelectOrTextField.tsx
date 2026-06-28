'use client'

import { useState } from 'react'
import { Pencil, RotateCcw } from 'lucide-react'

/**
 * 選択肢から選ぶ／自由入力に切り替えられるセル内コントロール（ClientInfoTabの連絡内容と同デザイン）。
 * datalistコンボより操作が分かりやすい。<td>は呼び出し側で用意する。
 * - 選択モード: select（末尾に「自由入力に切替」）＋鉛筆ボタン
 * - 自由入力モード: テキスト入力（amber背景）＋「選択肢に戻す」ボタン
 */
export default function SelectOrTextField({ value, options, onSave, placeholder, emptyLabel = '— 選択 —' }: {
  value: string | null
  options: readonly string[]
  onSave: (v: string) => void
  placeholder?: string
  emptyLabel?: string
}) {
  const inList = !!value && options.includes(value)
  const [mode, setMode] = useState<'select' | 'free'>(!!value && !inList ? 'free' : 'select')

  if (mode === 'free') {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          defaultValue={value ?? ''}
          onBlur={e => { if (e.target.value !== (value ?? '')) onSave(e.target.value) }}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-1.5 py-1.5 text-[12px] border border-gray-200 rounded outline-none bg-amber-50/40 focus:border-brand-500 focus:bg-white transition"
        />
        <button
          type="button"
          onClick={() => { if (!inList) onSave(''); setMode('select') }}
          className="text-gray-400 hover:text-brand-600 p-1 flex-shrink-0"
          title="選択肢に戻す"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={inList ? (value as string) : ''}
        onChange={e => { if (e.target.value === '__free__') { setMode('free'); return } onSave(e.target.value) }}
        className="flex-1 min-w-0 px-1.5 py-1.5 text-[12px] border border-gray-200 rounded outline-none bg-white focus:border-brand-500 transition"
      >
        <option value="">{emptyLabel}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
        <option value="__free__">— 自由入力に切替 —</option>
      </select>
      <button
        type="button"
        onClick={() => setMode('free')}
        className="text-gray-400 hover:text-brand-600 p-1 flex-shrink-0"
        title="自由入力に切替"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  )
}
