'use client'

// 戸籍・住民票等請求書の出力画面。
//
// ここは「入力する場所」ではなく「確認して出す場所」。
// 紙に載る中身（請求先・本籍・筆頭主・請求に係る者・種別・使用目的・備考・同封小為替）は
// 全部、実務タブの戸籍カードに書いたものが入る。ここで直せてしまうと、紙とカードの中身が
// 食い違って、あとから「何を頼んだのか」がカードを見ても分からなくなる。
//
// この画面で選ぶのは、今回この紙をどう出すかだけ（様式・請求日・拠点・事業部・通数）。
// どれも案件の情報ではないのでカードには持たせない。
//
// 1タブ＝1請求＝1枚。請求先を足したいときは戸籍タブの「＋ 請求を追加」でタブを足す。

import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import {
  KOSEKI_VARIANT_PRESETS,
  OFFICE_BRANCH_OPTIONS,
  divisionsOf,
  findBranch,
  IKIIKI_DEFAULT_BRANCH,
  defaultKosekiVariant,
  type KosekiVariant,
  type KosekiAgentOfficeId,
} from '@/lib/officeProfiles'
import { KOSEKI_REQUEST_TYPES, KOSEKI_DOC_FORMS, KOSEKI_PURPOSES, includesJuminhyo } from '@/lib/constants'
import type { CaseRow, TaskRow, HeirRow, KosekiRequestRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  /** 使っていないが、書類作成メニューが同じ形で渡してくる */
  tasks?: TaskRow[]
  heirs: HeirRow[]
  /**
   * 出力する戸籍請求。カードの「この内容で請求書を作る」からは1件。
   * 書類作成メニューからは案件の全件が来るので、その場合だけどれを出すか選ばせる。
   */
  kosekiRequests?: KosekiRequestRow[]
  /** タスク詳細から作成する際に紐づけるタスクID */
  defaultTaskId?: string
}

// 請求書に印字する種別＝実務タブの請求の種別（戸籍/除籍/…）＋種別②（謄本/抄本）。
const DOC_CHOICES = [...KOSEKI_REQUEST_TYPES, ...KOSEKI_DOC_FORMS] as const

/** 実務タブの種別から請求種別を拾う。マッチしなければ空＝未選択。 */
function parseRequestTypes(...docTypes: (string | null | undefined)[]): string[] {
  const joined = docTypes.filter(Boolean).join('・')
  return DOC_CHOICES.filter(t => joined.includes(t))
}

const toDigits = (s: string) => s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[^\d]/g, '')

