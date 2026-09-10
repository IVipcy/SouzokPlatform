'use client'

// 案件の登記依頼を読む（相続登記タブ）。依頼者・登記部門の担当・回答者の名前を join。
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TOUKI_REQUEST_SELECT } from '@/lib/toukiRequests'
import type { ToukiRequestRow } from '@/types'

export function useToukiRequests(caseId: string | null) {
  const [rows, setRows] = useState<ToukiRequestRow[]>([])
  const reload = useCallback(async () => {
    if (!caseId) return
    const { data } = await createClient().from('touki_requests').select(TOUKI_REQUEST_SELECT).eq('case_id', caseId).order('requested_at', { ascending: false })
    setRows((data ?? []) as unknown as ToukiRequestRow[])
  }, [caseId])
  useEffect(() => {
    let alive = true
    ;(async () => { await reload(); if (!alive) return })()
    return () => { alive = false }
  }, [reload])
  return { rows, reload }
}
