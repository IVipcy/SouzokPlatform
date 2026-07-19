import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isMinimalMode } from '@/lib/featureMode'
import ConfirmClient, { type ConfirmItem } from '@/components/features/confirm/ConfirmClient'

// 確認簿：全案件横断で「発送✓・着✓・確定・承認・凍結確認」の未処理を集める。
// 実体は各業務レコード（新テーブルは作らない）。ここではビューとして未処理だけ抽出する。

type CaseLite = { id: string; case_number: string; deal_name: string; status: string }

// 実務のチェックが発生する状態の案件だけ対象にする。
const ACTIVE = new Set(['対応中', '受注', '戻り受注'])

const yen = (n: number | null | undefined) => (n == null ? null : `¥${Math.round(n).toLocaleString('ja-JP')}`)

export default async function ConfirmPage() {
  if (isMinimalMode()) redirect('/my')
  const supabase = await createClient()

  const { data: casesRaw } = await supabase.from('cases').select('id,case_number,deal_name,status').order('case_number')
  const activeCases = ((casesRaw ?? []) as CaseLite[]).filter(c => ACTIVE.has(c.status))
  const caseIds = activeCases.map(c => c.id)
  const caseMap = new Map(activeCases.map(c => [c.id, c]))

  if (caseIds.length === 0) {
    return <ConfirmClient items={[]} properties={[]} />
  }

  const [{ data: kosekiRaw }, { data: acqRaw }, { data: propRaw }, { data: finRaw }, { data: memRaw }] = await Promise.all([
    supabase.from('koseki_requests').select('*').in('case_id', caseIds),
    supabase.from('real_estate_acquisitions').select('*').in('case_id', caseIds),
    supabase.from('real_estate_properties').select('*').in('case_id', caseIds),
    supabase.from('financial_assets').select('*').in('case_id', caseIds),
    supabase.from('members').select('id,name'),
  ])

  const memberName = new Map(((memRaw ?? []) as { id: string; name: string }[]).map(m => [m.id, m.name]))
  const nameOf = (id: string | null | undefined) => (id ? (memberName.get(id) ?? null) : null)
  const stampOf = (r: Record<string, unknown>) => (r.updated_at as string | null) ?? (r.created_at as string | null) ?? null

  const items: ConfirmItem[] = []
  const base = (r: { id: string; case_id: string }, gyomu: ConfirmItem['gyomu']): Pick<ConfirmItem, 'rowId' | 'caseId' | 'caseName' | 'caseNumber' | 'gyomu' | 'stamp'> => {
    const c = caseMap.get(r.case_id)
    return { rowId: r.id, caseId: r.case_id, caseName: c?.deal_name ?? '', caseNumber: c?.case_number ?? '', gyomu, stamp: stampOf(r as Record<string, unknown>) }
  }

  // ── 戸籍 ──
  for (const r of (kosekiRaw ?? []) as Record<string, unknown>[]) {
    const id = r.id as string, caseId = r.case_id as string
    if (!caseMap.has(caseId)) continue
    const b = base({ id, case_id: caseId }, '戸籍')
    const person = ((r.target_person as string) ?? '').trim()
    const requestTo = ((r.request_to as string) ?? '').trim()
    const isAdd = !!r.is_additional, approved = !!r.additional_approved_at
    const isClient = (r.acquirer as string) === '依頼者'
    const fee = yen((r.cost_budget as number) ?? (r.cost_confirmed as number))
    // 追加・未承認 → 承認タブ
    if (isAdd && !approved) {
      items.push({ ...b, key: `ka-${id}`, tab: 'approve', action: 'koseki_approve', target: requestTo || '追加戸籍', content: `${person || '対象未定'}／${(r.additional_reason as string) || '理由未記入'}`, amount: null, workerId: null, workerName: null, reviewer: 'manager', meta: { acquirer: r.acquirer as string, request_to: requestTo, target_person: person } })
      continue
    }
    if (isClient) continue // 依頼者取得は自社のW-checkなし
    // 発送✓待ち：請求先が入っていて未チェック
    if (requestTo && !r.request_check_at) {
      items.push({ ...b, key: `ks-${id}`, tab: 'request', action: 'koseki_send', target: requestTo, content: `${person || '対象未定'}の戸籍`, amount: fee, workerId: (r.request_done_by as string) ?? null, workerName: nameOf(r.request_done_by as string), reviewer: 'jimu' })
    }
    // 着✓待ち：到着日ありで未チェック
    if (r.arrival_date && !r.receipt_check_at) {
      items.push({ ...b, key: `kr-${id}`, tab: 'request', action: 'koseki_recv', target: requestTo || '請求先未設定', content: `${person || '対象未定'}の戸籍`, amount: fee, workerId: (r.receipt_done_by as string) ?? null, workerName: nameOf(r.receipt_done_by as string), reviewer: 'jimu' })
    }
  }

  // ── 不動産・取得資料 ──
  for (const r of (acqRaw ?? []) as Record<string, unknown>[]) {
    const id = r.id as string, caseId = r.case_id as string
    if (!caseMap.has(caseId)) continue
    const itemType = ((r.item_type as string) ?? '').trim()
    if (itemType === '路線価') continue // 参照は請求なし
    const b = base({ id, case_id: caseId }, '不動産')
    const requestTo = ((r.request_to as string) ?? '').trim()
    const muni = ((r.target_municipality as string) ?? '').trim()
    const isAdd = !!r.is_additional, approved = !!r.additional_approved_at
    const fee = yen(r.cost_confirmed as number)
    if (isAdd && !approved) {
      items.push({ ...b, key: `aa-${id}`, tab: 'approve', action: 're_acq_approve', target: requestTo || muni || '追加取得資料', content: itemType || '取得資料', amount: null, workerId: null, workerName: null, reviewer: 'manager', meta: { item_type: itemType, target_municipality: muni, target_property_id: (r.target_property_id as string) ?? null } })
      continue
    }
    if (requestTo && !r.request_check_at) {
      items.push({ ...b, key: `as-${id}`, tab: 'request', action: 're_send', target: requestTo, content: itemType || '取得資料', amount: fee, workerId: (r.request_done_by as string) ?? null, workerName: nameOf(r.request_done_by as string), reviewer: 'jimu' })
    }
    if (r.arrival_date && !r.receipt_check_at) {
      items.push({ ...b, key: `ar-${id}`, tab: 'request', action: 're_recv', target: requestTo || '請求先未設定', content: itemType || '取得資料', amount: fee, workerId: (r.receipt_done_by as string) ?? null, workerName: nameOf(r.receipt_done_by as string), reviewer: 'jimu' })
    }
  }

  // ── 不動産・物件（評価額の確定／市区町村追加の承認） ──
  const propLite: { id: string; municipality: string | null; address: string | null }[] = []
  for (const r of (propRaw ?? []) as Record<string, unknown>[]) {
    const id = r.id as string, caseId = r.case_id as string
    if (!caseMap.has(caseId)) continue
    const muni = ((r.municipality as string) ?? '').trim()
    const address = ((r.address as string) ?? '').trim()
    propLite.push({ id, municipality: muni || null, address: address || null })
    const b = base({ id, case_id: caseId }, '不動産')
    if (r.is_additional && !r.additional_approved_at) {
      items.push({ ...b, key: `pa-${id}`, tab: 'approve', action: 're_prop_approve', target: muni || '市区町村', content: '市区町村追加', amount: null, workerId: null, workerName: null, reviewer: 'manager', meta: { municipality: muni } })
      continue
    }
    if (r.appraisal_value != null && !r.confirmed) {
      items.push({ ...b, key: `pc-${id}`, tab: 'confirm', action: 're_confirm', target: muni || '未設定', content: `${(r.property_type as string) || ''} ${address}`.trim() || '物件', amount: yen(r.appraisal_value as number), workerId: null, workerName: null, reviewer: 'jimu' })
    }
  }

  // ── 金融（残高の確定／口座凍結確認） ──
  for (const r of (finRaw ?? []) as Record<string, unknown>[]) {
    const id = r.id as string, caseId = r.case_id as string
    if (!caseMap.has(caseId)) continue
    const b = base({ id, case_id: caseId }, '金融')
    const inst = ((r.institution_name as string) ?? '').trim()
    const sub = ((r.branch_name as string) || (r.stock_name as string) || '') as string
    if (r.balance_amount != null && !r.balance_confirmed) {
      items.push({ ...b, key: `fc-${id}`, tab: 'confirm', action: 'fin_confirm', target: inst || '未設定', content: sub || '口座', amount: yen(r.balance_amount as number), workerId: null, workerName: null, reviewer: 'jimu' })
    }
    if (!r.freeze_confirmed) {
      items.push({ ...b, key: `ff-${id}`, tab: 'freeze', action: 'fin_freeze', target: inst || '未設定', content: sub || '口座', amount: null, workerId: null, workerName: null, reviewer: 'manager' })
    }
  }

  // 起票が古い順（放置を上に）
  items.sort((a, b2) => (a.stamp ?? '').localeCompare(b2.stamp ?? ''))

  return <ConfirmClient items={items} properties={propLite} />
}
