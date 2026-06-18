'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { cascadeDeleteCase } from '@/lib/caseDelete'

/**
 * 案件一覧テーブルの「チェック選択＋一括削除」共通ロジック。
 * 各テーブルはこのフックを使い、チェックボックス列・選択バー・DeleteConfirmModal を描く。
 */
export function useCaseBulkDelete(visibleIds: string[]) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const selectedVisible = visibleIds.filter(id => selected.has(id))
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  const someSelected = selectedVisible.length > 0 && !allSelected

  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(prev => {
    const next = new Set(prev)
    if (allSelected) visibleIds.forEach(id => next.delete(id))
    else visibleIds.forEach(id => next.add(id))
    return next
  })
  const clear = () => setSelected(new Set())

  const handleDelete = async () => {
    if (selected.size === 0) return
    const supabase = createClient()
    const count = selected.size
    for (const id of selected) {
      await cascadeDeleteCase(supabase, id)
    }
    showToast(`${count}件の案件を削除しました`, 'success')
    setSelected(new Set())
    router.refresh()
  }

  return { selected, allSelected, someSelected, toggleOne, toggleAll, clear, confirmOpen, setConfirmOpen, handleDelete }
}