export default function KosekiRequestDocumentModal({ isOpen, onClose, caseData, heirs, kosekiRequests = [], defaultTaskId }: Props) {
  const [variant, setVariant] = useState<KosekiVariant>(defaultKosekiVariant(caseData.contract_type))
  const [requestDate, setRequestDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [copyCount, setCopyCount] = useState<number>(1)
  // 事業部。同じ拠点でも事業部で電話が変わる（共同ビルの第一／第二）ため、拠点とセットで決まる。
  // 拠点はカード（Step1の拠点）が持つので、ここでは事業部だけ選ぶ。
  const [division, setDivision] = useState<string>(IKIIKI_DEFAULT_BRANCH.division)
  const [generating, setGenerating] = useState(false)
  // どの請求を出すか。1件だけ渡されたときは選ばせない。
  const [pick, setPick] = useState(0)

  const preset = KOSEKI_VARIANT_PRESETS[variant]
  const k = kosekiRequests[pick] ?? kosekiRequests[0] ?? null

  // 上記代理人の所在地（拠点）。カードに入っていなければ共同ビル。
  const agentOffice = (OFFICE_BRANCH_OPTIONS.find(o => o.id === k?.branch_office)?.id ?? 'kyodo') as KosekiAgentOfficeId
  const agentOfficeLabel = OFFICE_BRANCH_OPTIONS.find(o => o.id === agentOffice)?.label ?? ''
  const branch = findBranch(agentOffice, division)

  useEffect(() => {
    if (!isOpen) return
    setVariant(defaultKosekiVariant(caseData.contract_type))
    setRequestDate(new Date().toISOString().slice(0, 10))
    setCopyCount(1)
    setPick(0)
  }, [isOpen, caseData.contract_type])

  // 拠点が変わったら、その拠点にある事業部の先頭に寄せる（無い事業部が残らないように）
  useEffect(() => {
    setDivision(prev => (divisionsOf(agentOffice).includes(prev) ? prev : divisionsOf(agentOffice)[0] ?? ''))
  }, [agentOffice])

  // 紙に載る中身。すべてカードの値。
  // 本籍・住所だけ、カード未入力のときに人（被相続人・相続人）の登録住所で補う。
  // 住民票・除票は住所、それ以外は本籍。
  const who = (k?.target_person ?? '').trim() || (caseData.deceased_name ?? '')
  const isDeceased = !!caseData.deceased_name && who === caseData.deceased_name
  const heir = isDeceased ? undefined : heirs.find(h => (h.name ?? '').trim() === who)
  const fallbackHonseki = includesJuminhyo(k?.doc_types)
    ? (isDeceased ? (caseData.deceased_address ?? '') : (heir?.address ?? ''))
    : (isDeceased ? (caseData.deceased_registered_address ?? '') : (heir?.registered_address ?? ''))

  const doc = {
    municipality: (k?.request_to ?? '').trim(),
    honseki: (k?.honseki_address ?? '').trim() || fallbackHonseki,
    hittousha: (k?.head_person ?? '').trim() || (isDeceased ? (caseData.deceased_name ?? '') : ''),
    targetName: who,
    requestTypes: parseRequestTypes(k?.doc_types, k?.doc_form),
    purpose: (k?.request_reason ?? '').trim() || KOSEKI_PURPOSES[0],
    notes: (k?.range_detail ?? '').trim(),
    // 同封小為替＝費用予算。封筒に入れる小為替はこの金額。
    // 返金・確定費用は戸籍が届いた後の数字なので、出す時点ではまだ存在しない。
    kogawase: k?.cost_budget ?? null,
  }

  const handleGenerate = async () => {
    if (!k) { showToast('出力する戸籍請求がありません', 'error'); return }
    if (!caseData.clients?.name || !caseData.clients?.address) {
      showToast('依頼者の氏名・住所が未入力です', 'error')
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/documents/koseki-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          variant,
          requestDate,
          purpose: doc.purpose,
          rows: [{
            municipality: doc.municipality,
            honseki: doc.honseki,
            hittousha: doc.hittousha,
            targetName: doc.targetName,
            requestTypes: doc.requestTypes,
            copyCount: Number(copyCount) || 1,
            kogawaseAmount: doc.kogawase,
            notes: doc.notes,
          }],
          rowIndex: 0,
          taskId: defaultTaskId ?? null,
          agentOffice,
          division,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '生成に失敗しました' }))
        showToast(`生成に失敗: ${err.error ?? '不明なエラー'}`, 'error')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `戸籍請求書_${caseData.case_number ?? ''}_${doc.municipality || '請求'}_${requestDate}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('戸籍請求書を生成しました', 'success')
      onClose()
    } catch (e) {
      showToast(`通信エラー: ${(e as Error).message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const sel = 'w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400'
  const lab = 'block text-xs font-semibold text-gray-700 mb-1'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="戸籍・住民票等請求書 を作成"
      maxWidth="max-w-3xl"
      footer={
        <>
          <button onClick={onClose} disabled={generating}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50">
            キャンセル
          </button>
          <button onClick={handleGenerate} disabled={generating || !k}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50">
            {generating ? '生成中…' : 'Excelで出力'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={lab}>様式バリエーション</label>
            <select value={variant} onChange={e => setVariant(e.target.value as KosekiVariant)} className={sel}>
              {(Object.keys(KOSEKI_VARIANT_PRESETS) as KosekiVariant[]).map(key => (
                <option key={key} value={key}>{KOSEKI_VARIANT_PRESETS[key].label}</option>
              ))}
            </select>
            <p className="text-[12px] text-gray-400 mt-1">契約形態：{caseData.contract_type ?? '未設定'}</p>
          </div>
          <div>
            <label className={lab}>請求日</label>
            <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-400" />
          </div>
          <div>
            <label className={lab}>通数</label>
            <input type="text" inputMode="numeric" value={copyCount ? String(copyCount) : ''}
              onChange={e => { const n = Number(toDigits(e.target.value)); setCopyCount(n > 0 ? n : 1) }}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 text-right focus:outline-none focus:border-brand-400" />
          </div>
          <div>
            <label className={lab}>事業部</label>
            <select value={division} onChange={e => setDivision(e.target.value)} className={sel}>
              {divisionsOf(agentOffice).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {branch && (
              <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                〒{branch.postalCode} {branch.line1} {branch.line2}<br />
                TEL {branch.tel} ／ FAX {branch.fax}
              </p>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">この内容で請求書を作成します</h3>
          {kosekiRequests.length > 1 && (
            <div className="mb-2">
              <label className={lab}>どの請求を出しますか</label>
              <select value={pick} onChange={e => setPick(Number(e.target.value))} className={sel}>
                {kosekiRequests.map((q, i) => (
                  <option key={q.id} value={i}>
                    {[q.request_to || '請求先未入力', q.target_person, q.doc_types].filter(Boolean).join('／')}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!k ? (
            <div className="px-3 py-6 text-center text-[12px] text-gray-400">出力する戸籍請求がありません</div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <ConfRow label="提出先市区町村" value={doc.municipality} />
              <ConfRow label="本籍・住所" value={doc.honseki} />
              <ConfRow label="筆頭主／世帯主" value={doc.hittousha} />
              <ConfRow label="請求に係る者" value={doc.targetName} />
              <ConfRow label="請求の種別" value={doc.requestTypes.join('・')} />
              <ConfRow label="使用目的" value={doc.purpose} />
              <ConfRow label="備考" value={doc.notes} />
              <ConfRow label="同封小為替" value={doc.kogawase == null ? '' : `¥${doc.kogawase.toLocaleString('ja-JP')}`} />
              <ConfRow label="拠点" value={agentOfficeLabel} />
              <ConfRow label="請求者欄" value={preset.requesterLabel} />
              <ConfRow label="代理人欄" value={preset.agentLabel ?? '（表示なし）'} last />
            </div>
          )}
          <p className="text-[12px] text-gray-500 mt-2">内容に問題なければ、Excelで出力ボタンを押下してください。</p>
        </section>
      </div>
    </Modal>
  )
}

/** 確認行。空欄は赤く「未入力」と出す。出したあとに気づくと紙を捨てることになるため。 */
function ConfRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const empty = !value.trim()
  return (
    <div className={`grid grid-cols-[9rem_minmax(0,1fr)] ${last ? '' : 'border-b border-gray-100'}`}>
      <div className="bg-gray-50/80 border-r border-gray-100 px-3 py-2 text-[12px] font-semibold text-gray-600">{label}</div>
      <div className={`px-3 py-2 text-[13px] break-words ${empty ? 'text-red-500' : 'text-gray-800'}`}>
        {empty ? '未入力' : value}
      </div>
    </div>
  )
}
