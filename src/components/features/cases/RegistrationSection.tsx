'use client'

// 相続登記（実務）：法務局単位の左レール。申請の単位が法務局なので、市区町村ではなく法務局で束ねる。
//   一覧（TOP） … 法務局ごとの「今どこか」＋物件別の登記状況（登録免許税の集計）
//   法務局ページ … 工程図（今どこか・根拠）→ 操作バー（次の依頼）→ 登記部門への依頼 → 物件ごとの登記の状況
// 申請書・委任状は別システム（相続の力）で作る。ここは依頼のやりとりと結果、業務の状態の記録。
// 物件は財産調査(real_estate_properties)を共有。登録免許税は 評価額×持分×0.4% の概算を出し、納付額を入れたらそちらを優先。

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { SectionHeading } from '@/components/ui/InlineFields'
import { REGISTRATION_TYPES } from '@/lib/constants'
import { ProgressChip } from './TabContextPanel'
import { LeftRail } from './LeftRail'
import { DateCell, MoneyCell, TxtCell } from './PracticeTableCells'
import { PracticeActionBar } from './PracticeCard'
import ProcedureStepper from './ProcedureStepper'
import ToukiRequestsTable from './ToukiRequestsTable'
import ToukiRequestModal from './ToukiRequestModal'
import { registrationTax } from '@/lib/registrationTax'
import { toukiStages, toukiNextRequest, isOpenToukiRequest } from '@/lib/toukiRequests'
import type { RealEstatePropertyRow, HeirRow, ToukiRequestRow, ToukiRequestType } from '@/types'

const collator = new Intl.Collator('ja')
const UNSET = '__unset__'
/** 物件の管轄法務局（空なら未設定） */
export const officeOf = (p: RealEstatePropertyRow) => (p.registration_office ?? '').trim()

