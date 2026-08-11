'use client'

// 操作ステップの閲覧＋章の管理。
//
// 章（面談 / 受注 / …）をタブで切り替え、その章のステップは開かずに全部表示する。
// 1件ずつ「表示」を押して開くと流れが読めないので、上から通しで読める形にしている。
// 章は manual_chapters（migration 237）に持たせ、この画面から足したり消したりできる。

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Trash2, Loader2, Settings2, Printer, ChevronUp, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import ManualStepView from './ManualStepView'
import type { ManualChapterRow, ManualStepRow } from '@/lib/manualStep'

export default function ManualStepsClient({ chapters, steps }: {
  chapters: ManualChapterRow[]
  steps: ManualStepRow[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  const first = chapters[0]?.name ?? ''
  const current = params.get('chapter') ?? first
  const [busy, setBusy] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [newChapter, setNewChapter] = useState('')

  const list = steps.filter(s => s.chapter === current)

  const goChapter = (name: string) => router.push(`/manual/steps?chapter=${encodeURIComponent(name)}`)

  const addStep = async () => {
    setBusy(true)
    const { data, error } = await supabase.from('manual_steps')
      .insert({ chapter: current, title: '', sort_order: list.length })
      .select('id').single()
    setBusy(false)
    if (error || !data) { showToast(`作成に失敗: ${error?.message ?? ''}`, 'error'); return }
    router.push(`/manual/steps/${(data as { id: string }).id}`)
  }

  const removeStep = async (s: ManualStepRow) => {
    if (!confirm(`「${s.title || '（無題）'}」を削除しますか。`)) return
    const { error } = await supabase.from('manual_steps').delete().eq('id', s.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    router.refresh()
  }

  // ステップの並べ替え（上下）。読む順がそのまま業務の順になるので、ここは触れるようにしておく。
  const moveStep = async (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const a = list[i], b = list[j]
    await Promise.all([
      supabase.from('manual_steps').update({ sort_order: j }).eq('id', a.id),
      supabase.from('manual_steps').update({ sort_order: i }).eq('id', b.id),
    ])
    router.refresh()
  }

  // ── 章の管理 ──
  const addChapter = async () => {
    const name = newChapter.trim()
    if (!name) return
    if (chapters.some(c => c.name === name)) { showToast('同じ名前の章があります', 'error'); return }
    const { error } = await supabase.from('manual_chapters')
      .insert({ name, sort_order: (chapters[chapters.length - 1]?.sort_order ?? 0) + 10 })
    if (error) { showToast(`追加に失敗: ${error.message}`, 'error'); return }
    setNewChapter('')
    router.refresh()
  }
  const renameChapter = async (c: ManualChapterRow, name: string) => {
    const next = name.trim()
    if (!next || next === c.name) return
    // 章の名前はステップ側にも持っているので、まとめて書き換える
    const { error } = await supabase.from('manual_chapters').update({ name: next }).eq('id', c.id)
    if (error) { showToast(`変更に失敗: ${error.message}`, 'error'); return }
    await supabase.from('manual_steps').update({ chapter: next }).eq('chapter', c.name)
    if (current === c.name) goChapter(next); else router.refresh()
  }
  const removeChapter = async (c: ManualChapterRow) => {
    const n = steps.filter(s => s.chapter === c.name).length
    if (n > 0) { showToast(`「${c.name}」にはステップが${n}件あります。先に移動か削除をしてください`, 'error'); return }
    if (!confirm(`章「${c.name}」を削除しますか。`)) return
    const { error } = await supabase.from('manual_chapters').delete().eq('id', c.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    if (current === c.name) goChapter(chapters.find(x => x.id !== c.id)?.name ?? '')
    else router.refresh()
  }
  const moveChapter = async (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= chapters.length) return
    const a = chapters[i], b = chapters[j]
    await Promise.all([
      supabase.from('manual_chapters').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('manual_chapters').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    router.refresh()
  }

  return (
    <div>
      {/* 章タブ */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-4 flex-wrap print:hidden">
        {chapters.map(c => {
          const n = steps.filter(s => s.chapter === c.name).length
          const on = c.name === current
          return (
            <button key={c.id} type="button" onClick={() => goChapter(c.name)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
                on ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'}`}>
              {c.name}
              <span className={`text-[10.5px] px-1.5 rounded-full ${on ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{n}</span>
            </button>
          )
        })}
        <button type="button" onClick={() => setManageOpen(o => !o)}
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-semibold text-gray-500 hover:text-brand-700">
          <Settings2 className="w-3.5 h-3.5" />章の編集
        </button>
      </div>

      {/* 章の追加・改名・削除・並べ替え */}
      {manageOpen && (
        <div className="bg-white border border-gray-200 rounded-lg p-3.5 mb-4 print:hidden">
          <div className="flex items-center gap-2 mb-2.5">
            <input value={newChapter} onChange={e => setNewChapter(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addChapter() }}
              placeholder="章の名前（例: 遺産承継）"
              className="w-56 px-2.5 py-1.5 text-[12.5px] border border-gray-300 rounded-md outline-none focus:border-brand-400" />
            <button type="button" onClick={addChapter}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700">
              <Plus className="w-3.5 h-3.5" />章を追加
            </button>
          </div>
          <div className="space-y-1">
            {chapters.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                <input defaultValue={c.name} onBlur={e => renameChapter(c, e.target.value)}
                  className="w-56 px-2.5 py-1 text-[12.5px] border border-gray-200 rounded-md outline-none focus:border-brand-400" />
                <span className="text-[11px] text-gray-400">{steps.filter(s => s.chapter === c.name).length}件</span>
                <button type="button" onClick={() => moveChapter(i, -1)} disabled={i === 0}
                  className="p-1 text-gray-300 hover:text-brand-600 disabled:opacity-30" title="上へ"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => moveChapter(i, 1)} disabled={i === chapters.length - 1}
                  className="p-1 text-gray-300 hover:text-brand-600 disabled:opacity-30" title="下へ"><ChevronDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => removeChapter(c)}
                  className="p-1 text-gray-300 hover:text-red-500" title="削除（中のステップが無いときだけ）"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">章の名前を変えると、その章のステップの所属もまとめて書き換わります。</p>
        </div>
      )}

      {/* その章のステップを、開かずに上から通しで出す */}
      <div className="flex items-center gap-2 mb-3 print:hidden">
        <span className="text-[15px] font-bold text-gray-900">{current || '章がありません'}</span>
        <span className="text-[11.5px] text-gray-400">{list.length}件</span>
        <button type="button" onClick={() => window.print()}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
          <Printer className="w-3.5 h-3.5" />この章を印刷
        </button>
        <button type="button" onClick={addStep} disabled={busy || !current}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-brand-700 border border-brand-300 rounded-lg hover:bg-brand-50 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}ステップを追加
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-[12.5px] text-gray-400 py-10 text-center border border-dashed border-gray-200 rounded-lg">
          この章にはまだステップがありません。「ステップを追加」から作れます。
        </p>
      ) : (
        <div className="space-y-6">
          {list.map((s, i) => (
            <div key={s.id}>
              <div className="flex items-center gap-2 mb-1.5 print:hidden">
                <span className="text-[11px] font-mono text-gray-400">{i + 1}/{list.length}</span>
                <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0}
                  className="p-1 text-gray-300 hover:text-brand-600 disabled:opacity-30" title="上へ"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => moveStep(i, 1)} disabled={i === list.length - 1}
                  className="p-1 text-gray-300 hover:text-brand-600 disabled:opacity-30" title="下へ"><ChevronDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => removeStep(s)}
                  className="ml-auto p-1 text-gray-300 hover:text-red-500" title="このステップを削除"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <ManualStepView step={s} embedded />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
