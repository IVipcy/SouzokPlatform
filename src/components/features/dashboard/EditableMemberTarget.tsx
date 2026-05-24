'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseIntInput } from '@/lib/inputHelpers'

type Props = {
  memberId: string
  ym: string
  initialTarget: number
}

// SalesTeamTable の「目標(新規受注)」セル。
// クリックで編集モード → blur / Enter で保存。Esc で取消。
export default function EditableMemberTarget({ memberId, ym, initialTarget }: Props) {
  const [target, setTarget] = useState(initialTarget)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [, startTransition] = useTransition()

  const startEdit = () => {
    setEditing(true)
    setDraft(String(target))
  }

  const commit = () => {
    if (!editing) return
    const next = Math.max(0, parseIntInput(draft))
    setEditing(false)
    if (next === target) return

    const prev = target
    setTarget(next)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('member_targets')
        .upsert(
          { member_id: memberId, ym, new_orders_count: next },
          { onConflict: 'member_id,ym' },
        )
      if (error) {
        // 失敗時ロールバック
        setTarget(prev)
      }
    })
  }

  const cancel = () => setEditing(false)

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-0.5">
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={draft}
          onFocus={e => e.target.select()}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
          className="w-12 px-1 py-0.5 text-right border border-brand-400 rounded text-[13px] font-mono outline-none focus:ring-1 focus:ring-brand-300"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="w-full text-right font-mono text-[13px] text-gray-700 hover:text-brand-700 hover:bg-brand-50/40 px-1 py-0.5 rounded transition-colors"
      title="クリックで編集"
    >
      {target > 0 ? target : <span className="text-gray-300">未設定</span>}
    </button>
  )
}
