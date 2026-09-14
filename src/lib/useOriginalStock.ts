'use client'

// 案件の「原本の出入り」を読むフック。請求カードの同梱（手元の原本から選ぶ）と、到着物タブの表で共用。
// 契約時受領書類・受信簿の到着物・同梱・手直し・金融の請求（印鑑証明）をまとめて読み、buildOriginalStock で行にする。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildOriginalStock, type StockReceiptItem, type StockFinRequest } from '@/lib/originals'
import type { ContractDocumentRow, RequestEnclosureRow, OriginalDocOverrideRow } from '@/types'

export function useOriginalStock(caseId: string | null | undefined, enabled = true) {
  const supabase = createClient()
  const [contractDocs, setContractDocs] = useState<ContractDocumentRow[]>([])
  const [receiptItems, setReceiptItems] = useState<StockReceiptItem[]>([])
  const [enclosures, setEnclosures] = useState<RequestEnclosureRow[]>([])
  const [overrides, setOverrides] = useState<OriginalDocOverrideRow[]>([])
  const [finRequests, setFinRequests] = useState<StockFinRequest[]>([])
  const [institutions, setInstitutions] = useState<Array<{ id: string; name: string }>>([])
  const [sealCopies, setSealCopies] = useState<number | null>(null)
  // 最初の描画から「読み込み中」にする（空のまま一瞬「原本なし」と判定されないように）
  const [loading, setLoading] = useState(!!caseId && enabled)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    if (!caseId || !enabled) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const [cd, rc, en, ov, fr, fi, cs] = await Promise.all([
        supabase.from('contract_documents').select('*').eq('case_id', caseId).order('sort_order').order('created_at'),
        supabase.from('document_receipts').select('id, received_date, is_parcel, items:document_receipt_items(id, item_name, quantity, received_from, return_enclosure_id, return_fin_request_id)').eq('case_id', caseId).order('received_date'),
        supabase.from('request_enclosures').select('*').eq('case_id', caseId).order('sort_order').order('created_at'),
        supabase.from('original_doc_overrides').select('*').eq('case_id', caseId).order('created_at'),
        supabase.from('financial_requests').select('id, institution_id, request_date, seal_original_sent, seal_original_returned_date').eq('case_id', caseId),
        supabase.from('financial_institutions').select('id, name').eq('case_id', caseId),
        supabase.from('cases').select('seal_cert_copies').eq('id', caseId).maybeSingle(),
      ])
      if (!alive) return
      setContractDocs((cd.data ?? []) as ContractDocumentRow[])
      const items: StockReceiptItem[] = []
      for (const r of (rc.data ?? []) as Array<{ id: string; received_date: string | null; is_parcel: boolean | null; items: Array<{ id: string; item_name: string; quantity: number | null; received_from: string | null; return_enclosure_id: string | null; return_fin_request_id: string | null }> | null }>) {
        for (const it of r.items ?? []) items.push({ ...it, received_date: r.received_date, is_parcel: r.is_parcel })
      }
      setReceiptItems(items)
      setEnclosures((en.data ?? []) as RequestEnclosureRow[])
      setOverrides((ov.data ?? []) as OriginalDocOverrideRow[])
      setFinRequests((fr.data ?? []) as StockFinRequest[])
      setInstitutions((fi.data ?? []) as Array<{ id: string; name: string }>)
      setSealCopies(((cs.data as { seal_cert_copies?: number | null } | null)?.seal_cert_copies) ?? null)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [caseId, enabled, tick, supabase])

  const stock = useMemo(
    () => buildOriginalStock({ contractDocs, receiptItems, enclosures, overrides, finRequests, institutions, sealCopies }),
    [contractDocs, receiptItems, enclosures, overrides, finRequests, institutions, sealCopies],
  )
  return { stock, enclosures, overrides, finRequests, institutions, loading, reload }
}

export type OriginalStock = ReturnType<typeof useOriginalStock>
