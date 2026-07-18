'use client'

// 不動産（実務タブ）：所在地（都道府県＋市区町村）単位でサブタブ化。
// TOP（一覧）＝各市区町村タブの物件を集計（確定済バッジ）。財産目録へ反映されるのは確定済のみ。
// 各市区町村タブ＝進捗サマリー／物件一覧（評価額・確定済）／取得資料①市区町村請求→②物件取得。

import { useState, useEffect, useRef } from 'react'
import { Plus, Check, Lock, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useIsManager, useAuth } from '@/components/providers/AuthProvider'
import { ACQUISITION_ITEMS } from '@/lib/constants'
import { LeftRail } from './LeftRail'
import { SectionHeading } from '@/components/ui/InlineFields'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import ProgressSummary from './ProgressSummary'
import RealEstateTable from './RealEstateTable'
import RealEstateAcquisitionsTable from './RealEstateAcquisitionsTable'
import RowTaskChip from '@/components/features/tasks/RowTaskChip'
import type { RealEstatePropertyRow, RealEstateAcquisitionRow, TaskRow, ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Props = {
  caseId: string
  properties: RealEstatePropertyRow[]
  acquisitions: RealEstateAcquisitionRow[]
  onRefresh?: () => void
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  contractDocs?: ContractDocumentRow[]
  focus?: string | null   // タスク詳細からの着地：市区町村名。該当市区町村タブを初期選択。
  focusOffice?: 'muni' | 'houmu' | null  // 着地元タスクの系統：①市区町村役場/②法務局。該当表を点滅。
}

const yen = (n: number | null) => (n == null ? '—' : `¥${n.toLocaleString('ja-JP')}`)
const collator = new Intl.Collator('ja')

// 市区町村キー：明示の municipality があればそれ、無ければ所在地から「都道府県＋市区町村」を抽出。
export function municipalityOf(p: { municipality: string | null; address: string | null }): string {
  const m = (p.municipality ?? '').trim()
  if (m) return m
  const a = (p.address ?? '').trim()
  const match = a.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)?(.+?[市区町村])/)
  return match ? `${match[1] ?? ''}${match[2]}` : ''
}

