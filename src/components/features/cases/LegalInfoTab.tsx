'use client'

// 法定相続情報一覧図タブ（相続人調査のサブタブから独立・格上げ）。
// 戸籍が揃ったら法務局に申出→認証付き一覧図を取得。銀行・法務局へ戸籍束の代わりに提出するため必要枚数を管理。
// 業務＝法定相続情報取得（管理担当タスク）。上部に作業内容フリー欄＋関連タスク。
import { Section, FieldGrid, InlineEdit, InlineDate, InlineNumber, InlineTextarea } from '@/components/ui/InlineFields'
import TabHeader from './TabHeader'
import { WorkContentField } from './WorkContentField'
import TabTasksSection from './TabTasksSection'
import type { CaseRow, TaskRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  tasks?: TaskRow[]
  documentReceipts?: TimelineReceipt[]
  /** タスクの着手・完了のあとに一覧を取り直す */
  onRefresh?: () => void
}

export default function LegalInfoTab({ caseData, patchCase, tasks = [], documentReceipts = [], onRefresh }: Props) {
  const saveCaseField = async (field: string, value: string | number | null) => {
    await patchCase({ [field]: value === '' ? null : value } as Partial<CaseRow>)
  }

  return (
    <div>
      <TabHeader title="法定相続情報一覧図" description="戸籍が揃ったら法務局へ申出し、認証付きの一覧図を取得します（管理担当の業務）。" />

      <div className="mb-3.5 rounded-lg border border-gray-200 bg-white px-3.5 py-3">
        <WorkContentField caseData={caseData} gyomu="法定相続情報取得" patchCase={patchCase} label="作業内容（フリー）" collapsible />
      </div>

      <div className="mb-3.5">
        <TabTasksSection
          onRefresh={onRefresh}
          gyomus={['法定相続情報取得']}
          tasks={tasks}
        />
      </div>

      <Section title="法定相続情報一覧図">
        <p className="text-[11.5px] text-gray-400 mb-2.5">戸籍が揃ったら法務局に申出→認証付きの一覧図を取得。各銀行・法務局に戸籍の束の代わりに提出するので、必要な数だけ発行してもらう（枚数を管理）。</p>
        <FieldGrid>
          <InlineDate label="申出日" value={caseData.family_tree_apply_date} onSave={v => saveCaseField('family_tree_apply_date', v || null)} />
          <InlineDate label="取得日" value={caseData.family_tree_obtain_date} onSave={v => saveCaseField('family_tree_obtain_date', v || null)} />
          <InlineNumber label="必要枚数（通）" value={caseData.family_tree_count} onSave={v => saveCaseField('family_tree_count', v)} />
          <InlineEdit label="提出先の法務局" value={caseData.family_tree_office} onSave={v => saveCaseField('family_tree_office', v)} />
          <InlineTextarea label="認証番号・備考" value={caseData.family_tree_note} onSave={v => saveCaseField('family_tree_note', v)} fullWidth />
        </FieldGrid>
      </Section>
    </div>
  )
}
