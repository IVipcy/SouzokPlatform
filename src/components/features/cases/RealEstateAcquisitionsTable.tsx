'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useAuth } from '@/components/providers/AuthProvider'
import { ACQUISITION_ITEMS, RE_REQUEST_KINDS, REQUEST_KIND_HELP, isMistakenRequest } from '@/lib/constants'

// 請求区分の説明（列見出しの「?」）。定義は constants.ts の1か所。
const KIND_HINT = RE_REQUEST_KINDS.map(k => `${k}：${REQUEST_KIND_HELP[k]}`).join('\n')

// 取得区分。誰が取るか／もう持っているか。空の既存行は「自社取得」として扱う。
const ACQUIRERS = ['自社取得', '依頼者取得', '受領済'] as const
const ACQUIRER_HINT = [
  '自社取得：こちらで役所・法務局へ請求します（請求日・費用を入れます）',
  '依頼者取得：依頼者が取ってきます（請求日・費用は入れません）',
  '受領済：もう手元にあります。契約手続きタブに「その場で受領」で自動追加されます',
].join('\n')
/**
 * 画面に出す取得区分。
 *
 * DBに入っているのは '自社' / '依頼者'（lib/acquirer.ts の ACQUIRERS）。
 * この画面だけ '自社取得' / '依頼者取得' というラベルで持っていたため、
 * オーダーシートから作った行（'自社'）が「自社取得ではない」と判定され、
 * 請求日・費用が「依頼者負担」になって入力できなくなっていた。
 * 表記ゆれを吸収して、'依頼者' でなければ自社取得として扱う。
 */
const acquirerOf = (r: { acquirer: string | null; received_at_meeting?: boolean }) => {
  if (r.received_at_meeting) return '受領済'
  const a = (r.acquirer ?? '').trim()
  return a === '依頼者' || a === '依頼者取得' ? '依頼者取得' : '自社取得'
}
/** 画面のラベル → DBに入れる値。'自社' / '依頼者' に揃える。 */
const acquirerValue = (label: string) => (label === '依頼者取得' ? '依頼者' : '自社')

