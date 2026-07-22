'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { REGISTRATION_TYPES, REGISTRATION_CAUSES, REGISTRATION_STATUSES } from '@/lib/constants'
import { Section } from '@/components/ui/InlineFields'
import HintTip from '@/components/ui/HintTip'
import ContractReceivedDocs from './ContractReceivedDocs'
import TabHeader from './TabHeader'
import { WorkContentField } from './WorkContentField'
import RegistrationSection from './RegistrationSection'
import type { CaseRow, RealEstatePropertyRow, ContractDocumentRow, HeirRow } from '@/types'

type Props = {
  caseData: CaseRow
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  // 契約残手続きの書類（区分=登記 を「契約時受領」として表示）
  contractDocuments?: ContractDocumentRow[]
  /** オーダーシート埋め込み時は TabHeader を出さない */
  orderSheetMode?: boolean
}

/**
 * 相続登記タブ
 * 財産調査の不動産を物件ごとにプリセット表示し、物件単位で相続登記の手続き
 * （種別[複数]・登記原因・管轄法務局・ステータス・申請日・完了日・備考）を管理する。
 * 登記情報等の取得進捗は財産調査タブの不動産側で管理する。
 * 不動産の追加・削除は財産調査タブで行う。
 */
export default function RegistrationTab({ caseData, properties, onRefresh, contractDocuments = [], orderSheetMode = false }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<RealEstatePropertyRow[]>(properties)
  useEffect(() => { setRows(properties) }, [properties])
  // 取得者selectは案件の相続人から選ぶ。相続人情報が変わったら即反映されるようEffectで取得。
  const [heirs, setHeirs] = useState<HeirRow[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('heirs').select('*').eq('case_id', caseData.id).order('sort_order')
      if (!cancelled) setHeirs((data ?? []) as HeirRow[])
    })()
    return () => { cancelled = true }
  }, [caseData.id, supabase])
  // 管轄法務局の予測候補：この案件で既に入力済みの法務局。市区町村単位で管轄が同じなので使い回せる。
  const officeSuggestions = [...new Set(rows.map(r => (r.registration_office ?? '').trim()).filter(Boolean))]

  const saveField = async (id: string, field: keyof RealEstatePropertyRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstatePropertyRow : r)))
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  // 案件詳細（実務）：市区町村単位の左レール＋カード（空でもTOPを表示）
  if (!orderSheetMode) {
    return (
      <div className="space-y-3.5">
        <TabHeader title="相続登記" description="物件ごとに、登記の種類・管轄の法務局・申請日・登録免許税を記録します。" />
        <div className="rounded-lg border border-gray-200 bg-white px-3.5 py-3">
          <WorkContentField caseData={caseData} gyomu="registration" patchCase={patchCase} label="作業内容（フリー・オーダーシートと共有）" collapsible />
        </div>
        <RegistrationSection caseId={caseData.id} properties={properties} onRefresh={onRefresh} />
        <ContractReceivedDocs documents={contractDocuments} category="登記" title="契約時にお客様から受領した登記関係書類" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-3.5">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-10 text-center text-[13px] text-gray-400">
          財産調査タブで不動産を登録すると、ここで物件ごとの相続登記手続きを管理できます。
        </div>
        <ContractReceivedDocs documents={contractDocuments} category="登記" title="契約時にお客様から受領した登記関係書類" />
      </div>
    )
  }

  return (
    <div className="space-y-3.5">
      <Section title="相続登記（物件ごとの手続き）">
      {/* PC(sm以上)は表・スマホはカード。 */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 1580 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2.5 py-2 text-left font-semibold w-24">物件種別</th>
              <th className="px-2.5 py-2 text-left font-semibold w-48">所在地</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">取得者</th>
              <th className="px-2.5 py-2 text-left font-semibold w-52">持分</th>
              <th className="px-2.5 py-2 text-left font-semibold w-56">相続登記の種別</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32">登記原因</th>
              <th className="px-2.5 py-2 text-left font-semibold w-40">管轄法務局</th>
              <th className="px-2.5 py-2 text-right font-semibold w-36">
                <span className="inline-flex items-center gap-1 justify-end">登録免許税<HintTip text="相続の登録免許税＝固定資産評価額×0.4%（例: ¥55,000,000×0.4%＝¥220,000）。財産調査タブの評価額から自動計算します。手動で上書きも可。※免税措置あり（100万円以下の土地等）。" /></span>
              </th>
              {!orderSheetMode && <th className="px-2.5 py-2 text-left font-semibold w-32">ステータス</th>}
              {!orderSheetMode && <th className="px-2.5 py-2 text-left font-semibold w-32">申請日</th>}
              {!orderSheetMode && <th className="px-2.5 py-2 text-left font-semibold w-32">完了日</th>}
              <th className="px-2.5 py-2 text-left font-semibold w-40">備考</th>
              {!orderSheetMode && <th className="px-2.5 py-2 text-left font-semibold w-56">備考・結果</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-2.5 py-2 text-gray-700">{r.property_type || <span className="text-gray-300">—</span>}</td>
                <td className="px-2.5 py-2 font-medium text-gray-800">{r.address || <span className="text-gray-300">—</span>}</td>
                <td className="px-2.5 py-1.5">
                  <select value={r.registration_acquirer ?? ''} onChange={e => saveField(r.id, 'registration_acquirer', e.target.value || null)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                    <option value="">— 選択 —</option>
                    {heirs.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                    {r.registration_acquirer && !heirs.some(h => h.name === r.registration_acquirer) && (
                      <option value={r.registration_acquirer}>{r.registration_acquirer}（案件外）</option>
                    )}
                  </select>
                </td>
                <td className="px-2.5 py-1.5"><ShareCell value={r.registration_share} onSave={v => saveField(r.id, 'registration_share', v || null)} /></td>
                <td className="px-2.5 py-1.5">
                  <MultiSelectCell value={r.registration_types ?? []} options={REGISTRATION_TYPES} onSave={v => saveField(r.id, 'registration_types', v.length ? v : null)} />
                </td>
                <td className="px-2.5 py-1.5">
                  <select value={r.registration_cause ?? ''} onChange={e => saveField(r.id, 'registration_cause', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                    <option value="">—</option>
                    {REGISTRATION_CAUSES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-2.5 py-1.5"><CustomCell value={r.registration_office ?? ''} onCommit={v => saveField(r.id, 'registration_office', v || null)} placeholder="例: 東京法務局 世田谷出張所" suggestions={officeSuggestions} /></td>
                <td className="px-2.5 py-1.5"><TaxCell appraisal={r.appraisal_value} value={r.registration_cost} onSave={v => saveField(r.id, 'registration_cost', v)} /></td>
                {!orderSheetMode && (
                  <td className="px-2.5 py-1.5">
                    <select value={r.registration_status ?? ''} onChange={e => saveField(r.id, 'registration_status', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                      <option value="">—</option>
                      {REGISTRATION_STATUSES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                )}
                {!orderSheetMode && <td className="px-2.5 py-1.5"><input type="date" defaultValue={r.registration_apply_date ?? ''} onBlur={e => { if (e.target.value !== (r.registration_apply_date ?? '')) saveField(r.id, 'registration_apply_date', e.target.value || null) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></td>}
                {!orderSheetMode && <td className="px-2.5 py-1.5"><input type="date" defaultValue={r.registration_complete_date ?? ''} onBlur={e => { if (e.target.value !== (r.registration_complete_date ?? '')) saveField(r.id, 'registration_complete_date', e.target.value || null) }} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></td>}
                <td className="px-2.5 py-1.5"><CustomCell value={r.registration_notes ?? ''} onCommit={v => saveField(r.id, 'registration_notes', v || null)} placeholder="特記事項" /></td>
                {!orderSheetMode && <td className="px-2.5 py-1.5"><CustomCell value={r.registration_result ?? ''} onCommit={v => saveField(r.id, 'registration_result', v || null)} placeholder="この登記で分かったこと・結果" /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* カード表示（1物件＝1カード）。スマホのみ（PCは上の表）。 */}
      <div className="sm:hidden space-y-2.5">
        {rows.map(r => (
          <RegCard key={r.id} r={r} heirs={heirs} officeSuggestions={officeSuggestions} saveField={saveField} />
        ))}
      </div>

      <p className="mt-2 text-[11px] text-gray-400">
        物件は財産調査タブの不動産から自動表示されます。登記情報・公図等の取得進捗は財産調査タブで管理します。
        登録免許税は評価額×0.4%で自動計算されます（手動上書き可）。
      </p>
      </Section>
      <ContractReceivedDocs documents={contractDocuments} category="登記" title="契約時にお客様から受領した登記関係書類" />
    </div>
  )
}

// スマホ用：相続登記 1物件＝1カード（オーダーシート用の列のみ）
function RegCard({ r, heirs, officeSuggestions, saveField }: {
  r: RealEstatePropertyRow
  heirs: HeirRow[]
  officeSuggestions: string[]
  saveField: (id: string, field: keyof RealEstatePropertyRow, value: unknown) => Promise<void>
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white">
      <div className="mb-2.5">
        <div className="text-[14px] font-semibold text-gray-900">{r.address || '所在地 未入力'}</div>
        <div className="text-[11px] text-gray-400">{r.property_type || '種別未設定'}</div>
      </div>
      <div className="space-y-2.5">
        <div><div className="text-[13px] font-medium text-slate-600 mb-1">取得者</div>
          <select value={r.registration_acquirer ?? ''} onChange={e => saveField(r.id, 'registration_acquirer', e.target.value || null)} className="w-full h-12 px-3 text-[15px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-500">
            <option value="">— 選択 —</option>
            {heirs.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
          </select>
        </div>
        <div><div className="text-[13px] font-medium text-slate-600 mb-1">持分</div>
          <ShareCell value={r.registration_share} onSave={v => saveField(r.id, 'registration_share', v || null)} />
        </div>
        <div><div className="text-[13px] font-medium text-slate-600 mb-1">相続登記の種別</div>
          <MultiSelectCell value={r.registration_types ?? []} options={REGISTRATION_TYPES} onSave={v => saveField(r.id, 'registration_types', v.length ? v : null)} />
        </div>
        <div><div className="text-[13px] font-medium text-slate-600 mb-1">登記原因</div>
          <select value={r.registration_cause ?? ''} onChange={e => saveField(r.id, 'registration_cause', e.target.value)} className="w-full h-12 px-3 text-[15px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-500">
            <option value="">—</option>
            {REGISTRATION_CAUSES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div><div className="text-[13px] font-medium text-slate-600 mb-1">管轄法務局</div>
          <CustomCell value={r.registration_office ?? ''} onCommit={v => saveField(r.id, 'registration_office', v || null)} placeholder="例: 東京法務局 世田谷出張所" suggestions={officeSuggestions} />
        </div>
        <div><div className="text-[13px] font-medium text-slate-600 mb-1 inline-flex items-center gap-1">登録免許税<HintTip text="相続の登録免許税＝固定資産評価額×0.4%（例: ¥55,000,000×0.4%＝¥220,000）。手動で上書きも可。" /></div>
          <TaxCell appraisal={r.appraisal_value} value={r.registration_cost} onSave={v => saveField(r.id, 'registration_cost', v)} />
        </div>
        <div><div className="text-[13px] font-medium text-slate-600 mb-1">備考</div>
          <CustomCell value={r.registration_notes ?? ''} onCommit={v => saveField(r.id, 'registration_notes', v || null)} placeholder="特記事項" />
        </div>
      </div>
    </div>
  )
}

// 持分入力（A案）：よくある持分をクイックチップで1タップ、他は自由入力（「3/7」形式）。
// 保存形式：'全部' or '1/2' 等の文字列（既存 registration_share と互換）。
function ShareCell({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const presets = ['全部', '1/2', '1/3', '1/4', '2/3'] as const
  const cur = (value ?? '').trim()
  const isPreset = (presets as readonly string[]).includes(cur)
  const [custom, setCustom] = useState(cur && !isPreset ? cur : '')
  useEffect(() => { setCustom(cur && !(presets as readonly string[]).includes(cur) ? cur : '') }, [cur])
  const chipCls = (on: boolean) => `px-1.5 py-0.5 rounded text-[10.5px] font-medium border transition-colors ${
    on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'
  }`
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {presets.map(p => (
        <button key={p} type="button" onClick={() => { setCustom(''); onSave(cur === p ? '' : p) }} className={chipCls(cur === p)}>{p}</button>
      ))}
      <input type="text" value={custom} onChange={e => setCustom(e.target.value)}
        onBlur={() => { const v = custom.trim(); if (v && v !== cur) onSave(v) }}
        placeholder="他 例:3/7"
        className={`w-14 px-1 py-1 text-[10.5px] text-center border rounded outline-none focus:border-brand-500 ${custom.trim() && !isPreset ? 'bg-white border-brand-400' : 'bg-gray-50 border-gray-200'}`} />
    </div>
  )
}

// 登録免許税セル：評価額×0.4%を自動計算値として提示（薄いプレースホルダ）、実値が入っていればそれを表示。
// 手動上書き可。空欄blurで null に戻す。
function TaxCell({ appraisal, value, onSave }: { appraisal: number | null; value: number | null; onSave: (v: number | null) => void }) {
  const auto = appraisal != null ? Math.floor(appraisal * 0.004) : null
  const [text, setText] = useState<string>(value != null ? String(value) : '')
  useEffect(() => { setText(value != null ? String(value) : '') }, [value])
  const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`
  const commit = () => {
    const t = text.replace(/[^0-9]/g, '').trim()
    if (t === '') { if (value != null) onSave(null); return }
    const n = Number(t)
    if (n !== value) onSave(n)
  }
  const useAuto = () => { if (auto != null) { setText(String(auto)); onSave(auto) } }
  const hasValue = value != null
  return (
    <div className="flex items-center gap-1 justify-end">
      <input type="text" inputMode="numeric" value={text} onChange={e => setText(e.target.value)} onBlur={commit}
        placeholder={auto != null ? String(auto) : '0'}
        className={`w-24 px-1.5 py-1 text-[12px] text-right border rounded outline-none focus:border-brand-500 ${hasValue ? 'bg-white border-gray-200' : 'bg-amber-50/60 border-amber-200'}`}
        title={hasValue ? yen(value) : auto != null ? `自動計算値: ${yen(auto)}（評価額×0.4%）` : '評価額を入れると自動計算されます'} />
      {!hasValue && auto != null && (
        <button type="button" onClick={useAuto} className="text-[10px] px-1 py-0.5 rounded border border-amber-200 text-amber-800 hover:bg-amber-50 whitespace-nowrap" title={`自動計算値 ${yen(auto)} を確定値として反映`}>自動</button>
      )}
    </div>
  )
}

// 相続登記の種別（複数選択）。表の overflow 枠でクリップされないよう、
// チェックリストは body へポータルして固定配置で表示する。
function MultiSelectCell({ value, options, onSave }: { value: string[]; options: readonly string[]; onSave: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const openPanel = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onMove = () => setOpen(false)  // スクロール/リサイズで閉じる（位置ズレ防止）
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  const toggle = (o: string) => {
    onSave(value.includes(o) ? value.filter(x => x !== o) : [...value, o])
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : openPanel())} className="w-full flex items-center gap-1 px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white text-left hover:border-brand-400">
        <span className="flex-1 truncate">
          {value.length === 0 ? <span className="text-gray-300">— 選択 —</span> : value.join('、')}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 60 }} className="max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg p-1.5">
          {options.map(o => (
            <label key={o} className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 rounded cursor-pointer">
              <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} className="w-3.5 h-3.5 accent-brand-600" />
              {o}
            </label>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

function CustomCell({ value, onCommit, placeholder, suggestions }: { value: string; onCommit: (v: string) => void; placeholder?: string; suggestions?: string[] }) {
  const [v, setV] = useState(value)
  const [open, setOpen] = useState(false)
  useEffect(() => { setV(value) }, [value])
  const filtered = (suggestions ?? []).filter(s => s && (v.length === 0 || s.includes(v)) && s !== v)
  return (
    <div className="relative">
      <input
        type="text"
        value={v}
        onChange={e => setV(e.target.value)}
        onFocus={() => suggestions && suggestions.length > 0 && setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 150); if (v !== value) onCommit(v) }}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-0.5 max-h-40 overflow-y-auto bg-white border border-gray-200 rounded shadow-md">
          {filtered.map(s => (
            <button key={s} type="button" onMouseDown={() => { setV(s); onCommit(s); setOpen(false) }}
              className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-brand-50">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