export default function RealEstateSection({ caseId, properties, acquisitions, onRefresh, receipts = [], tasks = [], contractDocs = [], focus, focusOffice }: Props) {
  const supabase = createClient()
  const [sub, setSub] = useState<string>(() => (focus && properties.some(p => municipalityOf(p) === focus)) ? focus : 'top')
  // タスク詳細から着地したとき、対象の表（①/②）を青枠点滅→点滅後も枠は残す。
  // 併せて対象の表を自動スクロールで画面中央へ（下までスクロールしても消えない）。
  const isFocusCard = (office: 'muni' | 'houmu') => !!focusOffice && focusOffice === office && !!focus && sub === focus
  const [flash, setFlash] = useState<boolean>(() => !!focusOffice && !!focus && sub === focus)
  const focusCardRef = useRef<HTMLDivElement | null>(null)
  const scrolledRef = useRef(false)
  useEffect(() => {
    if (flash) { const t = setTimeout(() => setFlash(false), 4500); return () => clearTimeout(t) }
  }, [flash])
  useEffect(() => {
    if (scrolledRef.current) return
    if (!focusOffice || !focus || sub !== focus || !focusCardRef.current) return
    scrolledRef.current = true
    const el = focusCardRef.current
    requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [focusOffice, focus, sub])
  // 点滅中は blink、点滅後も対象カードは steady 枠を残す。
  const flashCls = (office: 'muni' | 'houmu') => (isFocusCard(office) ? (flash ? ' task-focus-blink' : ' task-focus-steady') : '')
  // 市区町村を足した／取得資料を足したときの「タスク作成しますか？」ポップアップ対象。
  // offices = 提案する系統（muni=市区町村役場 / houmu=法務局）。
  const [taskPrompt, setTaskPrompt] = useState<{ muni: string; offices: ('muni' | 'houmu')[] } | null>(null)
  const [creatingTasks, setCreatingTasks] = useState(false)

  // source_rid が「prefix:muni」または「prefix:muni:資料」に一致するか（読込は資料単位で分割されるため後方も許容）。
  const ridHits = (rid: string | null, prefix: string, muni: string) => !!rid && (rid === `${prefix}:${muni}` || rid.startsWith(`${prefix}:${muni}:`))
  // その市区町村に不動産タスク（旧lump含む）が既にあるか。
  const hasMuniTasks = (muni: string) => tasks.some(x => ['re-muni', 're-muni-read', 're-houmu', 're-houmu-read', 're', 're-read'].some(p => ridHits(x.source_rid, p, muni)))
  // その市区町村の特定系統のタスクがあるか（muni=市区町村役場は旧lump re: もカバー扱い、houmu=法務局）。
  const hasOfficeTask = (muni: string, office: 'muni' | 'houmu') => {
    const prefixes = office === 'muni' ? ['re-muni', 're-muni-read', 're', 're-read'] : ['re-houmu', 're-houmu-read']
    return tasks.some(x => prefixes.some(p => ridHits(x.source_rid, p, muni)))
  }
  // 取得資料を足したとき、その系統のタスクが無ければポップアップで作成を促す。
  const promptIfMissing = (muni: string, office: 'muni' | 'houmu') => {
    if (!muni) return
    if (!hasOfficeTask(muni, office)) setTaskPrompt({ muni, offices: [office] })
  }

  // 選んだ系統のタスクを生成（既存はスキップ）。
  const createMuniTasks = async (muni: string, offices: ('muni' | 'houmu')[]) => {
    setCreatingTasks(true)
    const plan: { source_rid: string; title: string; ext_data: Record<string, unknown> }[] = []
    if (offices.includes('muni')) {
      plan.push({ source_rid: `re-muni:${muni}`, title: `名寄帳・評価証明を請求：${muni}`, ext_data: { ready: true, ready_reason: '起点タスク（前提なし・すぐ着手可）' } })
      plan.push({ source_rid: `re-muni-read:${muni}`, title: `名寄帳・評価証明を読込：${muni}`, ext_data: { ready_on_receipt: true } })
    }
    if (offices.includes('houmu')) {
      plan.push({ source_rid: `re-houmu:${muni}`, title: `登記・公図・地積を請求：${muni}`, ext_data: { ready: true, ready_reason: '起点タスク（前提なし・すぐ着手可）' } })
      plan.push({ source_rid: `re-houmu-read:${muni}`, title: `登記・公図・地積を読込：${muni}`, ext_data: { ready_on_receipt: true } })
    }
    const { data: existing } = await supabase.from('tasks').select('source_rid').eq('case_id', caseId).in('source_rid', plan.map(p => p.source_rid))
    const have = new Set(((existing ?? []) as { source_rid: string }[]).map(x => x.source_rid))
    const rows = plan.filter(p => !have.has(p.source_rid)).map((p, i) => ({
      case_id: caseId, task_kind: 'case', title: p.title, phase: '不動産', category: '不動産',
      status: '着手前', priority: '通常', source_rid: p.source_rid, work_role: 'assistant', ext_data: p.ext_data, sort_order: 80 + i,
    }))
    if (rows.length > 0) { const { error } = await supabase.from('tasks').insert(rows); if (error) showToast(`タスク生成に失敗: ${error.message}`, 'error'); else showToast(`${rows.length}件のタスクを作成しました`, 'success') }
    setCreatingTasks(false); setTaskPrompt(null); onRefresh?.()
  }

  // 追加取得資料の承認ゲート（migration 178。戸籍と同方式）。
  // 初期生成後（案件に不動産タスクがある状態）に事務が取得資料を足すと承認待ちになり、
  // 管理担当が承認したら、その資料の読込タスク（＋系統の請求タスクが無ければ）を作る。
  const isManager = useIsManager()
  const meId = useAuth()?.memberId ?? null
  const hasAnyReTask = tasks.some(t => { const r = t.source_rid ?? ''; return r.startsWith('re-') || r.startsWith('re:') })
  const additionsNeedApproval = !isManager && hasAnyReTask   // 事務が初期生成後に足す＝承認要
  const pendingAcqs = acquisitions.filter(a => a.is_additional && !a.additional_approved_at)
  // 承認待ちの市区町村追加（物件側フラグ）。承認したら名寄帳・登記のタスクを生成する。
  const pendingProps = properties.filter(p => p.is_additional && !p.additional_approved_at)
  const pendingMunis = [...new Set(pendingProps.map(p => municipalityOf(p)).filter(Boolean))].sort(collator.compare)
  // 取得資料の市区町村・系統を割り出す（承認時のタスク生成に使う）。読込は市区町村ごと1本。
  const acqTarget = (a: RealEstateAcquisitionRow): { muni: string; office: 'muni' | 'houmu' } | null => {
    const meta = ACQUISITION_ITEMS.find(i => i.key === a.item_type)
    if (!meta || meta.method === '参照') return null
    const office: 'muni' | 'houmu' = meta.target === '物件' ? 'houmu' : 'muni'
    let muni = (a.target_municipality ?? '').trim()
    if (!muni && a.target_property_id) { const p = properties.find(x => x.id === a.target_property_id); if (p) muni = municipalityOf(p) }
    return muni ? { muni, office } : null
  }
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const approveAdditional = async (a: RealEstateAcquisitionRow) => {
    setApprovingId(a.id)
    await supabase.from('real_estate_acquisitions').update({ additional_approved_by: meId, additional_approved_at: new Date().toISOString() }).eq('id', a.id)
    const t = acqTarget(a)
    if (t) {
      // その系統に請求・読込タスクが無ければ作る（読込は市区町村ごと1本。資料別の到着は実務タブの表で管理）。
      if (!hasOfficeTask(t.muni, t.office)) {
        await createMuniTasks(t.muni, [t.office])
      }
    }
    showToast('追加取得資料を承認しました', 'success')
    setApprovingId(null); onRefresh?.()
  }

  // 市区町村追加の承認：その市区町村の承認待ち物件を承認済みにし、名寄帳・登記のタスクを生成。
  const [approvingMuni, setApprovingMuni] = useState<string | null>(null)
  const approveMuni = async (muni: string) => {
    setApprovingMuni(muni)
    const ids = pendingProps.filter(p => municipalityOf(p) === muni).map(p => p.id)
    await supabase.from('real_estate_properties').update({ additional_approved_by: meId, additional_approved_at: new Date().toISOString() }).in('id', ids)
    await createMuniTasks(muni, ['muni', 'houmu'])
    setApprovingMuni(null); onRefresh?.()
  }

  // 追加請求（取得資料・市区町村）の承認依頼を管理担当へ通知（戸籍の追加請求と同じ仕組み）。
  const notifyManagersAdditional = async (title: string, body: string) => {
    const { data: mgrs } = await supabase.from('members').select('id').eq('primary_role', 'manager').eq('is_active', true)
    const rows = (mgrs ?? []).map(m => ({ member_id: (m as { id: string }).id, type: 'realestate_additional', case_id: caseId, title, body }))
    if (rows.length) await supabase.from('notifications').insert(rows)
  }

  // 管轄法務局（A案）：物件の registration_office を市区町村単位で読み書き。②の請求先・相続登記の提出先に使う。
  const houmuOfMuni = (muni: string) => (properties.filter(p => municipalityOf(p) === muni).find(p => (p.registration_office ?? '').trim())?.registration_office ?? '').trim()
  const setHoumuOfMuni = async (muni: string, val: string) => {
    const ids = properties.filter(p => municipalityOf(p) === muni).map(p => p.id)
    if (ids.length === 0) { showToast('先に物件を登録してください', 'error'); return }
    const { error } = await supabase.from('real_estate_properties').update({ registration_office: val || null }).in('id', ids)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }

  // 市区町村の一覧（空は「未設定」に集約）
  const munis = [...new Set(properties.map(p => municipalityOf(p)).filter(Boolean))].sort(collator.compare)
  const hasUnset = properties.some(p => !municipalityOf(p))

  const tabs = [
    { key: 'top', label: '一覧' },
    ...munis.map(m => ({ key: m, label: m })),
    ...(hasUnset ? [{ key: '__unset__', label: '市区町村 未設定' }] : []),
  ]
  // 受信済＝その市区町村の取得資料を受信簿で受領（acquisition.arrival_date）
  const propMuniById = new Map(properties.map(p => [p.id, municipalityOf(p)]))
  const muniReceived = (m: string) => acquisitions.some(a => !!a.arrival_date && (
    (a.target_municipality ?? '').trim() === m || (a.target_property_id != null && propMuniById.get(a.target_property_id) === m)
  ))
  const railItems = [
    { key: 'top', label: '一覧（TOP）' },
    ...munis.map(m => ({ key: m, label: m, received: muniReceived(m) })),
    ...(hasUnset ? [{ key: '__unset__', label: '市区町村 未設定', received: muniReceived('') }] : []),
  ]

  // 「＋市区町村」：名称を受け取り、その市区町村の空物件を1件作成 → タブが増える
  const addMunicipality = async () => {
    const name = window.prompt('追加する市区町村名（都道府県＋市区町村。例: 東京都墨田区）')?.trim()
    if (!name) return
    // 承認の目印は物件(is_additional)側に持たせる。取得資料の表＝立替実費の集計元なので、そこには行を作らない。
    const { error } = await supabase.from('real_estate_properties').insert({ case_id: caseId, municipality: name, is_additional: additionsNeedApproval })
    if (error) { showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    setSub(name)
    if (additionsNeedApproval) {
      // 事務が初期生成後に足す＝追加請求。承認待ちにし、管理担当へ通知（戸籍と同じ）。タスクは承認後に生成。
      await notifyManagersAdditional(`不動産の追加請求（${name}）の承認依頼`, `新しい市区町村「${name}」の追加です。承認すると名寄帳・登記のタスクを生成します。`)
      showToast(`「${name}」を追加しました（要承認・管理担当へ通知）`, 'success')
    } else if (!hasMuniTasks(name)) {
      // 管理担当（or 初期設定）はそのままタスク作成を促すポップアップ。
      setTaskPrompt({ muni: name, offices: ['muni', 'houmu'] })
    }
    onRefresh?.()
  }

  // グループ一括削除：その市区町村の物件と、それに紐づく取得資料をまとめて削除
  const deleteMunicipality = async (key: string) => {
    const muniKey = key === '__unset__' ? '' : key
    const targetProps = properties.filter(p => municipalityOf(p) === muniKey)
    const label = key === '__unset__' ? '市区町村 未設定' : key
    if (targetProps.length === 0) return
    if (!window.confirm(`「${label}」の物件${targetProps.length}件と、その取得資料をすべて削除します。よろしいですか？（オーダーシートからも消えます）`)) return
    const propIds = targetProps.map(p => p.id)
    // 取得資料（物件紐づき or 市区町村指定）→ 物件本体 の順で削除
    const acqIds = acquisitions.filter(a => (a.target_property_id != null && propIds.includes(a.target_property_id)) || (muniKey && (a.target_municipality ?? '').trim() === muniKey)).map(a => a.id)
    if (acqIds.length) { const { error } = await supabase.from('real_estate_acquisitions').delete().in('id', acqIds); if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return } }
    const { error } = await supabase.from('real_estate_properties').delete().in('id', propIds)
    if (error) { showToast(`削除に失敗: ${error.message}`, 'error'); return }
    if (sub === key) setSub('top')
    showToast(`「${label}」を削除しました`, 'success')
    onRefresh?.()
  }

  return (
    <div className="flex gap-3 items-start">
      <LeftRail items={railItems} active={sub} onChange={setSub} onDelete={deleteMunicipality} extra={
        <button type="button" onClick={addMunicipality} className="mt-1 text-left text-[11.5px] px-2.5 py-1.5 rounded-md border border-dashed border-gray-300 text-gray-500 hover:text-brand-700 hover:border-brand-300 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> 市区町村
        </button>
      } />
      <div className="flex-1 min-w-0 space-y-3.5">

      {/* 承認待ちの市区町村追加（案件全体）。管理担当が承認すると名寄帳・登記のタスクを生成。 */}
      {pendingMunis.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800 mb-2">
            <Lock className="w-3.5 h-3.5" />承認待ちの市区町村追加　{pendingMunis.length}件
          </div>
          <div className="space-y-2">
            {pendingMunis.map(m => (
              <div key={m} className="bg-white border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-gray-800">{m}</div>
                  <div className="text-[12px] text-gray-600 mt-0.5">承認すると名寄帳・登記のタスクを生成します。</div>
                </div>
                {isManager ? (
                  <button type="button" onClick={() => approveMuni(m)} disabled={approvingMuni === m} className="flex-none inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    <ShieldCheck className="w-3.5 h-3.5" />追加OK（承認）
                  </button>
                ) : (
                  <span className="flex-none text-[11px] text-amber-700 self-center">管理担当の承認待ち</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 承認待ちの追加取得資料（案件全体）。管理担当が承認すると読込タスクを生成。 */}
      {pendingAcqs.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800 mb-2">
            <Lock className="w-3.5 h-3.5" />承認待ちの追加取得資料　{pendingAcqs.length}件
          </div>
          <div className="space-y-2">
            {pendingAcqs.map(a => {
              const t = acqTarget(a)
              return (
                <div key={a.id} className="bg-white border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-gray-800">{a.item_type || '（取得物 未選択）'}{t ? ` ／ ${t.muni}` : ''}</div>
                    <div className="text-[12px] text-gray-600 mt-0.5">理由：{a.additional_reason || <span className="text-gray-400">（未記入）</span>}</div>
                  </div>
                  {isManager ? (
                    <button type="button" onClick={() => approveAdditional(a)} disabled={approvingId === a.id || !t} title={!t ? '取得物を選択すると承認できます' : ''} className="flex-none inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                      <ShieldCheck className="w-3.5 h-3.5" />追加OK（承認）
                    </button>
                  ) : (
                    <span className="flex-none text-[11px] text-amber-700 self-center">管理担当の承認待ち</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TOP（一覧）：確定済を集計した読み取り専用一覧 */}
      {sub === 'top' && (
        <div className="space-y-3.5">
          <div>
            <SectionHeading title="物件一覧（各市区町村タブの集計）" hint="財産目録へ反映されるのは「確定済」の物件のみです。評価額の入力・確定は各市区町村タブで行います。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse" style={{ minWidth: 760 }}>
                <thead>
                  <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                    <th className="px-2.5 py-2 text-left font-semibold w-40">市区町村</th>
                    <th className="px-2.5 py-2 text-left font-semibold w-28">物件種別</th>
                    <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
                    <th className="px-2.5 py-2 text-right font-semibold w-36">評価額</th>
                    <th className="px-2.5 py-2 text-center font-semibold w-24">確定済</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-gray-400">物件が登録されていません</td></tr>
                  ) : properties.map((p, i) => (
                    <tr key={p.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-2.5 py-2 text-gray-700">{municipalityOf(p) || <span className="text-gray-300">未設定</span>}</td>
                      <td className="px-2.5 py-2">{p.property_type || <span className="text-gray-300">—</span>}</td>
                      <td className="px-2.5 py-2 font-medium text-gray-800">{p.address || <span className="text-gray-300">—</span>}</td>
                      <td className="px-2.5 py-2 text-right">{yen(p.appraisal_value)}</td>
                      <td className="px-2.5 py-2 text-center">
                        {p.confirmed
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200"><Check className="w-3 h-3" strokeWidth={2.5} />確定済</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200"><Lock className="w-3 h-3" />未確定</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 市区町村タブ */}
      {tabs.filter(t => t.key !== 'top').map(t => {
        const muniKey = t.key === '__unset__' ? '' : t.key
        if (sub !== t.key) return null
        return (
          <div key={t.key} className="space-y-4">
            <ProgressSummary caseId={caseId} scopeKey={`asset_re_${muniKey || 'unset'}`} title={`進捗/結果（${t.label}）`} />
            {/* この市区町村の進め方（読込結果＝物件の洗い出し→登録→取得→評価の流れを明示） */}
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-[11.5px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="font-semibold text-gray-600 mr-1">この市区町村の進め方</span>
              {['① 役所へ請求（名寄帳）', '洗い出した物件を登録', '② 法務局へ請求（登記等）', '評価額を確定'].map((label, k) => (
                <span key={k} className="inline-flex items-center gap-2">
                  {k > 0 && <span className="text-gray-300">→</span>}
                  <span className="inline-flex items-center gap-1 text-gray-600"><span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold">{k + 1}</span>{label}</span>
                </span>
              ))}
            </div>
            {/* 作業順に並べる：① 請求（洗い出し）→ 物件を登録 → ② 請求（取得）。各表は枠付きカードで区切る。 */}
            <div ref={isFocusCard('muni') ? focusCardRef : undefined} className={`bg-white border border-gray-200 rounded-lg p-3.5${flashCls('muni')}`}>
              <SectionHeading title="① 市区町村役場へ請求（名寄帳・評価証明）" hint="不動産調査の起点。名寄帳でこの市区町村の物件を洗い出します（私道・持分も拾える）。評価証明・名寄帳は市区町村役場へ請求（市区町村単位）。小為替の費用（予算/返金/確定）を管理します。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              {(() => {
                const ts = tasks.filter(x => ['re-muni', 're-muni-read', 're', 're-read'].some(p => ridHits(x.source_rid, p, muniKey)))
                return ts.length > 0 ? <div className="flex items-center gap-2 flex-wrap mb-2.5"><span className="text-[11px] font-semibold text-brand-700">関連タスク</span>{ts.map(x => <RowTaskChip key={x.id} task={x} onRefresh={onRefresh} />)}</div> : null
              })()}
              <RealEstateAcquisitionsTable caseId={caseId} acquisitions={acquisitions} properties={properties} onRefresh={onRefresh} receipts={receipts} tasks={tasks} contractDocs={contractDocs} scope="municipality" municipalityFilter={muniKey} additionsNeedApproval={additionsNeedApproval} onAdditionalPending={() => notifyManagersAdditional('不動産の追加請求の承認依頼', `${muniKey}で取得資料が追加されました。承認するとタスクを生成します。`)} onAfterAddRow={() => promptIfMissing(muniKey, 'muni')} />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3.5">
              <SectionHeading title="物件一覧（①で洗い出した物件を登録／評価額を確定）" hint="①の名寄帳で見つかった物件をここに登録します。②の登記等が揃ったら評価額を入れて確定してください。財産目録へ反映されるのは確定済の物件のみです。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <RealEstateTable caseId={caseId} properties={properties} onRefresh={onRefresh} municipalityFilter={muniKey} showConfirmed />
            </div>
            <div ref={isFocusCard('houmu') ? focusCardRef : undefined} className={`bg-white border border-gray-200 rounded-lg p-3.5${flashCls('houmu')}`}>
              <SectionHeading title="② 法務局へ請求（登記情報・所有者事項・公図・地積測量図・路線価）" hint="流れ：①の名寄帳で物件を洗い出し→物件一覧に登録→ここ（法務局）で各物件の登記・公図・地積を取得。登記情報等は法務局へまとめて請求（請求・読込とも市区町村ごと1件。資料別の到着日は下の表で管理）。路線価は参照（請求や日付なし）です。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              {(() => {
                const ts = tasks.filter(x => ['re-houmu', 're-houmu-read'].some(p => ridHits(x.source_rid, p, muniKey)))
                return ts.length > 0 ? <div className="flex items-center gap-2 flex-wrap mb-2.5"><span className="text-[11px] font-semibold text-brand-700">関連タスク</span>{ts.map(x => <RowTaskChip key={x.id} task={x} onRefresh={onRefresh} />)}</div> : null
              })()}
              <div className="mb-2.5 flex items-center gap-2 flex-wrap text-[12px]">
                <span className="text-gray-500 font-medium">管轄法務局</span>
                <input key={houmuOfMuni(muniKey)} type="text" defaultValue={houmuOfMuni(muniKey)} onBlur={e => { const v = e.target.value.trim(); if (v !== houmuOfMuni(muniKey)) setHoumuOfMuni(muniKey, v) }} placeholder="例: 東京法務局 城東出張所" className="w-64 px-2 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
                <span className="text-[11px] text-gray-400">登記情報の請求先・相続登記の提出先に使います（この市区町村の物件に反映）</span>
              </div>
              <RealEstateAcquisitionsTable caseId={caseId} acquisitions={acquisitions} properties={properties} onRefresh={onRefresh} receipts={receipts} tasks={tasks} scope="property" municipalityFilter={muniKey} additionsNeedApproval={additionsNeedApproval} onAdditionalPending={() => notifyManagersAdditional('不動産の追加請求の承認依頼', `${muniKey}で取得資料が追加されました。承認するとタスクを生成します。`)} onAfterAddRow={() => promptIfMissing(muniKey, 'houmu')} />
            </div>
            <p className="text-[11px] text-gray-400">①②の確定費用は［請求］タブの「立替実費の取り込み」で案件全体に合算されます。</p>
          </div>
        )
      })}
      </div>

      {taskPrompt && (
        <Modal
          isOpen
          onClose={() => setTaskPrompt(null)}
          title={`${taskPrompt.muni} のタスクを作成しますか？`}
          maxWidth="max-w-md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setTaskPrompt(null)} disabled={creatingTasks}>あとで</Button>
              <Button variant="primary" onClick={() => createMuniTasks(taskPrompt.muni, taskPrompt.offices)} loading={creatingTasks}>作成する</Button>
            </>
          }
        >
          <div className="space-y-2.5 text-[13px] text-gray-700">
            <p>この市区町村の不動産調査タスクを作成します（各 請求＋読込）。既にあるものは作りません。</p>
            <div className="rounded-lg border border-gray-200 p-2.5 space-y-1.5">
              {taskPrompt.offices.includes('muni') && <div className="flex items-center gap-2"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">市区町村役場</span><span>名寄帳・評価証明を請求／読込</span></div>}
              {taskPrompt.offices.includes('houmu') && <div className="flex items-center gap-2"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">法務局</span><span>登記・公図・地積を請求／読込</span></div>}
            </div>
            <p className="text-[11.5px] text-gray-400">名寄帳で物件を洗い出してから、法務局で各物件の登記等を取得する流れです。</p>
          </div>
        </Modal>
      )}
    </div>
  )
}
