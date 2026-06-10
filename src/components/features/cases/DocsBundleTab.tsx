'use client'

import { useState } from 'react'
import DocsTab from './DocsTab'
import DocumentCreateTab from './DocumentCreateTab'
import type { CaseRow, CaseDocumentRow, TaskRow, HeirRow, RealEstatePropertyRow } from '@/types'

type Props = {
  caseData: CaseRow
  documents: CaseDocumentRow[]
  tasks: TaskRow[]
  heirs: HeirRow[]
  properties: RealEstatePropertyRow[]
}

/** 書類タブ（受信簿／作成 を内部サブタブで束ねる） */
export default function DocsBundleTab({ caseData, documents, tasks, heirs, properties }: Props) {
  const [sub, setSub] = useState<'inbox' | 'create'>('inbox')

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-gray-200 mb-3">
        <SubTab active={sub === 'inbox'} onClick={() => setSub('inbox')} label="受信簿" count={documents.length} />
        <SubTab active={sub === 'create'} onClick={() => setSub('create')} label="作成" />
      </div>

      {sub === 'inbox'
        ? <DocsTab caseData={caseData} documents={documents} />
        : <DocumentCreateTab caseData={caseData} tasks={tasks} heirs={heirs} properties={properties} />}
    </div>
  )
}

function SubTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {label}
      {count !== undefined && <span className={`text-[12px] font-mono ${active ? 'opacity-80' : 'opacity-50'}`}>{count}</span>}
    </button>
  )
}
