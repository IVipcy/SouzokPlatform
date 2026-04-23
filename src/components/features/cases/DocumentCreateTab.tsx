'use client'

import { useState } from 'react'
import { useModal } from '@/hooks/useModal'
import type { CaseRow, TaskRow, HeirRow, RealEstatePropertyRow } from '@/types'
import KosekiRequestDocumentModal from './KosekiRequestDocumentModal'
import FixedAssetRequestDocumentModal from './FixedAssetRequestDocumentModal'

type Props = {
  caseData: CaseRow
  tasks: TaskRow[]
  heirs: HeirRow[]
  properties: RealEstatePropertyRow[]
}

type DocumentItem = {
  key: string
  category: string
  categoryColor: string
  title: string
  description: string
  status: 'ready' | 'planned'
}

const DOCUMENTS: DocumentItem[] = [
  { key: 'koseki_request', category: '戸籍請求', categoryColor: 'bg-blue-50 text-blue-700 border-blue-200', title: '戸籍・住民票等請求書', description: '提出先の市区町村ごとに戸籍・住民票・附票を請求', status: 'ready' },
  { key: 'fixed_asset_request', category: '固定資産', categoryColor: 'bg-purple-50 text-purple-700 border-purple-200', title: '固定資産証明等申請書（名寄帳・評価証明）', description: '不動産の名寄帳・評価証明・非課税証明を請求', status: 'ready' },
  { key: 'contract', category: '契約書', categoryColor: 'bg-orange-50 text-orange-700 border-orange-200', title: '委任契約書（標準／簡易）', description: '甲乙丙の契約。契約形態と業務種別で自動切替', status: 'planned' },
  { key: 'ininjo', category: '委任状', categoryColor: 'bg-green-50 text-green-700 border-green-200', title: '委任状（相続手続／登記のみ／法定相続情報 等）', description: '権限リストを用途で切替', status: 'planned' },
  { key: 'invoice_advance', category: '請求', categoryColor: 'bg-pink-50 text-pink-700 border-pink-200', title: '請求書（前受金）', description: '前受金の請求書を発行（行/司）', status: 'planned' },
  { key: 'invoice_final', category: '請求', categoryColor: 'bg-pink-50 text-pink-700 border-pink-200', title: '請求書（確定）', description: '確定請求（報酬＋立替実費－前受金）', status: 'planned' },
  { key: 'expense_detail', category: '請求', categoryColor: 'bg-pink-50 text-pink-700 border-pink-200', title: '立替実費明細書', description: '非課税／課税の2区分で明細を作成', status: 'planned' },
  { key: 'receipt', category: '領収', categoryColor: 'bg-rose-50 text-rose-700 border-rose-200', title: '領収書（前受金／確定）', description: '前受金・確定分の領収書', status: 'planned' },
  { key: 'envelope', category: '封筒', categoryColor: 'bg-gray-50 text-gray-700 border-gray-200', title: '封筒（角２／長形３号）', description: '宛先・差出人情報をセット', status: 'planned' },
]

export default function DocumentCreateTab({ caseData, tasks, heirs, properties }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const kosekiModal = useModal()
  const fixedAssetModal = useModal()

  const openDocument = (key: string) => {
    setSelectedKey(key)
    if (key === 'koseki_request') {
      kosekiModal.open()
    } else if (key === 'fixed_asset_request') {
      fixedAssetModal.open()
    }
  }

  return (
    <div className="space-y-5">
      {/* ヘッダ */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">📄</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-indigo-900">書類作成</h3>
            <p className="text-xs text-indigo-700 mt-1">
              案件詳細の情報（依頼者・被相続人・契約形態・相続人・相続人調査内容など）を元に、
              Excel様式の書類を自動生成します。契約形態「{caseData.contract_type ?? '未設定'}」に応じて事務所情報が切替わります。
            </p>
          </div>
        </div>
      </div>

      {/* 書類一覧 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DOCUMENTS.map(doc => {
          const ready = doc.status === 'ready'
          return (
            <button
              key={doc.key}
              onClick={() => ready && openDocument(doc.key)}
              disabled={!ready}
              className={`text-left p-4 rounded-xl border transition-all ${
                ready
                  ? 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer'
                  : 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border ${doc.categoryColor}`}>
                  {doc.category}
                </span>
                {ready ? (
                  <span className="text-[10px] text-green-600 font-semibold">✓ 利用可能</span>
                ) : (
                  <span className="text-[10px] text-gray-400 font-medium">準備中</span>
                )}
              </div>
              <h4 className="text-sm font-semibold text-gray-800 mb-1">{doc.title}</h4>
              <p className="text-xs text-gray-500 leading-relaxed">{doc.description}</p>
            </button>
          )
        })}
      </div>

      <p className="text-[10px] text-gray-400 text-center pt-2">
        ※ 準備中の書類は今後のリリースで順次追加されます
      </p>

      {/* モーダル */}
      <KosekiRequestDocumentModal
        isOpen={kosekiModal.isOpen}
        onClose={() => { kosekiModal.close(); setSelectedKey(null) }}
        caseData={caseData}
        tasks={tasks}
        heirs={heirs}
      />
      <FixedAssetRequestDocumentModal
        isOpen={fixedAssetModal.isOpen}
        onClose={() => { fixedAssetModal.close(); setSelectedKey(null) }}
        caseData={caseData}
        properties={properties}
      />
    </div>
  )
}
