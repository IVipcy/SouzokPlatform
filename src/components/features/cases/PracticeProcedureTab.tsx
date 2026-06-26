'use client'

import { Section } from '@/components/ui/InlineFields'
import { categoriesOf, kindForTask } from '@/lib/serviceMaster'
import CourtProcedureInfo from './CourtProcedureInfo'
import TrustInfo from './TrustInfo'
import MediationParties from './MediationParties'
import ProcedureDocsTable from './ProcedureDocsTable'
import TabHeader from './TabHeader'
import type { RoleRow } from './ProcedureIntakeSection'
import type { CaseRow, HeirRow, SagyoDocumentRow, TaskRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Props = {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  /** 対象業務（例: 放棄手続き）。intake_roles をこの業務でフィルタして表示する。 */
  gyomu: string
  title: string
  description?: string
  /** 家庭裁判所手続き（放棄/調停/検認/後見）なら家裁手続き情報を表示。 */
  court?: boolean
  /** 信託タブなら信託情報を表示。 */
  trust?: boolean
  /** 調停タブなら当事者・争点を表示。 */
  mediation?: boolean
  /** 相続人（調停の申立人・相手方の選択に使用）。 */
  heirs?: HeirRow[]
  /** 互換のため受け取るが未使用（タスクは事務管理タスク一覧で管理）。 */
  tasks?: TaskRow[]
  /** オーダーシートに埋め込む場合は true（外側の見出し Section を省く）。 */
  embedded?: boolean
  /** 作業に紐づく必要書類（sagyo_documents）。 */
  sagyoDocuments?: SagyoDocumentRow[]
  /** 受信簿（受領連動の選択肢）。 */
  receipts?: TimelineReceipt[]
  onRefresh?: () => void
}

/**
 * 手続き系業務タブ（放棄 / 信託 / 調停 / 検認 / 後見）。
 *   ① 家裁手続き情報（court のみ）… 管轄家裁・事件番号・申立日・期日・結果
 *   ② 資料（受領管理）… kind=doc の作業＝受領する資料を受信簿連動で管理
 * ※タスク（進捗）欄は廃止。タスクは事務管理タスク一覧で管理する。
 */
export default function PracticeProcedureTab({ caseData, patchCase, gyomu, title, description, court, trust, mediation, heirs = [], embedded, sagyoDocuments = [], receipts = [], onRefresh }: Props) {
  const roles: RoleRow[] = (caseData.intake_roles ?? []) as RoleRow[]
  const cats = categoriesOf(caseData.service_category, caseData.service_category_2)
  // 行の実効kind: 明示値 → マスタ初期値 → task
  const effKind = (r: RoleRow) => r.kind ?? kindForTask(cats, gyomu, r.sagyou)
  const docRoles = roles.filter(r => r.gyomu === gyomu && effKind(r) === 'doc')
  const docs = sagyoDocuments.filter(d => d.gyomu === gyomu)

  const body = (
    <div className="space-y-3.5">
      {court && <CourtProcedureInfo caseData={caseData} gyomu={gyomu} patchCase={patchCase} />}
      {mediation && <MediationParties caseData={caseData} gyomu={gyomu} heirs={heirs} patchCase={patchCase} />}
      {trust && <TrustInfo caseData={caseData} patchCase={patchCase} />}

      {/* 資料（受領管理）。doc-kindの作業がある場合のみ。 */}
      {docRoles.length > 0 && (
        <Section title="請求・受領（受信簿連動）">
          <ProcedureDocsTable caseId={caseData.id} gyomu={gyomu} docRoles={docRoles} documents={docs} receipts={receipts} onRefresh={onRefresh} />
        </Section>
      )}
    </div>
  )

  if (embedded) return body
  return (
    <div>
      <TabHeader title={title} description={description} />
      {body}
    </div>
  )
}
