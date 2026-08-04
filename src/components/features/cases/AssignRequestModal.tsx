'use client'

import { useState } from 'react'
import { Search, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import type { MemberRow } from '@/types'

// 受注系（受注/戻り受注/即受注）＋依頼確定待ちにした瞬間の「管理担当の割振り依頼」ポップ。
// 通知先＝割振り担当（members.is_dispatcher）。既定で表示するが両方は自動チェックしない（1人を選ぶ）。
// 他の人が良いときは検索して選択。ステータスは変えない（管理担当のアサインは割振り担当が行う）。
// 「この案件には管理担当を割り振らない」に✓すると確認の上、cases.manager_assign_skipped=true を保存し依頼は送らない。
export default function AssignRequestModal({ isOpen, onClose, caseId, caseNumber, dealName, allMembers, onDone, onSkip }: {
  isOpen: boolean
  onClose: () => void
  caseId: string
  caseNumber: string
  dealName: string
  allMembers: MemberRow[]
  onDone?: () => void
  onSkip?: () => void   // 「割り振らない」確定後に親へ通知（caseState 反映用）
}) {
  const dispatchers = allMembers.filter(m => m.is_active && m.is_dispatcher)
  const [selectedId, setSelectedId] = useState<string | null>(null)  // 既定は未選択（両方チェックしない）
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [skip, setSkip] = useState(false)          // 「割り振らない」チェック状態
  const [confirmSkip, setConfirmSkip] = useState(false)  // ✓時の確認ダイアログ
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

  // 「割り振らない」を確定：フラグを保存し、依頼は送らずに閉じる。
  const confirmSkipAssign = async () => {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('cases').update({ manager_assign_skipped: true }).eq('id', caseId)
    setSaving(false)
    setConfirmSkip(false)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    setSkip(true)
    showToast('この案件は管理担当を割り振りません', 'success')
    onSkip?.(); onClose()
  }

  const Chip = ({ m }: { m: MemberRow }) => {
    const on = selectedId === m.id
    return (
      <button type="button" onClick={() => setSelectedId(on ? null : m.id)} disabled={skip}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'} ${skip ? 'opacity-40 cursor-not-allowed' : ''}`}>
        {on && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}{m.name}
      </button>
    )
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="管理担当の割振りを依頼"
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>あとで</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !selectedId || skip}>{saving ? '送信中…' : '依頼する'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px] text-gray-700 leading-relaxed">選んだ<strong>割振り担当</strong>に通知が飛び、管理担当がアサインされます。</p>
          <div className={skip ? 'opacity-50' : ''}>
            <div className="text-[12px] font-medium text-gray-500 mb-1.5">通知先（割振り担当）</div>
            <div className="flex flex-wrap gap-1.5">
              {dispatchers.length === 0
                ? <span className="text-[12px] text-gray-400">割振り担当が未設定です。下の検索から選ぶか、プロフィールで割振り担当を設定してください。</span>
                : dispatchers.map(m => <Chip key={m.id} m={m} />)}
            </div>
          </div>
          <div className={skip ? 'opacity-50' : ''}>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-gray-200 bg-gray-50">
              <Search className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} disabled={skip} placeholder="他の人を検索（氏名）" className="bg-transparent border-none outline-none text-[12.5px] text-gray-700 w-full placeholder:text-gray-400" />
            </div>
            {searchResults.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">{searchResults.map(m => <Chip key={m.id} m={m} />)}</div>
            )}
          </div>
          {selectedMember && !skip && <div className="text-[12px] text-brand-700">選択中：<strong>{selectedMember.name}</strong></div>}

          {/* 割り振らない */}
          <label className="flex items-start gap-2 pt-2 mt-1 border-t border-gray-100 cursor-pointer">
            <input type="checkbox" checked={skip} onChange={e => { if (e.target.checked) setConfirmSkip(true) /* ✓は確認後に確定 */ }} className="w-4 h-4 mt-0.5 accent-brand-600" />
            <span className="text-[12.5px] text-gray-700 leading-relaxed">この案件には<strong>管理担当を割り振らない</strong><br /><span className="text-[11px] text-gray-400">（受注ナビ・対応中ナビから「管理担当アサイン」を出しません）</span></span>
          </label>
        </div>
      </Modal>

      {/* ✓時の確認 */}
      <Modal
        isOpen={confirmSkip}
        onClose={() => setConfirmSkip(false)}
        title="管理担当を割り振らない"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSkip(false)} disabled={saving}>いいえ</Button>
            <Button variant="primary" onClick={confirmSkipAssign} disabled={saving}>{saving ? '保存中…' : 'はい'}</Button>
          </>
        }
      >
        <p className="text-[13px] text-gray-700 leading-relaxed">ここにチェックすると、<strong>管理担当の割振り依頼が出ません</strong>が本当によろしいですか？</p>
      </Modal>
    </>
  )
}
