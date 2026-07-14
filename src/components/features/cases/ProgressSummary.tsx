'use client'

// 各タブ/サブタブ共通の「進捗サマリー」（手動）。scope_key でどこのサマリーかを区別する。
// 状態（未着手/対応中/追加調査中/完了）＋文章をワンセットで管理。戸籍相関図など他UIからも参照する。

import { useEffect, useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
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

export default function ProgressSummary({ caseId, scopeKey, title, onSaved }: {
  caseId: string
  scopeKey: string
  title: string
  // メモを保存したら親へ通知（相関図のホバー等をリロードなしで即反映するため）
  onSaved?: (v: { body: string }) => void
}) {
  const supabase = createClient()
  const memberId = useCurrentMember(null)
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<string>('未着手')
  const [meta, setMeta] = useState<{ name: string | null; at: string | null }>({ name: null, at: null })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

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

  // 本文（メモ）の保存。状態は廃止したため既存値をそのまま維持して保存する。
  const saveBody = async () => {
    setSaving(true)
    const ok = await persist(draft, status || '未着手')
    setSaving(false)
    if (ok) { setBody(draft); setEditing(false); onSaved?.({ body: draft }) }
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/50 px-3.5 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-[3px] h-3.5 bg-brand-600 rounded-[1px]" />
        <span className="text-[12.5px] font-semibold text-brand-800">{title}</span>
        {!editing && (
          <button type="button" onClick={() => { setDraft(body); setEditing(true) }} className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-brand-600 hover:text-brand-700 font-semibold">
            <Pencil className="w-3 h-3" /> メモを編集
          </button>
        )}
      </div>

      {editing ? (
        <div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} placeholder="現時点で分かったこと・現状をまとめて記入" className="w-full px-2.5 py-1.5 text-[12.5px] border border-brand-200 rounded-lg outline-none focus:border-brand-400 bg-white" />
          <div className="flex justify-end gap-2 mt-1.5">
            <button type="button" onClick={() => setEditing(false)} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11.5px] text-gray-500 hover:text-gray-700"><X className="w-3 h-3" />取消</button>
            <button type="button" onClick={saveBody} disabled={saving} className="inline-flex items-center gap-1 px-3 py-1 text-[11.5px] font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50"><Check className="w-3 h-3" />保存</button>
          </div>
        </div>
      ) : (
        <>
          <div className={`text-[12.5px] leading-relaxed whitespace-pre-line rounded-lg px-3 py-2 ${body ? 'bg-white text-gray-800 border border-gray-200' : 'text-gray-400 italic'}`}>
            {body || '現状メモは未記入です。「メモを編集」から記入してください。'}
          </div>
          {meta.at && <div className="text-[10.5px] text-gray-400 mt-1.5">最終更新：{meta.name ?? '—'}・{meta.at}</div>}
        </>
      )}
    </div>
  )
}
