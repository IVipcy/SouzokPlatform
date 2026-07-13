'use client'

import { useState } from 'react'
import { Check, Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import type { MemberRow } from '@/types'

// 受注担当 → 管理担当への引き継ぎ。受注担当と同じチームの管理担当から選び、
// アサイン＋作業進行中へ遷移＋通知。あとで担当者タブから付け替え可。
export default function HandoffModal({ isOpen, onClose, caseId, salesMemberId, allMembers, onDone }: {
  isOpen: boolean
  onClose: () => void
  caseId: string
  salesMemberId: string | null
  allMembers: MemberRow[]
  onDone: () => void
}) {
  const salesTeam = salesMemberId ? allMembers.find(m => m.id === salesMemberId)?.team_id ?? null : null
  const managers = allMembers.filter(m => m.is_active && m.primary_role === 'manager')
  const sameTeam = salesTeam ? managers.filter(m => m.team_id === salesTeam) : []
  const noSameTeam = sameTeam.length === 0
  const defaultList = noSameTeam ? managers : sameTeam

  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // 検索時は全チームの管理担当から。未入力時は同じチーム（無ければ全員）。
  const displayed = q ? managers.filter(m => (m.name ?? '').toLowerCase().includes(q)) : defaultList

  const [picked, setPicked] = useState<string | null>(defaultList[0]?.id ?? null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!picked) return
    setSaving(true)
    const supabase = createClient()
    // 管理担当をアサイン（置き換え）
    await supabase.from('case_members').delete().eq('case_id', caseId).eq('role', 'manager')
    const { error } = await supabase.from('case_members').insert({ case_id: caseId, member_id: picked, role: 'manager' })
    if (error) { showToast(`引き継ぎに失敗しました: ${error.message}`, 'error'); setSaving(false); return }
    // 作業進行中へ遷移
    await supabase.from('cases').update({ status: '対応中' }).eq('id', caseId)
    // 引き継ぎ通知
    await supabase.from('notifications').insert({
      member_id: picked, type: 'case_handoff', case_id: caseId,
      title: '案件を引き継ぎました', body: '受注担当から管理担当として案件を引き継ぎました。',
    })
    setSaving(false)
    showToast('管理担当へ引き継ぎました（作業進行中）', 'success')
    onDone()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="管理担当へ引き継ぐ"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={submit} disabled={!picked || saving}>
            {saving ? '引き継ぎ中...' : '引き継ぐ（作業進行中へ）'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-[12.5px] text-gray-600">
          {noSameTeam
            ? '同じチームに管理担当がいないため、全ての管理担当を表示しています。'
            : '同じチームの管理担当から選んでください。別チームの人は検索で選べます。'}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={1.75} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="名前で検索（別チームの管理担当も選べます）"
            className="w-full h-10 pl-9 pr-3 text-[13px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-brand-500 focus:bg-white"
          />
        </div>
        {displayed.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-6 text-center text-[12px] text-gray-400">{q ? '該当する管理担当がいません。' : '管理担当が登録されていません。'}</div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto">
            {displayed.map(m => {
              const on = picked === m.id
              return (
                <button key={m.id} type="button" onClick={() => setPicked(m.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${on ? 'border-2 border-brand-400 bg-brand-50' : 'border border-gray-200 hover:bg-gray-50'}`}>
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>{m.name[0]}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-semibold ${on ? 'text-brand-700' : 'text-gray-800'}`}>{m.name}</div>
                    <div className="text-[11px] text-gray-500">管理担当</div>
                  </div>
                  {on && <Check className="w-4 h-4 text-brand-600 flex-shrink-0" strokeWidth={2.25} />}
                </button>
              )
            })}
          </div>
        )}
        <div className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          引き継ぐと作業進行中に遷移し、その管理担当へ通知します。受注担当は手離れします。受けた管理担当は、あとで担当者タブから別の管理担当へ付け替え可能です。
        </div>
      </div>
    </Modal>
  )
}
