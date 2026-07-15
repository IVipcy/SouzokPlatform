'use client'

import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import {
  invoiceVariantKey,
  recommendInvoiceOffice,
  type InvoiceVariant,
} from '@/lib/invoiceVariants'
import { type StampLaw } from '@/lib/ininjoVariants'
import { KOSEKI_AGENT_OFFICES } from '@/lib/officeProfiles'
import { advanceForFirm } from '@/lib/advancePayment'
import { billingPatternOf } from '@/lib/constants'
import type { CaseRow, TaskRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  tasks: TaskRow[]
  docType: InvoiceVariant['docType']  // '請求書' | '領収書'
  /** true=確定（確定の領収書など）、false/未指定=前受金 */
  kakutei?: boolean
  /** タスク詳細から作成する際に紐づけるタスクID（初期選択） */
  defaultTaskId?: string
  onSaved?: () => void
}

export default function InvoiceDocumentModal({ isOpen, onClose, caseData, tasks, docType, kakutei = false, defaultTaskId, onSaved }: Props) {
  const recommendedOffice = useMemo(() => recommendInvoiceOffice(caseData.contract_type), [caseData.contract_type])
  const kubunLabel = kakutei ? '確定' : '前受金'
  const [office, setOffice] = useState<StampLaw>(recommendedOffice)
  const [officeId, setOfficeId] = useState<string>(recommendedOffice === 'shiho' ? 'kyodo' : 'kureator')
  const [kenmei, setKenmei] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [taskId, setTaskId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [downloadInfo, setDownloadInfo] = useState<{ url: string; filename: string } | null>(null)

  const handleClose = () => {
    if (downloadInfo) URL.revokeObjectURL(downloadInfo.url)
    setDownloadInfo(null)
    onClose()
  }

  // 発行法人ぶんの確定報酬（割引後合計）。0のときは fee_total フォールバック。
  const firmFee = (firm: StampLaw): number => {
    let fee = firm === 'shiho' ? (caseData.fee_judicial ?? 0) : (caseData.fee_administrative ?? 0)
    if (fee === 0 && (caseData.fee_administrative ?? 0) === 0 && (caseData.fee_judicial ?? 0) === 0) {
      fee = caseData.fee_total ?? 0
    }
    return fee
  }
  const isLump = billingPatternOf(caseData.billing_pattern).value !== 'staged'  // ②③=一括（前受金＝確定分）

  // 発行法人ぶんの金額をプリセット。
  //   確定請求＝報酬−前受金 / 前受金（段階①）＝その法人の前受金 / 前受金（一括②③）＝確定報酬まるごと。
  const presetAmount = (firm: StampLaw): number => {
    if (kakutei) return Math.max(0, firmFee(firm) - advanceForFirm(caseData, firm))
    if (isLump) return firmFee(firm)          // 一括：前受金請求書＝確定報酬そのもの
    return advanceForFirm(caseData, firm)     // 段階：前受金欄の額
  }

  useEffect(() => {
    if (!isOpen) { setDownloadInfo(null); return }
    setOffice(recommendedOffice)
    setKenmei(`${caseData.deceased_name ? caseData.deceased_name + '様 ' : ''}相続手続き ${kubunLabel}`)
    setAmount(presetAmount(recommendedOffice) || '')
    setTaskId(defaultTaskId ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, recommendedOffice, caseData.deceased_name, defaultTaskId])

  const handleGenerate = async () => {
    if (amount === '' || Number(amount) <= 0) {
      showToast('金額を入力してください', 'error')
      return
    }
    if (!kenmei.trim()) {
      showToast('件名を入力してください', 'error')
      return
    }
    setGenerating(true)
    try {
      const variant = invoiceVariantKey(docType, office)
      const res = await fetch('/api/documents/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: caseData.id, variant, kenmei: kenmei.trim(), amount: Number(amount), taskId: taskId || null, kubun: kakutei ? '確定請求' : '前受金', officeId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '生成に失敗しました' }))
        showToast(`生成に失敗: ${err.error ?? '不明なエラー'}`, 'error')
        return
      }
      const blob = await res.blob()
      const officeLabel = office === 'gyosei' ? '行政' : '司法'
      const filename = `${docType}_${kubunLabel}_${officeLabel}_${caseData.case_number ?? ''}.xlsx`
      const url = URL.createObjectURL(blob)
      setDownloadInfo({ url, filename })
      showToast(`${docType}を生成しました。「ダウンロード」ボタンで保存してください`, 'success')
      onSaved?.()
      // モーダルは閉じない：ダウンロードリンクを残す
    } catch (e) {
      showToast(`通信エラー: ${(e as Error).message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`${docType}（${kubunLabel}）を作成`}
      maxWidth="max-w-xl"
      footer={
        downloadInfo ? (
          <>
            <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">閉じる</button>
            <a href={downloadInfo.url} download={downloadInfo.filename} className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors no-underline">⬇ ダウンロード</a>
          </>
        ) : (
          <>
            <button
              onClick={handleClose}
              disabled={generating}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {generating ? '生成中…' : 'Excelで出力'}
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {downloadInfo && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
            <div className="flex-1 text-[13px] text-green-800">{docType}を生成しました。下のボタンで保存してください。</div>
            <a href={downloadInfo.url} download={downloadInfo.filename} className="flex-none inline-flex items-center px-3 py-1.5 text-[13px] font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md no-underline">⬇ ダウンロード</a>
          </div>
        )}
        {/* 発行主体 */}
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            発行主体
            <span className="ml-2 text-[12px] font-normal text-gray-400">契約形態「{caseData.contract_type ?? '未設定'}」から推奨を初期選択</span>
          </label>
          <div className="flex gap-2">
            {(['gyosei', 'shiho'] as StampLaw[]).map(o => (
              <button
                key={o}
                type="button"
                onClick={() => { setOffice(o); setAmount(presetAmount(o) || '') }}
                className={`flex-1 text-sm px-3 py-2 rounded-lg border transition-colors ${
                  office === o ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
                }`}
              >
                {o === 'gyosei' ? '行政書士法人オーシャン' : '司法書士法人オーシャン'}
                {o === recommendedOffice ? '（推奨）' : ''}
              </button>
            ))}
          </div>
        </section>

        {/* 事務所住所（拠点） */}
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">事務所住所</label>
          <select
            value={officeId}
            onChange={e => setOfficeId(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400"
          >
            {KOSEKI_AGENT_OFFICES.map(o => (
              <option key={o.id} value={o.id}>{o.label}（{o.line1}）</option>
            ))}
          </select>
        </section>

        {/* 件名 */}
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">件名</label>
          <input
            type="text"
            value={kenmei}
            onChange={e => setKenmei(e.target.value)}
            placeholder={`例: ○○様 相続手続き ${kubunLabel}`}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-400"
          />
        </section>

        {/* 金額 */}
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{docType === '請求書' ? '請求額' : '領収額'}（{kubunLabel}・税込）</label>
          <div className="relative">
            <input
              type="number"
              min={1}
              value={amount}
              onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="例: 110000"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 pr-8 focus:outline-none focus:border-brand-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">円</span>
          </div>
          <p className="text-[12px] text-gray-400 mt-1">
            {kakutei
              ? '報酬−前受金を初期表示。立替実費を含める場合は加算してください。'
              : '前受金は消費税対象外のため、合計＝入力額で出力します。'}
          </p>
        </section>

        {/* 流し込みプレビュー */}
        <section className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1.5">
          <div className="flex gap-3">
            <span className="text-gray-500 w-16 flex-shrink-0">宛先</span>
            <span className="text-gray-800">{caseData.clients?.name ?? '（未設定）'} 様</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500 w-16 flex-shrink-0">発行日</span>
            <span className="text-gray-800">空欄（手書き）</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500 w-16 flex-shrink-0">社印</span>
            <span className="text-gray-800">{office === 'gyosei' ? '行政書士法人オーシャン' : '司法書士法人オーシャン'} の角印を配置</span>
          </div>
        </section>

        {/* 作成タスク紐付け（任意） */}
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">作成タスク（任意）</label>
          <select
            value={taskId}
            onChange={e => setTaskId(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400"
          >
            <option value="">案件全体（タスク未指定）</option>
            {tasks.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </section>
      </div>
    </Modal>
  )
}
