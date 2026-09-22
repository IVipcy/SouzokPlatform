'use client'

// 案件管理タブ「案件情報」の「関連案件」行。
//   ・いま結んでいる案件を並べる（案件番号・案件名・依頼者・一言メモ。押すと相手の案件へ）
//   ・「＋ 関連案件を足す」→ 案件番号／案件名／依頼者名で探して選ぶ。メモはあとから直せる
//   ・結びは向きなし（相手の案件からも同じ関連として見える）。外すとどちらからも消える
// 表示はここ以外に 案件ヘッダーのチップ と 案件一覧の「関連 n」。

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, X, ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { getCaseStatusLabel } from '@/lib/constants'
import { searchCasesForRelation, type RelatedCase } from '@/lib/caseRelations'

export default function RelatedCasesField({ caseId, relations, currentMemberId, onChanged }: {
  caseId: string
  relations: RelatedCase[]
  currentMemberId: string | null
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<RelatedCase['other'][]>([])
  const [searching, setSearching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!adding) return
    if (timer.current) clearTimeout(timer.current)
    const term = q.trim()
    timer.current = setTimeout(() => {
      ;(async () => {
        if (!term) { setHits([]); return }
        setSearching(true)
        const r = await searchCasesForRelation(createClient(), term, caseId, relations.map(x => x.other.id))
        setHits(r)
        setSearching(false)
      })()
    }, term ? 250 : 0)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, adding, caseId, relations])

  const add = async (other: RelatedCase['other']) => {
    const { error } = await createClient().from('case_relations').insert({ case_id: caseId, related_case_id: other.id, created_by_member_id: currentMemberId })
    if (error) { showToast(`関連案件の追加に失敗: ${error.message}`, 'error'); return }
    setAdding(false); setQ(''); setHits([])
    showToast(`「${other.deal_name}」を関連案件にしました`, 'success')
    onChanged()
  }
  const remove = async (r: RelatedCase) => {
    const { error } = await createClient().from('case_relations').delete().eq('id', r.relationId)
    if (error) { showToast(`外せませんでした: ${error.message}`, 'error'); return }
    onChanged()
  }
  const saveNote = async (r: RelatedCase, note: string) => {
    const v = note.trim() || null
    if (v === (r.note ?? null)) return
    const { error } = await createClient().from('case_relations').update({ note: v }).eq('id', r.relationId)
    if (error) { showToast(`メモの保存に失敗: ${error.message}`, 'error'); return }
    onChanged()
  }

  return (
    <div className="space-y-1.5">
      {relations.length === 0 && !adding && <div className="text-[13px] text-gray-400 italic">なし</div>}
      {relations.map(r => (
        <div key={r.relationId} className="flex items-center gap-2 min-w-0">
          <Link href={`/cases/${r.other.id}`} className="inline-flex items-center gap-1.5 max-w-[60%] min-w-0 px-2 py-1 border border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100 text-[12.5px]" title={`${r.other.case_number}｜${getCaseStatusLabel(r.other.status)}`}>
            <span className="font-mono text-[11.5px] text-brand-600 flex-none">{r.other.case_number}</span>
            <span className="font-semibold truncate">{r.other.deal_name}</span>
            {r.other.client_name && <span className="text-[11.5px] text-brand-700/70 flex-none">（{r.other.client_name}）</span>}
            <ArrowUpRight className="w-3 h-3 flex-none" />
          </Link>
          <input type="text" defaultValue={r.note ?? ''} onBlur={e => void saveNote(r, e.target.value)} placeholder="一言メモ（例：二次相続・兄の案件）"
            className="input-flat flex-1 min-w-0 px-2 py-1 text-[13px] text-gray-800 outline-none" />
          <button type="button" onClick={() => void remove(r)} title="関連を外す" className="flex-none text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      {adding ? (
        <div className="relative">
          <div className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-gray-400 flex-none" />
            <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="案件番号・案件名・依頼者名で探す"
              className="input-flat flex-1 min-w-0 px-2 py-1 text-[13px] text-gray-800 outline-none" />
            <button type="button" onClick={() => { setAdding(false); setQ(''); setHits([]) }} className="text-[12px] text-gray-500 hover:text-gray-700 flex-none">やめる</button>
          </div>
          {(q.trim() && (hits.length > 0 || !searching)) && (
            <div className="absolute z-20 left-5 right-0 mt-1 bg-white border border-gray-300 shadow-lg p-1 text-[12.5px] max-h-64 overflow-y-auto">
              {hits.length === 0 ? (
                <div className="px-2 py-1.5 text-gray-400">{searching ? '探しています…' : '見つかりません'}</div>
              ) : hits.map(h => (
                <button key={h.id} type="button" onClick={() => void add(h)} className="w-full text-left px-2 py-1.5 hover:bg-brand-50 flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11.5px] text-gray-500 flex-none">{h.case_number}</span>
                  <span className="font-semibold text-gray-800 truncate">{h.deal_name}</span>
                  {h.client_name && <span className="text-[11.5px] text-gray-500 flex-none">{h.client_name}</span>}
                  <span className="ml-auto text-[11px] text-gray-400 flex-none">{getCaseStatusLabel(h.status)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] text-gray-500 border border-dashed border-gray-300 hover:border-brand-400 hover:text-brand-700 self-start"><Plus className="w-3 h-3" />関連案件を足す</button>
      )}
    </div>
  )
}
