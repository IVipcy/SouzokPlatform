'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, FileText, Plus, AlertTriangle,
  Mail, MailOpen, FileCheck, StickyNote,
} from 'lucide-react'
import FlatDocumentsTable from '@/components/features/documents/FlatDocumentsTable'
import NewCaseDocumentModal from '@/components/features/documents/NewCaseDocumentModal'
import PageHeader from '@/components/ui/PageHeader'
import type { CaseDocumentRow } from '@/types'

type CaseLite = {
  id: string
  case_number: string
  deal_name: string
  status: string
}

type StatusFilter = 'all' | 'memo' | 'sent' | 'waiting' | 'received' | 'completed'

type Props = {
  documents: CaseDocumentRow[]
  cases: CaseLite[]
}

function statusOf(r: CaseDocumentRow): Exclude<StatusFilter, 'all'> {
  const hasSent = !!r.sent_date
  const hasReceived = !!r.received_date
  if (hasSent && hasReceived) return 'completed'
  if (hasSent && !hasReceived) return 'waiting'
  if (!hasSent && hasReceived) return 'received'
  return 'memo'
}

export default function DocumentsClient({ documents, cases }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [caseFilter, setCaseFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)

  const refresh = () => startTransition(() => router.refresh())

  // 案件 lookup
  const caseLookup = useMemo(() => {
    const m = new Map<string, CaseLite>()
    for (const c of cases) m.set(c.id, c)
    return m
  }, [cases])

  // 状態別カウント
  const counts = useMemo(() => {
    const c: Record<Exclude<StatusFilter, 'all'>, number> = { memo: 0, sent: 0, waiting: 0, received: 0, completed: 0 }
    for (const d of documents) c[statusOf(d)]++
    return c
  }, [documents])

  // 絞り込み済みデータ
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documents.filter(d => {
      if (caseFilter && d.case_id !== caseFilter) return false
      if (statusFilter !== 'all' && statusOf(d) !== statusFilter) return false
      if (q) {
        const ci = caseLookup.get(d.case_id)
        const hay = [
          d.document_name,
          d.sent_to ?? '',
          ci?.case_number ?? '',
          ci?.deal_name ?? '',
        ].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [documents, caseFilter, statusFilter, search, caseLookup])

  const totalCases = useMemo(() => {
    return new Set(documents.map(d => d.case_id)).size
  }, [documents])

  return (
    <div className="pb-8">
      <PageHeader
        eyebrow="Documents"
        title="ドキュメント"
        icon={FileText}
        description={`全 ${totalCases} 案件・${documents.length} 件の書類（発送・受領・メモ）`}
        right={
          <>
            {counts.waiting > 0 && (
              <button
                onClick={() => setStatusFilter('waiting')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                返送待ち {counts.waiting} 件
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="書類名・案件・発送先で検索"
                className="pl-8 pr-3 py-1.5 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none w-64"
              />
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              新規書類を記録
            </button>
          </>
        }
      />

      {/* フィルタバー */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        {/* 状態フィルタチップ */}
        <div className="flex items-center gap-1 flex-wrap text-[12px]">
          <Chip label="全て" count={documents.length} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          <Chip label="メモ"     count={counts.memo}      active={statusFilter === 'memo'}      onClick={() => setStatusFilter('memo')}      icon={StickyNote} />
          <Chip label="発送のみ" count={counts.sent}      active={statusFilter === 'sent'}      onClick={() => setStatusFilter('sent')}      icon={Mail} />
          <Chip label="返送待ち" count={counts.waiting}   active={statusFilter === 'waiting'}   onClick={() => setStatusFilter('waiting')}   icon={Mail}      tone="amber" />
          <Chip label="受領のみ" count={counts.received}  active={statusFilter === 'received'}  onClick={() => setStatusFilter('received')}  icon={MailOpen} />
          <Chip label="完了"     count={counts.completed} active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} icon={FileCheck} tone="green" />
        </div>

        <div className="h-5 w-px bg-gray-200" />

        {/* 案件絞り込みドロップダウン */}
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
          表示中: {filtered.length} 件 / 全 {documents.length} 件
        </span>
      </div>

      <FlatDocumentsTable rows={filtered} caseLookup={caseLookup} />

      <NewCaseDocumentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        cases={cases}
        onSaved={refresh}
      />
    </div>
  )
}

// ─────────────────────────────────────
// フィルタチップ
// ─────────────────────────────────────
function Chip({
  label, count, active, onClick, icon: Icon, tone = 'brand',
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  icon?: typeof Mail
  tone?: 'brand' | 'amber' | 'green'
}) {
  const activeCls =
    tone === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-300'
    : tone === 'green' ? 'bg-green-100 text-green-800 border-green-300'
    : 'bg-brand-100 text-brand-800 border-brand-300'
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition ${
        active ? activeCls : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
      }`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      <span>{label}</span>
      <span className="font-mono font-semibold">{count}</span>
    </button>
  )
}
