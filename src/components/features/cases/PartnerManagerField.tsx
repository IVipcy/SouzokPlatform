'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PartnerRow } from '@/types'
import { showToast } from '@/components/ui/Toast'

type Props = {
  caseId: string
  partnerId: string | null
  onChange: () => void
  /** ラベル（省略時「パートナー企業」） */
  label?: string
}

/**
 * パートナー企業の選択＋管理（追加・還元率編集・削除）を1つのインラインフィールドに集約。
 *
 * - 値表示: 未選択 → "未設定"、選択中 → "{name} ({rate}%)"
 * - クリックで popover 展開、パートナー一覧と ＋追加・解除ボタン
 */
export default function PartnerManagerField({ caseId, partnerId, onChange, label = 'パートナー企業' }: Props) {
  const [open, setOpen] = useState(false)
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRate, setNewRate] = useState('')
  const popRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const current = partners.find(p => p.id === partnerId) ?? null

  const loadPartners = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('partners')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setPartners((data as PartnerRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadPartners()
  }, [])

  // Outside click to close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAddMode(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectPartner = async (id: string | null) => {
    const supabase = createClient()
    const { error } = await supabase.from('cases').update({ partner_id: id }).eq('id', caseId)
    if (error) {
      showToast('パートナーの紐付けに失敗しました', 'error')
    } else {
      showToast(id ? 'パートナーを設定しました' : 'パートナー紐付けを解除しました', 'success')
      onChange()
    }
    setOpen(false)
  }

  const addPartner = async () => {
    const name = newName.trim()
    if (!name) return
    const rate = Number(newRate) || 0
    const supabase = createClient()
    const { data, error } = await supabase
      .from('partners')
      .insert({ name, kickback_rate: rate, is_active: true })
      .select('*')
      .single()
    if (error) {
      showToast('パートナーの追加に失敗しました', 'error')
      return
    }
    showToast('パートナーを追加しました', 'success')
    setNewName('')
    setNewRate('')
    setAddMode(false)
    await loadPartners()
    // 追加したパートナーを即選択
    if (data) await selectPartner((data as PartnerRow).id)
  }

  const updateRate = async (id: string, rate: number) => {
    const supabase = createClient()
    const { error } = await supabase.from('partners').update({ kickback_rate: rate }).eq('id', id)
    if (error) {
      showToast('還元率の更新に失敗しました', 'error')
      return
    }
    showToast('還元率を更新しました', 'success')
    await loadPartners()
    onChange()
  }

  const deletePartner = async (id: string) => {
    if (!confirm('このパートナーを削除しますか？\n※過去に紐付いている案件には影響ありません')) return
    const supabase = createClient()
    // 論理削除
    const { error } = await supabase.from('partners').update({ is_active: false }).eq('id', id)
    if (error) {
      showToast('削除に失敗しました', 'error')
      return
    }
    showToast('パートナーを削除しました', 'success')
    await loadPartners()
    if (partnerId === id) {
      await selectPartner(null)
    }
  }

  return (
    <div ref={rootRef} className="relative py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      <div
        onClick={() => setOpen(o => !o)}
        className="group cursor-pointer flex items-center gap-1.5 min-h-[24px]"
      >
        <span className={`text-[13px] ${current ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
          {current ? `${current.name}（${current.kickback_rate}%）` : '未設定'}
        </span>
        <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">▾</span>
      </div>

      {open && (
        <div
          ref={popRef}
          className="absolute z-30 left-0 top-full mt-1 w-[320px] bg-white border border-gray-200 rounded-lg shadow-lg p-2"
        >
          <div className="text-[10px] text-gray-400 px-1.5 pb-1.5 border-b border-gray-100">
            パートナー選択・管理
          </div>

          {loading ? (
            <div className="py-3 text-center text-[11px] text-gray-400">読み込み中...</div>
          ) : (
            <div className="max-h-[260px] overflow-y-auto">
              {partners.length === 0 && (
                <div className="py-3 text-center text-[11px] text-gray-400">
                  パートナー未登録。下の「＋ 新規追加」から登録してください
                </div>
              )}
              {partners.map(p => (
                <PartnerRowItem
                  key={p.id}
                  partner={p}
                  isSelected={p.id === partnerId}
                  onSelect={() => selectPartner(p.id)}
                  onUpdateRate={(rate) => updateRate(p.id, rate)}
                  onDelete={() => deletePartner(p.id)}
                />
              ))}
            </div>
          )}

          <div className="border-t border-gray-100 mt-1.5 pt-1.5 space-y-1">
            {partnerId && (
              <button
                onClick={() => selectPartner(null)}
                className="w-full text-left text-[11px] text-gray-500 hover:bg-gray-50 px-2 py-1 rounded"
              >
                × 紐付けを解除
              </button>
            )}
            {addMode ? (
              <div className="space-y-1.5 px-1 py-1">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="パートナー名"
                  className="w-full px-2 py-1 text-[12px] border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={newRate}
                    onChange={e => setNewRate(e.target.value)}
                    placeholder="還元率"
                    step="0.1"
                    className="flex-1 px-2 py-1 text-[12px] border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                  />
                  <span className="text-[11px] text-gray-500">%</span>
                  <button
                    onClick={addPartner}
                    disabled={!newName.trim()}
                    className="px-2 py-1 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
                  >
                    追加
                  </button>
                  <button
                    onClick={() => { setAddMode(false); setNewName(''); setNewRate('') }}
                    className="px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50 rounded"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddMode(true)}
                className="w-full text-left text-[11px] text-blue-600 hover:bg-blue-50 px-2 py-1 rounded font-medium"
              >
                ＋ 新規パートナーを追加
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 各パートナー行 ───
function PartnerRowItem({
  partner,
  isSelected,
  onSelect,
  onUpdateRate,
  onDelete,
}: {
  partner: PartnerRow
  isSelected: boolean
  onSelect: () => void
  onUpdateRate: (rate: number) => void
  onDelete: () => void
}) {
  const [editingRate, setEditingRate] = useState(false)
  const [rateDraft, setRateDraft] = useState(String(partner.kickback_rate))

  const commitRate = () => {
    const n = Number(rateDraft)
    if (!Number.isNaN(n) && n !== partner.kickback_rate) {
      onUpdateRate(n)
    }
    setEditingRate(false)
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-blue-50/40 ${
        isSelected ? 'bg-blue-50' : ''
      }`}
    >
      <button
        onClick={onSelect}
        className="flex-1 text-left text-[12px] font-medium text-gray-800 truncate"
        title={partner.name}
      >
        {isSelected ? '● ' : '○ '}
        {partner.name}
      </button>
      {editingRate ? (
        <input
          type="number"
          value={rateDraft}
          onChange={e => setRateDraft(e.target.value)}
          onBlur={commitRate}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRate()
            else if (e.key === 'Escape') { setRateDraft(String(partner.kickback_rate)); setEditingRate(false) }
          }}
          step="0.1"
          autoFocus
          className="w-14 px-1 py-0.5 text-[11px] border border-blue-400 rounded font-mono"
        />
      ) : (
        <button
          onClick={() => { setRateDraft(String(partner.kickback_rate)); setEditingRate(true) }}
          className="text-[11px] text-gray-600 font-mono px-1.5 py-0.5 rounded hover:bg-gray-100"
          title="還元率を編集"
        >
          {partner.kickback_rate}%
        </button>
      )}
      <button
        onClick={onDelete}
        className="text-[10px] text-gray-300 hover:text-red-500 px-1"
        title="削除"
      >
        🗑
      </button>
    </div>
  )
}
