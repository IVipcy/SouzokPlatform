'use client'

import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import {
  Section, FieldGrid, InlineEdit, InlineSelect, InlineMemberSelect,
} from '@/components/ui/InlineFields'
import { ORDER_ROUTES, PAST_CLIENT_ROUTE } from '@/lib/constants'
import type { CaseRow, CaseMemberRow, MemberRow } from '@/types'
import ReferralSourceLookup from './ReferralSourceLookup'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  allMembers: MemberRow[]
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  onRefresh?: () => void
}

/**
 * 担当・受注ルートタブ（受託・オーダーシート作成済から表示）
 *   担当者（受注担当〔案件作成者を自動セット〕/ 管理担当〔割り振りボタン付き〕）
 *   受注ルート（受注ルート / 詳細 / パートナー / 紹介先名）
 * ※ 受注内容（手続区分 等）と役割分担は「受注内容・契約手続き」タブへ移設。
 */
export default function OwnerSalesTab({ caseData, caseMembers, allMembers, patchCase, onRefresh }: Props) {
  const save = async (field: string, value: unknown) => {
    await patchCase({ [field]: value ?? null } as Partial<CaseRow>)
  }

  const salesMembers = caseMembers.filter(cm => cm.role === 'sales')
  const managerMembers = caseMembers.filter(cm => cm.role === 'manager')

  return (
    <div className="space-y-3.5">
      {/* 担当者 */}
      <Section title="担当者">
        <FieldGrid>
          <InlineMemberSelect label="受注担当" roleKey="sales" assigned={salesMembers} allMembers={allMembers} caseId={caseData.id} onRefresh={onRefresh} multi={false} />
          <InlineMemberSelect label="管理担当" roleKey="manager" assigned={managerMembers} allMembers={allMembers} caseId={caseData.id} onRefresh={onRefresh} multi={false} />
        </FieldGrid>
        {/* 管理担当の割り振り（稼働状況一覧へ遷移して割り振る） */}
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
      </Section>

      {/* 受注ルート */}
      <Section title="受注ルート">
        <FieldGrid>
          <InlineSelect
            label="受注ルート"
            value={caseData.order_route}
            options={[...ORDER_ROUTES]}
            onSave={async v => { await patchCase({ order_route: v, order_route_detail: null }) }}
          />
          {caseData.order_route && caseData.order_route !== PAST_CLIENT_ROUTE && (
            <ReferralSourceLookup
              label="詳細（紹介元）"
              route={caseData.order_route}
              value={caseData.order_route_detail}
              onChange={v => save('order_route_detail', v)}
            />
          )}
          {caseData.order_route === PAST_CLIENT_ROUTE && (
            <InlineEdit label="詳細（過去の依頼者）" value={caseData.order_route_detail} onSave={v => save('order_route_detail', v)} />
          )}
        </FieldGrid>
      </Section>
    </div>
  )
}
