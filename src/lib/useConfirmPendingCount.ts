'use client'

// 確認簿の「未処理件数」を数える軽量フック。サイドバーの赤バッジ用。
// 対応中の案件 × 各テーブルの「依頼済み＆未確認」＋「追加請求で未承認」を横断で数える。
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function useConfirmPendingCount(): number {
  const [count, setCount] = useState(0)
  const pathname = usePathname()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const { data: cases } = await supabase.from('cases').select('id').eq('status', '対応中')
      const ids = ((cases ?? []) as { id: string }[]).map(c => c.id)
      if (ids.length === 0) { if (alive) setCount(0); return }
      const [kos, acq, prop, fin] = await Promise.all([
        supabase.from('koseki_requests').select('acquirer,is_additional,additional_approved_at,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').in('case_id', ids),
        supabase.from('real_estate_acquisitions').select('item_type,is_additional,additional_approved_at,request_check_requested_at,request_check_at,receipt_check_requested_at,receipt_check_at').in('case_id', ids),
        supabase.from('real_estate_properties').select('is_additional,additional_approved_at,confirmed,confirm_requested_at').in('case_id', ids),
        supabase.from('financial_assets').select('balance_confirmed,balance_confirm_requested_at,freeze_confirmed,freeze_confirm_requested_at').in('case_id', ids),
      ])
      let n = 0
      for (const r of ((kos.data ?? []) as Array<Record<string, unknown>>)) {
        if (r.is_additional && !r.additional_approved_at) { n++; continue }
        if (r.acquirer === '依頼者') continue
        if (r.request_check_requested_at && !r.request_check_at) n++
        if (r.receipt_check_requested_at && !r.receipt_check_at) n++
      }
      for (const r of ((acq.data ?? []) as Array<Record<string, unknown>>)) {
        if ((r.item_type as string) === '路線価') continue
        if (r.is_additional && !r.additional_approved_at) { n++; continue }
        if (r.request_check_requested_at && !r.request_check_at) n++
        if (r.receipt_check_requested_at && !r.receipt_check_at) n++
      }
      for (const r of ((prop.data ?? []) as Array<Record<string, unknown>>)) {
        if (r.is_additional && !r.additional_approved_at) { n++; continue }
        if (r.confirm_requested_at && !r.confirmed) n++
      }
      for (const r of ((fin.data ?? []) as Array<Record<string, unknown>>)) {
        if (r.balance_confirm_requested_at && !r.balance_confirmed) n++
        if (r.freeze_confirm_requested_at && !r.freeze_confirmed) n++
      }
      if (alive) setCount(n)
    })()
    return () => { alive = false }
  }, [pathname])  // ページ遷移ごとに再取得（確認簿を離れた/戻ったタイミングで更新）

  return count
}
