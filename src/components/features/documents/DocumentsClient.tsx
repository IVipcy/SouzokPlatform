'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Plus, Inbox, LayoutList, ListChecks } from 'lucide-react'
import DocumentReceiptList from './DocumentReceiptList'
import ReceiptQueue from './ReceiptQueue'
import NewDocumentReceiptModal from './NewDocumentReceiptModal'
import PageHeader from '@/components/ui/PageHeader'
import { useIsManager } from '@/components/providers/AuthProvider'
import type { CaseDocumentRow, DocumentReceiptRow, MemberRow } from '@/types'

type CaseLite = { id: string; case_number: string; deal_name: string; status: string }

type Props = {
  documents: CaseDocumentRow[]   // 受領ファイルの参照に使用（case_document_id→ファイル）
  receipts: DocumentReceiptRow[]
  cases: CaseLite[]
  currentMemberId: string | null
  currentMember: MemberRow | null
}

export default function DocumentsClient({ documents, receipts, cases, currentMemberId, currentMember }: Props) {
  const router = useRouter()
  const isManager = useIsManager()  // 受信登録・受信確定は管理担当のみ
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())
  // case_document_id → 受領ファイル。受信簿の各到着物から開く/未添付判定に使う。
  const fileByDocId = useMemo(() => {
    const m: Record<string, { bucket: string; path: string; name: string | null }> = {}
    for (const d of documents) {
      if (d.received_file_path && d.received_file_bucket) m[d.id] = { bucket: d.received_file_bucket, path: d.received_file_path, name: d.received_file_name }
    }
    return m
  }, [documents])

  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [caseFilter, setCaseFilter] = useState<string>(searchParams.get('case') ?? '')
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [view, setView] = useState<'queue' | 'list'>('queue')

  // ── 書類受信簿の絞り込み ──
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

  return (
    <div className="pb-8">
      <PageHeader
        eyebrow="Documents"
        title="到着物受信簿"
        icon={Inbox}
        description={`案件に届く到着物（原本書類等）の受信を管理（全 ${receipts.length} 件）`}
        right={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="到着物名・案件で検索"
                className="pl-8 pr-3 py-1.5 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none w-64"
              />
            </div>
            {isManager && (
              <button
                onClick={() => setReceiptModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                新規作成
              </button>
            )}
          </>
        }
      />

      {!isManager && (
        <div className="mb-3 text-[12px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
          到着物の受信登録・受信確定（W-Check）・タスク紐づけは<strong className="font-semibold">管理担当のみ</strong>が操作できます（閲覧は可能）。
        </div>
      )}

      {/* 表示切替：処理キュー / 受信簿一覧 */}
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={() => setView('queue')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] rounded-md border ${view === 'queue' ? 'bg-brand-50 text-brand-700 border-brand-300 font-semibold' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}><ListChecks className="w-3.5 h-3.5" />処理キュー</button>
        <button type="button" onClick={() => setView('list')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] rounded-md border ${view === 'list' ? 'bg-brand-50 text-brand-700 border-brand-300 font-semibold' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}><LayoutList className="w-3.5 h-3.5" />受信簿一覧</button>
      </div>

      {view === 'queue' ? (
        <ReceiptQueue receipts={receipts} onJumpToCase={cid => { setCaseFilter(cid); setView('list') }} onChanged={refresh} />
      ) : (
      <>
      {/* 案件絞り込み */}
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
          表示中: {filteredReceipts.length} 件 / 全 {receipts.length} 件
        </span>
      </div>

      <DocumentReceiptList
        receipts={filteredReceipts}
        currentMemberId={currentMemberId}
        currentMember={currentMember}
        fileByDocId={fileByDocId}
        onChanged={refresh}
      />
      </>
      )}

      <NewDocumentReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        cases={cases}
        onSaved={refresh}
      />
    </div>
  )
}
