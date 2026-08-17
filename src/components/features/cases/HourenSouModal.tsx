'use client'

// 報連相モーダル。種別は2つだけ。
//   情報共有 … 見ておいてもらうもの。相手は「確認した」だけで閉じられる（回答してもよい）
//   要対応   … 回答が無いと作業が進まないもの。1営業日超過で要確認・3営業日超過で要注意のアラートに出る
//
// 通知先の既定は「自分と反対の持ち場」。事務管理担当が送るなら管理担当、管理担当が送るなら受注担当。
// 受注担当・管理担当・同チームは常にチップで出し、それ以外の人は検索して足せる。

import { useState, useMemo, useEffect } from 'react'
import { Send, Search } from 'lucide-react'
import FloatingWindow from '@/components/ui/FloatingWindow'
import Button from '@/components/ui/Button'
import UserAvatar from '@/components/ui/UserAvatar'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useAuth } from '@/components/providers/AuthProvider'
import type { CaseRow, MemberRow, CaseReportKind } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  currentMemberId: string | null
  /** この案件の受注担当（呼び出し元が既に持っていれば渡す。無ければ案件から引く） */
  salesMemberId?: string | null
  allMembers: MemberRow[]
  /** 本文の下書き（タスクから開いたときにタスク名を入れる） */
  initialMessage?: string
  onSent?: () => void
}

const KIND_OPTIONS: { key: CaseReportKind; note: string }[] = [
  { key: '情報共有', note: '見ておいてほしい' },
  { key: '要対応', note: '回答が無いと進まない' },
]

