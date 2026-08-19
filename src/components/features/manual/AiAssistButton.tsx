'use client'

// テキスト枠ごとに置く「AIに任せる」ボタン。
//
// 押すとメニューが出て、整える／構成する／短くする／ふくらませる／指示して直す を選ぶ。
// 結果は必ず「いまの文」と並べて出し、採用するまで元の文は書き換えない。
// 勝手に上書きされると、書いた本人が何を直されたか分からなくなるため。

import { useState } from 'react'
import { Sparkles, Loader2, X } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'

type Mode = 'polish' | 'structure' | 'shorten' | 'expand' | 'custom'

const MENU: { mode: Mode; label: string; note: string }[] = [
  { mode: 'polish', label: '整える', note: '誤字・言い回しを直す' },
  { mode: 'structure', label: '構成する', note: '読みやすい順に組み直す' },
  { mode: 'shorten', label: '短くする', note: '半分くらいの長さに' },
  { mode: 'expand', label: 'ふくらませる', note: '要点だけ書いた下書きを具体化' },
  { mode: 'custom', label: '指示して直す…', note: '自由に注文する' },
]

export default function AiAssistButton({ text, context, onAdopt, label = 'AIに任せる' }: {
  text: string
  /** この文が置かれているページの見出しなど。文脈をAIに渡す */
  context?: string
  onAdopt: (next: string) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [instruction, setInstruction] = useState('')

  const run = async (mode: Mode, ins?: string) => {
    if (!text.trim()) { showToast('先に文章を書いてください', 'error'); return }
    setOpen(false); setAsking(false); setBusy(true)
    try {
      const res = await fetch('/api/manual/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, text, instruction: ins, context }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(json.error ?? 'AIの呼び出しに失敗しました', 'error'); return }
      setResult(json.result as string)
    } catch {
      showToast('AIの呼び出しに失敗しました', 'error')
    } finally {
      setBusy(false)
      setInstruction('')
    }
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          disabled={busy}
          className="inline-flex items-center gap-1 h-[24px] px-2 text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-md hover:bg-brand-100 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" strokeWidth={2.25} />}
          {label}
        </button>

        {open && (
          <div className="absolute right-0 z-20 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {MENU.map(m => (
              <button
                key={m.mode}
                type="button"
                onClick={() => (m.mode === 'custom' ? (setOpen(false), setAsking(true)) : run(m.mode))}
                className="w-full text-left px-3 py-2 hover:bg-brand-50 border-b border-gray-100 last:border-b-0"
              >
                <div className="text-[12.5px] font-semibold text-gray-700">{m.label}</div>
                <div className="text-[11px] text-gray-400">{m.note}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 自由に指示する */}
      {asking && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={() => setAsking(false)}>
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-md p-4" onClick={e => e.stopPropagation()}>
            <div className="text-[13.5px] font-semibold text-gray-800 mb-2">どう直しますか</div>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              rows={3}
              placeholder="例：管理担当向けの言い方にして、手順を3つに分けて"
              className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-brand-400 resize-y"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={() => setAsking(false)}
                className="px-3 py-1.5 text-[12.5px] font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
              <button type="button" onClick={() => run('custom', instruction)} disabled={!instruction.trim()}
                className="px-3 py-1.5 text-[12.5px] font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">直してもらう</button>
            </div>
          </div>
        </div>
      )}

      {/* 結果（採用するまで元の文は変えない） */}
      {result !== null && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={() => setResult(null)}>
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-3xl p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
              <span className="text-[13.5px] font-semibold text-gray-800">AIの案</span>
              <button type="button" onClick={() => setResult(null)} className="ml-auto text-gray-400 hover:text-gray-700" aria-label="閉じる">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/60">
                <div className="text-[11px] text-gray-400 mb-1">いまの文</div>
                <p className="text-[12.5px] text-gray-600 leading-[1.8] whitespace-pre-wrap">{text}</p>
              </div>
              <div className="border border-brand-200 rounded-lg p-3 bg-brand-50/40">
                <div className="text-[11px] text-brand-600 mb-1">AIの案</div>
                <p className="text-[12.5px] text-gray-800 leading-[1.8] whitespace-pre-wrap">{result}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={() => setResult(null)}
                className="px-3 py-1.5 text-[12.5px] font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">やめる</button>
              <button type="button" onClick={() => { onAdopt(result); setResult(null) }}
                className="px-3 py-1.5 text-[12.5px] font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700">採用する</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
