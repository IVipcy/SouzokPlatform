'use client'

// 報連相モーダル。案件報告と同じテイストで「報告/連絡/相談」を送る。
// 通知先はデフォルトで受注担当（この案件の）＋同チームメンバーを追加選択可。

import { useState, useMemo, useEffect } from 'react'
import { Send } from 'lucide-react'
import FloatingWindow from '@/components/ui/FloatingWindow'
import Button from '@/components/ui/Button'
import UserAvatar from '@/components/ui/UserAvatar'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow, MemberRow, CaseReportKind } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  currentMemberId: string | null
  /** 通知先候補：この案件の受注担当（デフォルト送信先）＋ 自分と同じチームのメンバー */
  salesMemberId?: string | null
  allMembers: MemberRow[]
  /** 本文の下書き（タスクから開いたときにタスク名を入れる） */
  initialMessage?: string
  onSent?: () => void
}

const KIND_OPTIONS: CaseReportKind[] = ['報告', '連絡', '相談']

export default function HourenSouModal({ isOpen, onClose, caseData, currentMemberId, salesMemberId = null, allMembers, initialMessage = '', onSent }: Props) {
  const [kind, setKind] = useState<CaseReportKind>('報告')
  const [message, setMessage] = useState('')
  const [recipientIds, setRecipientIds] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  // 自分の所属チームメンバー（自分自身は除く。受注担当も別扱いにする）
  const myTeamId = useMemo(() => allMembers.find(m => m.id === currentMemberId)?.team_id ?? null, [allMembers, currentMemberId])
  const teamMembers = useMemo(
    () => allMembers.filter(m => m.is_active && m.team_id && m.team_id === myTeamId && m.id !== currentMemberId && m.id !== salesMemberId),
    [allMembers, myTeamId, currentMemberId, salesMemberId],
  )
  const salesMember = useMemo(() => (salesMemberId ? allMembers.find(m => m.id === salesMemberId) ?? null : null), [allMembers, salesMemberId])

  // モーダルを開くたびに初期化（受注担当をデフォルトON）
  useEffect(() => {
    if (!isOpen) return
    setKind('報告')
    setMessage(initialMessage)
    setRecipientIds(new Set(salesMemberId ? [salesMemberId] : []))
  }, [isOpen, salesMemberId, initialMessage])

  const toggleRecipient = (id: string) => {
    setRecipientIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const send = async () => {
    if (!currentMemberId) { showToast('ログイン情報が取得できません', 'error'); return }
    if (recipientIds.size === 0) { showToast('通知先を1人以上選んでください', 'error'); return }
    setSending(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const recipients = [...recipientIds]
    const { data: row, error } = await supabase.from('case_reports').insert({
      case_id: caseData.id,
      kind,
      requester_id: currentMemberId,
      recipient_ids: recipients,
      message: message.trim() || null,
      requested_date: today,
      status: '依頼中',
    }).select('id').single()
    if (error || !row) { console.error('case_reports insert failed:', error); setSending(false); showToast(`送信に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    // 各通知先に通知を送信（type=case_report で MyAlertCenter が報連相・メモタブへ遷移）
    const notifRows = recipients.map(mid => ({
      member_id: mid,
      type: 'case_report',
      case_id: caseData.id,
      title: `${kind}が届きました`,
      body: `${caseData.case_number} ${caseData.deal_name}：${message.trim() || `${kind}の依頼が届いています`}`,
    }))
    if (notifRows.length > 0) await supabase.from('notifications').insert(notifRows)
    setSending(false)
    onClose()
    showToast(`${kind}を送信しました`, 'success')
    onSent?.()
  }

  return (
    <FloatingWindow
      isOpen={isOpen}
      onClose={onClose}
      title="報連相を送る"
      width={410}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={sending}>キャンセル</Button>
          <Button variant="primary" size="sm" onClick={send} loading={sending} leftIcon={<Send className="w-3.5 h-3.5" strokeWidth={2} />}>送信</Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* 種別（報告/連絡/相談） */}
        <div className="space-y-1">
          <label className="block text-[12px] font-semibold text-gray-600">種別</label>
          <div className="flex gap-2">
            {KIND_OPTIONS.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 text-[13px] py-2 rounded-lg border transition-colors ${kind === k ? 'bg-brand-600 text-white border-brand-600 font-semibold' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
              >{k}</button>
            ))}
          </div>
        </div>

        {/* 本文 */}
        <div className="space-y-1">
          <label className="block text-[12px] font-semibold text-gray-600">内容</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={`${kind}したい内容を記入`}
            rows={5}
            className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 resize-y"
          />
        </div>

        {/* 通知先（デフォルト=受注担当。同チームも選択可） */}
        <div className="space-y-1.5">
          <label className="block text-[12px] font-semibold text-gray-600">通知先 <span className="text-gray-400 font-normal">（1人以上）</span></label>
          {salesMember && (
            <RecipientChip m={salesMember} label="受注担当" active={recipientIds.has(salesMember.id)} onToggle={() => toggleRecipient(salesMember.id)} />
          )}
          {teamMembers.length > 0 && (
            <>
              <div className="text-[11px] text-gray-400 pt-1">同じチームのメンバー</div>
              <div className="flex flex-wrap gap-1.5">
                {teamMembers.map(m => (
                  <RecipientChip key={m.id} m={m} active={recipientIds.has(m.id)} onToggle={() => toggleRecipient(m.id)} />
                ))}
              </div>
            </>
          )}
          {!salesMember && teamMembers.length === 0 && (
            <div className="text-[11px] text-gray-400">通知先候補がいません（受注担当未アサイン・同チームメンバーなし）</div>
          )}
        </div>
      </div>
    </FloatingWindow>
  )
}

function RecipientChip({ m, label, active, onToggle }: { m: MemberRow; label?: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors text-[12px] ${active ? 'bg-brand-50 border-brand-300 text-brand-700 font-semibold' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
    >
      <UserAvatar name={m.name} url={m.avatar_url ?? null} size="sm" />
      <span>{m.name}</span>
      {label && <span className={`text-[10px] px-1 rounded ${active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{label}</span>}
    </button>
  )
}