// 年度を持つ資料。登記情報・公図・地積測量図・路線価には年度がない。
const YEAR_ITEMS = ['名寄帳', '評価証明']
// 和暦の年度候補（今年度／前年度）
const yearOptions = () => { const y = new Date().getFullYear(); return [`令和${y - 2018}年度`, `令和${y - 2019}年度`] }
import type { RealEstateAcquisitionRow, RealEstatePropertyRow, TaskRow, ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'
import { receiptFilesFor } from '@/lib/relatedTasks'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'
import ContractReceivedBlock from './ContractReceivedBlock'
import CheckRequestControl from './CheckRequestControl'
import { MoneyCell, PriorityCell } from './PracticeTableCells'
import HintTip from '@/components/ui/HintTip'
import { municipalityOf } from './RealEstateSection'

const yen = (n: number | null | undefined) => (n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`)

type Props = {
  caseId: string
  acquisitions: RealEstateAcquisitionRow[]
  properties: RealEstatePropertyRow[]
  onRefresh?: () => void
  // オーダーシート埋め込み時は請求日・到着日の進捗列を出さない
  orderSheetMode?: boolean
  // 受信簿＋タスク（受信トリガーで着手したタスクへの「関連タスク」リンク用）
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  // 契約時にお客様から受領した不動産関係書類（区分=財産のうち不動産分）。表の先頭に受領済として表示。
  contractDocs?: ContractDocumentRow[]
  // 業務順に表を分割：'municipality'=市区町村単位の請求(名寄帳/評価証明)、'property'=物件単位の取得(登記情報/公図 等)
  scope?: 'all' | 'municipality' | 'property'
  // 市区町村タブで使用：この市区町村に紐づく行だけ表示し、新規行もこの市区町村にする
  municipalityFilter?: string
  // 取得資料を1行足した後に呼ぶ（親が「この系統のタスク無ければ作成しますか？」を出す）
  onAfterAddRow?: () => void
  // 初期生成後に事務が足す取得資料は承認ゲート対象（is_additional=true・タスクは承認後）
  additionsNeedApproval?: boolean
  // 承認待ちの取得資料を足したとき（親が管理担当へ通知を出す）
  onAdditionalPending?: () => void
  /**
   * 見せ方。'table'=16列の表（従来）／'cards'=1タブ＝1請求のカード。
   * 実務タブは cards。1件の請求を横スクロールせずに読めるようにするため。
   */
  layout?: 'table' | 'cards'
}

const itemMeta = (key: string | null) => ACQUISITION_ITEMS.find(i => i.key === key)
const propLabel = (p: RealEstatePropertyRow) => p.address || p.lot_number || p.property_type || '未入力の物件'
// selectのoption表示は先頭に[土地]/[建物]を付けて、同じ住所の物件を判別可能に。
const propLabelWithType = (p: RealEstatePropertyRow) => `${p.property_type ? `[${p.property_type}] ` : ''}${propLabel(p)}`

/** 読込結果のステータス。戸籍と同じ2つに揃える（内容は自由欄に書く）。 */
const RE_READ_STATUSES = ['取得完了', '一部不足'] as const

/**
 * タブの状態バッジ。色ではなく文字で言う。
 * 完了は薄く沈め、手を打つ必要がある「一部不足」だけ色を付ける。
 */
const RE_TAB_STATUS = {
  none:    { label: '未請求',   cls: 'text-gray-400 border border-gray-200' },
  request: { label: '請求中',   cls: 'text-gray-500 border border-gray-300' },
  check:   { label: '確認待ち', cls: 'text-white bg-gray-500' },
  partial: { label: '一部不足', cls: 'text-red-700 bg-red-50 border border-red-200' },
  done:    { label: '完了',     cls: 'text-gray-400 bg-gray-100' },
} as const

const reTabStatus = (r: RealEstateAcquisitionRow): keyof typeof RE_TAB_STATUS => {
  if (r.read_status === '一部不足') return 'partial'
  if (r.read_status === '取得完了') return 'done'
  if (r.arrival_date) return 'check'
  return r.request_date ? 'request' : 'none'
}

/** タブ名。役所ぶんは「資料＋年度」、法務局ぶんは「物件＋資料」。 */
function reTabLabel(
  r: RealEstateAcquisitionRow,
  properties: RealEstatePropertyRow[],
  itemsOf: (r: RealEstateAcquisitionRow) => string[],
  rowScopeOf: (r: RealEstateAcquisitionRow) => 'municipality' | 'property' | null,
): string {
  const items = itemsOf(r)
  const head = items.length === 0 ? '資料 未選択' : items.length === 1 ? items[0] : `${items[0]} +${items.length - 1}`
  if (rowScopeOf(r) === 'property') {
    const p = properties.find(x => x.id === r.target_property_id)
    const who = p ? (p.lot_number || p.address || p.property_type || '物件') : '物件 未選択'
    return `${who}　${head}`
  }
  const y = (r.doc_year ?? r.myna_year ?? '').replace('年度', '')
  return y ? `${head} ${y}` : head
}

/** カードの1行。ラベル左・値右。full は横いっぱい（col-start-1 が無いと前の行の途中から始まる）。 */
function ReRow({ label, sub, children, full = false }: {
  label: string; sub?: string; children: React.ReactNode; full?: boolean
}) {
  return (
    <div className="contents">
      <div className={`bg-gray-50/80 border-r border-gray-100 px-3 py-2 flex flex-col justify-center text-[11.5px] font-semibold text-gray-600 leading-snug ${full ? 'sm:col-start-1' : ''}`}>
        <span>{label}</span>
        {sub && <span className="text-[10px] font-normal text-brand-700">{sub}</span>}
      </div>
      <div className={`bg-white px-3 py-2 flex items-center gap-2 flex-wrap min-h-[42px] ${full ? 'sm:col-span-3' : ''}`}>
        {children}
      </div>
    </div>
  )
}

function ReGroup({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="inline-block w-[3px] h-3 bg-brand-500 rounded-[1px]" />
        <span className="text-[10.5px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded px-1.5">{no}</span>
        <span className="text-[12px] font-semibold text-gray-600">{title}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[8.5rem_minmax(0,1fr)_8.5rem_minmax(0,1fr)] gap-px bg-gray-100">
        {children}
      </div>
    </div>
  )
}

type AcquisitionCardsProps = {
  rows: RealEstateAcquisitionRow[]
  properties: RealEstatePropertyRow[]
  muniProps: RealEstatePropertyRow[]
  activeId: string | null
  setActiveId: (id: string) => void
  itemsOf: (r: RealEstateAcquisitionRow) => string[]
  rowScopeOf: (r: RealEstateAcquisitionRow) => 'municipality' | 'property' | null
  officeDefault: (muni?: string | null, propId?: string | null) => string
  save: (id: string, field: keyof RealEstateAcquisitionRow, value: unknown) => void
  saveMany: (id: string, patch: Partial<RealEstateAcquisitionRow>) => void
  toggleItem: (id: string, key: string) => void
  addRow: (forScope?: 'municipality' | 'property') => void
  delRow: (id: string) => void
  reqCheck: (r: RealEstateAcquisitionRow, kind: 'request' | 'receipt') => void
  cancelCheck: (r: RealEstateAcquisitionRow, kind: 'request' | 'receipt') => void
  setAcquirer: (r: RealEstateAcquisitionRow, v: string) => void
  receipts: TimelineReceipt[]
  meId: string | null
  fullCost: boolean
  confirmedOf: (r: RealEstateAcquisitionRow) => number | null
}

/**
 * カード表示（1タブ＝1請求）。表をやめて、戸籍タブと同じ形にしたもの。
 *
 * 16列の表を横スクロールしながら読むのをやめ、1件の請求を1画面で見る。
 * 役所への請求（名寄帳・評価証明）と法務局への請求（登記情報など）は、
 * 「請求先が違う」というだけで同じ請求なので、タブは1本にまとめて並び順で分ける。
 * タブ列を2本並べる形は見慣れないという指摘があったため。
 */
function AcquisitionCards({
  rows, properties, muniProps, activeId, setActiveId, itemsOf, rowScopeOf, officeDefault,
  save, saveMany, toggleItem, addRow, delRow, reqCheck, cancelCheck, setAcquirer,
  receipts, meId, fullCost, confirmedOf,
}: AcquisitionCardsProps) {
  const cur = rows.find(r => r.id === activeId) ?? rows[0] ?? null

  return (
    <div>
      {/* 請求ごとのタブ。役所ぶんが先、法務局ぶんが後ろ（rows は既にその順で並んでいる）。 */}
      <div className="flex items-end gap-1 flex-wrap border-b border-gray-200 mb-3">
        {rows.map(r => {
          const on = cur?.id === r.id
          const st = RE_TAB_STATUS[reTabStatus(r)]
          const finished = reTabStatus(r) === 'done'
          const isProp = rowScopeOf(r) === 'property'
          return (
            <button key={r.id} type="button" onClick={() => setActiveId(r.id)}
              title={`${isProp ? '法務局へ請求' : '役所へ請求'}／${st.label}`}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-[12.5px] rounded-t-lg border border-b-0 -mb-px transition-colors ${
                on ? 'bg-white border-gray-200 text-gray-800 font-semibold'
                  : `bg-gray-50 border-transparent hover:text-gray-800 ${finished ? 'text-gray-400' : 'text-gray-500'}`}`}>
              <span className={`text-[9.5px] px-1.5 rounded flex-none ${isProp ? 'bg-gray-100 text-gray-500' : 'bg-brand-50 text-brand-700'}`}>
                {isProp ? '法務局' : '役所'}
              </span>
              {reTabLabel(r, properties, itemsOf, rowScopeOf)}
              <span className={`text-[10px] tracking-wider px-2 py-[1px] rounded-full flex-none ${st.cls}`}>{st.label}</span>
            </button>
          )
        })}
        {/* 追加はどちらへの請求か聞く。タブを1本にしたぶん、ここで宛先を決める。 */}
        <span className="inline-flex items-center gap-1 ml-1.5">
          <span className="text-[11px] text-gray-400">＋ 請求を追加</span>
          <button type="button" onClick={() => addRow('municipality')}
            className="px-2 py-1 text-[11.5px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded hover:bg-brand-100">役所へ</button>
          <button type="button" onClick={() => addRow('property')}
            className="px-2 py-1 text-[11.5px] font-semibold text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">法務局へ</button>
        </span>
      </div>

      {!cur ? (
        <div className="px-4 py-8 text-center">
          <div className="text-[13px] text-gray-600 mb-1">取得資料はまだ登録されていません</div>
          <div className="text-[11.5px] text-gray-400 leading-relaxed">上の「＋ 請求を追加」から、役所（名寄帳・評価証明）か法務局（登記情報・公図など）を選んで作ってください。</div>
        </div>
      ) : (() => {
        const r = cur
        const items = itemsOf(r)
        const isRef = items.length > 0 && items.every(x => itemMeta(x)?.method === '参照')
        const isProp = (rowScopeOf(r) ?? (itemMeta(items[0])?.target === '物件' ? 'property' : 'municipality')) === 'property'
        const availableItems = ACQUISITION_ITEMS.filter(x => x.target === (isProp ? '物件' : '市区町村')).map(x => x.key)
        const acq = acquirerOf(r)
        const noRequest = acq !== '自社取得'
        const muted = <span className="text-[11px] text-gray-400">{acq === '受領済' ? '受領済' : '依頼者負担'}</span>
        const dateCls = 'px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white'
        const selCls = 'px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'
        return (
          <div className={`space-y-2.5 ${isMistakenRequest(r.request_kind) ? 'ring-1 ring-red-200 rounded-lg p-2 bg-red-50/30' : ''}`}>
            <div className="flex items-center justify-end">
              <button type="button" onClick={() => delRow(r.id)} title="この請求を削除"
                className="text-gray-300 hover:text-red-500 px-1"><Trash2 className="w-4 h-4" /></button>
            </div>

            <ReGroup no="Step1" title="何を・どこへ請求するか">
              <ReRow label="優先度"><PriorityCell value={r.priority} onChange={v => save(r.id, 'priority', v || null)} /></ReRow>
              <ReRow label="請求区分">
                <select value={r.request_kind ?? '通常請求'} onChange={e => save(r.id, 'request_kind', e.target.value)} className={selCls}>
                  {RE_REQUEST_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </ReRow>
              <ReRow label="取得区分">
                <select value={acq} onChange={e => setAcquirer(r, e.target.value)} className={selCls}>
                  {ACQUIRERS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </ReRow>
              <ReRow label="請求先">
                {isRef ? <span className="text-[11px] text-gray-300">— 参照 —</span>
                  : <input key={r.request_to ?? ''} type="text" defaultValue={r.request_to ?? ''}
                      onBlur={e => { if (e.target.value !== (r.request_to ?? '')) save(r.id, 'request_to', e.target.value || null) }}
                      placeholder={officeDefault(r.target_municipality, r.target_property_id) || itemMeta(items[0])?.office || '請求先'} className={`${dateCls} w-full`} />}
              </ReRow>
              <ReRow label="対象" full>
                {isProp ? (
                  <select value={r.target_property_id ?? ''} onChange={e => save(r.id, 'target_property_id', e.target.value || null)} className={`${selCls} w-full max-w-md`}>
                    <option value="">— 物件を選択 —</option>
                    {muniProps.map(p => <option key={p.id} value={p.id}>{propLabelWithType(p)}</option>)}
                  </select>
                ) : (
                  <input type="text" defaultValue={r.target_municipality ?? ''}
                    onBlur={e => { if (e.target.value !== (r.target_municipality ?? '')) save(r.id, 'target_municipality', e.target.value || null) }}
                    placeholder="例: 名古屋市中区" className={`${dateCls} w-full max-w-md`} />
                )}
              </ReRow>
              <ReRow label="取得する資料" full sub="1宛先＝1請求">
                <div className="flex flex-wrap gap-1">
                  {availableItems.map(key => {
                    const on = items.includes(key)
                    return (
                      <button key={key} type="button" onClick={() => toggleItem(r.id, key)}
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11.5px] font-medium border transition-colors ${
                          on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'}`}>
                        {on && '✓'}{key}
                      </button>
                    )
                  })}
                </div>
                {r.is_additional && !r.additional_approved_at && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">追加・承認待ち</span>
                )}
              </ReRow>
              <ReRow label="年度" sub="名寄帳・評価証明のとき" full>
                {items.some(x => YEAR_ITEMS.includes(x)) ? (
                  <select value={r.doc_year ?? r.myna_year ?? ''} onChange={e => saveMany(r.id, { doc_year: e.target.value || null, myna_year: e.target.value || null })} className={selCls}>
                    <option value="">—</option>
                    {yearOptions().map(o => <option key={o} value={o}>{o}</option>)}
                    {(r.doc_year ?? r.myna_year) && !yearOptions().includes((r.doc_year ?? r.myna_year) as string) &&
                      <option value={(r.doc_year ?? r.myna_year) as string}>{r.doc_year ?? r.myna_year}</option>}
                  </select>
                ) : <span className="text-[11px] text-gray-400">—　<span className="text-[10.5px]">（名寄帳・評価証明を選ぶと年度が出ます）</span></span>}
              </ReRow>
            </ReGroup>

            <ReGroup no="Step2" title="費用">
              {noRequest || isRef ? (
                <ReRow label="費用" full>{isRef ? <span className="text-[11px] text-gray-400">参照のみ（費用なし）</span> : muted}</ReRow>
              ) : (
                <>
                  <ReRow label="費用予算"><MoneyCell value={r.cost_budget} onCommit={v => saveMany(r.id, { cost_budget: v === '' ? null : Number(v) })} /></ReRow>
                  {fullCost && <ReRow label="返金"><MoneyCell value={r.cost_refund} onCommit={v => saveMany(r.id, { cost_refund: v === '' ? null : Number(v) })} /></ReRow>}
                  <ReRow label="確定費用" full>
                    {fullCost
                      ? <span className={`inline-block px-2 py-1 rounded text-[12px] font-semibold border ${isMistakenRequest(r.request_kind) ? 'text-purple-700 bg-purple-50 border-purple-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>{yen(confirmedOf(r))}</span>
                      : <MoneyCell value={r.cost_confirmed} onCommit={v => saveMany(r.id, { cost_confirmed: v === '' ? null : Number(v) })} />}
                    {isMistakenRequest(r.request_kind) && <span className="text-[10px] text-purple-600">経費として集計</span>}
                  </ReRow>
                </>
              )}
            </ReGroup>

            <ReGroup no="Step3" title="進捗">
              <ReRow label="請求日">
                {isRef || noRequest ? (noRequest ? muted : <span className="text-[11px] text-gray-300">—</span>)
                  : <input type="date" defaultValue={r.request_date ?? ''}
                      onBlur={e => { const v = e.target.value; if (v !== (r.request_date ?? '')) saveMany(r.id, { request_date: v || null, ...(v && !r.request_done_by ? { request_done_by: meId } : {}) }) }} className={dateCls} />}
              </ReRow>
              <ReRow label="到着日">
                {isRef ? <span className="text-[11px] text-gray-300">—</span>
                  : <input type="date" defaultValue={r.arrival_date ?? ''}
                      onBlur={e => { const v = e.target.value; if (v !== (r.arrival_date ?? '')) saveMany(r.id, { arrival_date: v || null, ...(v && !r.receipt_done_by ? { receipt_done_by: meId } : {}) }) }} className={dateCls} />}
              </ReRow>
              <ReRow label="発送チェック" sub="確認簿で確認">
                {isRef ? <span className="text-[11px] text-gray-300">—</span> : r.request_date
                  ? <CheckRequestControl label="発送チェックを依頼" requestedAt={r.request_check_requested_at} checkedAt={r.request_check_at} checkedName={r.request_check_name} onRequest={() => reqCheck(r, 'request')} onCancel={() => cancelCheck(r, 'request')} />
                  : <span className="text-[11px] text-gray-300">請求日待ち</span>}
              </ReRow>
              <ReRow label="到着チェック" sub="確認簿で確認">
                {isRef ? <span className="text-[11px] text-gray-300">—</span> : r.arrival_date
                  ? <CheckRequestControl label="到着チェックを依頼" requestedAt={r.receipt_check_requested_at} checkedAt={r.receipt_check_at} checkedName={r.receipt_check_name} onRequest={() => reqCheck(r, 'receipt')} onCancel={() => cancelCheck(r, 'receipt')} />
                  : <span className="text-[11px] text-gray-300">到着待ち</span>}
              </ReRow>
              <ReRow label="受領ファイル" full>
                {(() => {
                  const files = receiptFilesFor(receipts, 'real_estate_acquisition', r.id)
                  return files.length > 0
                    ? <div className="flex flex-wrap gap-2">{files.map((f, k) => <OpenStorageFile key={k} bucket={f.bucket} path={f.path} name={f.name} label="受領ファイル" />)}</div>
                    : <span className="text-[11px] text-gray-300">—</span>
                })()}
              </ReRow>
            </ReGroup>

            {/* 届いた資料を読んだ結果。名寄帳は「この市区町村の物件を洗い出す」ために取るので、
                読んで何が見つかったかを残さないと、私道の持分などを見落としたまま先へ進んでしまう。 */}
            <ReGroup no="Step4" title="読込結果">
              <ReRow label="取得の結果" full>
                <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                  {RE_READ_STATUSES.map(s => {
                    const on = r.read_status === s
                    return (
                      <button key={s} type="button" onClick={() => save(r.id, 'read_status', on ? null : s)}
                        className={`px-3 py-1 text-[12px] font-semibold transition ${
                          on ? (s === '一部不足' ? 'bg-red-600 text-white' : 'bg-gray-600 text-white') : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {s}
                      </button>
                    )
                  })}
                </div>
              </ReRow>
              <ReRow label="内容" full>
                <input type="text" defaultValue={r.read_result ?? ''}
                  onBlur={e => { if (e.target.value !== (r.read_result ?? '')) save(r.id, 'read_result', e.target.value || null) }}
                  placeholder={isProp ? '読んで分かったこと' : '例：私道の持分が2筆あった。物件一覧へ追加済み'}
                  className={`${dateCls} w-full`} />
              </ReRow>
              {r.read_status === '一部不足' && (
                <ReRow label="次にやること" full>
                  <span className="text-[12px] text-brand-700">
                    {isProp
                      ? '足りなかった資料について、上の「＋ 請求を追加」で法務局への請求を作ってください。'
                      : '見つかった物件を上の物件一覧に足したうえで、「＋ 請求を追加」で法務局への請求を作ってください。'}
                  </span>
                </ReRow>
              )}
            </ReGroup>
          </div>
        )
      })()}
    </div>
  )
}

