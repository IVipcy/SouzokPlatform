'use client'

import { useState } from 'react'
import { Search, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import type { MemberRow } from '@/types'

// 受注系（受注/戻り受注/即受注）にした瞬間の「管理担当の割振り依頼」ポップ。
// 通知先＝割振り担当（members.is_dispatcher）。既定で表示するが両方は自動チェックしない（1人を選ぶ）。
// 他の人が良いときは検索して選択。ステータスは変えない（管理担当のアサインは割振り担当が行う）。
export default function AssignRequestModal({ isOpen, onClose, caseId, caseNumber, dealName, allMembers, onDone }: {
  isOpen: boolean
  onClose: () => void
  caseId: string
  caseNumber: string
  dealName: string
  allMembers: MemberRow[]
  onDone?: () => void
}) {
  const dispatchers = allMembers.filter(m => m.is_active && m.is_dispatcher)
  const [selectedId, setSelectedId] = useState<string | null>(null)  // 既定は未選択（両方チェックしない）
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const q = search.trim()
  const searchResults = q
    ? allMembers.filter(m => m.is_active && !dispatchers.some(d => d.id === m.id) && (m.name.includes(q))).slice(0, 8)
    : []
  const selectedMember = selectedId ? allMembers.find(m => m.id === selectedId) ?? null : null

  const submit = async () => {
    if (!selectedId) { showToast('割振り担当を選んでください', 'error'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('notifications').insert({
      member_id: selectedId, type: 'manager_assign_request', case_id: caseId,
      title: '管理担当の割振り依頼が届きました',
      body: `${caseNumber} ${dealName}：管理担当をアサインしてください`,
    })
    setSaving(false)
    if (error) { showToast(`依頼に失敗しました: ${error.message}`, 'error'); return }
    showToast('割振り担当へ依頼しました', 'success')
    onDone?.(); onClose()
  }

  const Chip = ({ m }: { m: MemberRow }) => {
    const on = selectedId === m.id
    return (
      <button type="button" onClick={() => setSelectedId(on ? null : m.id)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
        {on && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}{m.name}
      </button>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="管理担当の割振りを依頼"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>あとで</Button>
          <Button variant="primary" onClick={submit} disabled={saving || !selectedId}>{saving ? '送信中…' : '依頼する'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-gray-700 leading-relaxed">選んだ<strong>割振り担当</strong>に通知が飛び、管理担当がアサインされます。</p>
        <div>
          <div className="text-[12px] font-medium text-gray-500 mb-1.5">通知先（割振り担当）</div>
          <div className="flex flex-wrap gap-1.5">
            {dispatchers.length === 0
              ? <span className="text-[12px] text-gray-400">割振り担当が未設定です。下の検索から選ぶか、プロフィールで割振り担当を設定してください。</span>
              : dispatchers.map(m => <Chip key={m.id} m={m} />)}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-gray-200 bg-gray-50">
            <Search className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="他の人を検索（氏名）" className="bg-transparent border-none outline-none text-[12.5px] text-gray-700 w-full placeholder:text-gray-400" />
          </div>
          {searchResults.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">{searchResults.map(m => <Chip key={m.id} m={m} />)}</div>
          )}
        </div>
        {selectedMember && <div className="text-[12px] text-brand-700">選択中：<strong>{selectedMember.name}</strong></div>}
      </div>
    </Modal>
  )
}
