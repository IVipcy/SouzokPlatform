'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Target, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

type Props = {
  memberId: string
  /** 'YYYY-MM' */
  ym: string
  /** 「8月」など表示用 */
  monthLabel: string
  /** 今月の目標（未設定は null） */
  target: number | null
  /** 今月の実績（新規受注件数） */
  actual: number
  /** 参考表示用の先月。目標が未設定の月は target=null */
  lastMonth: { monthLabel: string; target: number | null; actual: number } | null
}

/**
 * マイページのヘッダー、氏名のすぐ右に出す月間目標のチップ。
 * 受注担当だけに出す（管理担当は目標なし）。入れる項目は新規受注件数の1つだけ。
 *   未設定 → 橙 ／ 設定済み → グレー ／ 達成 → 緑
 * 押すとその場で目標を入れ直せる。
 */
export default function MyTargetChip({ memberId, ym, monthLabel, target, actual, lastMonth }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(target === null ? '' : String(target))
  const [saving, setSaving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // 外側クリック / Esc で閉じる
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const save = async () => {
    const num = Number(value)
    if (value === '' || isNaN(num) || num < 0 || !Number.isInteger(num)) {
      showToast('0以上の整数を入れてください', 'error')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('member_targets')
        .upsert({ member_id: memberId, ym, new_orders_count: num }, { onConflict: 'member_id,ym' })
      if (error) throw error
      showToast('目標を保存しました', 'success')
      setOpen(false)
      startTransition(() => router.refresh())
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  const unset = target === null || target <= 0
  const achieved = !unset && actual >= (target as number)
  const tone = unset
    ? 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100'
    : achieved
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'

  return (
    <span className="relative inline-flex" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={unset ? '今月の目標を入れる' : '目標を直す'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold border transition-colors whitespace-nowrap ${tone}`}
      >
        <Target className="w-3.5 h-3.5" strokeWidth={2} />
        {unset
          ? `${monthLabel}の目標が未設定`
          : <>{monthLabel} 受注 <span className="tabular-nums">{actual} / {target}</span>件{achieved && ' 達成'}</>}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-30 w-[280px] bg-white border border-gray-300 rounded-lg shadow-lg p-3.5">
          <div className="text-[13px] font-semibold text-gray-800 mb-2.5">{ym.slice(0, 4)}年{monthLabel}の目標</div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-gray-500 w-[74px] flex-shrink-0">新規受注件数</span>
            <input
              type="number"
              min={0}
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save() }}
              className="w-[72px] px-2 py-1 text-[14px] text-right font-mono border border-gray-300 rounded outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
            />
            <span className="text-[12px] text-gray-500">件</span>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}保存
            </button>
          </div>
          {lastMonth && (
            <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11.5px] text-gray-500">
              {lastMonth.monthLabel}の実績　<span className="font-semibold text-gray-700 tabular-nums">{lastMonth.actual}件</span>
              {lastMonth.target !== null && lastMonth.target > 0 && (
                <>（目標 {lastMonth.target}件・達成率 {Math.round((lastMonth.actual / lastMonth.target) * 100)}%）</>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
