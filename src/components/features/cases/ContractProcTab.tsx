'use client'

import { Section } from '@/components/ui/InlineFields'
import ContractDocumentsTable from './ContractDocumentsTable'
import type { ContractDocumentRow } from '@/types'

type Props = {
  caseId: string
  contractDocuments: ContractDocumentRow[]
  onRefresh?: () => void
}

/**
 * 契約残手続きタブ。契約関連書類（契約書・委任状 等）をいつ受け取るかを管理する。
 * 受領状況「後日郵送 / 依頼者が取得」で未受信の書類が残っていると、対応中へ進めない
 * （受託→対応中ゲートの一条件）。書類受信簿で受信すると到着日が入り「受信済」になる。
 */
export default function ContractProcTab({ caseId, contractDocuments, onRefresh }: Props) {
  return (
    <div className="space-y-3.5">
      <Section title="契約残手続き（契約関連書類の受け取り）">
        <p className="text-[12px] text-gray-400 mb-2">契約関連書類を、いつお客様から受け取るかを管理します。書類受信簿で受信すると到着日が入り「受信済」になります。<span className="text-brand-600 font-semibold">未受信の書類が残っていると対応中に進めません。</span></p>
        <ContractDocumentsTable caseId={caseId} documents={contractDocuments} onRefresh={onRefresh} />
      </Section>
    </div>
  )
}
