'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { Section, FieldGrid, InlineMemberSelect } from '@/components/ui/InlineFields'
import { createClient } from '@/lib/supabase/client'
import { isMinimalMode } from '@/lib/featureMode'
import type { CaseRow, CaseMemberRow, MemberRow } from '@/types'
import TabHeader from './TabHeader'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  allMembers: MemberRow[]
  onRefresh?: () => void
}

/**
 * 担当者タブ（案件基本情報グループ）。受注担当・管理担当の割り振り。
 * 案件ヘッダーには担当者を「表示のみ」で出し、変更はこのタブで行う。
 */
export default function AssigneesTab({ caseData, caseMembers, allMembers, onRefresh }: Props) {
  const salesMembers = caseMembers.filter(cm => cm.role === 'sales')
  const managerMembers = caseMembers.filter(cm => cm.role === 'manager')

  // 管理担当がアサインされたら、チームへ出した引き継ぎアラート（case_handoff通知）を全員分解消する。
  const hasManager = managerMembers.length > 0
  useEffect(() => {
    if (!hasManager) return
    void createClient().from('notifications').delete().eq('case_id', caseData.id).eq('type', 'case_handoff')
  }, [hasManager, caseData.id])

  return (
    <div className="space-y-3.5">
      <TabHeader title="担当者" description="この案件の受注担当・管理担当を決めます（上のヘッダーは表示だけ）。" />
      <Section title="担当者">
        <FieldGrid>
          <InlineMemberSelect label="受注担当" roleKey="sales" assigned={salesMembers} allMembers={allMembers} caseId={caseData.id} onRefresh={onRefresh} multi={false} />
          <InlineMemberSelect label="管理担当" roleKey="manager" assigned={managerMembers} allMembers={allMembers} caseId={caseData.id} onRefresh={onRefresh} multi={false} searchable candidateRoles={['manager', 'sub_manager']} />
        </FieldGrid>
        {/* 管理担当の割り振り（稼働状況一覧へ遷移して割り振る）。ミニマム運用では非表示。 */}
        {!isMinimalMode() && (
          <div className="mt-2.5 pt-2.5 border-t border-gray-100">
            <Link
              href={`/workload?assignCaseId=${caseData.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 border border-brand-200 text-[12px] font-semibold hover:bg-brand-100 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" strokeWidth={2.25} />
              管理担当を割り振る（稼働状況一覧へ）
            </Link>
            <p className="text-[11px] text-gray-400 mt-1">稼働状況・経験年数を見て管理担当を割り振ります。</p>
          </div>
        )}
      </Section>
    </div>
  )
}
