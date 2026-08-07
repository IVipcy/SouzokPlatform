'use client'

// タスクから開く報連相ウィンドウ。
//
// 以前は「管理担当にヘルプ」を押すとヘルプタスクが起票されていたが、
// 軽く相談したいだけのときにタスクが増えるのが重かったので、報連相（case_reports）に送る形にした。
// 案件・メンバーはこの中で読み込むので、呼び出し側は caseId とタスク名を渡すだけでよい。

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import HourenSouModal from '@/components/features/cases/HourenSouModal'
import type { CaseRow, MemberRow } from '@/types'

export default function TaskHourenSouModal({ isOpen, onClose, caseId, currentMemberId, taskTitle, onSent }: {
  isOpen: boolean
  onClose: () => void
  caseId: string
  currentMemberId: string | null
  /** 送信欄の下書きに入れるタスク名 */
  taskTitle?: string | null
  onSent?: () => void
}) {
  const [caseData, setCaseData] = useState<CaseRow | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [salesMemberId, setSalesMemberId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const [caseRes, memberRes, cmRes] = await Promise.all([
        supabase.from('cases').select('*').eq('id', caseId).single(),
        supabase.from('members').select('*').eq('is_active', true).order('name'),
        supabase.from('case_members').select('member_id, role').eq('case_id', caseId),
      ])
      if (!alive) return
      setCaseData((caseRes.data ?? null) as CaseRow | null)
      setMembers((memberRes.data ?? []) as MemberRow[])
      const cms = (cmRes.data ?? []) as Array<{ member_id: string; role: string }>
      // 宛先の既定は受注担当。いなければ管理担当。
      setSalesMemberId(cms.find(c => c.role === 'sales')?.member_id ?? cms.find(c => c.role === 'manager')?.member_id ?? null)
    })()
    return () => { alive = false }
  }, [isOpen, caseId])

  if (!isOpen || !caseData) return null
  return (
    <HourenSouModal
      isOpen
      onClose={onClose}
      caseData={caseData}
      currentMemberId={currentMemberId}
      salesMemberId={salesMemberId}
      allMembers={members}
      onSent={onSent}
      initialMessage={taskTitle ? `【${taskTitle}】について相談です。\n` : ''}
    />
  )
}
