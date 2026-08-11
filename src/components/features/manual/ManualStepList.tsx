'use client'

// 操作ステップの一覧。章ごとに並べ、ここから新規作成・編集・表示に入る。

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Eye, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { MANUAL_CHAPTERS, type ManualStepRow } from '@/lib/manualStep'

export default function ManualStepList({ steps }: { steps: ManualStepRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const create = async (chapter: string) => {
    setBusy(true)
    const supabase = createClient()
    const sameChapter = steps.filter(s => s.chapter === chapter)
    const { data, error } = await supabase.from('manual_steps')
      .insert({ chapter, title: '', sort_order: sameChapter.length })
      .select('id').single()
    setBusy(false)
    if (error || !data) { showToast(`作成に失敗: ${error?.message ?? ''}`, 'error'); return }
    router.push(`/manual/steps/${(data as { id: string }).id}`)
  }

  const remove = async (s: ManualStepRow) => {
    if (!confirm(`「${s.title || '（無題）'}」を削除しますか。`)) return
    const supabase = createClient()
    const { error } = await supabase.from('manual_steps').delete().eq('id', s.id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {MANUAL_CHAPTERS.map(ch => {
        const list = steps.filter(s => s.chapter === ch)
        return (
          <section key={ch}>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-1 h-4 bg-brand-600 rounded-full" />
              <h2 className="text-[14px] font-bold text-gray-800">{ch}</h2>
              <span className="text-[11.5px] text-gray-400">{list.length}件</span>
              <button type="button" onClick={() => create(ch)} disabled={busy}
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700 border border-brand-300 rounded-md hover:bg-brand-50 disabled:opacity-50">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}ステップを追加
              </button>
            </div>
            {list.length === 0 ? (
              <p className="text-[12px] text-gray-400 py-3 px-3 border border-dashed border-gray-200 rounded-lg">まだありません</p>
            ) : (
              <div className="space-y-1.5">
                {list.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                    <span className="text-[13px] font-semibold text-gray-800 truncate flex-1">{s.title || <span className="text-gray-300">（無題）</span>}</span>
                    <span className="flex items-center gap-1 flex-none">
                      {(s.roles ?? []).map(r => (
                        <span key={r} className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">{r}</span>
                      ))}
                    </span>
                    <span className="text-[11px] text-gray-400 flex-none">画面 {(s.shots ?? []).length}／手順 {(s.items ?? []).length}</span>
                    <span className="text-[11px] font-mono text-gray-400 flex-none">{(s.updated_at ?? '').slice(0, 10)}</span>
                    <Link href={`/manual/steps/${s.id}/view`} className="p-1 text-gray-400 hover:text-brand-700" title="表示を見る"><Eye className="w-4 h-4" /></Link>
                    <Link href={`/manual/steps/${s.id}`} className="p-1 text-gray-400 hover:text-brand-700" title="編集"><Pencil className="w-4 h-4" /></Link>
                    <button type="button" onClick={() => remove(s)} className="p-1 text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
