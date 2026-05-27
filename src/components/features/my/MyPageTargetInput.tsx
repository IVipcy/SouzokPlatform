'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

type Props = {
  memberId: string
  ym: string
  /** 'new_orders_count' = 受注 / 'invoice_count' = 管理 */
  field: 'new_orders_count' | 'invoice_count'
  initialValue: number
  label: string
}

/**
 * マイページの月間目標入力。
 * - member_targets を upsert で書き込む
 */
export default function MyPageTargetInput({ memberId, ym, field, initialValue, label }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [value, setValue] = useState<string>(String(initialValue))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const num = Number(value)
    if (isNaN(num) || num < 0) {
      showToast('正の整数を入力してください', 'error')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('member_targets')
        .upsert(
          { member_id: memberId, ym, [field]: num },
          { onConflict: 'member_id,ym' },
        )
      if (error) throw error
      showToast('目標を保存しました', 'success')
      startTransition(() => router.refresh())
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  const changed = String(initialValue) !== value

  return (
    <div className="flex items-center gap-2">
      <label className="text-[12px] font-semibold text-gray-500 flex-shrink-0">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={e => setValue(e.target.value)}
        className="w-24 px-2 py-1 text-[14px] font-mono border border-gray-300 rounded outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !changed}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
          saving || !changed
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-brand-600 text-white hover:bg-brand-700'
        }`}
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
        保存
      </button>
    </div>
  )
}
