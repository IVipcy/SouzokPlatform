'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import type { MemberRow } from '@/types'

// 受注担当 → チームへの引き継ぎ。特定の人は指名せず、作業進行中へ移し、
// 受注担当と同じチームの管理担当 全員のマイページにアラート（通知）を出す。
// 受けた管理担当が担当者タブで自分をアサインすると、チームのアラートは解消される。
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
  // 同じチームに管理担当がいなければ全管理担当へ（案件が宙に浮くのを防ぐ）
  const targets = noSameTeam ? managers : sameTeam
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const supabase = createClient()
    // 作業進行中へ（管理担当は未設定のまま。チームの誰かが受ける）
    const { error } = await supabase.from('cases').update({ status: '対応中' }).eq('id', caseId)
    if (error) { showToast(`引き継ぎに失敗しました: ${error.message}`, 'error'); setSaving(false); return }
    // チームの管理担当 全員へアラート（通知）
    if (targets.length > 0) {
      await supabase.from('notifications').insert(targets.map(m => ({
        member_id: m.id, type: 'case_handoff', case_id: caseId,
        title: '相談案件が引き継がれました',
        body: '受注担当から相談案件が引き継がれました。管理担当を設定して、案件の処理を開始してください。',
      })))
    }
    setSaving(false)
    showToast('チームへ引き継ぎました（作業進行中）。管理担当のマイページにアラートを出しました。', 'success')
    onDone()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="チームへ引き継ぐ"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? '引き継ぎ中...' : '引き継ぐ（作業進行中へ）'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-gray-700 leading-relaxed">
          この案件を<strong>作業進行中</strong>にして、下のチームの管理担当 全員のマイページに「管理担当を設定してください」というアラートを出します。誰かが受けて自分をアサインすると、アラートは自動で消えます。
        </p>
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500">
            {noSameTeam ? '管理担当（同じチームに不在のため全員）' : 'このチームの管理担当'} {targets.length}名にアラート
          </div>
          {targets.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-gray-400">管理担当が登録されていません。</div>
          ) : (
            <div className="max-h-[240px] overflow-y-auto divide-y divide-gray-100">
              {targets.map(m => (
                <div key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>{m.name[0]}</span>
                  <span className="text-[13px] text-gray-800">{m.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[11px] text-gray-400">特定の人を指名しません。チームの誰でも受けられます。受注担当はここで手離れします。</p>
      </div>
    </Modal>
  )
}
