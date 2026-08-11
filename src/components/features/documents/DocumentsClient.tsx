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

// レンダー中に new Date() を直接書くと React コンパイラに止められるので関数に包む
const todayYmd = () => new Date().toLocaleDateString('sv-SE')
/** 'YYYY-MM-DD' を n 日ずらす */
const shiftDay = (ymd: string, n: number) => {
  const d = new Date(ymd + 'T00:00:00')
  if (isNaN(d.getTime())) return ymd
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('sv-SE')
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
  // 到着日で絞る。既定は本日（開いてすぐ「今日届いた分」が出る）。空＝すべての日。
  // 案件での絞り込みは廃止（受信簿は「その日に何が届いたか」を見る台帳で、案件で見るなら案件詳細から入る）。
  const [dateFilter, setDateFilter] = useState<string>(() => todayYmd())
  const [location, setLocation] = useState<string | null>(null)  // 選んだ拠点。null=拠点選択トップ
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)
  const [editReceipt, setEditReceipt] = useState<EditReceiptInfo | null>(null)

  // アラート(?receipt=)/通知(?parcelCase=) で来たら、郵送物一式の「開封して再登録」モーダルを開く。
  //   receipt= はレコードIDで一意。parcelCase= は案件IDなので、その案件の未開封一式（最新）を探す。
  useEffect(() => {
    const rid = searchParams.get('receipt')
    const pcase = searchParams.get('parcelCase')
    let r: DocumentReceiptRow | undefined
    if (rid) r = receipts.find(x => x.id === rid)
    else if (pcase) r = receipts.find(x => x.case_id === pcase && x.is_parcel && !x.opened_at)
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
      if (dateFilter && (r.received_date ?? '') !== dateFilter) return false
      if (q) {
        const items = r.items ?? []
        const hay = [r.cases?.case_number ?? '', r.cases?.deal_name ?? '', ...items.flatMap(it => [it.item_name, it.received_from ?? ''])].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [receipts, dateFilter, search, location])

  // 拠点選択トップ（拠点未選択・?receipt=無し）
  if (location === null && !editReceipt) {
    const tiles = [...LOCATIONS.map(l => ({ key: l, label: l })), ...(((locCounts['__none__'] ?? 0) > 0) ? [{ key: '__none__', label: '未分類' }] : [])]
    return (
      <div className="pb-8">
        <PageHeader eyebrow="Documents" title="到着物受信簿" icon={Inbox} description="拠点を選んでください。拠点ごとに到着物を管理します。" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl">
          {tiles.map(t => (
            <button key={t.key} type="button" onClick={() => setLocation(t.key)}
              className="flex items-center justify-between gap-3 px-5 py-5 rounded-xl border-2 border-brand-100 bg-brand-50/40 hover:bg-brand-50 active:bg-brand-100 transition text-left">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0"><Building2 className="w-5 h-5 text-white" /></div>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-gray-900 whitespace-nowrap truncate">{t.label}</div>
                  <div className="text-[12px] text-gray-500 whitespace-nowrap">この拠点の受信簿</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0"><span className="text-[12px] font-bold text-brand-700 bg-white border border-brand-200 rounded-full px-2.5 py-0.5">{locCounts[t.key] ?? 0}</span><ChevronRight className="w-5 h-5 text-brand-400" /></div>
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

      {/* 到着日で絞る。‹ › で前後の日へ動かせる。空欄＝すべての日。 */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-semibold text-gray-500">到着日</span>
        <button type="button" onClick={() => setDateFilter(d => shiftDay(d || todayYmd(), -1))}
          title="前の日" className="px-2 py-1 text-[13px] text-gray-500 border border-gray-300 rounded-md hover:bg-gray-50">‹</button>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="px-2.5 py-1 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 outline-none bg-white" />
        <button type="button" onClick={() => setDateFilter(d => shiftDay(d || todayYmd(), 1))}
          title="次の日" className="px-2 py-1 text-[13px] text-gray-500 border border-gray-300 rounded-md hover:bg-gray-50">›</button>
        <button type="button" onClick={() => setDateFilter(todayYmd())}
          className="px-2.5 py-1 text-[12px] font-semibold text-brand-700 border border-brand-300 rounded-md hover:bg-brand-50">本日</button>
        {dateFilter && (
          <button type="button" onClick={() => setDateFilter('')}
            className="px-2.5 py-1 text-[12px] font-semibold text-gray-500 border border-gray-300 rounded-md hover:bg-gray-50">すべての日</button>
        )}
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
        singleDay={!!dateFilter}
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
