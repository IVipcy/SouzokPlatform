'use client'

// 画面側の原本ゲート：案件の原本管理を読み、source_rid（または請求の種類）ごとに「いま請求できるか」を返す。
// タスク詳細・完了モーダル・タスク追加で共用。戸籍の職務上請求（委任状不要）は koseki_requests を1回読んで判定する。
// その請求が既に同梱している原本（自分で入れた委任状など）は「手元にある」と数え、自分自身を原本待ちで止めない。

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOriginalStock } from '@/lib/useOriginalStock'
import { ownQtyForRid } from '@/lib/originals'
import { gateKindOfRid, originalsGate, type GateKind, type OriginalsGate } from '@/lib/originalsGate'

type AcqLite = { id: string; target_municipality: string | null }

export function useOriginalsGate(caseId: string | null | undefined, rids: string[], enabled = true) {
  const supabase = createClient()
  const { stock, enclosures, finRequests, institutions, loading, reload } = useOriginalStock(caseId, enabled)
  const [deceasedName, setDeceasedName] = useState<string | null>(null)
  const [authority, setAuthority] = useState<Record<string, string | null>>({})
  // 不動産の請求（re-muni:{市区町村} のタスクを、その市区町村の請求＝同梱の ref_id に解くのに使う）
  const [acquisitions, setAcquisitions] = useState<AcqLite[]>([])
  const kosekiIds = rids.filter(r => r.startsWith('koseki:')).map(r => r.slice('koseki:'.length))
  const kosekiKey = kosekiIds.join(',')
  const needsAcq = rids.some(r => r.startsWith('re-muni:'))

  useEffect(() => {
    if (!caseId || !enabled) return
    let alive = true
    ;(async () => {
      const [{ data: c }, ko, ra] = await Promise.all([
        supabase.from('cases').select('deceased_name').eq('id', caseId).maybeSingle(),
        kosekiIds.length > 0 ? supabase.from('koseki_requests').select('id, acquisition_authority').in('id', kosekiIds) : Promise.resolve({ data: [] as Array<{ id: string; acquisition_authority: string | null }> }),
        needsAcq ? supabase.from('real_estate_acquisitions').select('id, target_municipality').eq('case_id', caseId) : Promise.resolve({ data: [] as AcqLite[] }),
      ])
      if (!alive) return
      setDeceasedName(((c as { deceased_name?: string | null } | null)?.deceased_name) ?? null)
      setAuthority(Object.fromEntries(((ko.data ?? []) as Array<{ id: string; acquisition_authority: string | null }>).map(k => [k.id, k.acquisition_authority])))
      setAcquisitions((ra.data ?? []) as AcqLite[])
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, enabled, kosekiKey, needsAcq])

  const gateFor = useMemo(() => (rid: string | null | undefined): OriginalsGate | null => {
    const kind = gateKindOfRid(rid)
    if (!kind) return null
    const shokumujo = kind === 'koseki' ? authority[(rid ?? '').slice('koseki:'.length)] === '職務上請求' : false
    const ownQty = ownQtyForRid(rid, enclosures, { acquisitions, finRequests, institutions })
    return originalsGate(kind, stock, { deceasedName, shokumujo, ownQty })
  }, [stock, enclosures, acquisitions, finRequests, institutions, deceasedName, authority])
  const gateForKind = useMemo(() => (kind: GateKind, shokumujo = false): OriginalsGate => originalsGate(kind, stock, { deceasedName, shokumujo }), [stock, deceasedName])

  return { stock, loading, reload, gateFor, gateForKind, deceasedName }
}