export default function HourenSouModal({ isOpen, onClose, caseData, currentMemberId, salesMemberId = null, allMembers, initialMessage = '', onSent }: Props) {
  const auth = useAuth()
  const [kind, setKind] = useState<CaseReportKind>('情報共有')
  const [message, setMessage] = useState('')
  // 通知先。null＝まだ触っていない（既定のまま）。触ったらその集合を持つ。
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  // この案件の担当者（受注・管理）。呼び出し元から受注担当だけ渡ってくることがあるので、ここで両方引く。
  const [caseRoles, setCaseRoles] = useState<{ sales: string | null; manager: string | null }>({ sales: salesMemberId, manager: null })

  useEffect(() => {
    if (!isOpen) return
    let alive = true
    ;(async () => {
      const { data } = await createClient().from('case_members').select('member_id, role').eq('case_id', caseData.id).in('role', ['sales', 'manager'])
      if (!alive) return
      const rows = (data ?? []) as Array<{ member_id: string | null; role: string }>
      setCaseRoles({
        sales: rows.find(r => r.role === 'sales')?.member_id ?? salesMemberId,
        manager: rows.find(r => r.role === 'manager')?.member_id ?? null,
      })
    })()
    return () => { alive = false }
  }, [isOpen, caseData.id, salesMemberId])

  const memberOf = (id: string | null) => (id ? allMembers.find(m => m.id === id) ?? null : null)
  const salesMember = memberOf(caseRoles.sales)
  const managerMember = memberOf(caseRoles.manager)

  // 自分の持ち場と反対側を既定の通知先にする。
  //   事務管理担当・受注担当 → 管理担当あて／管理担当 → 受注担当あて
  const myRole = auth?.primaryRole ?? ''
  const defaultRecipient = useMemo(() => {
    if (myRole === 'manager' || myRole === 'sub_manager') return caseRoles.sales
    return caseRoles.manager ?? caseRoles.sales
  }, [myRole, caseRoles])

  // 自分の所属チームメンバー（自分・受注担当・管理担当は別枠で出すので除く）
  const myTeamId = useMemo(() => allMembers.find(m => m.id === currentMemberId)?.team_id ?? null, [allMembers, currentMemberId])
  const teamMembers = useMemo(
    () => allMembers.filter(m => m.is_active && m.team_id && m.team_id === myTeamId
      && m.id !== currentMemberId && m.id !== caseRoles.sales && m.id !== caseRoles.manager),
    [allMembers, myTeamId, currentMemberId, caseRoles],
  )

  // 相談相手（Sister/Brother）。本人がプロフィールで登録した人（チーム外の先輩を想定）。
  // 担当・同チームで既に出ている人は重複させない。
  const mentors = useMemo(() => {
    const my = allMembers.find(m => m.id === currentMemberId)
    const ids = my?.mentor_ids ?? []
    const dup = new Set([caseRoles.sales, caseRoles.manager, ...teamMembers.map(m => m.id)].filter(Boolean) as string[])
    return ids
      .map(id => allMembers.find(m => m.id === id))
      .filter((m): m is MemberRow => !!m && m.is_active && m.id !== currentMemberId && !dup.has(m.id))
  }, [allMembers, currentMemberId, caseRoles, teamMembers])

  // 検索で足す人（上のチップに出ていない人が対象）
  const shownIds = useMemo(
    () => new Set([caseRoles.sales, caseRoles.manager, currentMemberId, ...teamMembers.map(m => m.id), ...mentors.map(m => m.id)].filter(Boolean) as string[]),
    [caseRoles, currentMemberId, teamMembers, mentors],
  )
  const searchHits = useMemo(() => {
    const q = search.trim()
    if (!q) return []
    return allMembers
      .filter(m => m.is_active && !shownIds.has(m.id))
      .filter(m => (m.name ?? '').includes(q))
      .slice(0, 8)
  }, [search, allMembers, shownIds])
  // 検索から選んだ人（チップとして残す）
  const [extraIds, setExtraIds] = useState<string[]>([])
  const extraMembers = extraIds.map(id => memberOf(id)).filter((m): m is MemberRow => !!m)

  // 開くたびに初期化（レンダー中に前回値と比べて戻す。effect で setState しないため）
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) { setKind('情報共有'); setMessage(initialMessage); setSearch(''); setExtraIds([]); setPicked(null) }
  }

  // 実際の通知先＝触っていなければ既定（自分と反対の持ち場）
  const recipientIds = picked ?? new Set(defaultRecipient ? [defaultRecipient] : [])
  const withBase = (fn: (n: Set<string>) => void) => {
    const n = new Set(recipientIds)
    fn(n)
    setPicked(n)
  }
  const toggleRecipient = (id: string) => withBase(n => { if (n.has(id)) n.delete(id); else n.add(id) })
  const addFromSearch = (m: MemberRow) => {
    setExtraIds(prev => (prev.includes(m.id) ? prev : [...prev, m.id]))
    withBase(n => n.add(m.id))
    setSearch('')
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
    // 各通知先に通知（type=case_report で MyAlertCenter が報連相・メモタブへ遷移）
    const notifRows = recipients.map(mid => ({
      member_id: mid,
      type: 'case_report',
      case_id: caseData.id,
      title: kind === '要対応' ? '【要対応】報連相が届きました' : '報連相が届きました',
      body: `${caseData.case_number} ${caseData.deal_name}：${message.trim() || `${kind}の連絡が届いています`}`,
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
      width={430}
      height={480}
      resizable
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={sending}>キャンセル</Button>
          <Button variant="primary" size="sm" onClick={send} loading={sending} leftIcon={<Send className="w-3.5 h-3.5" strokeWidth={2} />}>送信</Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* 種別（情報共有／要対応） */}
        <div className="space-y-1">
          <label className="block text-[12px] font-semibold text-gray-600">種別</label>
          <div className="flex gap-2">
            {KIND_OPTIONS.map(o => (
              <button
                key={o.key}
                type="button"
                onClick={() => setKind(o.key)}
                className={`flex-1 py-2 rounded-lg border transition-colors ${kind === o.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
              >
                <span className="block text-[13px] font-semibold">{o.key}</span>
                <span className={`block text-[10.5px] ${kind === o.key ? 'text-white/80' : 'text-gray-400'}`}>{o.note}</span>
              </button>
            ))}
          </div>
          {kind === '要対応' && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1 leading-snug">
              回答が無いまま1営業日で「要確認」、3営業日で「要注意」のアラートに出ます。
            </p>
          )}
        </div>

        {/* 本文 */}
        <div className="space-y-1">
          <label className="block text-[12px] font-semibold text-gray-600">内容</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={kind === '要対応' ? '確認・対応してほしいことを記入' : '共有したい内容を記入'}
            rows={5}
            className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 resize-y"
          />
        </div>

        {/* 通知先 */}
        <div className="space-y-1.5">
          <label className="block text-[12px] font-semibold text-gray-600">通知先 <span className="text-gray-400 font-normal">（1人以上）</span></label>
          <div className="flex flex-wrap gap-1.5">
            {managerMember && (
              <RecipientChip m={managerMember} label="管理担当" active={recipientIds.has(managerMember.id)} onToggle={() => toggleRecipient(managerMember.id)} />
            )}
            {salesMember && (
              <RecipientChip m={salesMember} label="受注担当" active={recipientIds.has(salesMember.id)} onToggle={() => toggleRecipient(salesMember.id)} />
            )}
          </div>
          {mentors.length > 0 && (
            <>
              <div className="text-[11px] text-gray-400 pt-1">相談相手（Sister / Brother）</div>
              <div className="flex flex-wrap gap-1.5">
                {mentors.map(m => (
                  <RecipientChip key={m.id} m={m} active={recipientIds.has(m.id)} onToggle={() => toggleRecipient(m.id)} />
                ))}
              </div>
            </>
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
          {extraMembers.length > 0 && (
            <>
              <div className="text-[11px] text-gray-400 pt-1">検索して追加</div>
              <div className="flex flex-wrap gap-1.5">
                {extraMembers.map(m => (
                  <RecipientChip key={m.id} m={m} active={recipientIds.has(m.id)} onToggle={() => toggleRecipient(m.id)} />
                ))}
              </div>
            </>
          )}
          {/* ほかの人を検索して足す（チームの外へも送れるように） */}
          <div className="relative pt-1">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 mt-0.5 -translate-y-1/2 pointer-events-none" strokeWidth={2} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ほかの人を名前で検索して追加"
              className="w-full text-[12.5px] border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 bg-white focus:outline-none focus:border-brand-400"
            />
            {searchHits.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                {searchHits.map(m => (
                  <button key={m.id} type="button" onClick={() => addFromSearch(m)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-brand-50">
                    <UserAvatar name={m.name} url={m.avatar_url ?? null} size="sm" />
                    <span className="text-[12.5px] text-gray-700">{m.name}</span>
                    {m.primary_role && <span className="ml-auto text-[10.5px] text-gray-400">{m.primary_role}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
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
