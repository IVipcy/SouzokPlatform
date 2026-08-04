'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Plus, Inbox, Building2, ArrowLeft, ChevronRight } from 'lucide-react'
import DocumentReceiptList from './DocumentReceiptList'
import NewDocumentReceiptModal, { type EditReceiptInfo } from './NewDocumentReceiptModal'
import PageHeader from '@/components/ui/PageHeader'
import HintTip from '@/components/ui/HintTip'
import { useCanOperateReceipts } from '@/components/providers/AuthProvider'
import { LOCATIONS } from '@/lib/constants'
import type { CaseDocumentRow, DocumentReceiptRow, MemberRow } from '@/types'

type CaseLite = { id: string; case_number: string; deal_name: string; status: string }

type Props = {
  documents: CaseDocumentRow[]   // 受領ファイルの参照に使用（case_document_id→ファイル）
  receipts: DocumentReceiptRow[]
  cases: CaseLite[]
  currentMemberId: string | null
  currentMember: MemberRow | null
  teams: { id: string; name: string }[]
  operableCaseIds?: string[]
}

export default function DocumentsClient({ documents, receipts, cases, currentMemberId, currentMember, teams, operableCaseIds }: Props) {
  const router = useRouter()
  const isManager = useCanOperateReceipts()  // 受信登録・受信確定は管理担当＋事務スタッフ(assistant)
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())
  const searchParams = useSearchParams()

  // case_document_id → 受領ファイル。受信簿の各到着物から開く/未添付判定に使う。
  const fileByDocId = useMemo(() => {
    const m: Record<string, { bucket: string; path: string; name: string | null }> = {}
    for (const d of documents) {
      if (d.received_file_path && d.received_file_bucket) m[d.id] = { bucket: d.received_file_bucket, path: d.received_file_path, name: d.received_file_name }
    }
    return m
  }, [documents])

  const [search, setSearch] = useState('')
  const [caseFilter, setCaseFilter] = useState<string>(searchParams.get('case') ?? '')
  const [location, setLocation] = useState<string | null>(null)  // 選んだ拠点。null=拠点選択トップ
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [editReceipt, setEditReceipt] = useState<EditReceiptInfo | null>(null)

  // アラート/通知の ?receipt= で来たら、その郵送物一式の「開封して再登録」モーダルを開く
  useEffect(() => {
    const rid = searchParams.get('receipt')
    if (!rid) return
    const r = receipts.find(x => x.id === rid)
    if (r) { setEditReceipt({ id: r.id, caseId: r.case_id, location: r.location ?? null }); setLocation(r.location ?? '__none__') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 拠点別の件数
  const locCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of receipts) { const k = r.location || '__none__'; m[k] = (m[k] ?? 0) + 1 }
    return m
  }, [receipts])

  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return receipts.filter(r => {
      if (location === '__none__') { if (r.location) return false }
      else if (location) { if (r.location !== location) return false }
      if (caseFilter && r.case_id !== caseFilter) return false
      if (q) {
        const items = r.items ?? []
        const hay = [r.cases?.case_number ?? '', r.cases?.deal_name ?? '', ...items.flatMap(it => [it.item_name, it.received_from ?? ''])].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [receipts, caseFilter, search, location])

  // 拠点選択トップ（拠点未選択・?receipt=無し）
  if (location === null && !editReceipt) {
    const tiles = [...LOCATIONS.map(l => ({ key: l, label: l })), ...(((locCounts['__none__'] ?? 0) > 0) ? [{ key: '__none__', label: '未分類' }] : [])]
    return (
      <div className="pb-8">
        <PageHeader eyebrow="Documents" title="到着物受信簿" icon={Inbox} description="拠点を選んでください。拠点ごとに到着物を管理します。" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
          {tiles.map(t => (
            <button key={t.key} type="button" onClick={() => setLocation(t.key)}
              className="flex items-center justify-between gap-3 px-5 py-5 rounded-xl border-2 border-brand-100 bg-brand-50/40 hover:bg-brand-50 active:bg-brand-100 transition text-left">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0"><Building2 className="w-5 h-5 text-white" /></div>
                <div><div className="text-[15px] font-bold text-gray-900">{t.label}</div><div className="text-[12px] text-gray-500">この拠点の受信簿</div></div>
              </div>
              <div className="flex items-center gap-1.5"><span className="text-[12px] font-bold text-brand-700 bg-white border border-brand-200 rounded-full px-2.5 py-0.5">{locCounts[t.key] ?? 0}</span><ChevronRight className="w-5 h-5 text-brand-400" /></div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const locLabel = location === '__none__' ? '未分類' : location
  const closeModal = () => { setReceiptModalOpen(false); setEditReceipt(null) }

  return (
    <div className="pb-8">
      <PageHeader
        eyebrow="Documents"
        title={`到着物受信簿${locLabel ? `｜${locLabel}` : ''}`}
        icon={Inbox}
        description={`この拠点の到着物（原本書類等）の受信を管理（${filteredReceipts.length} 件）`}
        right={
          <>
            <button onClick={() => setLocation(null)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
              <ArrowLeft className="w-3.5 h-3.5" />拠点を変える
            </button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="到着物名・案件で検索"
                className="pl-8 pr-3 py-1.5 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none w-56" />
            </div>
            {isManager && (
              <button onClick={() => setReceiptModalOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md shadow-sm">
                <Plus className="w-3.5 h-3.5" />新規作成
              </button>
            )}
          </>
        }
      />

      {!isManager && (
        <div className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-gray-500">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 font-semibold">
            {(operableCaseIds?.length ?? 0) > 0 ? '自分の案件は操作可' : '参照のみ'}
          </span>
          <HintTip text="新規の受信登録は管理担当・事務スタッフが行います。あなたが受注/管理担当の案件は、到着物の開封・中身の紐付け（郵送物一式の再登録）を操作できます。それ以外は閲覧のみです。" />
        </div>
      )}

      {/* 案件絞り込み */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <select value={caseFilter} onChange={e => setCaseFilter(e.target.value)}
          className="px-2.5 py-1 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 outline-none bg-white max-w-[280px]">
          <option value="">全案件 ({cases.length}件)</option>
          {cases.map(c => <option key={c.id} value={c.id}>{c.case_number} {c.deal_name}</option>)}
        </select>
        <span className="text-[12px] text-gray-400 ml-auto">表示中: {filteredReceipts.length} 件</span>
      </div>

      <DocumentReceiptList
        receipts={filteredReceipts}
        currentMemberId={currentMemberId}
        currentMember={currentMember}
        fileByDocId={fileByDocId}
        teams={teams}
        onChanged={refresh}
        operableCaseIds={operableCaseIds}
        onReRegister={r => setEditReceipt({ id: r.id, caseId: r.case_id, location: r.location ?? null })}
      />

      <NewDocumentReceiptModal
        isOpen={receiptModalOpen || !!editReceipt}
        onClose={closeModal}
        cases={cases}
        teams={teams}
        onSaved={refresh}
        defaultLocation={location && location !== '__none__' ? location : null}
        editReceipt={editReceipt}
      />
    </div>
  )
}
