'use client'

// 作業着手待ちの案件数を数える軽量フック。サイドバー「事務管理ダッシュボード」の赤い件数用。
// 事務管理ダッシュボードの「作業着手待ち」タブと同じ母数＝status が「作業着手準備」の案件。
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function useStartWaitingCount(enabled: boolean): number {
  const [count, setCount] = useState(0)
  const pathname = usePathname()

  useEffect(() => {
    if (!enabled) return
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const { count: n } = await supabase
        .from('cases')
        .select('id', { count: 'exact', head: true })
        .eq('status', '作業着手準備')
      if (alive) setCount(n ?? 0)
    })()
    return () => { alive = false }
  }, [pathname, enabled])   // ページ遷移ごとに数え直す（着手させたら減る）

  return count
}
