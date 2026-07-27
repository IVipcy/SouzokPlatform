'use client'

// 管理担当向け 案件進捗ボード。業務グループ＋対象別サブ項目。上部にルールベース即時サマリー＋「AI進捗要約」(Sonnet 5)。
import { useState } from 'react'
import { Check, Sparkles, Wand2 } from 'lucide-react'
import type { ProgressBoard as Board, ItemStatus } from '@/lib/caseProgressBoard'

const STATUS_LABEL: Record<ItemStatus, string> = { done: '完了', prog: '進行中', todo: '未着手' }
const DONE = '#1D9E75', PROG = '#EF9F27', TODO = '#D8D5CD'
const LBL_COLOR: Record<ItemStatus, string> = { done: '#1D9E75', prog: '#B5651D', todo: '#9a978f' }

function Dot({ st }: { st: ItemStatus }) {
  if (st === 'done') return <span className="w-[15px] h-[15px] rounded-full flex items-center justify-center flex-none" style={{ background: DONE }}><Check className="w-2.5 h-2.5 text-white" strokeWidth={3} /></span>
  if (st === 'prog') return <span className="w-[15px] h-[15px] rounded-full bg-white flex-none" style={{ border: `2px solid ${PROG}`, boxShadow: '0 0 0 3px #FBE7C4' }} />
  return <span className="w-[15px] h-[15px] rounded-full bg-white flex-none" style={{ border: `2px solid ${TODO}` }} />
}

export default function ProgressBoard({ board, dealName }: { board: Board; dealName: string }) {
  const [ai, setAi] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const runAi = async () => {
    setBusy(true); setErr('')
    try {
      const items = board.groups.flatMap(g => g.items.map(i => ({ name: g.count ? `${g.title}・${i.name}` : i.name, status: STATUS_LABEL[i.status], note: i.note })))
      const res = await fetch('/api/progress-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, dealName }) })
      const j = (await res.json()) as { summary?: string; error?: string }
      if (!res.ok) { setErr(j.error ?? '生成に失敗しました'); return }
      setAi(j.summary || '（要約できませんでした）')
    } catch {
      setErr('通信に失敗しました')
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* 全体サマリー */}
      <div className="rounded-2xl border border-[#D5E4FB] bg-[#F4F8FF] px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <Sparkles className="w-4 h-4 text-[#378ADD]" strokeWidth={2} />
          <span className="text-[11.5px] font-semibold text-[#185FA5] tracking-wide">進捗サマリー</span>
          <span className="text-[10px] text-[#7FA8D9] bg-[#E6F1FB] px-1.5 py-0.5 rounded">{ai ? 'AI生成' : '自動'}</span>
          <button type="button" onClick={runAi} disabled={busy} className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-[#185FA5] hover:text-[#0C447C] disabled:opacity-50">
            <Wand2 className="w-3.5 h-3.5" />{busy ? '生成中…' : 'AI進捗要約'}
          </button>
        </div>
        <p className="text-[13.5px] text-[#0C447C] leading-relaxed whitespace-pre-wrap">{ai ?? board.ruleSummary}</p>
        {err && <p className="mt-1.5 text-[11.5px] text-red-600">{err}</p>}
      </div>

      {/* 全体進捗バー */}
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[13px] text-gray-500">案件進捗</span>
          <span className="text-[22px] font-medium text-gray-900">{board.percent}%</span>
          <span className="ml-auto text-[12px] text-gray-400">{board.done} / {board.total} 項目完了</span>
        </div>
        <div className="h-2 rounded-full bg-[#EAE7E0] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${board.percent}%`, background: DONE }} />
        </div>
      </div>

      {/* 業務グループ */}
      <div className="space-y-2.5">
        {board.groups.map((g, gi) => (
          <div key={gi} className={`bg-white border border-gray-200 rounded-2xl ${g.count ? 'px-4 py-3' : 'px-4 py-1.5'}`}>
            {g.count && (
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-medium text-gray-600">{g.title}</span>
                <span className="text-[11px] text-gray-400">{g.count}</span>
                <div className="ml-auto flex gap-1">
                  {g.items.map((i, ii) => <span key={ii} className="w-4 h-[3px] rounded-full" style={{ background: i.status === 'done' ? DONE : i.status === 'prog' ? PROG : '#EAE7E0' }} />)}
                </div>
              </div>
            )}
            {g.items.map((it, ii) => (
              <div key={ii}>
                {ii > 0 && <div className="h-px bg-gray-100 ml-[25px]" />}
                <div className="flex gap-2.5 items-start py-1.5">
                  <span className="pt-0.5"><Dot st={it.status} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-[13.5px] font-medium ${it.status === 'todo' ? 'text-gray-400' : 'text-gray-800'}`}>{it.name}</span>
                      <span className="text-[11px]" style={{ color: LBL_COLOR[it.status] }}>{STATUS_LABEL[it.status]}</span>
                    </div>
                    {it.note && <div className={`text-[12.5px] mt-0.5 ${it.status === 'todo' ? 'text-gray-400' : 'text-gray-600'}`}>{it.note}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
