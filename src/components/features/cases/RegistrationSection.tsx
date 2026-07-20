'use client'

// 相続登記（実務）：市区町村単位の左レール＋カード。TOP＝物件別の登記状況。
// 物件は財産調査(real_estate_properties)を共有。確定費用＝登録免許税＋申請時ダブルチェック。

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useAuth } from '@/components/providers/AuthProvider'
import { SectionHeading } from '@/components/ui/InlineFields'
import { REGISTRATION_TYPES, REGISTRATION_CAUSES } from '@/lib/constants'
import ProgressSummary from './ProgressSummary'
import { LeftRail } from './LeftRail'
import { TxtCell, SelCell, DateCell, MoneyCell, DcCell } from './PracticeTableCells'
import { municipalityOf } from './RealEstateSection'
import type { RealEstatePropertyRow } from '@/types'

const collator = new Intl.Collator('ja')

export default function RegistrationSection({ caseId, properties, onRefresh }: {
  caseId: string
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
}) {
  const supabase = createClient()
  const authUser = useAuth()
  const me = authUser?.memberName ?? authUser?.email ?? '担当者'  // 申請時DBチェックの記録者
  const [sub, setSub] = useState('top')

  const munis = [...new Set(properties.map(p => municipalityOf(p)).filter(Boolean))].sort(collator.compare)
  const hasUnset = properties.some(p => !municipalityOf(p))

  const saveField = async (id: string, field: keyof RealEstatePropertyRow, value: unknown) => {
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }
  const saveMany = async (id: string, patch: Partial<RealEstatePropertyRow>) => {
    const { error } = await supabase.from('real_estate_properties').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }

  const muniProps = (m: string) => properties.filter(p => municipalityOf(p) === m)
  const items = [
    { key: 'top', label: '一覧（TOP）' },
    ...munis.map(m => ({ key: m, label: m })),
    ...(hasUnset ? [{ key: '__unset__', label: '市区町村 未設定' }] : []),
  ]
  const activeMuni = sub === '__unset__' ? '' : sub
  const costTotal = properties.reduce((s, p) => s + (p.registration_cost ?? 0), 0)
  // 管轄法務局の予測候補：この案件で入力済みの法務局（自由入力も可）。
  const officeListId = `reg-office-${caseId}`
  const officeOptions = [...new Set(properties.map(p => (p.registration_office ?? '').trim()).filter(Boolean))]

  return (
    <div className="flex gap-3 items-start">
      {officeOptions.length > 0 && <datalist id={officeListId}>{officeOptions.map(o => <option key={o} value={o} />)}</datalist>}
      <LeftRail items={items} active={sub} onChange={setSub} />
      <div className="flex-1 min-w-0">
        {sub === 'top' ? (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey="registration" title="進捗/結果（相続登記 全体）" />
            <div>
              <SectionHeading title="相続登記の状況" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse" style={{ minWidth: 760 }}>
                  <thead>
                    <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
                      <th className="px-2.5 py-2 text-left font-semibold w-36">市区町村</th>
                      <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
                      <th className="px-2.5 py-2 text-left font-semibold">進捗/メモ</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-20">申請日</th>
                      <th className="px-2.5 py-2 text-right font-semibold w-28">登録免許税</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">財産調査タブで不動産を登録すると、ここで相続登記を管理できます。</td></tr>
                    ) : properties.map((p, i) => (
                      <tr key={p.id} className={`border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-brand-50/30 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`} onClick={() => setSub(municipalityOf(p) || '__unset__')}>
                        <td className="px-2.5 py-2 text-gray-700">{municipalityOf(p) || <span className="text-gray-300">未設定</span>}</td>
                        <td className="px-2.5 py-2 font-medium text-gray-800">{p.address || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2.5 py-2 text-gray-500 text-[11px] max-w-[220px] truncate" title={p.registration_result ?? ''}>{p.registration_result || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2.5 py-2">{p.registration_apply_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2 text-right">{p.registration_cost != null ? `¥${Math.round(p.registration_cost).toLocaleString('ja-JP')}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-gray-700">
                      <td className="px-2.5 py-2 text-right" colSpan={4}>登録免許税 合計（立替実費の実績）</td>
                      <td className="px-2.5 py-2 text-right text-emerald-700">{`¥${Math.round(costTotal).toLocaleString('ja-JP')}`}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <ProgressSummary caseId={caseId} scopeKey={`registration_${activeMuni}`} title={`進捗/結果（${sub === '__unset__' ? '市区町村 未設定' : activeMuni}）`} />
            {muniProps(activeMuni).length === 0 ? (
              <div className="rounded-md border border-gray-200 px-4 py-8 text-center text-[12px] text-gray-400">この市区町村の物件がありません。</div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-3.5">
                <SectionHeading title="物件ごとの登記（1物件=1行）／全項目を直接編集（横スクロール）" className="mb-2.5 pb-1.5 border-b border-gray-200" />
                <div className="overflow-x-auto">
                  <table className="text-[12px] border-collapse" style={{ minWidth: 1780, width: 'max-content' }}>
                    <thead>
                      <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
                        <th className="px-2 py-2 text-left font-semibold w-20">種別</th>
                        <th className="px-2 py-2 text-left font-semibold w-44">所在地</th>
                        <th className="px-2 py-2 text-left font-semibold w-32">取得者（相続人）</th>
                        <th className="px-2 py-2 text-left font-semibold w-20">持分</th>
                        <th className="px-2 py-2 text-left font-semibold w-56">相続登記の種別</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">登記原因</th>
                        <th className="px-2 py-2 text-left font-semibold w-36">管轄法務局</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">申請日</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">完了日</th>
                        <th className="px-2 py-2 text-right font-semibold w-28">登録免許税</th>
                        <th className="px-2 py-2 text-left font-semibold w-32">申請時W-Check</th>
                        <th className="px-2 py-2 text-left font-semibold w-40">備考・結果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {muniProps(activeMuni).map((p, i) => (
                        <tr key={p.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-2 py-1.5 text-gray-700">{p.property_type || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-1.5 font-medium text-gray-800">{p.address || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-1.5"><TxtCell value={p.registration_acquirer} onCommit={v => saveField(p.id, 'registration_acquirer', v)} placeholder="相続人名" /></td>
                          <td className="px-2 py-1.5"><ShareCell key={p.registration_share ?? 'empty'} value={p.registration_share} onSave={v => saveField(p.id, 'registration_share', v)} /></td>
                          <td className="px-2 py-1.5"><TypesCell value={p.registration_types} options={REGISTRATION_TYPES} onSave={v => saveField(p.id, 'registration_types', v.length ? v : null)} /></td>
                          <td className="px-2 py-1.5"><SelCell value={p.registration_cause} options={[...REGISTRATION_CAUSES]} onChange={v => saveField(p.id, 'registration_cause', v)} /></td>
                          <td className="px-2 py-1.5"><TxtCell value={p.registration_office} onCommit={v => saveField(p.id, 'registration_office', v)} placeholder="法務局（予測）" list={officeListId} /></td>
                          <td className="px-2 py-1.5"><DateCell value={p.registration_apply_date} onCommit={v => saveField(p.id, 'registration_apply_date', v)} /></td>
                          <td className="px-2 py-1.5"><DateCell value={p.registration_complete_date} onCommit={v => saveField(p.id, 'registration_complete_date', v)} /></td>
                          <td className="px-2 py-1.5"><MoneyCell value={p.registration_cost} onCommit={v => saveField(p.id, 'registration_cost', v === '' ? null : Number(v))} /></td>
                          <td className="px-2 py-1.5"><DcCell name={p.registration_check_name} at={p.registration_check_at} me={me} onSet={(n, a) => saveMany(p.id, { registration_check_name: n, registration_check_at: a })} /></td>
                          <td className="px-2 py-1.5"><TxtCell value={p.registration_result} onCommit={v => saveField(p.id, 'registration_result', v)} placeholder="結果" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-gray-400">物件は財産調査(不動産)と共有です。物件の追加・削除は不動産タブで行います。登録免許税＝立替実費の実績。</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// 相続登記の種別（複数選択）を表セル内で編集。クリックで下にチェック一覧を展開（行が伸びるので横スクロール内でも隠れない）。
function TypesCell({ value, options, onSave }: { value: string[] | null; options: readonly string[]; onSave: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const sel = value ?? []
  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left px-1.5 py-1 border border-gray-200 rounded bg-white hover:border-brand-400 min-h-[30px] flex flex-wrap gap-1 items-center">
        {sel.length ? sel.map(s => <span key={s} className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 text-[10.5px] font-semibold">{s}</span>) : <span className="text-gray-300 text-[11.5px]">選択…</span>}
      </button>
      {open && (
        <div className="mt-1 p-2 border border-brand-300 rounded bg-white flex flex-wrap gap-1">
          {options.map(o => {
            const on = sel.includes(o)
            return <button key={o} type="button" onClick={() => onSave(on ? sel.filter(x => x !== o) : [...sel, o])} className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border transition ${on ? 'bg-brand-100 text-brand-700 border-brand-300' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>{on && '✓ '}{o}</button>
          })}
          <button type="button" onClick={() => setOpen(false)} className="ml-auto px-1.5 py-0.5 text-[11px] text-gray-400 hover:text-gray-600">閉じる</button>
        </div>
      )}
    </div>
  )
}

// 持分の入力補助：分子／分母の2枠＋「全部（単独相続）」。保存値は "1/2" or "全部"（フリー列と互換）。
function ShareCell({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const parsed = (value ?? '').trim()
  const m = parsed.match(/^(\d+)\s*\/\s*(\d+)$/)
  const [whole, setWhole] = useState(parsed === '全部')
  const [num, setNum] = useState(m ? m[1] : '')
  const [den, setDen] = useState(m ? m[2] : '')
  const commit = (w: boolean, n: string, d: string) => { onSave(w ? '全部' : (n && d ? `${n}/${d}` : '')) }
  if (whole) {
    return (
      <div className="flex items-center gap-1">
        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200">全部</span>
        <button type="button" onClick={() => { setWhole(false); commit(false, num, den) }} title="共有に戻す" className="text-gray-300 hover:text-gray-500 text-[12px]">✕</button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-0.5">
      <input type="number" min="1" value={num} onChange={e => setNum(e.target.value)} onBlur={() => commit(false, num, den)} placeholder="分子" className="w-9 px-1 py-1 text-[12px] text-center bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
      <span className="text-gray-400">/</span>
      <input type="number" min="1" value={den} onChange={e => setDen(e.target.value)} onBlur={() => commit(false, num, den)} placeholder="分母" className="w-9 px-1 py-1 text-[12px] text-center bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" />
      <button type="button" onClick={() => { setWhole(true); commit(true, num, den) }} title="単独相続（全部取得）" className="ml-1 text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 whitespace-nowrap">全部</button>
    </div>
  )
}