export default function RegistrationSection({ caseId, properties, heirs = [], requests = [], onRefresh, onRefreshRequests }: {
  caseId: string
  properties: RealEstatePropertyRow[]
  heirs?: HeirRow[]
  /** この案件の登記依頼 */
  requests?: ToukiRequestRow[]
  onRefresh?: () => void
  onRefreshRequests?: () => void
}) {
  const supabase = createClient()
  const [sub, setSub] = useState('top')
  const [reqModal, setReqModal] = useState<{ type?: ToukiRequestType; parent?: ToukiRequestRow | null } | null>(null)
  const [showDone, setShowDone] = useState(false)
  const todayStr = new Date().toLocaleDateString('sv-SE')

  const offices = [...new Set(properties.map(officeOf).filter(Boolean))].sort(collator.compare)
  const hasUnset = properties.some(p => !officeOf(p))

  const saveField = async (id: string, field: keyof RealEstatePropertyRow, value: unknown) => {
    const { error } = await supabase.from('real_estate_properties').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }

  const propsOf = (office: string) => properties.filter(p => officeOf(p) === office)
  const reqsOf = (office: string) => requests.filter(r => (r.office ?? '').trim() === office)
  const activeOffice = sub === UNSET ? '' : sub
  const openCount = (office: string) => reqsOf(office).filter(isOpenToukiRequest).length

  const items = [
    { key: 'top', label: '一覧（TOP）' },
    ...offices.map(o => ({ key: o, label: o, count: propsOf(o).length, note: openCount(o) > 0 ? `依頼 ${openCount(o)}` : null })),
    ...(hasUnset ? [{ key: UNSET, label: '法務局 未設定', count: propsOf('').length }] : []),
  ]

  // 登録免許税は、納付額を入れていなければ 評価額×持分×0.4% の概算で見せる（財産調査TOP・請求タブと同じ計算）。
  const regCost = (p: RealEstatePropertyRow) => p.registration_cost ?? Math.round(registrationTax(p))
  const isEstimate = (p: RealEstatePropertyRow) => p.registration_cost == null && registrationTax(p) > 0
  const costTotal = properties.reduce((s, p) => s + regCost(p), 0)
  const officeListId = `reg-office-${caseId}`
  const propLabel = (ids: string[] | null) => {
    if (!ids || ids.length === 0) return '—'
    const names = ids.map(id => properties.find(p => p.id === id)).filter((p): p is RealEstatePropertyRow => !!p)
    return `${ids.length}件`
      + (names.length > 0 ? `：${names.map(p => p.lot_number || p.kaoku_bango || p.address || '物件').join('・')}` : '')
  }

  const openModal = (type?: ToukiRequestType, parent?: ToukiRequestRow) => setReqModal({ type, parent: parent ?? null })

  return (
    <div className="flex gap-3 items-start">
      {offices.length > 0 && <datalist id={officeListId}>{offices.map(o => <option key={o} value={o} />)}</datalist>}
      <LeftRail width="w-72" items={items} active={sub} onChange={setSub} />
      <div className="flex-1 min-w-0">
        {sub === 'top' ? (
          <div className="space-y-3.5">
            {/* 法務局ごとの今どこか */}
            <div className="bg-white p-3.5">
              <SectionHeading title="法務局ごとの進み具合" hint="申請の単位は法務局です。段は 申請書作成 → チェック → 署名・本人確認 → 申請 → 完了・製本 → 納品。今どこかは、依頼の結果と物件の申請日・完了日・納品日から自動で決めます。" className="mb-2.5 pb-1.5 border-b border-gray-200"
                right={<ProgressChip caseId={caseId} scopeKey="registration" title="相続登記 全体" />} />
              {offices.length === 0 && !hasUnset ? (
                <p className="px-3 py-5 text-center text-[12.5px] text-gray-400">財産調査タブで物件に管轄法務局を入れると、ここに法務局ごとの進み具合が出ます。</p>
              ) : (
                <table className="w-full text-[12.5px] border-collapse">
                  <thead><tr><th className="px-2.5 py-2 text-left font-semibold w-56">法務局</th><th className="px-2.5 py-2 text-left font-semibold w-16">物件</th><th className="px-2.5 py-2 text-left font-semibold">今どこか</th><th className="px-2.5 py-2 text-left font-semibold w-40">登記部門への依頼</th></tr></thead>
                  <tbody>
                    {[...offices, ...(hasUnset ? [''] : [])].map(o => {
                      const st = toukiStages(reqsOf(o), propsOf(o))
                      const now = st.nodes.find(n => n.state === 'now' || n.state === 'warn')
                      const open = reqsOf(o).filter(isOpenToukiRequest)
                      return (
                        <tr key={o || UNSET} className="border-b border-gray-100 cursor-pointer hover:bg-brand-50/30" onClick={() => setSub(o || UNSET)}>
                          <td className="px-2.5 py-2 font-medium text-gray-800">{o || <span className="text-gray-400">法務局 未設定</span>}</td>
                          <td className="px-2.5 py-2 text-gray-600">{propsOf(o).length}件</td>
                          <td className="px-2.5 py-2">
                            {st.stage >= 7 ? <span className="text-emerald-700 font-semibold">納品まで完了</span>
                              : now ? <><span className={`font-semibold ${now.state === 'warn' ? 'text-red-700' : 'text-brand-800'}`}>{st.stage}. {now.label}</span><span className="ml-2 text-[12px] text-gray-500">{now.sub}</span></> : '—'}
                          </td>
                          <td className="px-2.5 py-2 text-[12px]">{open.length > 0 ? <span className="text-amber-700 font-semibold">{open.map(r => r.request_type).join('・')} 対応待ち</span> : <span className="text-gray-400">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {/* 物件別の登記状況＋登録免許税 */}
            <div className="bg-white p-3.5">
              <SectionHeading title="物件ごとの登記の状況" className="mb-2.5 pb-1.5 border-b border-gray-200" />
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th className="px-2.5 py-2 text-left font-semibold w-48">法務局</th>
                      <th className="px-2.5 py-2 text-left font-semibold">所在地</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-20">申請日</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-20">完了日</th>
                      <th className="px-2.5 py-2 text-left font-semibold w-20">納品日</th>
                      <th className="px-2.5 py-2 text-right font-semibold w-28">登録免許税</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">財産調査タブで不動産を登録すると、ここで相続登記を管理できます。</td></tr>
                    ) : properties.map((p, i) => (
                      <tr key={p.id} className={`border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-brand-50/30 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`} onClick={() => setSub(officeOf(p) || UNSET)}>
                        <td className="px-2.5 py-2 text-gray-700">{officeOf(p) || <span className="text-gray-300">未設定</span>}</td>
                        <td className="px-2.5 py-2 font-medium text-gray-800">{[p.address, p.lot_number || (p.kaoku_bango ? `家屋番号 ${p.kaoku_bango}` : '')].filter(Boolean).join(' ') || <span className="text-gray-300">—</span>}</td>
                        <td className="px-2.5 py-2">{p.registration_apply_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2">{p.registration_complete_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2">{p.registration_delivery_date?.slice(5).replace('-', '/') || '—'}</td>
                        <td className="px-2.5 py-2 text-right">
                          {regCost(p) > 0
                            ? <>¥{regCost(p).toLocaleString('ja-JP')}{isEstimate(p) && <span className="ml-1 text-[10px] text-gray-400">概算</span>}</>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-gray-700">
                      <td className="px-2.5 py-2 text-right" colSpan={5}>登録免許税 合計（立替実費の実績）</td>
                      <td className="px-2.5 py-2 text-right text-emerald-700">{`¥${Math.round(costTotal).toLocaleString('ja-JP')}`}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        ) : (() => {
          const label = sub === UNSET ? '法務局 未設定' : activeOffice
          const oProps = propsOf(activeOffice)
          const oReqs = reqsOf(activeOffice)
          const st = toukiStages(oReqs, oProps)
          const next = toukiNextRequest(st.stage, oReqs)
          const open = oReqs.filter(isOpenToukiRequest)
          const bounced = oReqs.find(r => r.status === '修正あり' && !oReqs.some(x => x.parent_id === r.id))
          return (
            <div className="space-y-3.5">
              {/* 工程図：今どこか＋根拠。手で選ぶ欄は無し */}
              <div className="bg-white p-3.5">
                <SectionHeading title={`${label}の進み具合`} hint="段は 申請書作成 → チェック → 署名・本人確認 → 申請 → 完了・製本 → 納品。今どこかは、この法務局の依頼の結果と、下の物件の申請日・完了日・納品日から自動で決めます。製本は登記依頼ではなく相続登記チームのタスク（識別情報通知の確認タスクの完了で作る）。" className="mb-2.5 pb-1.5 border-b border-gray-200"
                  right={<ProgressChip caseId={caseId} scopeKey={`registration_${activeOffice || 'unset'}`} title={label} />} />
                <ProcedureStepper nodes={st.nodes} parallel={st.parallel} parallelTone="red" />
                {/* 操作バー：いまの段でやること＋次の依頼ボタンを1本だけ */}
                <PracticeActionBar
                  title={open.length > 0 ? `登記部門が対応中：${open.map(r => r.request_type).join('・')}`
                    : bounced ? `${bounced.request_type}が修正ありで戻っています`
                    : st.stage >= 7 ? '納品まで完了しました'
                    : next ? next.label.replace(/を依頼$|依頼$/, '').replace(/^登記部門へ/, '') + 'の段です' : st.stage === 4 ? '申請の段です' : st.stage === 5 ? '完了・製本の段です' : st.stage === 6 ? '納品の段です' : '進めてください'}
                  note={open.length > 0 ? '結果が返ると通知が届きます（修正あり／完了）'
                    : bounced ? (bounced.result_comment ?? '')
                    : st.stage >= 7 ? ''
                    : next ? next.note
                    : st.stage === 4 ? '相続の力で申請したら、下の物件に申請日・受付番号を入れてください。完了したら完了日を'
                    : st.stage === 5 ? '登記識別情報通知が届いたら受信簿で受け、確認タスクの完了で「権利書の製本」を相続登記チームへ（チームのタスクタブに出ます）'
                    : st.stage === 6 ? '製本した権利証をお客様へ納品したら、下の物件に納品日を' : ''}>
                  {/* 依頼のボタンはここ1か所。次の段の依頼を主ボタンで。段に依頼が無いとき（申請中・製本・納品）は従ボタンで任意の依頼 */}
                  {next && !open.length && <button type="button" onClick={() => openModal(next.type, bounced ?? undefined)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-white bg-brand-600 border border-brand-600 hover:bg-brand-700">{next.label}</button>}
                  {!next && !open.length && st.stage < 7 && <button type="button" onClick={() => openModal()} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"><Plus className="w-3.5 h-3.5" />依頼を出す</button>}
                </PracticeActionBar>
              </div>

              {/* 登記部門への依頼 */}
              <div className="bg-white p-3.5">
                <SectionHeading title="登記部門への依頼" hint="依頼は 依頼中 → 対応中（登記部門の誰かが対応）→ 完了／修正あり。修正ありなら直して同じ種別で再依頼します。依頼中のまま1営業日で要確認、3営業日で要注意。" className="mb-2.5 pb-1.5 border-b border-gray-200"
                  right={<button type="button" onClick={() => setShowDone(v => !v)} className="px-2.5 py-1 rounded-md text-[12px] font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50">{showDone ? '完了を隠す' : '完了も表示'}</button>} />
                <ToukiRequestsTable rows={oReqs} mode="case" todayStr={todayStr} showDone={showDone} propertyLabel={propLabel}
                  onChanged={onRefreshRequests} onRerequest={r => openModal(r.request_type, r)} />
              </div>

              {/* 物件ごとの登記（この法務局） */}
              {oProps.length === 0 ? (
                <div className="rounded-md border border-gray-200 px-4 py-8 text-center text-[12px] text-gray-400">この法務局の物件がありません。</div>
              ) : (
                <div className="bg-white p-3.5">
                  <SectionHeading title={`${label}の物件（登記の状況）`} hint="申請は相続の力で行い、結果（申請日・受付番号・完了日・納品日）をここに写します。横スクロールで全項目を直接編集できます。登録免許税＝立替実費の実績（空なら評価額×持分×0.4%の概算）。" className="mb-2.5 pb-1.5 border-b border-gray-200" />
                  <div className="overflow-x-auto">
                    <table className="text-[12px] border-collapse" style={{ minWidth: 1900, width: 'max-content' }}>
                      <thead>
                        <tr>
                          <th className="px-2 py-2 text-left font-semibold w-20">種別</th>
                          <th className="px-2 py-2 text-left font-semibold w-52">所在地・地番／家屋番号</th>
                          <th className="px-2 py-2 text-left font-semibold w-32">取得者（相続人）</th>
                          <th className="px-2 py-2 text-left font-semibold w-24">持分</th>
                          <th className="px-2 py-2 text-left font-semibold w-52">相続登記の種別</th>
                          <th className="px-2 py-2 text-left font-semibold w-28">申請日</th>
                          <th className="px-2 py-2 text-left font-semibold w-36">受付番号</th>
                          <th className="px-2 py-2 text-left font-semibold w-28">完了日</th>
                          <th className="px-2 py-2 text-left font-semibold w-28">納品日</th>
                          <th className="px-2 py-2 text-right font-semibold w-28">登録免許税</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oProps.map((p, i) => (
                          <tr key={p.id} className={`border-b border-gray-100 last:border-b-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                            <td className="px-2 py-1.5 text-gray-700">{p.property_type || <span className="text-gray-300">—</span>}</td>
                            <td className="px-2 py-1.5 font-medium text-gray-800">{[p.address, p.lot_number || (p.kaoku_bango ? `家屋番号 ${p.kaoku_bango}` : '')].filter(Boolean).join(' ') || <span className="text-gray-300">—</span>}</td>
                            <td className="px-2 py-1.5">
                              <TypesCell
                                value={(p.registration_acquirer ?? '').split('、').map(x => x.trim()).filter(Boolean)}
                                options={Array.from(new Set([...heirs.map(h => h.name).filter(Boolean), ...(p.registration_acquirer ?? '').split('、').map(x => x.trim()).filter(Boolean)]))}
                                onSave={v => saveField(p.id, 'registration_acquirer', v.length ? v.join('、') : null)}
                              />
                            </td>
                            <td className="px-2 py-1.5"><ShareCell key={p.registration_share ?? 'empty'} value={p.registration_share} onSave={v => saveField(p.id, 'registration_share', v)} /></td>
                            <td className="px-2 py-1.5"><TypesCell value={p.registration_types} options={REGISTRATION_TYPES} onSave={v => saveField(p.id, 'registration_types', v.length ? v : null)} /></td>
                            <td className="px-2 py-1.5"><DateCell value={p.registration_apply_date} onCommit={v => saveField(p.id, 'registration_apply_date', v)} /></td>
                            <td className="px-2 py-1.5"><TxtCell value={p.registration_receipt_no ?? null} onCommit={v => saveField(p.id, 'registration_receipt_no', v)} placeholder="受付番号" /></td>
                            <td className="px-2 py-1.5"><DateCell value={p.registration_complete_date} onCommit={v => saveField(p.id, 'registration_complete_date', v)} /></td>
                            <td className="px-2 py-1.5"><DateCell value={p.registration_delivery_date ?? null} onCommit={v => saveField(p.id, 'registration_delivery_date', v)} /></td>
                            <td className="px-2 py-1.5"><MoneyCell value={p.registration_cost} onCommit={v => saveField(p.id, 'registration_cost', v === '' ? null : Number(v))} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-gray-400">物件は財産調査(不動産)と共有です。物件の追加・削除・管轄法務局は不動産タブで行います。</p>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {reqModal && (
        <ToukiRequestModal isOpen onClose={() => setReqModal(null)} caseId={caseId} properties={properties}
          defaultOffice={sub === 'top' || sub === UNSET ? (offices[0] ?? '') : activeOffice}
          parent={reqModal.parent ?? null} onSaved={onRefreshRequests} />
      )}
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
