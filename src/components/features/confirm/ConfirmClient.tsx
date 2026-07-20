'use client'

// 確認簿：作業者以外／管理担当が「発送✓・着✓・確定・承認・凍結確認」を横断で処理するメインページ。
// 実体は各業務レコードのビュー（新テーブルは作らない）。押すと業務タブと同じ列を更新する。
import { useEffect, useMemo, useState } from 'react'
import { Check, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useAuth, useIsManager } from '@/components/providers/AuthProvider'
import { ACQUISITION_ITEMS } from '@/lib/constants'
import Link from 'next/link'

export type ConfirmAction =
  | 'koseki_send' | 'koseki_recv' | 're_send' | 're_recv'
  | 're_confirm' | 'fin_confirm'
  | 'koseki_approve' | 're_acq_approve' | 're_prop_approve'
  | 'fin_freeze'

export type ConfirmItem = {
  key: string
  tab: 'request' | 'confirm' | 'approve' | 'freeze'
  action: ConfirmAction
  rowId: string
  caseId: string
  caseName: string
  caseNumber: string
  gyomu: '戸籍' | '不動産' | '金融'
  stamp: string | null       // 起票/更新の日時（ISO）
  target: string             // 請求先 / 対象
  content: string            // 内容（自動）
  amount: string | null      // 費用/金額の表示
  workerId: string | null    // 作業者（この人は押せない）
  workerName: string | null
  reviewer: 'jimu' | 'manager'
  // 依頼者（依頼→確認モデル。履歴＝confirm_events へ残す）
  requestedAt?: string | null
  requestedBy?: string | null
  requestedByName?: string | null
  // 承認のタスク生成に使う付帯情報
  meta?: {
    acquirer?: string | null
    request_to?: string | null
    target_person?: string | null
    item_type?: string | null
    target_municipality?: string | null
    target_property_id?: string | null
    municipality?: string | null
  }
}

type PropLite = { id: string; municipality: string | null; address: string | null }

const TABS: { key: ConfirmItem['tab']; label: string }[] = [
  { key: 'request', label: '請求（発送・着）' },
  { key: 'confirm', label: '評価・残高の確定' },
  { key: 'approve', label: '追加請求承認' },
  { key: 'freeze', label: '口座凍結確認' },
]

const GYOMU_CLS: Record<string, string> = {
  '戸籍': 'bg-sky-50 text-sky-700 border-sky-200',
  '不動産': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '金融': 'bg-amber-50 text-amber-700 border-amber-200',
}

const ACTION_LABEL: Record<ConfirmAction, string> = {
  koseki_send: '発送✓', koseki_recv: '着✓', re_send: '発送✓', re_recv: '着✓',
  re_confirm: '確定', fin_confirm: '確定',
  koseki_approve: '承認', re_acq_approve: '承認', re_prop_approve: '承認',
  fin_freeze: '確認',
}
const KIND_LABEL: Record<ConfirmAction, string> = {
  koseki_send: '発送前', koseki_recv: '着（受信）', re_send: '発送前', re_recv: '着（受信）',
  re_confirm: '評価額の確定', fin_confirm: '残高の確定',
  koseki_approve: '追加請求の承認', re_acq_approve: '追加取得資料の承認', re_prop_approve: '市区町村追加の承認',
  fin_freeze: '口座凍結確認',
}

const nowIso = () => new Date().toISOString()

