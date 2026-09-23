// タスク一覧（サーバー側）用：着手前の請求タスクについて「原本待ち」を計算する。
// 対象の案件だけ原本管理の材料を読み、buildOriginalStock → originalsGate。

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildOriginalStock, type StockReceiptItem, type StockFinRequest, type StockRow, type OwnQtyContext } from '@/lib/originals'
import { gateKindOfRid, originalsWaitForTasks, type OriginalsGate } from '@/lib/originalsGate'
import type { TaskRow, ContractDocumentRow, RequestEnclosureRow, OriginalDocOverrideRow } from '@/types'

export type OriginalsWaitByTask = Record<string, { missing: string[]; note: string }>

export async function loadOriginalsWaitByTask(supabase: SupabaseClient, tasks: TaskRow[]): Promise<OriginalsWaitByTask> {
  const targets = tasks.filter(t => (t.status === '着手前' || t.status === '未着手') && gateKindOfRid(t.source_rid))
  const caseIds = [...new Set(targets.map(t => t.case_id))]
  if (caseIds.length === 0) return {}

  const [cd, rc, en, ov, fr, fi, cs, kr, ra] = await Promise.all([
    supabase.from('contract_documents').select('*').in('case_id', caseIds),
    supabase.from('document_receipts').select('id, case_id, received_date, is_parcel, items:document_receipt_items(id, item_name, quantity, received_from, return_enclosure_id, return_fin_request_id)').in('case_id', caseIds),
    supabase.from('request_enclosures').select('*').in('case_id', caseIds),
    supabase.from('original_doc_overrides').select('*').in('case_id', caseIds),
    supabase.from('financial_requests').select('id, case_id, institution_id, request_date, seal_original_sent, seal_original_returned_date').in('case_id', caseIds),
    supabase.from('financial_institutions').select('id, case_id, name').in('case_id', caseIds),
    supabase.from('cases').select('id, deceased_name, seal_cert_copies').in('id', caseIds),
    supabase.from('koseki_requests').select('id, case_id, acquisition_authority').in('case_id', caseIds),
    // 不動産の請求：re-muni:{市区町村} のタスクを、その市区町村の請求（同梱の ref_id）に解くのに使う
    supabase.from('real_estate_acquisitions').select('id, case_id, target_municipality').in('case_id', caseIds),
  ])

  const by = <T extends { case_id: string }>(rows: T[] | null | undefined) => {
    const m: Record<string, T[]> = {}
    for (const r of rows ?? []) (m[r.case_id] ??= []).push(r)
    return m
  }
  const cdBy = by((cd.data ?? []) as ContractDocumentRow[])
  const enBy = by((en.data ?? []) as RequestEnclosureRow[])
  const ovBy = by((ov.data ?? []) as OriginalDocOverrideRow[])
  const frBy = by((fr.data ?? []) as Array<StockFinRequest & { case_id: string }>)
  const fiBy = by((fi.data ?? []) as Array<{ id: string; case_id: string; name: string }>)
  const rcRows = (rc.data ?? []) as Array<{ id: string; case_id: string; received_date: string | null; is_parcel: boolean | null; items: Array<{ id: string; item_name: string; quantity: number | null; received_from: string | null; return_enclosure_id: string | null; return_fin_request_id: string | null }> | null }>
  const itemsBy: Record<string, StockReceiptItem[]> = {}
  for (const r of rcRows) for (const it of r.items ?? []) (itemsBy[r.case_id] ??= []).push({ ...it, received_date: r.received_date, is_parcel: r.is_parcel })
  const caseRows = (cs.data ?? []) as Array<{ id: string; deceased_name: string | null; seal_cert_copies: number | null }>
  const krBy = by((kr.data ?? []) as Array<{ id: string; case_id: string; acquisition_authority: string | null }>)
  const raBy = by((ra.data ?? []) as Array<{ id: string; case_id: string; target_municipality: string | null }>)

  const stockByCase: Record<string, StockRow[]> = {}
  const ctxByCase: Record<string, { deceasedName: string | null; kosekiAuthority?: Record<string, string | null>; enclosures?: RequestEnclosureRow[]; ownQtyCtx?: OwnQtyContext }> = {}
  for (const c of caseRows) {
    stockByCase[c.id] = buildOriginalStock({
      contractDocs: cdBy[c.id] ?? [], receiptItems: itemsBy[c.id] ?? [], enclosures: enBy[c.id] ?? [], overrides: ovBy[c.id] ?? [],
      finRequests: frBy[c.id] ?? [], institutions: fiBy[c.id] ?? [], sealCopies: c.seal_cert_copies,
    })
    ctxByCase[c.id] = {
      deceasedName: c.deceased_name,
      kosekiAuthority: Object.fromEntries((krBy[c.id] ?? []).map(k => [k.id, k.acquisition_authority])),
      // 自分の請求が同梱している分は「手元にある」と数える（自分自身を原本待ちで止めない）
      enclosures: enBy[c.id] ?? [],
      ownQtyCtx: { acquisitions: raBy[c.id] ?? [], finRequests: frBy[c.id] ?? [], institutions: fiBy[c.id] ?? [] },
    }
  }
  const gates = originalsWaitForTasks(targets, stockByCase, ctxByCase)
  const out: OriginalsWaitByTask = {}
  for (const [id, g] of Object.entries(gates) as Array<[string, OriginalsGate]>) {
    out[id] = { missing: g.missing.map(m => m.name), note: g.missing.map(m => `${m.name} 手元0${m.outs.length ? `（${m.outs.join('・')}に出払い中）` : ''}`).join('・') }
  }
  return out
}
