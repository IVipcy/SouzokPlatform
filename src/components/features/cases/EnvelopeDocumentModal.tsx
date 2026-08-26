'use client'

// 封筒（宛名）Excel生成モーダル。
// v2: 相続人選択(郵送先)対応。heirs を渡すと 相続人リストから郵送先を選べる。
//     依頼者(is_applicant) にはバッジ。heirs 未指定 or 空の場合は 従来どおり cases.clients を使う。
//     郵便番号は 依頼者選択時のみ 案件情報から自動流し込み、他の相続人は 手入力可。

import { useEffect, useMemo, useState } from 'react'
import { User } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import { ENVELOPE_VARIANTS } from '@/lib/envelopeVariants'
import type { CaseRow, TaskRow, HeirRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  tasks: TaskRow[]
  defaultTaskId?: string
  onSaved?: () => void
  heirs?: HeirRow[]
}

type RecipientOption = {
  id: string   // heir.id or 'client'
  name: string
  address: string | null
  postal_code: string | null
  isApplicant: boolean
  isFallback: boolean  // heirs 未登録時の 依頼者フォールバック
}

export default function EnvelopeDocumentModal({ isOpen, onClose, caseData, defaultTaskId, onSaved, heirs = [] }: Props) {
  const [variantKey, setVariantKey] = useState<string>('naga3_white')
  const [taskId, setTaskId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [manualPostal, setManualPostal] = useState('')

  // 郵送先候補: 相続人 + (依頼者情報が heirs 側になければ)フォールバック
  const options = useMemo<RecipientOption[]>(() => {
    const out: RecipientOption[] = []
    for (const h of heirs) {
      out.push({
        id: h.id, name: h.name, address: h.address ?? null,
        postal_code: h.is_applicant ? (caseData.clients?.postal_code ?? null) : null,
        isApplicant: h.is_applicant, isFallback: false,
      })
    }
    const hasApplicantInHeirs = heirs.some(h => h.is_applicant)
    if ((out.length === 0 || !hasApplicantInHeirs) && (caseData.clients?.address || caseData.clients?.name)) {
      out.push({
        id: 'client',
        name: caseData.clients?.name || '（依頼者）',
        address: caseData.clients?.address ?? null,
        postal_code: caseData.clients?.postal_code ?? null,
        isApplicant: true, isFallback: true,
      })
    }
    return out
  }, [heirs, caseData.clients])

  const initialId = options.find(o => o.isApplicant)?.id ?? options[0]?.id ?? null
  const currentId = selectedId ?? initialId
  const selected = options.find(o => o.id === currentId)

  useEffect(() => {
    if (!isOpen) return
    setVariantKey('naga3_white')
    setTaskId(defaultTaskId ?? '')
    setSelectedId(null)
    setManualPostal('')
  }, [isOpen, defaultTaskId])

  const variant = ENVELOPE_VARIANTS.find(v => v.key === variantKey)
  const effectivePostal = manualPostal || selected?.postal_code || ''

  const handleGenerate = async () => {
    if (!selected) { showToast('郵送先を選択してください', 'error'); return }
    if (!selected.address) { showToast('選択した宛先の住所が未入力です', 'error'); return }
    setGenerating(true)
    try {
      const res = await fetch('/api/documents/envelope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id, variant: variantKey, taskId: taskId || null,
          recipient: { name: selected.name, address: selected.address, postal_code: effectivePostal || null },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '生成に失敗しました' }))
        showToast(`生成に失敗: ${err.error ?? '不明なエラー'}`, 'error')
        return
      }
      const blob = await res.blob()
      const filename = `封筒_${variant?.label ?? ''}_${caseData.case_number ?? ''}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      showToast('封筒を生成しました', 'success')
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
      title="封筒（宛名）を作成"
      maxWidth="max-w-lg"
      footer={
        <>
          <button onClick={onClose} disabled={generating} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50">キャンセル</button>
          <button onClick={handleGenerate} disabled={generating || !selected?.address} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50">{generating ? '生成中…' : 'Excelで出力'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">郵送先（宛名の氏名・住所が流し込まれます）</label>
          {options.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              相続人も依頼者住所も未登録です。相続人調査タブ or 依頼者タブで登録してください。
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-200 max-h-56 overflow-y-auto">
              {options.map(opt => (
                <label key={opt.id} className={`flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer ${currentId === opt.id ? 'bg-brand-50/60' : ''}`}>
                  <input type="radio" name="envrcpt" checked={currentId === opt.id} onChange={() => { setSelectedId(opt.id); setManualPostal('') }} className="mt-1 w-4 h-4 accent-brand-600" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-gray-800">{opt.name} 様</span>
                      {opt.isApplicant && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-100 text-brand-800 border border-brand-300">
                          <User className="w-2.5 h-2.5" />依頼者
                        </span>
                      )}
                      {opt.isFallback && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">依頼者情報から</span>
                      )}
                    </div>
                    <div className={`text-[11.5px] mt-0.5 ${opt.address ? 'text-gray-600' : 'text-red-600'}`}>
                      {opt.address ?? '住所未登録 — この宛先では生成できません'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </section>

        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">郵便番号 <span className="font-normal text-gray-400">(依頼者以外は手入力可)</span></label>
          <input type="text" value={effectivePostal} onChange={e => setManualPostal(e.target.value)} placeholder="例: 220-0011"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400" />
        </section>

        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">封筒の種類</label>
          <div className="flex flex-col gap-2">
            {ENVELOPE_VARIANTS.map(v => (
              <button key={v.key} type="button" onClick={() => setVariantKey(v.key)}
                className={`text-left text-sm px-3 py-2 rounded-lg border transition-colors ${variantKey === v.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'}`}>
                {v.label}
              </button>
            ))}
          </div>
        </section>

        <p className="text-[12px] text-gray-400">差出人（オーシャン）はテンプレートに既設です。郵便番号・住所・宛名を選択した宛先から流し込みます。</p>
      </div>
    </Modal>
  )
}
