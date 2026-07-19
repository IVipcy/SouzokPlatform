'use client'

// 確認簿：作業者以外／管理担当が「発送✓・着✓・確定・承認・凍結確認」を横断で処理するメインページ。
// 実体は各業務レコードのビュー（新テーブルは作らない）。押すと業務タブと同じ列を更新する。
import { useMemo, useState } from 'react'
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

export default function ConfirmClient({ items: initialItems, properties }: { items: ConfirmItem[]; properties: PropLite[] }) {
  const supabase = createClient()
  const meId = useAuth()?.memberId ?? null
  const meName = useAuth()?.memberName ?? null
  const isManager = useIsManager()
  const [items, setItems] = useState<ConfirmItem[]>(initialItems)
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
        <span className="text-[12px] text-gray-500">全案件・未処理 {items.length}件</span>
        <label className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-gray-600">
          <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} className="w-4 h-4 accent-brand-600" />自分が押せるものだけ
        </label>
        <input type="text" value={caseQuery} onChange={e => setCaseQuery(e.target.value)} placeholder="案件名・番号で絞込" className="w-48 px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none focus:border-brand-500" />
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
