'use client'

import { useEffect, useMemo, useState } from 'react'
import { Stamp } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import {
  KEIYAKU_VARIANTS,
  getKeiyakuVariant,
  recommendKeiyakuVariant,
  type KeiyakuVariant,
} from '@/lib/keiyakuVariants'
import type { CaseRow, TaskRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  tasks: TaskRow[]
  /** タスク詳細から作成する際に紐づけるタスクID（初期選択） */
  defaultTaskId?: string
  onSaved?: () => void
}

const LAW_LABEL: Record<string, string> = { gyosei: '行政書士法人オーシャン（乙）', shiho: '司法書士法人オーシャン（丙）' }
const GROUP_ORDER: KeiyakuVariant['group'][] = ['連名', '行政単独', 'その他']

export default function KeiyakuDocumentModal({ isOpen, onClose, caseData, tasks, defaultTaskId, onSaved }: Props) {
  const recommended = useMemo(
    () => recommendKeiyakuVariant(caseData.contract_type, caseData.service_category),
    [caseData.contract_type, caseData.service_category],
  )
  const [variantKey, setVariantKey] = useState<string>(recommended)
  const [taskId, setTaskId] = useState<string>('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setVariantKey(recommended)
    setTaskId(defaultTaskId ?? '')
  }, [isOpen, recommended, defaultTaskId])

  const variant = getKeiyakuVariant(variantKey)

  const handleGenerate = async () => {
    if (!variant) {
      showToast('様式を選択してください', 'error')
      return
    }
    if (!caseData.clients?.address) {
      showToast('依頼者の住所が未入力です（依頼者タブで設定してください）', 'error')
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/documents/keiyaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: caseData.id, variant: variantKey, taskId: taskId || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '生成に失敗しました' }))
        showToast(`生成に失敗: ${err.error ?? '不明なエラー'}`, 'error')
        return
      }
      const blob = await res.blob()
      const filename = `契約書_${variant.label}_${caseData.case_number ?? ''}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast('契約書を生成しました', 'success')
      onSaved?.()
      onClose()
    } catch (e) {
      showToast(`通信エラー: ${(e as Error).message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="契約書 を作成"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button
            onClick={onClose}
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
      }
    >
      <div className="space-y-4">
        {/* FMT選択 */}
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            様式（FMT）
            <span className="ml-2 text-[12px] font-normal text-gray-400">
              契約形態「{caseData.contract_type ?? '未設定'}」から推奨を初期選択。変更可。
            </span>
          </label>
          <select
            value={variantKey}
            onChange={e => setVariantKey(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400"
          >
            {GROUP_ORDER.map(group => {
              const items = KEIYAKU_VARIANTS.filter(v => v.group === group)
              if (items.length === 0) return null
              return (
                <optgroup key={group} label={group}>
                  {items.map(v => (
                    <option key={v.key} value={v.key}>
                      {v.label}{v.key === recommended ? '（推奨）' : ''}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
          {variantKey === recommended && (
            <p className="text-[12px] text-green-600 mt-1">✓ 契約形態・受注区分に基づく推奨様式です</p>
          )}
        </section>

        {/* 流し込み内容のプレビュー */}
        <section className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1.5">
          <div className="flex gap-3">
            <span className="text-gray-500 w-20 flex-shrink-0">甲（依頼者）</span>
            <span className="text-gray-800">{caseData.clients?.name ?? '（未設定）'} / {caseData.clients?.address ?? '（住所未設定）'}</span>
          </div>
          {variant?.fields.deceased && (
            <div className="flex gap-3">
              <span className="text-gray-500 w-20 flex-shrink-0">被相続人</span>
              <span className="text-gray-800">{caseData.deceased_name ?? '（未設定）'}</span>
            </div>
          )}
          <div className="flex gap-3">
            <span className="text-gray-500 w-20 flex-shrink-0">押印</span>
            <span className="text-gray-800 inline-flex items-center gap-1 flex-wrap">
              <Stamp className="w-3.5 h-3.5 text-rose-500" strokeWidth={1.75} />
              {variant?.stamps.map(s => LAW_LABEL[s.law]).join(' ・ ') || '（なし）'}
            </span>
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

        <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
          ※ 甲（依頼者）住所・氏名・被相続人を案件詳細から自動流し込みします。報酬は「別紙報酬額基準表」、
          契約日は空欄（手書き）です。参照用データ（注意書き・関数・枠外マスタ・案件番号見本）は除去済みです。
        </p>
      </div>
    </Modal>
  )
}
