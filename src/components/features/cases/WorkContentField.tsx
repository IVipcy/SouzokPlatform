'use client'

// 業務ごとのフリー作業内容（システム未定義の運用を吸収する余白）。
// オーダーシート・各実務タブで共有（caseData.work_content[gyomu]）。
// FreeWorkTab：専用タブが無い業務（手紙・執行通知 等）の実務タブ。作業内容＋進捗/結果のみ。

import { useState, useEffect } from 'react'
import type { CaseRow } from '@/types'
import TabHeader from './TabHeader'
import ProgressSummary from './ProgressSummary'

// セクション（gyomu）別の作業内容・関連情報の記入例プレースホルダー。
// キーは OrderSheet の gate(TabKey) または title（gate が無いセクション）。
export const WORK_CONTENT_PLACEHOLDERS: Record<string, string> = {
  '依頼者情報': '例）本人の性格・連絡の取りやすさ、同行者との関係、対応時の注意点 など',
  '受注内容': '例）提案の経緯、値引き・特約、依頼者の要望・懸念 など',
  deceased: '例）相続人◯名（長男・次男…）、関係は円満/対立、遠方・海外・連絡不通の有無、代襲/数次相続 など',
  assets: '例）金融資産の概算合計◯◯万円、ゆうちょ銀行：◯◯万円、みずほ銀行：◯◯万円。不動産の概要 など',
  '他事業者紹介': '例）紹介先の選定理由、依頼者からの指定、見込み報酬・紹介時期 など',
  division: '例）分割方針（法定/2次相続を踏まえて）、揉め事の兆候、代償・換価の希望 など',
  will: '例）遺言の種別・内容の希望、付言事項、遺言執行者 など',
  registration: '例）対象物件・登記の種別、管轄法務局、登録免許税の見込み など',
  cancellation: '例）解約対象の口座、凍結状況、必要書類・注意点 など',
  letter: '例）送付先・目的、文面の要点 など',
  execution: '例）通知先・時期、注意点 など',
  contractCreate: '例）作成する契約書の種類、特約・注意点 など',
}

export function workContentPlaceholder(gyomu: string): string | undefined {
  return WORK_CONTENT_PLACEHOLDERS[gyomu]
}

export function WorkContentField({ caseData, gyomu, patchCase, label = '作業内容（フリー）', placeholder, large }: {
  caseData: CaseRow
  gyomu: string
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  label?: string
  placeholder?: string
  large?: boolean
}) {
  const stored = (caseData.work_content ?? {})[gyomu] ?? ''
  const [val, setVal] = useState(stored)
  useEffect(() => { setVal(stored) }, [stored])

  const save = async () => {
    if (val === stored) return
    const next = { ...(caseData.work_content ?? {}) }
    if (val.trim()) next[gyomu] = val
    else delete next[gyomu]
    await patchCase({ work_content: Object.keys(next).length ? next : null })
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-slate-500">{label}</span>
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        rows={large ? 8 : 5}
        placeholder={placeholder ?? '作業内容や備考を自由に記載してください'}
        className={`w-full px-3 py-2.5 bg-blue-50/50 border border-blue-100 rounded-lg outline-none focus:bg-white focus:border-blue-300 placeholder:text-slate-400 ${large ? 'text-[14px] leading-relaxed' : 'text-[13px] leading-relaxed'}`}
      />
    </div>
  )
}

export default function FreeWorkTab({ caseData, gyomu, title, description, patchCase }: {
  caseData: CaseRow
  gyomu: string
  title: string
  description?: string
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
}) {
  return (
    <div className="space-y-3.5">
      <TabHeader title={title} description={description ?? 'この業務は作業内容＋進捗/結果で管理します（詳細な管理項目は今後追加予定）'} />
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3.5">
        <WorkContentField caseData={caseData} gyomu={gyomu} patchCase={patchCase} label="作業内容（オーダーシートと共有）" large />
      </div>
      <ProgressSummary caseId={caseData.id} scopeKey={`work_${gyomu}`} title={`進捗/結果（${title}）`} />
    </div>
  )
}
