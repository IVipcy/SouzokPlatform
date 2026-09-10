'use client'

// マイページ（管理担当）「登記依頼」タブ。自分が出した登記依頼の一覧＋「＋依頼を出す」（先頭で案件を選ぶ）。
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ToukiRequestsTable from '@/components/features/cases/ToukiRequestsTable'
import ToukiRequestModal from '@/components/features/cases/ToukiRequestModal'
import type { ToukiRequestRow } from '@/types'

export default function MyToukiRequestsTab({ rows, memberId, todayStr }: { rows: ToukiRequestRow[]; memberId: string; todayStr: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [parent, setParent] = useState<ToukiRequestRow | null>(null)
  const [cases, setCases] = useState<Array<{ id: string; case_number: string; deal_name: string }>>([])

  // 自分が管理担当の案件（対応中）。依頼を出すときの案件の候補
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await createClient().from('case_members').select('cases(id, case_number, deal_name, status)').eq('member_id', memberId).in('role', ['manager', 'sub_manager'])
      if (!alive) return
      const list = ((data ?? []) as unknown as Array<{ cases: { id: string; case_number: string; deal_name: string; status: string } | null }>)
        .map(r => r.cases).filter((c): c is { id: string; case_number: string; deal_name: string; status: string } => !!c && c.status === '対応中')
        .sort((a, b) => a.case_number.localeCompare(b.case_number))
      setCases(list)
    })()
    return () => { alive = false }
  }, [memberId])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div>
          <h2 className="text-[15px] font-bold text-gray-800">登記依頼</h2>
          <p className="text-[12px] text-gray-500">自分が登記部門へ出した依頼。結果（完了／修正あり）が付くと通知が届きます。依頼中のまま1営業日で要確認、3営業日で要注意。</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => setShowDone(v => !v)} className="px-2.5 py-1 rounded-md text-[12px] font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50">{showDone ? '完了を隠す' : '完了も表示'}</button>
          <button type="button" onClick={() => { setParent(null); setOpen(true) }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-white bg-brand-600 border border-brand-600 hover:bg-brand-700"><Plus className="w-3.5 h-3.5" />依頼を出す</button>
        </span>
      </div>
      <ToukiRequestsTable rows={rows} mode="mine" todayStr={todayStr} showDone={showDone}
        onChanged={() => router.refresh()} onRerequest={r => { setParent(r); setOpen(true) }} />
      {open && (
        <ToukiRequestModal isOpen onClose={() => setOpen(false)} cases={cases} caseId={parent?.case_id} parent={parent}
          onSaved={() => router.refresh()} />
      )}
    </div>
  )
}
