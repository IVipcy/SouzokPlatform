'use client'

import Link from 'next/link'
import { Folder } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import ContractDocumentsTable from './ContractDocumentsTable'
import TabHeader from './TabHeader'
import type { ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Props = {
  caseId: string
  contractDocuments: ContractDocumentRow[]
  documentReceipts?: TimelineReceipt[]
  onRefresh?: () => void
}

/**
 * 契約残手続きタブ。契約関連書類（契約書・委任状 等）をいつ受け取るかを管理する。
 * 受領状況「後日郵送 / 依頼者が取得」で未受信の書類が残っていると、対応中へ進めない
 * （受託→対応中ゲートの一条件）。書類受信簿で受信すると到着日が入り「受信済」になる。
 */
export default function ContractProcTab({ caseId, contractDocuments, documentReceipts = [], onRefresh }: Props) {
  return (
    <div className="space-y-3.5">
      <TabHeader title="郵送書類確認" description="契約関連書類（契約書・委任状・本人確認・印鑑証明等）の受領管理" />
      <Section title="郵送書類確認（契約関連書類の受け取り）">
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="text-[12px] text-gray-400">契約関連書類を、いつお客様から受け取るかを管理します。書類受信簿で受信すると到着日が入り「受信済」になります。<span className="text-brand-600 font-semibold">未受信の書類が残っていると対応中に進めません。</span>ファイルは案件フォルダに集約します（個別添付は廃止）。</p>
          <Link href={`/cases/${caseId}?tab=docs`} className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-md hover:bg-brand-100">
            <Folder className="w-3.5 h-3.5" />案件フォルダを開く
          </Link>
        </div>
        <ContractDocumentsTable caseId={caseId} documents={contractDocuments} documentReceipts={documentReceipts} onRefresh={onRefresh} />
      </Section>
    </div>
  )
}
