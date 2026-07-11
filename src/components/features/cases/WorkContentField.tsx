'use client'

// 業務ごとのフリー作業内容（システム未定義の運用を吸収する余白）。
// オーダーシート・各実務タブで共有（caseData.work_content[gyomu]）。
// FreeWorkTab：専用タブが無い業務（手紙・執行通知 等）の実務タブ。作業内容＋進捗/結果のみ。

import { useState, useEffect } from 'react'
import type { CaseRow } from '@/types'
import TabHeader from './TabHeader'
import ProgressSummary from './ProgressSummary'

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
