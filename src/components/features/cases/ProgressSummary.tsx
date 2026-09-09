'use client'

// 各タブ/サブタブ共通の「進捗サマリー」（手動）。scope_key でどこのサマリーかを区別する。
// 状態（未着手/対応中/追加調査中/完了）＋文章をワンセットで管理。戸籍相関図など他UIからも参照する。

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'

export const SUMMARY_STATUSES = ['未着手', '対応中', '追加調査中', '完了'] as const
export type SummaryStatus = (typeof SUMMARY_STATUSES)[number]

// 状態バッジの配色（相関図・TOP表など他コンポーネントからも使う）
export function summaryStatusClass(status: string | null | undefined): string {
  switch (status) {
    case '完了': return 'text-emerald-700 bg-emerald-50 border-emerald-200'
    case '対応中': return 'text-amber-700 bg-amber-50 border-amber-200'
    case '追加調査中': return 'text-brand-700 bg-brand-50 border-brand-200'
    default: return 'text-gray-400 bg-gray-50 border-gray-200'  // 未着手 / 未設定
  }
}

export default function ProgressSummary({ caseId, scopeKey, title, onSaved, collapsible = false }: {
  caseId: string
  scopeKey: string
  title: string
  // メモを保存したら親へ通知（相関図のホバー等をリロードなしで即反映するため）
  onSaved?: (v: { body: string }) => void
  /** true＝閉じた状態で出し、見出しの右の「開く」で開く。閉じているときは1行目を薄く見せる */
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(!collapsible)
  const supabase = createClient()
  const memberId = useCurrentMember(null)
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<string>('未着手')
  const [meta, setMeta] = useState<{ name: string | null; at: string | null }>({ name: null, at: null })
  // 直近に保存した本文。欄から出たときに変わっていれば保存する（作業内容フリー欄と同じ仕様）
  const [savedBody, setSavedBody] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('progress_summaries')
        .select('body, status, updated_at, member:members!progress_summaries_updated_by_fkey(name)')
        .eq('case_id', caseId).eq('scope_key', scopeKey).maybeSingle()
      if (!alive || !data) return
      const d = data as { body: string | null; status: string | null; updated_at: string | null; member: { name: string } | { name: string }[] | null }
      setBody(d.body ?? '')
      setSavedBody(d.body ?? '')
      setStatus(d.status ?? '未着手')
      const m = Array.isArray(d.member) ? d.member[0] : d.member
      setMeta({ name: m?.name ?? null, at: d.updated_at ? d.updated_at.slice(0, 16).replace('T', ' ') : null })
    })()
    return () => { alive = false }
  }, [caseId, scopeKey, supabase])

  // 状態・本文をまとめて保存（upsert は行全体を置換するため両方を渡す）
  const persist = async (nextBody: string, nextStatus: string): Promise<boolean> => {
    const { error } = await supabase.from('progress_summaries').upsert(
      { case_id: caseId, scope_key: scopeKey, body: nextBody, status: nextStatus, updated_by: memberId, updated_at: new Date().toISOString() },
      { onConflict: 'case_id,scope_key' },
    )
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return false }
    setMeta({ name: null, at: new Date().toISOString().slice(0, 16).replace('T', ' ') })
    return true
  }

  // 本文（メモ）の保存。欄から出たとき、変わっていれば保存。状態は廃止したため既存値を維持する。
  const saveBody = async () => {
    if (body === savedBody) return
    const ok = await persist(body, status || '未着手')
    if (ok) { setSavedBody(body); onSaved?.({ body }) }
  }

  return (
    <div className="bg-white px-3.5 pt-3 pb-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-[3px] h-4 bg-brand-600" />
        <span className="text-[15px] font-semibold text-gray-800">{title}</span>
        {!open && <span className="text-[12px] text-gray-400 truncate max-w-[50%]">{body ? body.split('\n')[0] : '（未記入）'}</span>}
        <span className="ml-auto flex items-center gap-3">
          {meta.at && open && <span className="text-[12px] text-gray-400">最終更新：{meta.name ?? '—'}・{meta.at}</span>}
          {collapsible && (
            <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              {open ? '閉じる' : '開く'} {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </span>
      </div>
      {/* 作業内容フリー欄と同じ：書いて欄から出れば保存。ボタンは置かない */}
      {open && (
        <textarea value={body} onChange={e => setBody(e.target.value)} onBlur={() => void saveBody()} rows={3}
          placeholder="現時点で分かったこと・現状をまとめて記入"
          className="w-full px-3 py-2.5 text-[14px] leading-relaxed outline-none rounded-lg" />
      )}
    </div>
  )
}