/**
 * 不動産の取得資料管理（戸籍請求一覧と同じ思想）。1行＝1取得物。
 * 何を（取得物）・どこに（請求先）・いつ請求し・受け取れたか（到着日/取得済）を管理。
 * 路線価は「参照」なので請求先・日付はグレーアウトし、取得済のみ管理。
 * 物件単位（登記情報/公図/地積/路線価）は対象物件を選択、市区町村単位（評価証明/名寄帳）は市区町村を入力。
 */
export default function RealEstateAcquisitionsTable({ caseId, acquisitions, properties, onRefresh, orderSheetMode = false, receipts = [], contractDocs = [], scope = 'all', municipalityFilter, onAfterAddRow, additionsNeedApproval = false, onAdditionalPending, layout = 'table' }: Props) {
  const supabase = createClient()
  const authUser = useAuth()
  const meId = authUser?.memberId ?? null
  const [rows, setRows] = useState<RealEstateAcquisitionRow[]>(acquisitions)
  // カード表示で開いている請求。null なら先頭を開く。
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => { setRows(acquisitions) }, [acquisitions])
  const progressMode = !orderSheetMode
  const costMode = scope === 'property' ? 'confirmedOnly' : 'full'  // 物件取得=印紙(確定のみ)、市区町村請求=小為替(予算/返金/確定)
  const fullCost = costMode === 'full'
  const confirmedOf = (r: RealEstateAcquisitionRow) => fullCost ? (r.cost_budget != null ? r.cost_budget - (r.cost_refund ?? 0) : r.cost_confirmed) : r.cost_confirmed

  // 取得区分の保存。「受領済」にしたら、これまでの「面談時に受領✓」と同じく
  // 契約手続きタブに「その場で受領」で書類を足す（解除したら消す）。
  const setAcquirer = async (r: RealEstateAcquisitionRow, next: string) => {
    const cur = acquirerOf(r)
    if (cur === next) return
    if (next === '受領済') {
      const label = itemsOf(r).join('・') || '取得資料'
      const where = (r.target_municipality ?? '').trim() || (r.request_to ?? '').trim() || ''
      const yr = (r.doc_year ?? r.myna_year) ? `・${r.doc_year ?? r.myna_year}` : ''
      const { data, error } = await supabase.from('contract_documents')
        .insert({ case_id: caseId, name: `${label}（${where}${yr}）`, category: '不動産', status: 'その場で受領', arrival_date: new Date().toLocaleDateString('sv-SE'), sort_order: 0 })
        .select('id').single()
      if (error || !data) { showToast(`契約手続きへの追加に失敗: ${error?.message ?? ''}`, 'error'); return }
      await saveMany(r.id, { acquirer: '自社', received_at_meeting: true, contract_document_id: (data as { id: string }).id })
      return
    }
    // 受領済 → それ以外に戻すときは、足した書類を消す
    if (cur === '受領済' && r.contract_document_id) {
      await supabase.from('contract_documents').delete().eq('id', r.contract_document_id)
    }
    await saveMany(r.id, { acquirer: acquirerValue(next), received_at_meeting: false, contract_document_id: null })
  }

  // 請求先の既定値：①市区町村役場＝「{市区町村}役所」（都道府県プレフィックスは省く）、②法務局＝物件の管轄法務局（registration_office）。
  const stripPref = (m: string) => m.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, '')
  const officeDefault = (muni?: string | null, propId?: string | null) => {
    if (scope === 'municipality') { const m = stripPref((muni ?? municipalityFilter ?? '').trim()); return m ? `${m}役所` : '市区町村役所' }
    if (scope === 'property') {
      // 対象物件の管轄法務局があればそれ、無ければ同市区町村の物件から拾う（A案：局名を表示・請求先に）。
      if (propId) { const p = properties.find(x => x.id === propId); const o = (p?.registration_office ?? '').trim(); if (o) return o }
      const pool = muni ? properties.filter(x => municipalityOf(x) === muni) : properties
      const o2 = (pool.find(x => (x.registration_office ?? '').trim())?.registration_office ?? '').trim()
      return o2 || '法務局'
    }
    return ''
  }
  // ①市区町村役場タブ：請求先が空／汎用（「市区町村役所」）の行を、この市区町村の「◯◯役所」に自動補完。
  useEffect(() => {
    if (scope !== 'municipality' || !municipalityFilter) return
    const want = officeDefault(municipalityFilter)
    const ids = acquisitions.filter(r => {
      if ((r.target_municipality ?? '') !== municipalityFilter) return false
      if (r.scope && r.scope !== 'municipality') return false
      if (!r.scope && itemMeta(r.item_type)?.target !== '市区町村') return false
      const cur = (r.request_to ?? '').trim()
      return cur === '' || cur === '市区町村役所' || cur === '市区町村役場'
    }).map(r => r.id)
    if (ids.length === 0) return
    supabase.from('real_estate_acquisitions').update({ request_to: want }).in('id', ids).then(({ error }) => {
      if (!error) setRows(prev => prev.map(r => (ids.includes(r.id) ? { ...r, request_to: want } : r)))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acquisitions, municipalityFilter, scope])

  const saveMany = async (id: string, patch: Partial<RealEstateAcquisitionRow>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } as RealEstateAcquisitionRow : r)))
    const { error } = await supabase.from('real_estate_acquisitions').update(patch).eq('id', id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error'); else onRefresh?.()
  }

  // 確認依頼を出す／取り消す（発送＝request・着＝receipt）。確認簿の受信箱に上げる/下ろす。
  const reqCheck = (r: RealEstateAcquisitionRow, kind: 'request' | 'receipt') => {
    const at = new Date().toISOString()
    void saveMany(r.id, kind === 'request'
      ? { request_check_requested_at: at, request_check_requested_by: meId }
      : { receipt_check_requested_at: at, receipt_check_requested_by: meId })
  }
  const cancelCheck = (r: RealEstateAcquisitionRow, kind: 'request' | 'receipt') => {
    void saveMany(r.id, kind === 'request'
      ? { request_check_requested_at: null, request_check_requested_by: null }
      : { receipt_check_requested_at: null, receipt_check_requested_by: null })
  }

  // scope に応じて取得物の選択肢を絞る（市区町村単位＝評価証明/名寄帳、物件単位＝登記情報 等）
  const scopeTarget = scope === 'municipality' ? '市区町村' : scope === 'property' ? '物件' : null
  // この市区町村に属する物件（物件単位の対象を絞る）。タブキーは municipalityOf（住所からの派生）なので揃える。
  const muniProps = municipalityFilter != null ? properties.filter(p => municipalityOf(p) === municipalityFilter) : properties
  const muniPropIds = new Set(muniProps.map(p => p.id))
  // 表示行：scope列（①市区町村/②物件）＋市区町村でフィルタ。
  // scope列が未設定のレガシー行は取得物(item_type)の対象種別から推定。
  const rowScopeOf = (r: RealEstateAcquisitionRow): 'municipality' | 'property' | null => {
    if (r.scope) return r.scope
    const meta = itemMeta(r.item_type)
    return meta ? (meta.target === '物件' ? 'property' : 'municipality') : null
  }
  const visibleRows = rows.filter(r => {
    if (scopeTarget) {
      const rs = rowScopeOf(r)
      if (rs == null || rs !== scope) return false   // scope不明 or 別scope行は出さない（①②の混在を防ぐ）
    }
    if (municipalityFilter == null) return true
    if (scope === 'municipality') return (r.target_municipality ?? '') === municipalityFilter
    if (scope === 'property') return (r.target_property_id != null && muniPropIds.has(r.target_property_id)) || (r.target_property_id == null && (r.target_municipality ?? '') === municipalityFilter)
    // scope='all'（カード表示）。役所ぶんも法務局ぶんも、この市区町村のものを全部出す。
    return (r.target_municipality ?? '') === municipalityFilter
      || (r.target_property_id != null && muniPropIds.has(r.target_property_id))
  })
  // 並び順：①市区町村役場 → ②法務局 の順にまとめ、法務局内は物件ごとにまとまるよう物件IDでソート。
  //   scope 未設定の行は item_type の対象から推定して②扱いに寄せる。
  visibleRows.sort((a, b) => {
    const sa = rowScopeOf(a) === 'property' ? 1 : 0
    const sb = rowScopeOf(b) === 'property' ? 1 : 0
    if (sa !== sb) return sa - sb
    const pa = a.target_property_id ?? ''
    const pb = b.target_property_id ?? ''
    if (pa !== pb) return pa.localeCompare(pb)
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
  // 確定費用の合計（＝この表の立替実費の実績）。戸籍タブと表示を揃える。
  const confirmedTotal = visibleRows.reduce((s, r) => s + (confirmedOf(r) ?? 0), 0)

  const save = async (id: string, field: keyof RealEstateAcquisitionRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as RealEstateAcquisitionRow : r)))
    const { error } = await supabase.from('real_estate_acquisitions').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  // 行の資料配列を取得。item_types 優先。空配列(null含む)なら旧 item_type にフォールバック。
  const itemsOf = (r: RealEstateAcquisitionRow): string[] => {
    const arr = r.item_types ?? []
    if (arr.length > 0) return arr
    return r.item_type ? [r.item_type] : []
  }
  // 資料チップのトグル。空になったら item_types=[] のまま残す（削除は行の×で行う）。
  const toggleItem = async (id: string, key: string) => {
    const row = rows.find(r => r.id === id); if (!row) return
    const cur = itemsOf(row)
    const next = cur.includes(key) ? cur.filter(x => x !== key) : [...cur, key]
    const meta = itemMeta(key)
    const fallbackOffice = (scope === 'municipality' || scope === 'property') ? officeDefault(row.target_municipality, row.target_property_id) : (meta?.office ?? '')
    setRows(prev => prev.map(r => (r.id === id ? { ...r, item_types: next, item_type: next[0] ?? null, request_to: r.request_to || fallbackOffice } : r)))
    await supabase.from('real_estate_acquisitions').update({ item_types: next, item_type: next[0] ?? null }).eq('id', id)
    if (fallbackOffice && !row.request_to) await supabase.from('real_estate_acquisitions').update({ request_to: fallbackOffice }).eq('id', id).is('request_to', null)
  }

  const addRow = async (forScope?: 'municipality' | 'property') => {
    const init: Partial<RealEstateAcquisitionRow> = { case_id: caseId, sort_order: rows.length }
    // カード表示はタブが1本なので、押したボタンで宛先（役所／法務局）を受け取る。
    const sc = forScope ?? (scope === 'municipality' || scope === 'property' ? scope : undefined)
    if (sc) init.scope = sc
    // 新規行をこの市区町村タブに固定（②物件はあとで物件を選ぶ）＋請求先の既定値をセット
    if (municipalityFilter != null) { init.target_municipality = municipalityFilter; const o = officeDefault(municipalityFilter); if (o) init.request_to = o }
    // 初期生成後に事務が足す＝承認ゲート対象（承認までタスクは作らない）
    if (additionsNeedApproval) init.is_additional = true
    const { error } = await supabase.from('real_estate_acquisitions').insert(init)
    if (error) { showToast(`追加に失敗しました: ${error.message}`, 'error'); return }
    onRefresh?.()
    if (additionsNeedApproval) { onAdditionalPending?.(); showToast('追加取得資料を登録しました（要承認・管理担当へ通知）。取得物を選ぶと承認できます。', 'success'); return }
    // この系統のタスクが無ければ親が作成ポップアップを出す（承認要のときはパネル経由なので出さない）
    if (municipalityFilter) onAfterAddRow?.()
  }

  const delRow = async (id: string) => {
    if (!confirm('この取得資料を削除しますか？')) return
    const { error } = await supabase.from('real_estate_acquisitions').delete().eq('id', id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const dateCls = 'w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white'
  const selCls = 'w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'

  // 状態列は撤去（作業状態は tasks.status に一本化・行状態は請求日/到着日/W-Checkから自明）
  const colCount = progressMode ? (fullCost ? 15 : 13) : 4  // 請求区分/取得区分/対象/請求先/取得資料/年度(+日付/費用/W-Check/受領)/削除

  // 1タブ＝1請求のカード表示。16列の表を横に流して読む形をやめる。
  if (layout === 'cards') {
    return (
      <>
        <ContractReceivedBlock docs={contractDocs} caseId={caseId} onRefresh={onRefresh} />
        <AcquisitionCards
          rows={visibleRows} properties={properties} muniProps={muniProps}
          activeId={activeId} setActiveId={setActiveId}
          itemsOf={itemsOf} rowScopeOf={rowScopeOf} officeDefault={officeDefault}
          save={save} saveMany={saveMany} toggleItem={toggleItem} addRow={addRow} delRow={delRow}
          reqCheck={reqCheck} cancelCheck={cancelCheck} setAcquirer={setAcquirer}
          receipts={receipts} meId={meId} fullCost={fullCost} confirmedOf={confirmedOf}
        />
        {visibleRows.length > 0 && (
          <p className="mt-2 text-[11.5px] text-gray-500 text-right">
            確定費用 合計（立替実費の実績）<span className="ml-2 font-semibold text-emerald-700">{yen(confirmedTotal)}</span>
          </p>
        )}
      </>
    )
  }

  return (
    <div>
      {/* 契約時に受領済の不動産関係書類（依頼者取得分）は別ブロックで上に表示。新規請求の表とは分ける。 */}
      <ContractReceivedBlock docs={contractDocs} caseId={caseId} onRefresh={onRefresh} />
      <div className="overflow-x-auto">
        <table className="text-[13px] border-collapse" style={{ minWidth: progressMode ? (fullCost ? 1860 : 1680) : 640, width: 'max-content' }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600 tracking-[0.04em]">
              {progressMode && <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-24">
                <span className="inline-flex items-center gap-1">請求区分<HintTip text={KIND_HINT} /></span>
              </th>}
              {progressMode && <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-28">
                <span className="inline-flex items-center gap-1">取得区分<HintTip text={ACQUIRER_HINT} /></span>
              </th>}
              <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-52">対象</th>
              <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-40"><span className="inline-flex items-center gap-1">請求先<HintTip text={scope === 'municipality' ? '請求する市区町村役所。物件の所在地から自動で入ります（編集可）。' : scope === 'property' ? '請求する法務局。必要なら管轄の法務局名に修正してください。' : 'どこに請求するか（役所・法務局など）。'} /></span></th>
              <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-56">取得する資料<span className="block text-[10px] font-normal text-brand-700">1宛先＝1請求（複数選択）</span></th>
              {progressMode && <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-28">
                <span className="inline-flex items-center gap-1">年度<HintTip text="名寄帳・評価証明の年度（和暦）。行ごとに持つので、令和7年度と令和8年度を並べて管理できます。登記情報・公図などには年度がありません。" /></span>
              </th>}
              {progressMode && <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-32">請求日</th>}
              {progressMode && <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-32">到着日</th>}
              {progressMode && fullCost && <th className="px-2 py-2 whitespace-nowrap text-right font-semibold w-28"><span className="inline-flex items-center gap-1">費用予算<HintTip text="請求時に用意した小為替等の金額（例: 定額小為替の合計）。" /></span></th>}
              {progressMode && fullCost && <th className="px-2 py-2 whitespace-nowrap text-right font-semibold w-20">返金</th>}
              {progressMode && <th className="px-2 py-2 whitespace-nowrap text-right font-semibold w-28"><span className="inline-flex items-center gap-1">確定費用<HintTip text={fullCost ? '実費＝予算−返金（お釣り）。自動計算されます。' : '実際にかかった額（印紙代など）を入力します。'} /></span></th>}
              {progressMode && <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-28"><span className="inline-flex items-center gap-1">発送チェック<HintTip text="請求（発送）が正しいか、確認簿で別の担当者に確認してもらう依頼を出します。請求日を入れると押せます。" /></span></th>}
              {progressMode && <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-28"><span className="inline-flex items-center gap-1">到着チェック<HintTip text="届いた物が正しいか、確認簿で別の担当者に確認してもらう依頼を出します。到着日を入れると押せます。" /></span></th>}
              {progressMode && <th className="px-2 py-2 whitespace-nowrap text-left font-semibold w-28">受領ファイル</th>}
              <th className="px-2 py-2 whitespace-nowrap w-8" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-4 py-6 text-center">
                <div className="text-[13px] text-gray-600 mb-1">取得資料はまだ登録されていません</div>
                <div className="text-[11.5px] text-gray-400 leading-relaxed">オーダーシート ＞ 財産調査 ＞ 不動産 で物件を登録すると、市区町村と物件に必要な資料が自動でここに並びます。<br />急ぎで足したい場合は下の「＋取得資料を追加」でこの場でも追加できます（追加は承認要）。</div>
              </td></tr>
            ) : visibleRows.map((r, i) => {
              const items = itemsOf(r)
              // isRef=行の資料が路線価のみ（実務上路線価は他資料と一緒に取ることは稀）。この時は請求先・日付なし。
              const isRef = items.length > 0 && items.every(x => itemMeta(x)?.method === '参照')
              const rowScope = rowScopeOf(r) ?? (itemMeta(items[0])?.target === '物件' ? 'property' : 'municipality')
              const isProp = rowScope === 'property'
              // 選択可能な資料キー：scope に応じて絞る（市区町村＝名寄帳/評価証明、物件＝登記情報/公図/地積/所有者事項/路線価）
              const availableItems = ACQUISITION_ITEMS.filter(x => x.target === (isProp ? '物件' : '市区町村')).map(x => x.key)
              const dash = <span className="text-gray-300 text-[11px]">—</span>
              // 受領済＝もう手元にある／依頼者取得＝依頼者が取る。どちらも請求日・費用は入れない。
              const acq = acquirerOf(r)
              const noRequest = acq !== '自社取得'
              const noCost = <span className="text-[11px] text-gray-400 whitespace-nowrap">{acq === '受領済' ? '受領済' : '依頼者負担'}</span>
              return (
                <tr key={r.id} className={`border-b border-gray-100 [&>td]:align-top ${isMistakenRequest(r.request_kind) ? 'bg-red-50/40' : i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  {/* 請求区分（誤請求＝費用はお客様に請求せず自社の経費） */}
                  {progressMode && (
                    <td className="px-2 py-1.5">
                      <select value={r.request_kind ?? '通常請求'} onChange={e => save(r.id, 'request_kind', e.target.value)} className={selCls}>
                        {RE_REQUEST_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </td>
                  )}
                  {/* 取得区分（誰が取るか・もう持っているか） */}
                  {progressMode && (
                    <td className="px-2 py-1.5">
                      <select value={acquirerOf(r)} onChange={e => setAcquirer(r, e.target.value)} className={selCls}>
                        {ACQUIRERS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                  )}
                  {/* 対象（物件select は [土地]/[建物] 付きで判別可能に） */}
                  <td className="px-2 py-1.5">
                    {(scope === 'property' || (scope === 'all' && isProp)) ? (
                      <select value={r.target_property_id ?? ''} onChange={e => save(r.id, 'target_property_id', e.target.value || null)} className={selCls}>
                        <option value="">— 物件を選択 —</option>
                        {muniProps.map(p => <option key={p.id} value={p.id}>{propLabelWithType(p)}</option>)}
                      </select>
                    ) : (
                      <input type="text" defaultValue={r.target_municipality ?? ''} onBlur={e => { if (e.target.value !== (r.target_municipality ?? '')) save(r.id, 'target_municipality', e.target.value || null) }} placeholder="例: 名古屋市中区" className={dateCls} />
                    )}
                  </td>
                  {/* 請求先（独立列。①は「◯◯役所」、②は「法務局」を既定でセット） */}
                  <td className="px-2 py-1.5">
                    {isRef ? <span className="text-[11px] text-gray-300">— 参照 —</span>
                      : <input key={r.request_to ?? ''} type="text" defaultValue={r.request_to ?? ''} onBlur={e => { if (e.target.value !== (r.request_to ?? '')) save(r.id, 'request_to', e.target.value || null) }} placeholder={officeDefault(r.target_municipality, r.target_property_id) || itemMeta(items[0])?.office || '請求先'} className={dateCls} />}
                  </td>
                  {/* 取得する資料（チップ複数選択・1行=1宛先＝1請求） */}
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {availableItems.map(key => {
                        const on = items.includes(key)
                        return (
                          <button key={key} type="button" onClick={() => toggleItem(r.id, key)}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10.5px] font-medium border transition-colors ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-700'}`}>
                            {on && '✓'}{key}
                          </button>
                        )
                      })}
                    </div>
                    {r.is_additional && !r.additional_approved_at && <div className="mt-1"><span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">追加・承認待ち</span></div>}
                    {isRef && <div className="text-[10px] text-gray-400 mt-0.5">参照（路線価図）のみ</div>}
                  </td>
                  {/* 年度（名寄帳・評価証明のみ。行ごとに持つ） */}
                  {progressMode && (
                    <td className="px-2 py-1.5">
                      {items.some(x => YEAR_ITEMS.includes(x)) ? (
                        <select value={r.doc_year ?? r.myna_year ?? ''} onChange={e => saveMany(r.id, { doc_year: e.target.value || null, myna_year: e.target.value || null })} className={selCls}>
                          <option value="">—</option>
                          {yearOptions().map(o => <option key={o} value={o}>{o}</option>)}
                          {(r.doc_year ?? r.myna_year) && !yearOptions().includes((r.doc_year ?? r.myna_year) as string) &&
                            <option value={(r.doc_year ?? r.myna_year) as string}>{r.doc_year ?? r.myna_year}</option>}
                        </select>
                      ) : dash}
                    </td>
                  )}
                  {/* 請求日（入力者を請求作業者として記録） */}
                  {progressMode && <td className="px-2 py-1.5">{isRef || noRequest ? (noRequest ? noCost : dash) : <input type="date" defaultValue={r.request_date ?? ''} onBlur={e => { const v = e.target.value; if (v !== (r.request_date ?? '')) saveMany(r.id, { request_date: v || null, ...(v && !r.request_done_by ? { request_done_by: meId } : {}) }) }} className={dateCls} />}</td>}
                  {/* 到着日（入力者を受信作業者として記録） */}
                  {progressMode && <td className="px-2 py-1.5">{isRef ? dash : <input type="date" defaultValue={r.arrival_date ?? ''} onBlur={e => { const v = e.target.value; if (v !== (r.arrival_date ?? '')) saveMany(r.id, { arrival_date: v || null, ...(v && !r.receipt_done_by ? { receipt_done_by: meId } : {}) }) }} className={dateCls} />}</td>}
                  {/* 費用予算（fullCostのみ） */}
                  {progressMode && fullCost && <td className="px-2 py-1.5 text-right">{isRef || noRequest ? dash : <MoneyCell value={r.cost_budget} onCommit={v => saveMany(r.id, { cost_budget: v === '' ? null : Number(v) })} />}</td>}
                  {/* 返金（fullCostのみ） */}
                  {progressMode && fullCost && <td className="px-2 py-1.5 text-right">{isRef || noRequest ? dash : <MoneyCell value={r.cost_refund} onCommit={v => saveMany(r.id, { cost_refund: v === '' ? null : Number(v) })} />}</td>}
                  {/* 確定費用（fullCost=予算−返金の自動計算／confirmedOnly=直接入力） */}
                  {progressMode && (
                    <td className="px-2 py-1.5 text-right">
                      {isRef || noRequest ? dash : fullCost
                        ? <span className={`font-semibold tabular-nums ${isMistakenRequest(r.request_kind) ? 'text-purple-700' : 'text-emerald-700'}`}>{yen(confirmedOf(r))}</span>
                        : <MoneyCell value={r.cost_confirmed} onCommit={v => saveMany(r.id, { cost_confirmed: v === '' ? null : Number(v) })} />}
                      {isMistakenRequest(r.request_kind) && <span className="block text-[10px] text-purple-600 mt-0.5">経費</span>}
                    </td>
                  )}
                  {/* 発送チェック依頼（請求日を入れると押せる。確認は確認簿で別の担当者が行う） */}
                  {progressMode && <td className="px-2 py-1.5">{isRef ? dash : (r.request_date
                    ? <CheckRequestControl label="発送チェックを依頼" requestedAt={r.request_check_requested_at} checkedAt={r.request_check_at} checkedName={r.request_check_name} onRequest={() => reqCheck(r, 'request')} onCancel={() => cancelCheck(r, 'request')} />
                    : <span className="text-[11px] text-gray-300">請求日待ち</span>)}</td>}
                  {/* 着チェック依頼（到着日を入れると押せる） */}
                  {progressMode && <td className="px-2 py-1.5">{isRef ? dash : (r.arrival_date
                    ? <CheckRequestControl label="到着チェックを依頼" requestedAt={r.receipt_check_requested_at} checkedAt={r.receipt_check_at} checkedName={r.receipt_check_name} onRequest={() => reqCheck(r, 'receipt')} onCancel={() => cancelCheck(r, 'receipt')} />
                    : <span className="text-[11px] text-gray-300">到着待ち</span>)}</td>}
                  {/* 受領ファイル */}
                  {progressMode && (
                    <td className="px-2 py-1.5">
                      {(() => {
                        const files = receiptFilesFor(receipts, 'real_estate_acquisition', r.id)
                        return files.length > 0
                          ? <div className="flex flex-col gap-1 items-start">{files.map((f, k) => <OpenStorageFile key={k} bucket={f.bucket} path={f.path} name={f.name} label="受領ファイル" />)}</div>
                          : <span className="text-[11px] text-gray-300">—</span>
                      })()}
                    </td>
                  )}
                  {/* 削除 */}
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {progressMode && visibleRows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-gray-700">
                <td className="px-2 py-2 text-right" colSpan={fullCost ? 10 : 8}>確定費用 合計（誤請求分は経費として別集計）</td>
                <td className="px-2 py-2 text-right text-emerald-700 tabular-nums">{yen(confirmedTotal)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button type="button" onClick={() => addRow()} className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors">
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> 取得資料を追加
      </button>
    </div>
  )
}
