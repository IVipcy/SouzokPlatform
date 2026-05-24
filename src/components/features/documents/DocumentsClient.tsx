'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, FileText, Plus, Inbox } from 'lucide-react'
import DocumentManagementList from './DocumentManagementList'
import DocumentReceiptList from './DocumentReceiptList'
import NewCaseDocumentModal from './NewCaseDocumentModal'
import NewDocumentReceiptModal from './NewDocumentReceiptModal'
import PageHeader from '@/components/ui/PageHeader'
import type { CaseDocumentRow, DocumentReceiptRow, MemberRow } from '@/types'

type CaseLite = { id: string; case_number: string; deal_name: string; status: string }

type TabKey = 'receipts' | 'docs'

type Props = {
  documents: CaseDocumentRow[]
  receipts: DocumentReceiptRow[]
  cases: CaseLite[]
  currentMemberId: string | null
  currentMember: MemberRow | null
}

export default function DocumentsClient({ documents, receipts, cases, currentMemberId, currentMember }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [tab, setTab] = useState<TabKey>('receipts')
  const [search, setSearch] = useState('')
  const [caseFilter, setCaseFilter] = useState<string>('')
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)

  const caseLookup = useMemo(() => {
    const m = new Map<string, CaseLite>()
    for (const c of cases) m.set(c.id, c)
    return m
  }, [cases])

  // ── ドキュメント管理タブ用の絞り込み ──
  const filteredDocuments = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documents.filter(d => {
      if (caseFilter && d.case_id !== caseFilter) return false
      if (q) {
        const ci = caseLookup.get(d.case_id)
        const hay = [d.document_name, ci?.case_number ?? '', ci?.deal_name ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [documents, caseFilter, search, caseLookup])

  // ── 書類受信簿タブ用の絞り込み ──
  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return receipts.filter(r => {
      if (caseFilter && r.case_id !== caseFilter) return false
      if (q) {
        const items = r.items ?? []
        const hay = [
          r.cases?.case_number ?? '',
          r.cases?.deal_name ?? '',
          ...items.flatMap(it => [it.item_name, it.received_from ?? '']),
        ].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [receipts, caseFilter, search])

  const totalCases = useMemo(() => new Set(documents.map(d => d.case_id)).size, [documents])

  return (
    <div className="pb-8">
      <PageHeader
        eyebrow="Documents"
        title="ドキュメント"
        icon={FileText}
        description={`受信簿 ${receipts.length} 件・ドキュメント管理 ${documents.length} 件（${totalCases} 案件）`}
        right={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="書類名・案件で検索"
                className="pl-8 pr-3 py-1.5 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none w-64"
              />
            </div>
            <button
              onClick={() => tab === 'receipts' ? setReceiptModalOpen(true) : setDocModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              新規作成
            </button>
          </>
        }
      />

      {/* タブ切替 */}
      <div className="mb-3 inline-flex bg-gray-100 rounded-lg p-0.5">
        <TabButton
          active={tab === 'receipts'}
          onClick={() => setTab('receipts')}
          icon={<Inbox className="w-3.5 h-3.5" />}
          label="書類受信簿"
          count={receipts.length}
        />
        <TabButton
          active={tab === 'docs'}
          onClick={() => setTab('docs')}
          icon={<FileText className="w-3.5 h-3.5" />}
          label="ドキュメント管理"
          count={documents.length}
        />
      </div>

      {/* 共通: 案件絞り込み */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <select
          value={caseFilter}
          onChange={e => setCaseFilter(e.target.value)}
          className="px-2.5 py-1 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 outline-none bg-white max-w-[280px]"
        >
          <option value="">全案件 ({cases.length}件)</option>
          {cases.map(c => (
            <option key={c.id} value={c.id}>
              {c.case_number} {c.deal_name}
            </option>
          ))}
        </select>

        <span className="text-[12px] text-gray-400 ml-auto">
          {tab === 'receipts'
            ? `表示中: ${filteredReceipts.length} 件 / 全 ${receipts.length} 件`
            : `表示中: ${filteredDocuments.length} 件 / 全 ${documents.length} 件`}
        </span>
      </div>

      {/* タブごとのビュー */}
      {tab === 'receipts' ? (
        <DocumentReceiptList
          receipts={filteredReceipts}
          currentMemberId={currentMemberId}
          currentMember={currentMember}
          onChanged={refresh}
        />
      ) : (
        <DocumentManagementList rows={filteredDocuments} caseLookup={caseLookup} />
      )}

      <NewCaseDocumentModal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        cases={cases}
        onSaved={refresh}
      />
      <NewDocumentReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        cases={cases}
        onSaved={refresh}
      />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold rounded-md transition-all ${
        active
          ? 'bg-white text-brand-700 shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${active ? 'bg-brand-50 text-brand-700' : 'bg-gray-200 text-gray-600'}`}>
        {count}
      </span>
    </button>
  )
}
