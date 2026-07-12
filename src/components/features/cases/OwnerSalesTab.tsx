'use client'

import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import {
  Section, FieldGrid, Field, InlineEdit, InlineSelect, InlineDate, InlineMemberSelect,
} from '@/components/ui/InlineFields'
import { LOCATIONS } from '@/lib/constants'
import { isMinimalMode } from '@/lib/featureMode'
import type { CaseRow, CaseMemberRow, MemberRow } from '@/types'
import TabHeader from './TabHeader'

type Props = {
  caseData: CaseRow
  caseMembers: CaseMemberRow[]
  allMembers: MemberRow[]
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  onRefresh?: () => void
}

/**
 * 担当者タブ（受託・オーダーシート作成済から表示）
 *   担当者（受注担当〔案件作成者を自動セット〕/ 管理担当〔割り振りボタン付き〕）
 *   案件基本情報（案件番号・保管場所・受注日など案件そのものの情報）
 * ※ 受注ルートは面談情報タブへ移設。受注内容（手続区分 等）は「受注内容」タブ。
 */
export default function OwnerSalesTab({ caseData, caseMembers, allMembers, patchCase, onRefresh }: Props) {
  const save = async (field: keyof CaseRow, value: unknown) => {
    await patchCase({ [field]: value === '' ? null : value } as Partial<CaseRow>)
  }

  const salesMembers = caseMembers.filter(cm => cm.role === 'sales')
  const managerMembers = caseMembers.filter(cm => cm.role === 'manager')

  return (
    <div className="space-y-3.5">
      <TabHeader title="担当者" description="案件の担当者（受注/管理）と案件基本情報（案件番号・保管場所・受注日など）" />
      {/* 担当者 */}
      <Section title="担当者">
        <FieldGrid>
          <InlineMemberSelect label="受注担当" roleKey="sales" assigned={salesMembers} allMembers={allMembers} caseId={caseData.id} onRefresh={onRefresh} multi={false} />
          <InlineMemberSelect label="管理担当" roleKey="manager" assigned={managerMembers} allMembers={allMembers} caseId={caseData.id} onRefresh={onRefresh} multi={false} searchable candidateRoles={['manager', 'sub_manager']} />
        </FieldGrid>
        {/* 管理担当の割り振り（稼働状況一覧へ遷移して割り振る）。ミニマム運用では稼働状況一覧が非表示のため隠す（上のインライン選択で割り振り） */}
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

      {/* 案件基本情報（旧・案件基本情報タブから統合。被相続人情報・手続詳細はオーダーシートで入力） */}
      <Section title="案件基本情報">
        <FieldGrid>
          <InlineEdit label="案件管理番号" value={caseData.case_number} onSave={v => save('case_number', v)} required />
          <InlineEdit label="LP案件管理番号" value={caseData.lp_case_number} onSave={v => save('lp_case_number', v)} />
          <InlineSelect label="難易度" value={caseData.difficulty} options={['易', '普', '難']} onSave={v => save('difficulty', v)} />
          <InlineSelect label="原本保管場所" value={caseData.location} options={[...LOCATIONS]} onSave={v => save('location', v)} required />
          <InlineDate label="受注日（受託日）" value={caseData.order_received_date} onSave={v => save('order_received_date', v || null)} />
          <InlineDate label="完了予定日" value={caseData.expected_completion_date} onSave={v => save('expected_completion_date', v || null)} />
          <Field label="完了日" value={caseData.completion_date ?? '未完了'} mono />
          <Field label="案件作成日" value={caseData.created_at ? caseData.created_at.slice(0, 10) : null} mono />
        </FieldGrid>
      </Section>
    </div>
  )
}
