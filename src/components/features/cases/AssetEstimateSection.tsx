'use client'

// 資産概算（調査開始前）。面談シートとオーダーシートで同じものを出す（migration 292）。
//   面談時点では口座ごとの残高・物件ごとの評価額は分からないので、区分ごとのざっくりした金額だけ入れる。
//   内訳＝区分（不動産／預貯金／証券・信託／生命保険／その他財産／相続債務／その他費用）・金額・メモ。
//   合計（プラス − マイナス）は cases.total_asset_estimate に写す（案件一覧の「資産」列と同じ値）。
//   実務タブの評価額確定・残高証明は別（ここは調査前の目安）。

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { MoneyInput } from './FinancialAssetsTable'
import type { CaseRow } from '@/types'

export const ASSET_ESTIMATE_KINDS: Array<{ kind: string; negative: boolean }> = [
  { kind: '不動産', negative: false }, { kind: '預貯金', negative: false }, { kind: '証券・信託', negative: false }, { kind: '生命保険', negative: false },
  { kind: 'その他財産', negative: false }, { kind: '相続債務', negative: true }, { kind: 'その他費用', negative: true },
]
const isNeg = (k: string) => ASSET_ESTIMATE_KINDS.find(x => x.kind === k)?.negative ?? false
const yen = (n: number) => '¥' + Math.round(n).toLocaleString()

type Row = { id: string; case_id: string; kind: string; amount: number | null; note: string | null; sort_order: number }

export default function AssetEstimateSection({ caseId, patchCase, ensureCaseId, compact = false }: {
  caseId: string
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  /** 面談シートの下書き（案件が未作成）用。行を足す前に案件を作る */
  ensureCaseId?: () => Promise<string>
  compact?: boolean
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      // 案件未作成の面談シートは caseId が 'new' や空で来る。uuid でなければ取りに行かない（毎回コンソールにエラーが出ていた）
      if (!caseId || !/^[0-9a-f-]{36}$/i.test(caseId)) { if (alive) setLoaded(true); return }
      const { data } = await createClient().from('case_asset_estimates').select('*').eq('case_id', caseId).order('sort_order').order('created_at')
      if (!alive) return
      setRows((data ?? []) as Row[])
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [caseId])

  const positive = rows.filter(r => !isNeg(r.kind)).reduce((s, r) => s + (r.amount ?? 0), 0)
  const negative = rows.filter(r => isNeg(r.kind)).reduce((s, r) => s + (r.amount ?? 0), 0)
  const total = positive - negative

  /** 合計を案件に写す（案件一覧の資産列） */
  const syncTotal = async (next: Row[]) => {
    const p = next.filter(r => !isNeg(r.kind)).reduce((s, r) => s + (r.amount ?? 0), 0)
    const n = next.filter(r => isNeg(r.kind)).reduce((s, r) => s + (r.amount ?? 0), 0)
    await patchCase({ total_asset_estimate: next.some(r => r.amount != null) ? p - n : null } as Partial<CaseRow>)
  }

  const add = async (kind: string) => {
    const cid = ensureCaseId ? await ensureCaseId() : caseId
    const { data, error } = await createClient().from('case_asset_estimates').insert({ case_id: cid, kind, sort_order: rows.length }).select('*').single()
    if (error || !data) { showToast(`追加に失敗: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as Row])
  }
  const save = async (id: string, patch: Partial<Row>) => {
    const next = rows.map(r => (r.id === id ? { ...r, ...patch } : r))
    setRows(next)
    const { error } = await createClient().from('case_asset_estimates').update(patch).eq('id', id)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    if ('amount' in patch || 'kind' in patch) await syncTotal(next)
  }
  const remove = async (id: string) => {
    const next = rows.filter(r => r.id !== id)
    setRows(next)
    const { error } = await createClient().from('case_asset_estimates').delete().eq('id', id)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    await syncTotal(next)
  }

  const sel = 'input-flat w-full px-2 py-1 text-[13px] text-gray-800 outline-none'
  const used = new Set(rows.map(r => r.kind))
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2.5 flex-wrap border border-brand-200 bg-brand-50/50 px-3.5 py-2.5">
        <span className="text-[11.5px] text-gray-500">資産概算の合計{negative > 0 ? '（正味）' : ''}</span>
        <span className="text-[22px] font-bold text-brand-800 tabular-nums leading-none">{rows.some(r => r.amount != null) ? yen(total) : '—'}</span>
        {negative > 0 && <span className="text-[12px] text-gray-500">プラス {yen(positive)} − マイナス {yen(negative)}</span>}
        <span className="ml-auto text-[11px] text-gray-400">調査開始前の目安です。確定額は実務タブ（評価額確定・残高証明）と財産目録で管理します</span>
      </div>
      {loaded && rows.length > 0 && (
        <div className="text-[13px]">
          <div className={`grid ${compact ? 'grid-cols-[8rem_9rem_minmax(0,1fr)_1.5rem]' : 'grid-cols-[9rem_10rem_minmax(0,1fr)_1.5rem]'} gap-x-3 items-center pb-1 text-[11.5px] text-gray-400`}>
            <span>区分</span><span className="text-right">金額</span><span>メモ</span><span />
          </div>
          {rows.map(r => (
            <div key={r.id} className={`grid ${compact ? 'grid-cols-[8rem_9rem_minmax(0,1fr)_1.5rem]' : 'grid-cols-[9rem_10rem_minmax(0,1fr)_1.5rem]'} gap-x-3 items-center py-1 border-t border-gray-100`}>
              <select value={r.kind} onChange={e => void save(r.id, { kind: e.target.value })} style={{ fontFamily: 'inherit' }} className={`${sel} ${isNeg(r.kind) ? 'text-red-700' : ''}`}>
                {ASSET_ESTIMATE_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.negative ? `${k.kind}（マイナス）` : k.kind}</option>)}
              </select>
              <MoneyInput value={r.amount} onCommit={v => void save(r.id, { amount: v ? Number(v) : null })} />
              <input type="text" defaultValue={r.note ?? ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (r.note ?? '')) void save(r.id, { note: v || null }) }} placeholder="例：自宅の土地建物・A銀行とB銀行の合計 など" className={sel} />
              <button type="button" onClick={() => void remove(r.id)} title="この行を外す" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[12px] text-gray-500">内訳を足す：</span>
        {ASSET_ESTIMATE_KINDS.map(k => (
          <button key={k.kind} type="button" onClick={() => void add(k.kind)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[12px] border border-dashed ${k.negative ? 'border-red-300 text-red-600 hover:border-red-400' : 'border-gray-300 text-brand-700 hover:border-brand-400'} ${used.has(k.kind) ? 'opacity-60' : ''}`}>
            <Plus className="w-3 h-3" />{k.kind}
          </button>
        ))}
      </div>
    </div>
  )
}
