'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, X, Loader2, UserPlus, Compass } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import UserAvatar from '@/components/ui/UserAvatar'

export type TeamMemberKind = 'member' | 'mentor'

export type TeamMemberEntry = {
  /** dashboard_team_members.id（既に追加されている場合） */
  id?: string
  member_id: string
  name: string
  avatar_color: string | null
  avatar_url: string | null
  primary_role: string | null
  kind: TeamMemberKind
  /** 達成リング表示用 */
  achieved?: boolean
}

type Props = {
  teamId: string
  /** 現在のチームに登録済のメンバー（member + mentor 含む） */
  entries: TeamMemberEntry[]
  /** 追加候補（全アクティブメンバー） */
  candidates: Array<{ id: string; name: string; avatar_color: string | null; avatar_url: string | null; primary_role: string | null }>
  /** URL で選択中のメンバーID (?member=) */
  selectedMemberId?: string | null
  /** 遷移先のベースパス（例: '/dashboard/team/xxx'）。
   *  メンバー選択時は `${basePath}?member={id}` に遷移、全体は basePath そのまま */
  basePath: string
}

/**
 * チームダッシュボード用のメンバータブ + メンバー追加 UI。
 * dashboard_team_members を読み書きする。
 *
 * - 「メンバー」(集計対象) / 「メンター」(集計除外) を区別表示
 * - 「+ メンバー追加」で検索ルックアップから選択 + 区分を指定して追加
 * - 行ホバーで × ボタンが出て削除可
 */
