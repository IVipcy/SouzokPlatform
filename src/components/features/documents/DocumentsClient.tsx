'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Plus, Inbox } from 'lucide-react'
import DocumentReceiptList from './DocumentReceiptList'
import NewDocumentReceiptModal from './NewDocumentReceiptModal'
import ParcelReceiptModal from './ParcelReceiptModal'
import PageHeader from '@/components/ui/PageHeader'
import HintTip from '@/components/ui/HintTip'
import { useCanOperateReceipts } from '@/components/providers/AuthProvider'
import { LOCATIONS } from '@/lib/constants'
import type { CaseDocumentRow, DocumentReceiptRow, MemberRow } from '@/types'

// 拠点フィルタの選択肢（全拠点＋各拠点＋未分類）
const LOC_TABS: Array<{ key: string; label: string }> = [
  { key: '', label: '全拠点' },
  ...LOCATIONS.map(l => ({ key: l, label: l })),
  { key: '__none__', label: '未分類' },
]

type CaseLite = { id: string; case_number: string; deal_name: string; status: string }

type Props = {
  documents: CaseDocumentRow[]   // 受領ファイルの参照に使用（case_document_id→ファイル）
  receipts: DocumentReceiptRow[]
  cases: CaseLite[]
  currentMemberId: string | null
  currentMember: MemberRow | null
  teams: { id: string; name: string }[]
}

export default function DocumentsClient({ documents, receipts, cases, currentMemberId, currentMember, teams }: Props) {
  const router = useRouter()
  const isManager = useCanOperateReceipts()  // 受信登録・受信確定は管理担当＋事務スタッフ(assistant)
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
  const [locationFilter, setLocationFilter] = useState<string>('')
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [parcelModalOpen, setParcelModalOpen] = useState(false)

  // 拠点別の件数（タブのバッジ用）
  const locCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of receipts) { const k = r.location || '__none__'; m[k] = (m[k] ?? 0) + 1 }
    return m
  }, [receipts])

  // ── 書類受信簿の絞り込み ──
  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return receipts.filter(r => {
      if (caseFilter && r.case_id !== caseFilter) return false
      if (locationFilter === '__none__') { if (r.location) return false }
      else if (locationFilter && r.location !== locationFilter) return false
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
  }, [receipts, caseFilter, search, locationFilter])

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
              <>
                <button
                  onClick={() => setParcelModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50 rounded-md shadow-sm"
                  title="受注/管理宛の郵送物を一式で受付け、到着連絡を飛ばす"
                >
                  <Plus className="w-3.5 h-3.5" />
                  郵送物一式で受付
                </button>
                <button
                  onClick={() => setReceiptModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新規作成
                </button>
              </>
            )}
          </>
        }
      />

      {/* 拠点タブ（受信簿を拠点別に管理） */}
      <div className="mb-3 flex items-center gap-1.5 flex-wrap">
        {LOC_TABS.map(t => {
          const on = locationFilter === t.key
          const cnt = t.key === '' ? receipts.length : (locCounts[t.key] ?? 0)
          return (
            <button
              key={t.key || 'all'}
              type="button"
              onClick={() => setLocationFilter(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}
            >
              {t.label}
              <span className={`inline-flex items-center justify-center min-w-[20px] px-1 h-5 rounded-full text-[11px] font-bold ${on ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'}`}>{cnt}</span>
            </button>
          )
        })}
      </div>

      {!isManager && (
        <div className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-gray-500">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 font-semibold">参照のみ</span>
          <HintTip text="到着物の受信の登録・受信確定（W-Check）・タスクとの結び付けは、管理担当だけが操作できます。閲覧は誰でもできます。" />
        </div>
      )}

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
        teams={teams}
        onChanged={refresh}
      />

      <NewDocumentReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        cases={cases}
        teams={teams}
        onSaved={refresh}
      />

      <ParcelReceiptModal
        isOpen={parcelModalOpen}
        onClose={() => setParcelModalOpen(false)}
        cases={cases}
        defaultLocation={locationFilter && locationFilter !== '__none__' ? locationFilter : null}
        onSaved={refresh}
      />
    </div>
  )
}
