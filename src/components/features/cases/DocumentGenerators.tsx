'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { useModal } from '@/hooks/useModal'
import type { CaseRow, TaskRow, HeirRow, RealEstatePropertyRow, ContractDocumentRow, KosekiRequestRow } from '@/types'
import KosekiRequestDocumentModal from './KosekiRequestDocumentModal'
import FixedAssetRequestDocumentModal from './FixedAssetRequestDocumentModal'
import MailingConfirmationModal from './MailingConfirmationModal'
import IninjoDocumentModal from './IninjoDocumentModal'
import KeiyakuDocumentModal from './KeiyakuDocumentModal'
import InvoiceDocumentModal from './InvoiceDocumentModal'
import KakuteiInvoiceModal from './KakuteiInvoiceModal'
import { showToast } from '@/components/ui/Toast'
// 封筒印刷は 納品タブ側 (DeliveryTab) に移設したため ここでは import しない

type Props = {
  caseData: CaseRow
  tasks: TaskRow[]
  heirs: HeirRow[]
  properties: RealEstatePropertyRow[]
  kosekiRequests?: KosekiRequestRow[]
  contractDocuments?: ContractDocumentRow[]
  /** タスク詳細から開く際に紐づけるタスクID。指定時は各モーダルでこのタスクを初期選択。 */
  defaultTaskId?: string
  /** 生成完了時に親で一覧を再取得するため */
  onGenerated?: () => void
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
  { key: 'mailing_confirmation', category: '郵送', categoryColor: 'bg-cyan-50 text-cyan-700 border-cyan-200', title: '郵送書類確認票', description: '契約書と同封し、お客様に返送してもらう書類の確認票（契約残手続きから自動表示）', status: 'ready' },
  { key: 'koseki_request', category: '戸籍請求', categoryColor: 'bg-brand-50 text-brand-700 border-brand-200', title: '戸籍・住民票等請求書', description: '提出先の市区町村ごとに戸籍・住民票・附票を請求', status: 'ready' },
  { key: 'fixed_asset_request', category: '固定資産', categoryColor: 'bg-purple-50 text-purple-700 border-purple-200', title: '固定資産証明等申請書（名寄帳・評価証明）', description: '不動産の名寄帳・評価証明・非課税証明を請求', status: 'ready' },
  { key: 'contract', category: '契約書', categoryColor: 'bg-orange-50 text-orange-700 border-orange-200', title: '契約書（連名／単独）', description: '契約形態×財産調査有無でFMTを切替。甲・被相続人を自動流し込み＋乙丙押印', status: 'ready' },
  { key: 'ininjo', category: '委任状', categoryColor: 'bg-green-50 text-green-700 border-green-200', title: '委任状（相続手続／登記のみ／法定相続情報 等）', description: '行/司/連名×業務でFMTを切替。委任者・被相続人を自動流し込み＋押印', status: 'ready' },
  { key: 'invoice_advance', category: '請求', categoryColor: 'bg-pink-50 text-pink-700 border-pink-200', title: '請求書（前受金）', description: '前受金の請求書を発行（行/司）。件名・金額を入力＋社印配置', status: 'ready' },
  { key: 'invoice_final', category: '請求', categoryColor: 'bg-pink-50 text-pink-700 border-pink-200', title: '請求書（確定）＋立替実費明細', description: '報酬＋立替実費－前受金。確定請求書と立替明細を1ファイル2シートで出力', status: 'ready' },
  { key: 'receipt_final', category: '領収', categoryColor: 'bg-rose-50 text-rose-700 border-rose-200', title: '領収書（確定）', description: '確定（報酬−前受金）の領収書を発行（行/司）。入金時に発行', status: 'ready' },
  { key: 'receipt', category: '領収', categoryColor: 'bg-rose-50 text-rose-700 border-rose-200', title: '領収書（前受金）', description: '前受金の領収書を発行（行/司）。基本は確定領収書を使用', status: 'ready' },
  { key: 'jikenbo', category: '帳簿', categoryColor: 'bg-slate-50 text-slate-700 border-slate-200', title: '事件簿（業務事件簿）', description: '職務上請求用紙を使った案件の備え付け帳簿。案件情報を流し込み、経緯・経過・用紙番号は手書き用に枠だけ出力', status: 'ready' },
  // 封筒印刷は 納品タブ側 (原本受領証と並べて配置) に移設。
]

