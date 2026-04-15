'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Section } from '@/components/ui/InlineFields'
import type { TaskRow } from '@/types'

type FinancialAsset = {
  id: string
  institution_name: string
  branch_name: string | null
}

type BankEntry = {
  financial_asset_id: string
  institution_name: string
  branch_name: string | null
  frozen: boolean
  reqDate: string | null
  arrDate: string | null
  memo: string
}

type Props = {
  task: TaskRow
  onRefresh: () => void
}

function DateCell({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  if (editing) {
    return (
      <input
        type="date"
        value={draft}
        autoFocus
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          onChange(draft || null)
        }}
        className="w-full text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none"
      />
    )
  }
  return (
    <button
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className={`w-full text-left text-xs px-1 py-0.5 rounded hover:bg-gray-100 transition-colors ${
        value ? 'text-gray-800' : 'text-gray-400'
      }`}
    >
      {value ?? '—'}
    </button>
  )
}

export default function MultiBankSection({ task, onRefresh }: Props) {
  const ext = (task.ext_data ?? {}) as Record<string, unknown>
  const banks: BankEntry[] = Array.isArray(ext.banks) ? (ext.banks as BankEntry[]) : []
  const [syncing, setSyncing] = useState(false)

  const totalCount = banks.length
  const doneCount = banks.filter(b => !!b.arrDate).length
  const allDone = totalCount > 0 && doneCount === totalCount

  const saveBanks = async (updatedBanks: BankEntry[]) => {
    const supabase = createClient()
    const newExt = { ...ext, banks: updatedBanks }
    await supabase.from('tasks').update({ ext_data: newExt }).eq('id', task.id)
    onRefresh()
  }

  const updateBank = (index: number, updates: Partial<BankEntry>) => {
    const updated = banks.map((b, i) => i === index ? { ...b, ...updates } : b)
    saveBanks(updated)
  }

  // 案件の財産情報から銀行リストを同期する
  const syncFromCase = async () => {
    setSyncing(true)
    const supabase = createClient()
    const { data: assets } = await supabase
      .from('financial_assets')
      .select('id, institution_name, branch_name')
      .eq('case_id', task.case_id)
      .eq('asset_type', '預貯金')
      .order('created_at')
    if (assets && assets.length > 0) {
      // 既存エントリは保持しつつ、未登録の銀行を追加
      const existingIds = new Set(banks.map(b => b.financial_asset_id))
      const newBanks: BankEntry[] = assets
        .filter((a: FinancialAsset) => !existingIds.has(a.id))
        .map((a: FinancialAsset) => ({
          financial_asset_id: a.id,
          institution_name: a.institution_name,
          branch_name: a.branch_name ?? null,
          frozen: false,
          reqDate: null,
          arrDate: null,
          memo: '',
        }))
      await saveBanks([...banks, ...newBanks])
    }
    setSyncing(false)
  }

  if (totalCount === 0) {
    return (
      <Section title="作業内容" icon="📝">
        <div className="text-center py-4">
          <p className="text-sm text-gray-400 mb-3">
            金融機関の情報がありません。
          </p>
          <button
            onClick={syncFromCase}
            disabled={syncing}
            className="text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            {syncing ? '読み込み中...' : '案件の預貯金情報を取得する'}
          </button>
          <p className="text-[10px] text-gray-400 mt-2">
            案件詳細の「財産情報」タブで預貯金を登録してから実行してください
          </p>
        </div>
      </Section>
    )
  }

  return (
    <Section title="作業内容" icon="📝">
      {/* 完了状況サマリー */}
      <div className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-3 ${
        allDone ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
      }`}>
        <span className={`text-xl ${allDone ? '' : ''}`}>
          {allDone ? '✅' : '⏳'}
        </span>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${allDone ? 'text-green-700' : 'text-amber-700'}`}>
            {allDone ? '全金融機関の書類が揃いました' : `書類待ち ${totalCount - doneCount} 件`}
          </p>
          <p className="text-xs text-gray-500">
            {doneCount} / {totalCount} 件 到着済
          </p>
        </div>
        {/* プログレスバー */}
        <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-amber-400'}`}
            style={{ width: totalCount > 0 ? `${(doneCount / totalCount) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* 銀行別テーブル */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[35%]">金融機関</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[15%]">凍結済</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[22%]">請求日</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[22%]">到着日</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-[6%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {banks.map((bank, idx) => {
              const isDone = !!bank.arrDate
              return (
                <tr
                  key={bank.financial_asset_id}
                  className={`transition-colors ${isDone ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}
                >
                  {/* 金融機関名 */}
                  <td className="px-3 py-2">
                    <div className={`font-medium ${isDone ? 'text-green-700' : 'text-gray-800'}`}>
                      {bank.institution_name}
                    </div>
                    {bank.branch_name && (
                      <div className="text-gray-400 text-[10px]">{bank.branch_name}</div>
                    )}
                  </td>
                  {/* 凍結済チェックボックス */}
                  <td className="px-3 py-2">
                    <label className="flex items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bank.frozen}
                        onChange={e => updateBank(idx, { frozen: e.target.checked })}
                        className="accent-blue-600 w-3.5 h-3.5"
                      />
                    </label>
                  </td>
                  {/* 請求日 */}
                  <td className="px-2 py-1.5">
                    <DateCell
                      value={bank.reqDate}
                      onChange={v => updateBank(idx, { reqDate: v })}
                    />
                  </td>
                  {/* 到着日 */}
                  <td className="px-2 py-1.5">
                    <DateCell
                      value={bank.arrDate}
                      onChange={v => updateBank(idx, { arrDate: v })}
                    />
                  </td>
                  {/* 完了アイコン */}
                  <td className="px-2 py-2 text-center">
                    {isDone ? (
                      <span className="text-green-500">✓</span>
                    ) : (
                      <span className="text-gray-300">○</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-2 px-1">
        <p className="text-[10px] text-gray-400">
          ※ 到着日を入力すると書類受取完了になります。全件揃ったらタスクを「完了」にしてください。
        </p>
        <button
          onClick={syncFromCase}
          disabled={syncing}
          className="text-[10px] font-medium text-gray-400 hover:text-blue-600 disabled:opacity-50 whitespace-nowrap ml-2 transition-colors"
        >
          {syncing ? '...' : '↻ 銀行を更新'}
        </button>
      </div>
    </Section>
  )
}
