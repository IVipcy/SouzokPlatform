'use client'

// 原本受領証 生成モーダル。
// 郵送先(相続人)を1名選択 → API叩いて Excel 生成 → ダウンロード。
// 相続人が未登録の案件では 依頼者(cases.clients) にフォールバック。
//
// 納品タブで書類ごとに受領先を決めている場合は、その人あての書類だけが載る。
// 受領先が未設定の書類は「共通」として、誰あての受領証にも載る。
// 受領先が分かれるときは、この画面で1人ずつ選んで人数分の受領証を作る。

import { useState } from 'react'
import { X, FileText, User } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow, HeirRow, ClientRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow & { clients?: ClientRow | null }
  heirs: HeirRow[]
  /** 納品タブで「対象」にした書類の受領先。受領先ごとの件数表示に使う（null=共通） */
  targetRecipients?: Array<string | null>
  onGenerated?: () => void
}

type RecipientOption = {
  id: string | null   // heir.id or null(=依頼者)
  name: string
  address: string | null
  isApplicant: boolean
  isFallback: boolean  // heirs 未登録時の 依頼者フォールバック
}

export default function GenponJuryoshoModal({ isOpen, onClose, caseData, heirs, targetRecipients = [], onGenerated }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)  // heir.id or 'client' or null
  const [generating, setGenerating] = useState(false)
  if (!isOpen) return null

  const options: RecipientOption[] = []
  for (const h of heirs) {
    options.push({ id: h.id, name: h.name, address: h.address ?? null, isApplicant: h.is_applicant, isFallback: false })
  }
  // 相続人未登録 or 依頼者情報が heirs.is_applicant で拾えない場合 fallback として依頼者を追加
  const hasApplicantInHeirs = heirs.some(h => h.is_applicant)
  if ((options.length === 0 || !hasApplicantInHeirs) && caseData.clients?.address) {
    options.push({
      id: 'client',
      name: caseData.clients.name || '（依頼者）',
      address: caseData.clients.address,
      isApplicant: true,
      isFallback: true,
    })
  }

  // その宛先の受領証に何件載るか（自分あて＋共通）。0件なら作る意味がないので止める。
  const commonCount = targetRecipients.filter(r => r == null).length
  const countFor = (id: string | null) => (id && id !== 'client' ? targetRecipients.filter(r => r === id).length : 0) + commonCount
  const hasSplit = targetRecipients.some(r => r != null)

  const initialId = selectedId ?? (options.find(o => o.isApplicant)?.id ?? options[0]?.id ?? null)
  const currentId = selectedId ?? initialId
  const selected = options.find(o => o.id === currentId)

  const handleGenerate = async () => {
    if (!selected) { showToast('郵送先を選択してください', 'error'); return }
    if (!selected.address) { showToast('選択した相続人の住所が未入力です', 'error'); return }
    setGenerating(true)
    try {
      const res = await fetch('/api/documents/genpon-juryosho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          recipientHeirId: selected.id === 'client' ? null : selected.id,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '生成に失敗しました' }))
        showToast(`生成に失敗: ${err.error ?? '不明なエラー'}`, 'error')
        return
      }
      const blob = await res.blob()
      const filename = `原本受領証_${caseData.case_number ?? ''}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      showToast('原本受領証を生成しました', 'success')
      onGenerated?.()
      onClose()
    } catch (e) {
      showToast(`通信エラー: ${(e as Error).message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-[520px] max-w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-bold text-gray-900 flex items-center gap-2"><FileText className="w-4 h-4 text-brand-600" />原本受領証を作成</div>
            <div className="text-[11.5px] text-gray-500 mt-0.5">お客様に返却する納品物一覧を書面化します</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[12px] text-gray-500 leading-relaxed">
            郵送先を1名選択してください。宛先(事務所)は 契約形態「<span className="font-semibold text-gray-700">{caseData.contract_type ?? '未設定'}</span>」から自動で決まります。<br />
            納品物一覧は 納品タブで「対象」に選択済みの書類が自動で並びます。
          </p>
          {hasSplit && (
            <p className="text-[12px] text-brand-700 bg-brand-50 border border-brand-100 rounded-md px-2.5 py-2 leading-relaxed">
              受領先が分かれています。1人ずつ選んで、人数分の原本受領証を作ってください。
              受領先を決めていない書類（共通{commonCount}件）は、どの受領証にも載ります。
            </p>
          )}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-2">郵送先 (住所と氏名が原本受領証に流し込まれます)</label>
            {options.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[12px] text-amber-800">
                相続人も依頼者住所も未登録です。相続人調査タブ or 依頼者タブで住所を登録してください。
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-200 max-h-64 overflow-y-auto">
                {options.map(opt => (
                  <label key={opt.id ?? 'null'} className={`flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer ${currentId === opt.id ? 'bg-brand-50/60' : ''}`}>
                    <input type="radio" name="rcpt" checked={currentId === opt.id} onChange={() => setSelectedId(opt.id)} className="mt-1 w-4 h-4 accent-brand-600" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-gray-800">{opt.name} 様</span>
                        {opt.isApplicant && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-100 text-brand-800 border border-brand-300">
                            <User className="w-2.5 h-2.5" />依頼者
                          </span>
                        )}
                        {opt.isFallback && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            依頼者情報から
                          </span>
                        )}
                      </div>
                      <div className={`text-[11.5px] mt-0.5 ${opt.address ? 'text-gray-600' : 'text-red-600'}`}>
                        {opt.address ?? '住所未登録 — 相続人調査タブで住所を入力してください'}
                      </div>
                      {hasSplit && (
                        <div className="text-[11px] text-gray-500 mt-0.5">この宛先の書類 {countFor(opt.id)}件</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
          <button onClick={onClose} disabled={generating} className="px-4 py-2 text-[13px] font-semibold text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 disabled:opacity-50">キャンセル</button>
          <button onClick={handleGenerate} disabled={generating || !selected?.address}
            className="px-5 py-2 text-[13px] font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {generating ? '生成中...' : 'Excelで出力'}
          </button>
        </div>
      </div>
    </div>
  )
}