// 各アクションの元テーブル（監査ログのスナップショット用）
const SOURCE_TABLE: Record<ConfirmAction, string> = {
  koseki_send: 'koseki_requests', koseki_recv: 'koseki_requests', koseki_approve: 'koseki_requests',
  re_send: 'real_estate_acquisitions', re_recv: 'real_estate_acquisitions', re_acq_approve: 'real_estate_acquisitions',
  re_confirm: 'real_estate_properties', re_prop_approve: 'real_estate_properties',
  fin_confirm: 'financial_assets', fin_freeze: 'financial_assets',
}
const amountToNumber = (s: string | null): number | null => {
  if (!s) return null
  const n = Number(s.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export default function ConfirmClient({ items: initialItems, properties }: { items: ConfirmItem[]; properties: PropLite[] }) {
  const supabase = createClient()
  const meId = useAuth()?.memberId ?? null
  const meName = useAuth()?.memberName ?? null
  const isManager = useIsManager()
  const [items, setItems] = useState<ConfirmItem[]>(initialItems)
  const [view, setView] = useState<'pending' | 'history'>('pending')
  const [tab, setTab] = useState<ConfirmItem['tab']>('request')
  const [mineOnly, setMineOnly] = useState(false)
  const [caseQuery, setCaseQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const propMuni = useMemo(() => new Map(properties.map(p => [p.id, (p.municipality ?? '').trim()])), [properties])

  // その項目を今のユーザーが押せるか。W-check=作業者以外（管理担当は例外）／確定=誰でも／承認・凍結=管理担当のみ。
  const canAct = (it: ConfirmItem): boolean => {
    if (it.reviewer === 'manager') return isManager
    // reviewer === 'jimu'（ピア）：作業者本人はNG（管理担当は例外）
    if (it.workerId && meId && it.workerId === meId && !isManager) return false
    return true
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { request: 0, confirm: 0, approve: 0, freeze: 0 }
    for (const it of items) c[it.tab] = (c[it.tab] ?? 0) + 1
    return c
  }, [items])

  const visible = useMemo(() => {
    const q = caseQuery.trim()
    return items.filter(it => it.tab === tab
      && (!mineOnly || canAct(it))
      && (!q || it.caseName.includes(q) || it.caseNumber.includes(q)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tab, mineOnly, caseQuery, meId, isManager])

  // 承認時のタスク生成（既存 KosekiSection / RealEstateSection と同じ source_rid・重複回避）。
  const genKosekiTasks = async (it: ConfirmItem) => {
    const dest = (it.meta?.request_to ?? '').trim() || '請求先未設定'
    const person = (it.meta?.target_person ?? '').trim()
    const label = `${dest}${person ? `（${person}）` : ''}`
    const isOwn = (it.meta?.acquirer ?? '自社') !== '依頼者'
    const plan: { source_rid: string; title: string; ext_data: Record<string, unknown> }[] = []
    if (isOwn) plan.push({ source_rid: `koseki:${it.rowId}`, title: `戸籍請求：${label}`, ext_data: { ready: true, ready_reason: '起点タスク（前提なし・すぐ着手可）' } })
    plan.push({ source_rid: `koseki-read:${it.rowId}`, title: `戸籍読込：${label}`, ext_data: { ready_on_receipt: true } })
    await insertTasks(it.caseId, plan, '戸籍', 90)
  }
  const genMuniTasks = async (caseId: string, muni: string, offices: ('muni' | 'houmu')[]) => {
    const plan: { source_rid: string; title: string; ext_data: Record<string, unknown> }[] = []
    if (offices.includes('muni')) {
      plan.push({ source_rid: `re-muni:${muni}`, title: `名寄帳・評価証明を請求：${muni}`, ext_data: { ready: true, ready_reason: '起点タスク（前提なし・すぐ着手可）' } })
      plan.push({ source_rid: `re-muni-read:${muni}`, title: `名寄帳・評価証明を読込：${muni}`, ext_data: { ready_on_receipt: true } })
    }
    if (offices.includes('houmu')) {
      plan.push({ source_rid: `re-houmu:${muni}`, title: `登記・公図・地積を請求：${muni}`, ext_data: { ready: true, ready_reason: '起点タスク（前提なし・すぐ着手可）' } })
      plan.push({ source_rid: `re-houmu-read:${muni}`, title: `登記・公図・地積を読込：${muni}`, ext_data: { ready_on_receipt: true } })
    }
    await insertTasks(caseId, plan, '不動産', 80)
  }
  const insertTasks = async (caseId: string, plan: { source_rid: string; title: string; ext_data: Record<string, unknown> }[], gyomu: string, base: number) => {
    if (plan.length === 0) return
    const { data: existing } = await supabase.from('tasks').select('source_rid').eq('case_id', caseId).in('source_rid', plan.map(p => p.source_rid))
    const have = new Set(((existing ?? []) as { source_rid: string }[]).map(x => x.source_rid))
    const rows = plan.filter(p => !have.has(p.source_rid)).map((p, i) => ({
      case_id: caseId, task_kind: 'case', title: p.title, phase: gyomu, category: gyomu,
      status: '着手前', priority: '通常', source_rid: p.source_rid, work_role: 'assistant', ext_data: p.ext_data, sort_order: base + i,
    }))
    if (rows.length > 0) await supabase.from('tasks').insert(rows)
  }

  const act = async (it: ConfirmItem) => {
    if (busy || !canAct(it)) return
    setBusy(it.key)
    try {
      const at = nowIso()
      switch (it.action) {
        case 'koseki_send':
          await upd('koseki_requests', it.rowId, { request_check_by: meId, request_check_at: at, request_check_name: meName }); break
        case 'koseki_recv':
          await upd('koseki_requests', it.rowId, { receipt_check_by: meId, receipt_check_at: at, receipt_check_name: meName }); break
        case 're_send':
          await upd('real_estate_acquisitions', it.rowId, { request_check_by: meId, request_check_at: at }); break
        case 're_recv':
          await upd('real_estate_acquisitions', it.rowId, { receipt_check_by: meId, receipt_check_at: at }); break
        case 're_confirm':
          await upd('real_estate_properties', it.rowId, { confirmed: true, confirmed_by: meId, confirmed_at: at }); break
        case 'fin_confirm':
          await upd('financial_assets', it.rowId, { balance_confirmed: true, balance_confirmed_by: meId, balance_confirmed_at: at }); break
        case 'fin_freeze':
          await upd('financial_assets', it.rowId, { freeze_confirmed: true, freeze_confirmed_by: meId, freeze_confirmed_at: at }); break
        case 'koseki_approve':
          await upd('koseki_requests', it.rowId, { additional_approved_by: meId, additional_approved_at: at })
          await genKosekiTasks(it); break
        case 're_acq_approve': {
          await upd('real_estate_acquisitions', it.rowId, { additional_approved_by: meId, additional_approved_at: at })
          const meta = ACQUISITION_ITEMS.find(i => i.key === it.meta?.item_type)
          if (meta && meta.method !== '参照') {
            const office: 'muni' | 'houmu' = meta.target === '物件' ? 'houmu' : 'muni'
            const muni = (it.meta?.target_municipality ?? '').trim() || (it.meta?.target_property_id ? (propMuni.get(it.meta.target_property_id) ?? '') : '')
            if (muni) await genMuniTasks(it.caseId, muni, [office])
          }
          break
        }
        case 're_prop_approve': {
          await upd('real_estate_properties', it.rowId, { additional_approved_by: meId, additional_approved_at: at })
          const muni = (it.meta?.municipality ?? '').trim()
          if (muni) await genMuniTasks(it.caseId, muni, ['muni', 'houmu'])
          break
        }
      }
      // 監査ログ（追記専用）。元行を後で変更・削除しても履歴は当時のまま残す。失敗しても確認自体は成立させる。
      const { error: logErr } = await supabase.from('confirm_events').insert({
        case_id: it.caseId, case_number: it.caseNumber, case_name: it.caseName,
        gyomu: it.gyomu, kind: KIND_LABEL[it.action], action: it.action,
        target: it.target, content: it.content, amount: amountToNumber(it.amount),
        requested_by: it.requestedBy ?? null, requested_by_name: it.requestedByName ?? null, requested_at: it.requestedAt ?? null,
        checked_by: meId, checked_by_name: meName, checked_at: at,
        source_table: SOURCE_TABLE[it.action], source_row_id: it.rowId,
      })
      if (logErr) console.warn('confirm_events 記録に失敗:', logErr.message)
      setItems(prev => prev.filter(x => x.key !== it.key))
      showToast(`${ACTION_LABEL[it.action]}しました`, 'success')
    } catch (e) {
      showToast(`処理に失敗しました: ${e instanceof Error ? e.message : ''}`, 'error')
    } finally {
      setBusy(null)
    }
  }
  const upd = async (table: string, id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from(table).update(patch).eq('id', id)
    if (error) throw new Error(error.message)
  }

  // 業務ごとにグルーピング（請求タブのみ。他タブはフラット）。
  const grouped = useMemo(() => {
    const g: Record<string, ConfirmItem[]> = {}
    for (const it of visible) (g[it.gyomu] ??= []).push(it)
    return g
  }, [visible])

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <h1 className="text-lg font-bold text-gray-900">確認簿</h1>
        {view === 'pending'
          ? <span className="text-[12px] text-gray-500">全案件・未処理 {items.length}件</span>
          : <span className="text-[12px] text-gray-500">確認済みの記録を検索</span>}
        {/* 未処理／履歴 の切替 */}
        <div className="ml-auto inline-flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {(['pending', 'history'] as const).map(v => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`text-[12px] px-3 py-1 rounded-md transition-colors ${view === v ? 'bg-white text-gray-900 font-semibold border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
              {v === 'pending' ? '未処理' : '履歴'}
            </button>
          ))}
        </div>
      </div>

      {view === 'history' ? (
        <HistoryView />
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-600">
              <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} className="w-4 h-4 accent-brand-600" />自分が押せるものだけ
            </label>
            <input type="text" value={caseQuery} onChange={e => setCaseQuery(e.target.value)} placeholder="案件名・番号で絞込" className="ml-auto w-48 px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none focus:border-brand-500" />
          </div>

          <div className="flex gap-1.5 flex-wrap mb-4">
            {TABS.map(t => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`text-[12px] px-3 py-1.5 rounded-full border transition-colors ${tab === t.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {t.label}<span className="ml-1.5 opacity-70">{counts[t.key] ?? 0}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="text-center text-[13px] text-gray-400 py-16 border border-dashed border-gray-200 rounded-lg">未処理はありません</div>
          ) : tab === 'request' ? (
            <div className="space-y-4">
              {(['戸籍', '不動産', '金融'] as const).filter(g => (grouped[g] ?? []).length > 0).map(g => (
                <GyomuSection key={g} gyomu={g} rows={grouped[g]} busy={busy} canAct={canAct} onAct={act} />
              ))}
            </div>
          ) : (
            <FlatTable rows={visible} busy={busy} canAct={canAct} onAct={act} />
          )}
        </>
      )}
    </div>
  )
}

// ── 履歴（確認済みの監査ログ）───────────────────────────────
type ConfirmEvent = {
  id: string; checked_at: string | null; gyomu: string | null; kind: string | null
  case_name: string | null; case_number: string | null; target: string | null; content: string | null
  amount: number | null; requested_by_name: string | null; requested_at: string | null; checked_by_name: string | null
}
const fmtDate = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const fmtDay = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }

function HistoryView() {
  const supabase = createClient()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [checker, setChecker] = useState('')
  const [requester, setRequester] = useState('')
  const [caseQ, setCaseQ] = useState('')
  const [gyomuSel, setGyomuSel] = useState<Set<string>>(new Set())
  const [kind, setKind] = useState('')
  const [rows, setRows] = useState<ConfirmEvent[]>([])
  const [loading, setLoading] = useState(true)

  const gyomuKey = [...gyomuSel].sort().join(',')
  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      let q = supabase.from('confirm_events').select('id,checked_at,gyomu,kind,case_name,case_number,target,content,amount,requested_by_name,requested_at,checked_by_name').order('checked_at', { ascending: false }).limit(500)
      if (from) q = q.gte('checked_at', from)
      if (to) q = q.lte('checked_at', `${to}T23:59:59`)
      if (gyomuKey) q = q.in('gyomu', gyomuKey.split(','))
      if (kind) q = q.eq('kind', kind)
      const { data } = await q
      if (alive) { setRows((data ?? []) as ConfirmEvent[]); setLoading(false) }
    })()
    return () => { alive = false }
  }, [from, to, gyomuKey, kind, supabase])

  // 確認者・依頼者・案件はクライアント側で絞込（打鍵ごとの再取得を避ける）
  const filtered = useMemo(() => rows.filter(r =>
    (!checker || (r.checked_by_name ?? '').includes(checker)) &&
    (!requester || (r.requested_by_name ?? '').includes(requester)) &&
    (!caseQ || (r.case_name ?? '').includes(caseQ) || (r.case_number ?? '').includes(caseQ))
  ), [rows, checker, requester, caseQ])
  const kindOptions = useMemo(() => [...new Set(rows.map(r => r.kind).filter((k): k is string => !!k))], [rows])

  const csv = () => {
    const head = ['確認日時', '業務', '案件番号', '案件', '対象', '内容', '種類', '金額', '依頼者', '依頼日', '確認者']
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = filtered.map(r => [fmtDate(r.checked_at), r.gyomu ?? '', r.case_number ?? '', r.case_name ?? '', r.target ?? '', r.content ?? '', r.kind ?? '', r.amount != null ? String(r.amount) : '', r.requested_by_name ?? '', fmtDay(r.requested_at), r.checked_by_name ?? ''].map(x => esc(String(x))).join(','))
    const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '確認履歴.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div>
            <div className="text-[11px] text-gray-500 mb-1">期間（確認日）</div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="flex-1 px-2 py-1.5 text-[12px] border border-gray-200 rounded outline-none focus:border-brand-500" />
              <span className="text-gray-400 text-[12px]">〜</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className="flex-1 px-2 py-1.5 text-[12px] border border-gray-200 rounded outline-none focus:border-brand-500" />
            </div>
          </div>
          <div><div className="text-[11px] text-gray-500 mb-1">確認者</div><input type="text" value={checker} onChange={e => setChecker(e.target.value)} placeholder="名前で絞込" className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded outline-none focus:border-brand-500" /></div>
          <div><div className="text-[11px] text-gray-500 mb-1">依頼者</div><input type="text" value={requester} onChange={e => setRequester(e.target.value)} placeholder="名前で絞込" className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded outline-none focus:border-brand-500" /></div>
          <div><div className="text-[11px] text-gray-500 mb-1">案件名・番号</div><input type="text" value={caseQ} onChange={e => setCaseQ(e.target.value)} placeholder="案件名・番号" className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded outline-none focus:border-brand-500" /></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <span className="text-[11px] text-gray-500">業務</span>
          {(['戸籍', '不動産', '金融'] as const).map(g => {
            const on = gyomuSel.has(g)
            return <button key={g} type="button" onClick={() => setGyomuSel(prev => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n })}
              className={`text-[11.5px] px-2.5 py-0.5 rounded-full border ${on ? GYOMU_CLS[g] : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{g}</button>
          })}
          <span className="w-px h-4 bg-gray-200 mx-1" />
          <span className="text-[11px] text-gray-500">種類</span>
          <select value={kind} onChange={e => setKind(e.target.value)} className="px-2 py-1 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
            <option value="">すべて</option>
            {kindOptions.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <button type="button" onClick={csv} className="ml-auto inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"><Download className="w-3.5 h-3.5" />CSV出力</button>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-2 px-1">
        <span className="text-[12px] text-gray-500">該当 <span className="text-gray-800 font-semibold">{filtered.length}</span> 件</span>
        <span className="text-[11px] text-gray-400">確認日の新しい順{rows.length >= 500 ? '・最新500件' : ''}</span>
      </div>

      {loading ? (
        <div className="text-center text-[13px] text-gray-400 py-16">読み込み中…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-[13px] text-gray-400 py-16 border border-dashed border-gray-200 rounded-lg">記録がありません</div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 820 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[10.5px] text-gray-500">
                <th className="px-2.5 py-2 text-left font-semibold w-28">確認日時</th>
                <th className="px-2.5 py-2 text-left font-semibold w-14">業務</th>
                <th className="px-2.5 py-2 text-left font-semibold w-28">案件</th>
                <th className="px-2.5 py-2 text-left font-semibold">対象 / 内容</th>
                <th className="px-2.5 py-2 text-left font-semibold w-24">種類</th>
                <th className="px-2.5 py-2 text-right font-semibold w-28">金額</th>
                <th className="px-2.5 py-2 text-left font-semibold w-32">依頼 → 確認</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-2.5 py-2 text-gray-500 text-[11px] whitespace-nowrap">{fmtDate(r.checked_at)}</td>
                  <td className="px-2.5 py-2">{r.gyomu && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${GYOMU_CLS[r.gyomu] ?? ''}`}>{r.gyomu}</span>}</td>
                  <td className="px-2.5 py-2"><div className="font-medium text-gray-800">{r.case_name || '—'}</div><div className="text-[10px] text-gray-400 font-mono">{r.case_number}</div></td>
                  <td className="px-2.5 py-2"><div className="text-gray-800">{r.target || '—'}</div><div className="text-[11px] text-gray-500">{r.content}</div></td>
                  <td className="px-2.5 py-2 text-gray-600">{r.kind}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-gray-700">{r.amount != null ? `¥${Math.round(r.amount).toLocaleString('ja-JP')}` : '—'}</td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-1 text-[11px] text-gray-500">{r.requested_by_name || '—'}{r.requested_at && <span className="text-[9px] text-gray-400">{fmtDay(r.requested_at)}</span>}</div>
                    <div className="flex items-center gap-1 mt-0.5"><Check className="w-3 h-3 text-emerald-600" strokeWidth={2.5} /><span className="font-medium text-gray-800">{r.checked_by_name || '—'}</span></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GyomuSection({ gyomu, rows, busy, canAct, onAct }: { gyomu: string; rows: ConfirmItem[]; busy: string | null; canAct: (it: ConfirmItem) => boolean; onAct: (it: ConfirmItem) => void }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${GYOMU_CLS[gyomu]}`}>{gyomu}</span>
        <span className="text-[11px] text-gray-400">{rows.length}件</span>
      </div>
      <ItemTable rows={rows} busy={busy} canAct={canAct} onAct={onAct} />
    </div>
  )
}

function FlatTable({ rows, busy, canAct, onAct }: { rows: ConfirmItem[]; busy: string | null; canAct: (it: ConfirmItem) => boolean; onAct: (it: ConfirmItem) => void }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <ItemTable rows={rows} busy={busy} canAct={canAct} onAct={onAct} showGyomu />
    </div>
  )
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function ItemTable({ rows, busy, canAct, onAct, showGyomu = false }: { rows: ConfirmItem[]; busy: string | null; canAct: (it: ConfirmItem) => boolean; onAct: (it: ConfirmItem) => void; showGyomu?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 820 }}>
        <thead>
          <tr className="bg-white border-b border-gray-200 text-[10.5px] text-gray-500">
            <th className="px-2.5 py-2 text-left font-semibold w-24">起票</th>
            {showGyomu && <th className="px-2.5 py-2 text-left font-semibold w-16">業務</th>}
            <th className="px-2.5 py-2 text-left font-semibold w-28">案件</th>
            <th className="px-2.5 py-2 text-left font-semibold">対象 / 内容</th>
            <th className="px-2.5 py-2 text-left font-semibold w-24">種類</th>
            <th className="px-2.5 py-2 text-right font-semibold w-32">費用/金額</th>
            <th className="px-2.5 py-2 text-left font-semibold w-20">作業者</th>
            <th className="px-2.5 py-2 text-left font-semibold w-20">確認者</th>
            <th className="px-2.5 py-2 w-24" />
          </tr>
        </thead>
        <tbody>
          {rows.map((it, i) => {
            const enabled = canAct(it)
            return (
              <tr key={it.key} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-2.5 py-2 text-gray-400 text-[11px]">{fmt(it.stamp)}</td>
                {showGyomu && <td className="px-2.5 py-2"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${GYOMU_CLS[it.gyomu]}`}>{it.gyomu}</span></td>}
                <td className="px-2.5 py-2">
                  <Link href={`/cases/${it.caseId}`} className="font-medium text-gray-800 hover:text-brand-700 hover:underline">{it.caseName || '—'}</Link>
                  <div className="text-[10px] text-gray-400 font-mono">{it.caseNumber}</div>
                </td>
                <td className="px-2.5 py-2">
                  <div className="font-medium text-gray-800">{it.target || '—'}</div>
                  <div className="text-[11px] text-gray-500">{it.content}</div>
                </td>
                <td className="px-2.5 py-2 text-gray-600">{KIND_LABEL[it.action]}</td>
                <td className="px-2.5 py-2 text-right tabular-nums text-gray-700">{it.amount ?? '—'}</td>
                <td className="px-2.5 py-2 text-gray-600">{it.workerName || '—'}</td>
                <td className="px-2.5 py-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${it.reviewer === 'manager' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}`}>
                    {it.reviewer === 'manager' ? '管理担当' : '事務管理'}
                  </span>
                </td>
                <td className="px-2.5 py-2 text-right">
                  <button type="button" onClick={() => onAct(it)} disabled={!enabled || busy === it.key}
                    title={enabled ? '' : (it.reviewer === 'manager' ? '管理担当のみ' : '自分の作業は確認できません')}
                    className="inline-flex items-center px-3 py-1.5 rounded-md text-[11.5px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed">
                    {busy === it.key ? '…' : ACTION_LABEL[it.action]}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
