'use client'

// 画面側の原本ゲート：案件の原本管理を読み、source_rid（または請求の種類）ごとに「いま請求できるか」を返す。
// タスク詳細・完了モーダル・タスク追加で共用。戸籍の職務上請求（委任状不要）は koseki_requests を1回読んで判定する。

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOriginalStock } from '@/lib/useOriginalStock'
import { gateKindOfRid, originalsGate, type GateKind, type OriginalsGate } from '@/lib/originalsGate'

export function useOriginalsGate(caseId: string | null | undefined, rids: string[], enabled = true) {
  const supabase = createClient()
  const { stock, loading, reload } = useOriginalStock(caseId, enabled)
  const [deceasedName, setDeceasedName] = useState<string | null>(null)
  const [authority, setAuthority] = useState<Record<string, string | null>>({})
  const kosekiIds = rids.filter(r => r.startsWith('koseki:')).map(r => r.slice('koseki:'.length))
  const kosekiKey = kosekiIds.join(',')

  useEffect(() => {
    if (!caseId || !enabled) return
    let alive = true
    ;(async () => {
      const [{ data: c }, ko] = await Promise.all([
        supabase.from('cases').select('deceased_name').eq('id', caseId).maybeSingle(),
        kosekiIds.length > 0 ? supabase.from('koseki_requests').select('id, acquisition_authority').in('id', kosekiIds) : Promise.resolve({ data: [] as Array<{ id: string; acquisition_authority: string | null }> }),
      ])
      if (!alive) return
      setDeceasedName(((c as { deceased_name?: string | null } | null)?.deceased_name) ?? null)
      setAuthority(Object.fromEntries(((ko.data ?? []) as Array<{ id: string; acquisition_authority: string | null }>).map(k => [k.id, k.acquisition_authority])))
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, enabled, kosekiKey])

  const gateFor = useMemo(() => (rid: string | null | undefined): OriginalsGate | null => {
    const kind = gateKindOfRid(rid)
    if (!kind) return null
    const shokumujo = kind === 'koseki' ? authority[(rid ?? '').slice('koseki:'.length)] === '職務上請求' : false
    return originalsGate(kind, stock, { deceasedName, shokumujo })
  }, [stock, deceasedName, authority])
  const gateForKind = useMemo(() => (kind: GateKind, shokumujo = false): OriginalsGate => originalsGate(kind, stock, { deceasedName, shokumujo }), [stock, deceasedName])

  return { stock, loading, reload, gateFor, gateForKind, deceasedName }
}
