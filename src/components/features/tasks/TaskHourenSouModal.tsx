'use client'

// タスクから開く報連相ウィンドウ。
//
// 以前は「管理担当にヘルプ」を押すとヘルプタスクが起票されていたが、
// 軽く相談したいだけのときにタスクが増えるのが重かったので、報連相（case_reports）に送る形にした。
// 案件・メンバーはこの中で読み込むので、呼び出し側は caseId とタスク名を渡すだけでよい。

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import HourenSouModal from '@/components/features/cases/HourenSouModal'
import type { CaseRow, MemberRow, CaseReportKind } from '@/types'

/** 送った報連相の種別。呼び出し側が「要対応のときだけタスクを確認中にする」判断に使う */
export type TaskHourenSouSent = { kind: CaseReportKind | null }

export default function TaskHourenSouModal({ isOpen, onClose, caseId, currentMemberId, taskId = null, taskTitle, onSent }: {
  isOpen: boolean
  onClose: () => void
  caseId: string
  currentMemberId: string | null
  /** どのタスクについての相談か（渡すと報連相に紐づく） */
  taskId?: string | null
  /** 送信欄の下書きに入れるタスク名 */
  taskTitle?: string | null
  /** 送信後。種別（情報共有／要対応）を添える。taskId が無いときは kind=null */
  onSent?: (sent: TaskHourenSouSent) => void
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
      taskId={taskId}
      onSent={async () => {
        // 報連相ウィンドウは種別を返さないので、このタスクに紐づく直近の1件を読んで種別を知る。
        // 情報共有は誰も回答しないので、呼び出し側でタスクを確認中にしないために要る。
        let kind: CaseReportKind | null = null
        if (taskId) {
          const { data } = await createClient().from('case_reports').select('kind').eq('task_id', taskId).order('created_at', { ascending: false }).limit(1).maybeSingle()
          kind = ((data as { kind?: CaseReportKind } | null)?.kind) ?? null
        }
        onSent?.({ kind })
      }}
      initialMessage={taskTitle ? `【${taskTitle}】について相談です。\n` : ''}
    />
  )
}