export default function TeamMemberTabs({
  teamId,
  entries,
  candidates,
  selectedMemberId,
  basePath,
}: Props) {
  const buildMemberHref = (mid: string) => `${basePath}?member=${mid}`
  const buildAllHref = () => basePath
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = () => startTransition(() => router.refresh())

  const members = entries.filter(e => e.kind === 'member')
  const mentors = entries.filter(e => e.kind === 'mentor')

  const registeredIds = useMemo(() => new Set(entries.map(e => e.member_id)), [entries])

  const handleRemove = async (entryId: string) => {
    if (!entryId || busy) return
    if (!confirm('このメンバーをチームから外しますか？\n（社員マスタの所属は変わりません）')) return
    setBusy(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('dashboard_team_members').delete().eq('id', entryId)
      if (error) throw error
      showToast('メンバーを外しました', 'success')
      // 削除したメンバーが selected の場合、URL から ?member= を外す
      if (selectedMemberId && entries.find(e => e.id === entryId)?.member_id === selectedMemberId) {
        const params = new URLSearchParams(searchParams.toString())
        params.delete('member')
        const qs = params.toString()
        router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
      }
      refresh()
    } catch (e) {
      console.error(e)
      showToast('削除に失敗しました', 'error')
    } finally {
      setBusy(false)
    }
  }

  const isAllActive = !selectedMemberId

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-gray-500 tracking-wider uppercase">メンバー</span>
          <span className="text-[11px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
            {members.length}人{mentors.length > 0 ? ` + メンター${mentors.length}人` : ''}
          </span>
        </div>
        {!addOpen ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md transition-colors"
          >
            <Plus className="w-3 h-3" strokeWidth={2.5} />
            メンバー追加
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(false)}
            className="text-[11px] text-gray-500 hover:text-gray-700"
          >
            閉じる
          </button>
        )}
      </div>

      {/* タブ一覧 */}
      <div className="flex flex-wrap gap-2">
        {/* 全体タブ */}
        <button
          type="button"
          onClick={() => router.replace(buildAllHref(), { scroll: false })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors ${
            isAllActive
              ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          チーム全体
        </button>

        {/* チームメンバー */}
        {members.map(m => {
          const isActive = selectedMemberId === m.member_id
          return (
            <div key={m.member_id} className="relative group">
              <button
                type="button"
                onClick={() => router.replace(buildMemberHref(m.member_id), { scroll: false })}
                className={`inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-lg text-[13px] font-medium border transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 border-brand-300'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <UserAvatar
                  name={m.name}
                  role={m.primary_role as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | undefined}
                  url={m.avatar_url}
                  size="sm"
                />
                <span>{m.name}</span>
              </button>
              {m.id && (
                <button
                  type="button"
                  onClick={() => handleRemove(m.id!)}
                  disabled={busy}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title="チームから外す"
                >
                  <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          )
        })}

        {/* メンター（集計除外） */}
        {mentors.map(m => {
          const isActive = selectedMemberId === m.member_id
          return (
            <div key={m.member_id} className="relative group">
              <button
                type="button"
                onClick={() => router.replace(buildMemberHref(m.member_id), { scroll: false })}
                title="メンター（集計には含めません）"
                className={`inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-lg text-[13px] font-medium border-2 border-dashed transition-colors ${
                  isActive
                    ? 'bg-purple-50 text-purple-800 border-purple-400'
                    : 'bg-white text-gray-600 border-purple-200 hover:bg-purple-50/40'
                }`}
              >
                <Compass className="w-3 h-3 text-purple-500" strokeWidth={2.25} />
                <span>{m.name}</span>
                <span className="text-[10px] text-purple-500 font-bold">[メンター]</span>
              </button>
              {m.id && (
                <button
                  type="button"
                  onClick={() => handleRemove(m.id!)}
                  disabled={busy}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title="チームから外す"
                >
                  <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* 追加ピッカー */}
      {addOpen && (
        <AddMemberPicker
          teamId={teamId}
          candidates={candidates.filter(c => !registeredIds.has(c.id))}
          onAdded={() => {
            setAddOpen(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function AddMemberPicker({
  teamId,
  candidates,
  onAdded,
}: {
  teamId: string
  candidates: Array<{ id: string; name: string; avatar_color: string | null; avatar_url: string | null; primary_role: string | null }>
  onAdded: () => void
}) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<TeamMemberKind>('member')
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates.slice(0, 20)
    return candidates.filter(c => c.name.toLowerCase().includes(q)).slice(0, 20)
  }, [candidates, query])

  const handleAdd = async (memberId: string) => {
    setBusyId(memberId)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('dashboard_team_members').insert({
        team_id: teamId,
        member_id: memberId,
        kind,
      })
      if (error) throw error
      showToast(`「${kind === 'member' ? 'メンバー' : 'メンター'}」として追加しました`, 'success')
      onAdded()
    } catch (e) {
      console.error(e)
      showToast('追加に失敗しました', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-3 p-3 bg-gray-50/60 border border-gray-200 rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <span className="text-[13px] font-bold text-gray-700">メンバー追加</span>
      </div>

      {/* 区分選択 */}
      <div>
        <div className="text-[11px] font-semibold text-gray-500 mb-1">追加区分</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setKind('member')}
            className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[12px] font-semibold border-2 transition-colors ${
              kind === 'member'
                ? 'bg-brand-50 border-brand-500 text-brand-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-brand-300'
            }`}
          >
            👥 チームメンバー
            <span className="text-[10px] font-normal">(集計に含める)</span>
          </button>
          <button
            type="button"
            onClick={() => setKind('mentor')}
            className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[12px] font-semibold border-2 transition-colors ${
              kind === 'mentor'
                ? 'bg-purple-50 border-purple-500 text-purple-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-purple-300'
            }`}
          >
            <Compass className="w-3 h-3" strokeWidth={2.25} />
            メンター
            <span className="text-[10px] font-normal">(集計外)</span>
          </button>
        </div>
      </div>

      {/* 検索 */}
      <input
        type="text"
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="名前で検索"
        className="w-full px-2 py-1 text-[12px] border border-gray-300 rounded outline-none focus:ring-1 focus:ring-brand-300 focus:border-brand-400 bg-white"
      />

      {/* 候補リスト */}
      <div className="max-h-[240px] overflow-y-auto rounded border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-gray-400">
            {query ? '該当するメンバーはいません' : '追加可能なメンバーはいません'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map(c => {
              const isBusy = busyId === c.id
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleAdd(c.id)}
                    disabled={isBusy}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-brand-50/40 disabled:opacity-50 transition-colors text-left"
                  >
                    <UserAvatar
                      name={c.name}
                      role={c.primary_role as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | undefined}
                      url={c.avatar_url}
                      size="sm"
                    />
                    <span className="flex-1 text-[12px] font-medium text-gray-800 truncate">{c.name}</span>
                    {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