// 請求書・領収書は受注確定（受注／戻り受注）以降のみ発行可
const BILLING_DOC_KEYS = new Set(['invoice_advance', 'invoice_final', 'receipt_final', 'receipt'])

export default function DocumentGenerators({ caseData, tasks, heirs, properties, kosekiRequests = [], contractDocuments = [], defaultTaskId, onGenerated }: Props) {
  const canBill = ['受注', '戻り受注', '対応中', '完了'].includes(caseData.status)
  const [, setSelectedKey] = useState<string | null>(null)
  const kosekiModal = useModal()
  const fixedAssetModal = useModal()
  const mailingModal = useModal()
  const ininjoModal = useModal()
  const keiyakuModal = useModal()
  const invoiceModal = useModal()
  const receiptModal = useModal()
  const receiptFinalModal = useModal()
  const kakuteiModal = useModal()

  const openDocument = (key: string) => {
    setSelectedKey(key)
    if (key === 'koseki_request') kosekiModal.open()
    else if (key === 'fixed_asset_request') fixedAssetModal.open()
    else if (key === 'mailing_confirmation') mailingModal.open()
    else if (key === 'ininjo') ininjoModal.open()
    else if (key === 'contract') keiyakuModal.open()
    else if (key === 'invoice_advance') invoiceModal.open()
    else if (key === 'receipt') receiptModal.open()
    else if (key === 'receipt_final') receiptFinalModal.open()
    else if (key === 'invoice_final') kakuteiModal.open()
    else if (key === 'jikenbo') void downloadJikenbo()
  }

  // 事件簿はその場でWordを出す（入力を求める項目が無いのでモーダルを挟まない）
  const downloadJikenbo = async () => {
    try {
      const res = await fetch('/api/documents/jikenbo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: caseData.id }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        showToast(j.error ?? '事件簿の作成に失敗しました', 'error'); return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `事件簿_${caseData.case_number ?? ''}_${caseData.deal_name ?? ''}.docx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      const n = Number(res.headers.get('X-Authority-Form-Count') ?? '0')
      showToast(
        n > 0
          ? `事件簿を作成しました。職務上請求用紙 ${n}枚ぶんの番号は帳簿に手書きしてください`
          : '事件簿を作成しました',
        'success',
      )
      onGenerated?.()
    } catch {
      showToast('事件簿の作成に失敗しました', 'error')
    }
  }

  return (
    <div className="space-y-5">
      {/* ヘッダ */}
      <div className="bg-gradient-to-r from-indigo-50 to-brand-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-indigo-600" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-indigo-900">書類作成</h3>
            <p className="text-xs text-indigo-700 mt-1">
              案件詳細の情報（依頼者・被相続人・契約形態・相続人・相続人調査内容など）を元に、
              Excel様式の書類を自動生成します。契約形態「{caseData.contract_type ?? '未設定'}」に応じて事務所情報が切替わります。
              {defaultTaskId && <span className="ml-1 font-semibold">作成した書類はこのタスクに紐づきます。</span>}
            </p>
          </div>
        </div>
      </div>

      {/* 書類一覧 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DOCUMENTS.map(doc => {
          // 請求書・領収書は受注確定以降のみ
          const billingBlocked = BILLING_DOC_KEYS.has(doc.key) && !canBill
          const ready = doc.status === 'ready' && !billingBlocked
          return (
            <button
              key={doc.key}
              onClick={() => ready && openDocument(doc.key)}
              disabled={!ready}
              className={`text-left p-4 rounded-xl border transition-all ${
                ready
                  ? 'bg-white border-gray-200 hover:border-brand-400 hover:shadow-md cursor-pointer'
                  : 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={`inline-block text-[12px] font-medium px-2 py-0.5 rounded-full border ${doc.categoryColor}`}>
                  {doc.category}
                </span>
                {ready ? (
                  <span className="text-[12px] text-green-600 font-semibold">✓ 利用可能</span>
                ) : billingBlocked ? (
                  <span className="text-[12px] text-amber-600 font-medium">受注後に発行</span>
                ) : (
                  <span className="text-[12px] text-gray-400 font-medium">準備中</span>
                )}
              </div>
              <h4 className="text-sm font-semibold text-gray-800 mb-1">{doc.title}</h4>
              <p className="text-xs text-gray-500 leading-relaxed">{doc.description}</p>
            </button>
          )
        })}
      </div>

      <p className="text-[12px] text-gray-400 text-center pt-2">
        ※ 準備中の書類は今後のリリースで順次追加されます
      </p>

      {/* モーダル */}
      <KosekiRequestDocumentModal
        isOpen={kosekiModal.isOpen}
        onClose={() => { kosekiModal.close(); setSelectedKey(null); onGenerated?.() }}
        caseData={caseData}
        tasks={tasks}
        heirs={heirs}
        kosekiRequests={kosekiRequests}
        defaultTaskId={defaultTaskId}
      />
      <FixedAssetRequestDocumentModal
        isOpen={fixedAssetModal.isOpen}
        onClose={() => { fixedAssetModal.close(); setSelectedKey(null); onGenerated?.() }}
        caseData={caseData}
        properties={properties}
        defaultTaskId={defaultTaskId}
      />
      <MailingConfirmationModal
        isOpen={mailingModal.isOpen}
        onClose={() => { mailingModal.close(); setSelectedKey(null) }}
        caseData={caseData}
        contractDocuments={contractDocuments}
        defaultTaskId={defaultTaskId}
        onSaved={onGenerated}
      />
      <IninjoDocumentModal
        isOpen={ininjoModal.isOpen}
        onClose={() => { ininjoModal.close(); setSelectedKey(null) }}
        caseData={caseData}
        tasks={tasks}
        defaultTaskId={defaultTaskId}
        onSaved={onGenerated}
      />
      <KeiyakuDocumentModal
        isOpen={keiyakuModal.isOpen}
        onClose={() => { keiyakuModal.close(); setSelectedKey(null) }}
        caseData={caseData}
        tasks={tasks}
        defaultTaskId={defaultTaskId}
        onSaved={onGenerated}
      />
      <InvoiceDocumentModal
        isOpen={invoiceModal.isOpen}
        onClose={() => { invoiceModal.close(); setSelectedKey(null) }}
        caseData={caseData}
        tasks={tasks}
        docType="請求書"
        defaultTaskId={defaultTaskId}
        onSaved={onGenerated}
      />
      <InvoiceDocumentModal
        isOpen={receiptModal.isOpen}
        onClose={() => { receiptModal.close(); setSelectedKey(null) }}
        caseData={caseData}
        tasks={tasks}
        docType="領収書"
        defaultTaskId={defaultTaskId}
        onSaved={onGenerated}
      />
      <InvoiceDocumentModal
        isOpen={receiptFinalModal.isOpen}
        onClose={() => { receiptFinalModal.close(); setSelectedKey(null) }}
        caseData={caseData}
        tasks={tasks}
        docType="領収書"
        kakutei
        defaultTaskId={defaultTaskId}
        onSaved={onGenerated}
      />
      <KakuteiInvoiceModal
        isOpen={kakuteiModal.isOpen}
        onClose={() => { kakuteiModal.close(); setSelectedKey(null) }}
        caseData={caseData}
        tasks={tasks}
        defaultTaskId={defaultTaskId}
        onSaved={onGenerated}
      />
    </div>
  )
}
