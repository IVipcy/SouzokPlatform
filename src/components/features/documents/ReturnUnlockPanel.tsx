'use client'

// 受信簿の「対応」で、到着物に「原本の返却」があるとき：
// 戻った原本で「いま請求できるようになった請求」を請求カード（未請求）から探して出す。
//   ・既にタスクがあるもの … 原本待ちだったタスクが自動で着手OKになる（何もしなくてよい）ことを知らせる
//   ・タスクが無いもの …「タスクを作る」候補（既定ON）。親（対応ウィンドウ）が確定時に作る
// 判定は originalsGate（原本管理の手元）。ここでは保存しない。

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useOriginalsGate } from '@/lib/useOriginalsGate'
import { gateKindsAffectedBy, gyomuOfGateKind, type GateKind } from '@/lib/originalsGate'
import type { DocumentReceiptItemRow } from '@/types'

export type UnlockCandidate = {
  rid: string
  kind: GateKind
  title: string
  work: string
  gyomu: string
  /** 既にあるタスク（あれば作らない） */
  existing: { id: string; title: string } | null
  /** 戻った原本の名前（着手OKの理由に使う） */
  byOriginal: string
  /** どの到着物（返却）から */
  receiptItemId: string
}

export default function ReturnUnlockPanel({ caseId, items, onChange }: {
  caseId: string
  items: DocumentReceiptItemRow[]
  /** 選ばれている「タスクを作る」候補が変わったら親に知らせる */
  onChange: (picked: UnlockCandidate[]) => void
}) {
  const returns = useMemo(() => items.filter(it => it.return_enclosure_id || it.return_fin_request_id), [items])
  const enabled = returns.length > 0
  const { gateForKind, deceasedName, loading } = useOriginalsGate(caseId, [], enabled)
  const [cands, setCands] = useState<UnlockCandidate[] | null>(null)
  const [on, setOn] = useState<Record<string, boolean>>({})
  // 戻った原本の名前（到着物名から「返却：」と「（… に出したもの）」を落とす）
  const returnedNames = useMemo(() => returns.map(it => it.item_name.replace(/^返却：/, '').replace(/（.*$/, '').trim()).filter(Boolean), [returns])

  useEffect(() => {
    if (!enabled || loading) return
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const kinds = new Set<GateKind>(returnedNames.flatMap(gateKindsAffectedBy))
      if (kinds.size === 0) { if (alive) setCands([]); return }
      const [ko, re, fi, fr] = await Promise.all([
        kinds.has('koseki') ? supabase.from('koseki_requests').select('id, request_to, target_person, acquisition_authority, acquirer').eq('case_id', caseId).is('request_date', null) : Promise.resolve({ data: [] }),
        kinds.has('re') ? supabase.from('real_estate_acquisitions').select('id, target_municipality, item_types, item_type, scope, acquirer').eq('case_id', caseId).is('request_date', null) : Promise.resolve({ data: [] }),
        kinds.has('fin') ? supabase.from('financial_institutions').select('id, name, kind').eq('case_id', caseId) : Promise.resolve({ data: [] }),
        kinds.has('fin') ? supabase.from('financial_requests').select('institution_id, request_date').eq('case_id', caseId) : Promise.resolve({ data: [] }),
      ])
      const out: UnlockCandidate[] = []
      const byName = (s: string) => returnedNames.find(n => gateKindsAffectedBy(n).includes(s as GateKind)) ?? returnedNames[0] ?? ''
      const firstReturn = returns[0]
      // 戸籍：未請求で自社取得のもの
      for (const k of (ko.data ?? []) as Array<{ id: string; request_to: string | null; target_person: string | null; acquisition_authority: string | null; acquirer: string | null }>) {
        if (k.acquirer === '依頼者') continue
        const g = gateForKind('koseki', k.acquisition_authority === '職務上請求')
        if (!g.ok) continue
        const dest = (k.request_to ?? '').trim() || '請求先未定'
        const who = (k.target_person ?? '').trim() || '対象者未設定'
        out.push({ rid: `koseki:${k.id}`, kind: 'koseki', title: `戸籍請求：${dest}（${who}）`, work: `${who}の戸籍を${dest}へ請求する。戸籍請求タブのカードから請求書を作る`, gyomu: gyomuOfGateKind('koseki'), existing: null, byOriginal: byName('koseki'), receiptItemId: firstReturn.id })
      }
      // 不動産：役所への未請求（名寄帳・評価証明・非課税証明書）
      const munis = new Set<string>()
      for (const a of (re.data ?? []) as Array<{ id: string; target_municipality: string | null; item_types: string[] | null; item_type: string | null; scope: string | null; acquirer: string | null }>) {
        if (a.acquirer === '依頼者') continue
        const items = a.item_types && a.item_types.length > 0 ? a.item_types : (a.item_type ? [a.item_type] : [])
        const isMuni = a.scope === 'municipality' || items.some(x => x === '名寄帳' || x.includes('評価証明') || x.includes('非課税'))
        const m = (a.target_municipality ?? '').trim()
        if (!isMuni || !m || munis.has(m)) continue
        munis.add(m)
        const g = gateForKind('re')
        if (!g.ok) continue
        out.push({ rid: `re-muni:${m}`, kind: 're', title: `名寄帳・評価証明を請求：${m}`, work: `${m}役所へ名寄帳・評価証明を請求する。不動産タブのカードから申請書を作る`, gyomu: gyomuOfGateKind('re'), existing: null, byOriginal: byName('re'), receiptItemId: firstReturn.id })
      }
      // 金融：まだ請求（請求日あり）が無い調査先
      const requested = new Set(((fr.data ?? []) as Array<{ institution_id: string; request_date: string | null }>).filter(r => !!r.request_date).map(r => r.institution_id))
      for (const i of (fi.data ?? []) as Array<{ id: string; name: string; kind: string }>) {
        if (!(i.kind === '預金' || i.kind === '証券')) continue
        if (requested.has(i.id)) continue
        const g = gateForKind('fin')
        if (!g.ok) continue
        const name = i.name.trim()
        out.push({ rid: `fin:${name}`, kind: 'fin', title: `資料請求：${name}`, work: `${name}へ残高証明等を請求する。財産調査タブ（金融）の調査先から請求を登録する`, gyomu: gyomuOfGateKind('fin'), existing: null, byOriginal: byName('fin'), receiptItemId: firstReturn.id })
      }
      // 既にあるタスク
      if (out.length > 0) {
        const { data: ts } = await supabase.from('tasks').select('id, title, source_rid').eq('case_id', caseId).in('source_rid', out.map(c => c.rid)).neq('status', '完了')
        const have = new Map(((ts ?? []) as Array<{ id: string; title: string; source_rid: string }>).map(t => [t.source_rid, { id: t.id, title: t.title }]))
        for (const c of out) c.existing = have.get(c.rid) ?? null
      }
      if (!alive) return
      setCands(out)
      setOn(Object.fromEntries(out.filter(c => !c.existing).map(c => [c.rid, true])))
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loading, caseId, returnedNames.join('|'), deceasedName])

  useEffect(() => {
    if (!cands) return
    onChange(cands.filter(c => !c.existing && on[c.rid]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cands, on])

  if (!enabled) return null
  if (!cands) return <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[12px] text-emerald-800">原本が戻りました。請求できるようになった請求を確認しています…</div>
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 overflow-hidden">
      <div className="px-3 py-2 flex items-start gap-2 text-[12.5px] text-emerald-900">
        <CheckCircle2 className="w-4 h-4 flex-none mt-0.5 text-emerald-600" />
        <span><b>{returnedNames.join('・') || '原本'}が戻りました。</b>{cands.length === 0 ? 'この原本を待っていた請求はありません。' : 'この原本で請求できるようになった請求があります。'}</span>
      </div>
      {cands.length > 0 && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {cands.map(c => (
            <label key={c.rid} className={`flex items-start gap-2.5 px-2.5 py-2 bg-white border ${c.existing ? 'border-gray-200' : on[c.rid] ? 'border-emerald-400' : 'border-gray-200'} ${c.existing ? '' : 'cursor-pointer'}`}>
              {c.existing
                ? <span className="w-4 h-4 mt-[2px] flex-none text-emerald-600"><CheckCircle2 className="w-4 h-4" /></span>
                : <input type="checkbox" checked={!!on[c.rid]} onChange={e => setOn(prev => ({ ...prev, [c.rid]: e.target.checked }))} className="w-4 h-4 accent-emerald-600 mt-[2px] flex-none" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-gray-800 truncate">{c.existing ? c.existing.title : c.title}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  <span className="inline-block px-1.5 rounded bg-gray-100 text-gray-500 mr-1.5">{c.gyomu}</span>
                  {c.existing ? '原本待ちだったタスク。原本が戻ったので着手OKになります（何もしなくてよい）' : 'タスクはまだ無い → 作ります（着手OK・理由「原本が戻った」）'}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
