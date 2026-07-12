'use client'

// 不動産（実務タブ）：表ベース＋行展開に統一。
// 物件は1つの表に全件表示（市区町村列つき・評価額入力・確定・詳細は行展開）。
// 取得資料（①市区町村へ請求／②物件ごとに取得）は下部の折りたたみに集約（横スクロールと3表縦積みを解消）。

import { Section, SectionHeading } from '@/components/ui/InlineFields'
import ProgressSummary from './ProgressSummary'
import RealEstateTable from './RealEstateTable'
import RealEstateAcquisitionsTable from './RealEstateAcquisitionsTable'
import type { RealEstatePropertyRow, RealEstateAcquisitionRow, TaskRow, ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Props = {
  caseId: string
  properties: RealEstatePropertyRow[]
  acquisitions: RealEstateAcquisitionRow[]
  onRefresh?: () => void
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  contractDocs?: ContractDocumentRow[]
}

// 市区町村キー：明示の municipality があればそれ、無ければ所在地から「都道府県＋市区町村」を抽出。
// （RealEstateTable / RealEstateAcquisitionsTable から参照される共有ロジック）
export function municipalityOf(p: { municipality: string | null; address: string | null }): string {
  const m = (p.municipality ?? '').trim()
  if (m) return m
  const a = (p.address ?? '').trim()
  const match = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/)
  return match ? `${match[1] ?? ''}${match[2]}` : ''
}

export default function RealEstateSection({ caseId, properties, acquisitions, onRefresh, receipts = [], tasks = [], contractDocs = [] }: Props) {
  return (
    <div className="space-y-3.5">
      <ProgressSummary caseId={caseId} scopeKey="asset_re_all" title="進捗/結果（不動産）" />

      {/* 物件一覧（全件・1表）。市区町村・評価額・確定は列、物件詳細は行展開で編集。 */}
      <div>
        <SectionHeading title="物件一覧（評価額の入力・確定／詳細は行を開いて編集）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
        <RealEstateTable caseId={caseId} properties={properties} onRefresh={onRefresh} showConfirmed />
      </div>

      {/* 取得資料（名寄帳・評価証明・登記情報 等）は折りたたみに集約。 */}
      <Section title="取得資料（名寄帳・評価証明・登記情報 等）" collapsible defaultOpen={false}>
        <div className="space-y-4">
          <div>
            <SectionHeading title="① 市区町村へ請求（名寄帳・評価証明）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
            <RealEstateAcquisitionsTable caseId={caseId} acquisitions={acquisitions} properties={properties} onRefresh={onRefresh} receipts={receipts} tasks={tasks} contractDocs={contractDocs} scope="municipality" />
          </div>
          <div>
            <SectionHeading title="② 物件ごとに取得（登記情報・所有者事項・公図・地積測量図・路線価）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
            <RealEstateAcquisitionsTable caseId={caseId} acquisitions={acquisitions} properties={properties} onRefresh={onRefresh} receipts={receipts} tasks={tasks} scope="property" />
          </div>
        </div>
      </Section>

      <p className="text-[11px] text-gray-400">財産目録へ反映されるのは「確定済」の物件のみです。評価額の入力・確定は上の物件一覧で行います。</p>
    </div>
  )
}
