'use client'

import { useState, useEffect, useRef } from 'react'
import { Trash2, Plus, Lock, LockOpen, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { evidenceDocsFor } from '@/lib/constants'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useAuth } from '@/components/providers/AuthProvider'
import { ACQUIRERS, acquirerLabel } from '@/lib/acquirer'
import { SURVEY_BAN_DESIGNATIONS, SURVEY_BAN_METHODS, isSurveyBanActive } from '@/lib/financialBan'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { FinancialAssetRow, CaseRow, TaskRow, ContractDocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'
import { receiptFilesFor } from '@/lib/relatedTasks'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'
import ContractReceivedBlock from './ContractReceivedBlock'

const REQ = ['要', '不要', '確認中']
const CANCEL = ['有', '無', '確認中']
const ACCOUNT_TYPES = ['普通', '定期', '当座', '積立', '貯蓄', 'その他']

type Kind = '預貯金' | '証券' | '信託銀行'
type ColType = 'text' | 'req' | 'cancel' | 'accountType' | 'acquirer'
type Col = { key: keyof FinancialAssetRow; label: string; type: ColType; width?: string }

// 取得区分（自社/依頼者）と調査禁止(開始/終了/理由)は 表の左端に固定配置する（cols とは別にヘッダ/行で描画）。
// 依頼者取得なら以降の調査系入力は不要になる。

// 種別ごとの列定義（取得区分・調査禁止は左端固定・残高証明取得日・備考・進捗列は共通で末尾に付与）
const COLUMNS: Record<Kind, Col[]> = {
  '預貯金': [
    { key: 'institution_name', label: '金融機関名', type: 'text' },
    { key: 'branch_name', label: '支店', type: 'text', width: 'w-28' },
    { key: 'account_type', label: '口座種別', type: 'accountType', width: 'w-24' },
    // 財産目録の表記に使う（「みずほ銀行 渋谷支店 1234567」の形）
    { key: 'account_number', label: '口座番号', type: 'text', width: 'w-32' },
    { key: 'all_branch_survey', label: '全店調査', type: 'req', width: 'w-24' },
    { key: 'balance_cert_required', label: '残高証明', type: 'req', width: 'w-24' },
    { key: 'accrued_interest_required', label: '経過利息', type: 'req', width: 'w-24' },
    { key: 'transaction_detail_required', label: '取引明細', type: 'req', width: 'w-24' },  // エクセルR79・NEW
    // 解約有無（cancellation_required）。同じ行を解約タブと共有するため、ここで「有」にすると解約手続タブに出る。
    { key: 'cancellation_required', label: '解約', type: 'cancel', width: 'w-24' },
  ],
  '証券': [
    { key: 'institution_name', label: '証券会社', type: 'text' },
    { key: 'branch_name', label: '支店名', type: 'text', width: 'w-28' },
    { key: 'stock_name', label: '銘柄名', type: 'text' },
    { key: 'all_branch_survey', label: '全店調査', type: 'req', width: 'w-24' },  // エクセルR96・NEW
    { key: 'balance_cert_required', label: '残高証明', type: 'req', width: 'w-24' },
    { key: 'cancellation_required', label: '解約有無', type: 'cancel', width: 'w-24' },  // エクセルR98・NEW（取引明細は削除）
  ],
  '信託銀行': [
    { key: 'institution_name', label: '信託銀行名', type: 'text' },
    { key: 'stock_name', label: '銘柄名', type: 'text' },
    { key: 'share_cert_required', label: '所有株式数証明', type: 'req', width: 'w-28' },
    { key: 'unclaimed_dividend_required', label: '未受領配当金', type: 'req', width: 'w-28' },
    { key: 'cancellation_required', label: '解約有無', type: 'cancel', width: 'w-24' },  // エクセルR112・NEW
  ],
}

type Props = {
  caseId: string
  kind: Kind
  assets: FinancialAssetRow[]
  onRefresh?: () => void
  /** 対応中タブ（進捗管理）で「請求日・到着日」列を表示。オーダーシートでは false */
  progressMode?: boolean
  // 役割分担（取得区分の一括反映用）
  roles?: CaseRow['intake_roles']
  // 受信簿＋タスク（受信トリガーで着手したタスクへの「関連タスク」リンク用）
  receipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  // 契約時にお客様から受領した金融関係書類（区分=財産のうち金融分）。表の先頭に受領済として表示。
  contractDocs?: ContractDocumentRow[]
  /** 金融機関タブで使用：この金融機関の口座だけ表示し、新規行もこの金融機関にする */
  institutionFilter?: string
  /** 口座タブで使用：この口座(id)だけ表示 */
  accountId?: string
  /** 口座タブで使用：表ではなく1行1項目のカードで表示 */
  cardLayout?: boolean
  /** 金融機関タブで使用：残高確定トグル列を表示（管理担当のみ操作可） */
  showConfirmed?: boolean
}

/** 金融機関の表（預金/証券/信託で列が変わる）。インライン編集・行追加。 */
export default function FinancialAssetsTable({ caseId, kind, assets, onRefresh, progressMode = false, receipts = [], contractDocs = [], institutionFilter, accountId, cardLayout = false, showConfirmed = false }: Props) {
  const supabase = createClient()
  const memberId = useCurrentMember(null)
  const authUser = useAuth()
  const memberName = authUser?.memberName ?? authUser?.email ?? null   // 確認のハンコに出す名前
  const [rows, setRows] = useState<FinancialAssetRow[]>(() => assets.filter(a => a.asset_type === kind))
  // 入力したがまだ保存できていない値（行ID→項目）。親からの再取得で消されないよう手元に持つ。
  const pendingRef = useRef<Record<string, Partial<FinancialAssetRow>>>({})
  // 入力中の自動保存タイマー（行ID:項目 ごと）
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // この画面で追加した行。サーバーの一覧にまだ載っていない間も消さないための印。
  const addedRef = useRef<Set<string>>(new Set())
  // assets prop（親のonRefresh後の最新データ）が変わったら rows を同期。
  // これが無いと、オーダーシートで追加した口座が実務タブに反映されない等の不整合が起きる。
  //
  // ただし単純に置き換えてはいけない。「＋追加」は直後に親の再取得を投げるので、
  // 追加した行に金融機関名を打っている最中に古いデータが返ってきて、打った文字が消えていた
  // （＝最後に追加した行だけ保存されない）。未保存の値と、まだ一覧に載っていない追加行は残す。
  useEffect(() => {
    const server = assets.filter(a => a.asset_type === kind)
    const ids = new Set(server.map(a => a.id))
    const merged = server.map(a => {
      const p = pendingRef.current[a.id]
      return p ? { ...a, ...p } as FinancialAssetRow : a
    })
    setRows(prev => [...merged, ...prev.filter(r => !ids.has(r.id) && addedRef.current.has(r.id))])
  }, [assets, kind])
  // 画面を離れるときは、待機中の自動保存をその場で流す（ページを移っても入力が消えないように）
  useEffect(() => () => {
    Object.values(timersRef.current).forEach(clearTimeout)
    for (const [id, patch] of Object.entries(pendingRef.current)) {
      if (patch && Object.keys(patch).length > 0) void supabase.from('financial_assets').update(patch).eq('id', id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [busy, setBusy] = useState(false)
  // 口座種別・口座番号は実務タブのみ（オーダーシートでは非表示）。エクセルR74-75。
  const cols = COLUMNS[kind].filter(c => progressMode || c.key !== 'account_type')
  // institutionFilter（左レールのキー）は trim 済み。r.institution_name もtrimして比較しないと、
  // 名称に前後空白があるとレール(=trim)には出るのに口座一覧(=非trim比較)が0件になる不整合が起きる。
  const visibleRows = accountId != null ? rows.filter(r => r.id === accountId)
    : institutionFilter != null ? rows.filter(r => (r.institution_name ?? '').trim() === institutionFilter.trim()) : rows
  // 財産調査禁止ホールド：調査禁止指定=指定あり かつ（期間指定で終了日前 / 連絡待ちで未解除）のとき調査を止める。
  const todayYmd = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const isSurveyBanned = (r: FinancialAssetRow) => isSurveyBanActive(r, todayYmd)
  // 投信/貸金庫チェックは実務・預金のみ。凍結済みフラグはオーダーシート(!progressMode)のみ左端に出す。
  // 残高/評価額・根拠資料は調査で分かることなので、オーダーシート（面談時のヒアリング）では出さない。
  const showTrustSafe = progressMode && kind === '預貯金'
  const showFreezeFlag = !progressMode
  const showBalanceCols = progressMode || showConfirmed
  // 取引明細の取得期間。取引明細の列を持つ種別（預金）の実務タブだけに出す。
  const showTxPeriods = progressMode && cols.some(c => c.key === 'transaction_detail_required')
  const [safeDepositPrompt, setSafeDepositPrompt] = useState<{ bank: string } | null>(null)

  // 残高確定・凍結確認は「確認簿へ依頼 → 確認簿で確認」をやめ、この表でそのままチェックする。
  // 凍結確認は解約タスクの着手ゲートになっているので、付けられる場所は残す必要がある。
  const patchReq = async (row: FinancialAssetRow, patch: Partial<FinancialAssetRow>) => {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } as FinancialAssetRow : r))
    const { error } = await supabase.from('financial_assets').update(patch).eq('id', row.id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    onRefresh?.()
  }
  const setFreezeConfirmed = (row: FinancialAssetRow, on: boolean) => patchReq(row, on
    ? { freeze_confirmed: true, freeze_confirmed_at: new Date().toISOString(), freeze_confirmed_by: memberId, freeze_confirmed_name: memberName }
    : { freeze_confirmed: false, freeze_confirmed_at: null, freeze_confirmed_by: null, freeze_confirmed_name: null })
  const setBalanceConfirmed = (row: FinancialAssetRow, on: boolean) => patchReq(row, on
    ? { balance_confirmed: true, balance_confirmed_at: new Date().toISOString(), balance_confirmed_by: memberId, balance_confirmed_name: memberName }
    : { balance_confirmed: false, balance_confirmed_at: null, balance_confirmed_by: null, balance_confirmed_name: null })
  // 貸金庫「あり」に切替 → 銀行単位のタスク作成ポップアップ。投信はチェックのみ（タスク無し）。
  const toggleSafeDeposit = async (row: FinancialAssetRow, checked: boolean) => {
    await patchReq(row, { has_safe_deposit: checked })
    const bank = (row.institution_name ?? '').trim()
    if (checked && bank) setSafeDepositPrompt({ bank })
  }
  const createSafeDepositTasks = async (bank: string) => {
    const plan = [
      { rid: `safe-deposit-ask:${bank}`, title: `【${bank}】依頼者への貸金庫内容確認依頼` },
      { rid: `safe-deposit-check:${bank}`, title: `【${bank}】貸金庫内容物の確認` },
    ]
    const { data: existing } = await supabase.from('tasks').select('source_rid').eq('case_id', caseId).in('source_rid', plan.map(p => p.rid))
    const have = new Set(((existing ?? []) as { source_rid: string }[]).map(x => x.source_rid))
    const rows2 = plan.filter(p => !have.has(p.rid)).map((p, i) => ({
      case_id: caseId, task_kind: 'case', title: p.title, phase: '金融資産', category: '金融資産',
      status: '着手前', priority: '通常', source_rid: p.rid, work_role: 'assistant', sort_order: 90 + i,
    }))
    if (rows2.length > 0) { const { error } = await supabase.from('tasks').insert(rows2); if (error) { showToast(`タスク生成に失敗: ${error.message}`, 'error'); } else showToast(`${rows2.length}件のタスクを作成しました`, 'success') }
    setSafeDepositPrompt(null); onRefresh?.()
  }
  // 凍結確認済フラグ（オーダーシート・事前凍結）。freeze_confirmed を手動でON/OFF。
  const toggleFreezeFlag = (row: FinancialAssetRow, checked: boolean) =>
    patchReq(row, checked
      ? { freeze_confirmed: true, freeze_confirmed_at: new Date().toISOString(), freeze_confirmed_name: '事前凍結' }
      : { freeze_confirmed: false, freeze_confirmed_at: null, freeze_confirmed_name: null })
  // 連絡待ちの解除（お客様OK）：解除日を当日で記録。
  const releaseWait = (row: FinancialAssetRow) => patchReq(row, { prohibition_released_at: todayYmd })

  const applyLocal = (id: string, field: keyof FinancialAssetRow, value: unknown) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as FinancialAssetRow : r)))

  // 入力中：手元の表示を更新し、未保存の値として控えたうえで、少し待ってから保存する。
  // フォーカスを外す前にページを移っても、離脱時にまとめて保存されるので消えない。
  const setLocal = (id: string, field: keyof FinancialAssetRow, value: unknown) => {
    applyLocal(id, field, value)
    pendingRef.current[id] = { ...pendingRef.current[id], [field]: value }
    const key = `${id}:${String(field)}`
    clearTimeout(timersRef.current[key])
    timersRef.current[key] = setTimeout(() => { commit(id, field, value as string) }, 800)
  }

  // 文字列以外（根拠資料の有無=boolean、根拠資料の種別=string[]）も保存できるようにする。
  // 空文字だけ null に落とす従来の挙動は維持（他の列がそれ前提のため）。
  //
  // 画面の値もここで更新する。以前は DB だけ書いて手元の行を直しておらず、
  // チェックボックスが押しても変わらない（＝押せない）ように見えていた。
  const commit = async (id: string, field: keyof FinancialAssetRow, value: unknown) => {
    const key = `${id}:${String(field)}`
    clearTimeout(timersRef.current[key])
    delete timersRef.current[key]
    // institution_name は NOT NULL。空にしたら null ではなく空文字で保存する。
    const v = value === '' ? (field === 'institution_name' ? '' : null) : value
    applyLocal(id, field, v)
    pendingRef.current[id] = { ...pendingRef.current[id], [field]: v }
    const { error } = await supabase.from('financial_assets').update({ [field]: v }).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    // 保存できたので未保存の印を落とす（以降は親の再取得で上書きされてよい）
    const p = pendingRef.current[id]
    if (p) {
      delete p[field]
      if (Object.keys(p).length === 0) delete pendingRef.current[id]
    }
  }
  const save = (id: string, field: keyof FinancialAssetRow, value: string) => { commit(id, field, value) }

  const addRow = async () => {
    setBusy(true)
    // 取得区分の既定は常に「自社取得」。役割分担には引っ張られない。
    const { data, error } = await supabase.from('financial_assets').insert({ case_id: caseId, asset_type: kind, institution_name: institutionFilter ?? '', acquirer: '自社' }).select('*').single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    addedRef.current.add((data as FinancialAssetRow).id)
    setRows(prev => [...prev, data as FinancialAssetRow])
    onRefresh?.()
  }

  const delRow = async (row: FinancialAssetRow) => {
    if (!confirm(`「${row.institution_name || '未入力'}」を削除しますか？`)) return
    const { error } = await supabase.from('financial_assets').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    delete pendingRef.current[row.id]
    addedRef.current.delete(row.id)
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  // 列数（空表示のcolspan用）。取得区分+調査禁止+備考+削除=4 固定 ＋cols＋各条件列。
  const colCount = 4 + cols.length
    + (showBalanceCols ? 3 : 0)     // 残高+根拠資料有無+根拠資料
    + (showTxPeriods ? 1 : 0)
    + (showFreezeFlag ? 1 : 0)
    + (progressMode ? 8 : 0)       // 凍結状態+凍結確認+残高証明取得日+請求+到着+受信+関連+備考結果
    + (showConfirmed ? 1 : 0)
    + (showTrustSafe ? 1 : 0)

  const dateCls = 'w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500'
  const selCls = 'w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500'

  // 調査禁止（指定なし/あり → 方法 → 期間指定なら日付 → 理由 → 連絡待ち解除）を1セルにまとめて描画（表・カード共用）
  const renderBanCell = (r: FinancialAssetRow) => {
    const desig = r.survey_prohibited_designation ?? '指定なし'
    const on = desig === '指定あり'
    const method = r.survey_prohibited_method ?? ''
    const isPeriod = method === '期間指定'
    const isWait = method === 'お客さんからの連絡待ち'
    return (
      <div className="flex flex-col gap-1 min-w-[210px]">
        <select value={desig} onChange={e => save(r.id, 'survey_prohibited_designation', e.target.value)} className={selCls}>
          {SURVEY_BAN_DESIGNATIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {on && (
          <select value={method} onChange={e => save(r.id, 'survey_prohibited_method', e.target.value)} className={selCls}>
            <option value="">禁止方法を選択</option>
            {SURVEY_BAN_METHODS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {on && isPeriod && (
          <div className="flex items-center gap-1">
            <input type="date" value={r.survey_prohibited_start ?? ''} onChange={e => setLocal(r.id, 'survey_prohibited_start', e.target.value)} onBlur={e => commit(r.id, 'survey_prohibited_start', e.target.value)} className={dateCls} />
            <span className="text-gray-400 text-[11px]">〜</span>
            <input type="date" value={r.survey_prohibited_end ?? ''} onChange={e => setLocal(r.id, 'survey_prohibited_end', e.target.value)} onBlur={e => commit(r.id, 'survey_prohibited_end', e.target.value)} className={dateCls} />
          </div>
        )}
        {on && <TextInput value={r.survey_prohibited_reason} onChange={v => setLocal(r.id, 'survey_prohibited_reason', v)} onCommit={v => commit(r.id, 'survey_prohibited_reason', v)} placeholder="禁止理由" />}
        {/* 禁止の解除は実務の操作なので実務タブだけに出す。
            オーダーシートは面談直後の指示書で、その場で解除することはない。 */}
        {progressMode && on && isWait && !r.prohibition_released_at && (
          <button type="button" onClick={() => releaseWait(r)} className="self-start inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100"><LockOpen className="w-3 h-3" strokeWidth={2} />禁止を解除（お客様OK）</button>
        )}
        {on && isWait && r.prohibition_released_at && <span className="text-[10.5px] text-emerald-600">連絡待ち 解除済 {r.prohibition_released_at}</span>}
      </div>
    )
  }
  // ── 取引明細の取得期間（口座ごと・複数本） ──
  // 相続開始日までの1本で済むとは限らず、使途不明金の確認などで別の年度を追加請求することがある。
  const txPeriodsOf = (r: FinancialAssetRow) => (r.transaction_periods ?? []) as { start: string | null; end: string | null }[]
  const saveTxPeriods = (r: FinancialAssetRow, list: { start: string | null; end: string | null }[]) =>
    commit(r.id, 'transaction_periods', list)
  // 取引明細を「要」にした時点で、空の1本目を用意する（毎回「追加」を押さずに済むように）
  const selectCol = async (r: FinancialAssetRow, key: keyof FinancialAssetRow, v: string) => {
    await commit(r.id, key, v)
    if (key === 'transaction_detail_required' && v === '要' && txPeriodsOf(r).length === 0) {
      await saveTxPeriods(r, [{ start: null, end: null }])
    }
  }
  const renderTxPeriodsCell = (r: FinancialAssetRow) => {
    const list = txPeriodsOf(r)
    const need = (r.transaction_detail_required ?? '') === '要'
    // 「不要」に戻しても入力済みの期間は消さない（畳んで残す）。
    if (!need && list.length === 0) return <span className="text-[12px] text-gray-300">—</span>
    const setAt = (i: number, key: 'start' | 'end', v: string) =>
      saveTxPeriods(r, list.map((x, j) => (j === i ? { ...x, [key]: v || null } : x)))
    const removeAt = (i: number) => saveTxPeriods(r, list.filter((_, j) => j !== i))
    const dCls = 'px-1 py-1 text-[11px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500'
    return (
      <div className="flex flex-col gap-1 min-w-[248px]">
        {list.map((x, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-[10.5px] text-gray-400 w-3 flex-none">{i + 1}</span>
            <input type="date" value={x.start ?? ''} onChange={e => setAt(i, 'start', e.target.value)} className={dCls} />
            <span className="text-[10.5px] text-gray-400">〜</span>
            <input type="date" value={x.end ?? ''} onChange={e => setAt(i, 'end', e.target.value)} className={dCls} />
            <button type="button" onClick={() => removeAt(i)} title="この期間を削除" className="text-gray-300 hover:text-red-500 flex-none"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        {!need && list.length > 0 && <span className="text-[10.5px] text-gray-400">取引明細は「要」ではありません</span>}
        {need && (
          <button type="button" onClick={() => saveTxPeriods(r, [...list, { start: null, end: null }])}
            className="self-start inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700">
            <Plus className="w-3 h-3" strokeWidth={2.5} />期間を追加
          </button>
        )}
      </div>
    )
  }

  // ── 残高証明取得日 ──
  // 「相続開始日」と任意の日付は併用する（相続開始日の残高と、直近の残高の両方を取ることがある）。
  // 任意の日付は何本でも足せる。
  const balCertDates = (r: FinancialAssetRow) => (r.balance_cert_dates ?? []) as string[]
  const saveBalCertDates = (r: FinancialAssetRow, list: string[]) => commit(r.id, 'balance_cert_dates', list)
  const renderBalanceCertCell = (r: FinancialAssetRow) => {
    const list = balCertDates(r)
    const dCls = 'w-[130px] flex-none px-1 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500'
    return (
      <div className="flex flex-col gap-1 min-w-[170px]">
        <label className="inline-flex items-center gap-1.5 text-[11.5px] cursor-pointer">
          <input type="checkbox" checked={!!r.balance_cert_on_death} onChange={e => commit(r.id, 'balance_cert_on_death', e.target.checked)} className="w-4 h-4 accent-brand-600" />
          <span className={r.balance_cert_on_death ? 'text-gray-700 font-semibold' : 'text-gray-500'}>相続開始日</span>
        </label>
        {list.map((d, i) => (
          <div key={i} className="flex items-center gap-1">
            <input type="date" value={d ?? ''} onChange={e => saveBalCertDates(r, list.map((x, j) => (j === i ? e.target.value : x)))} className={dCls} />
            <button type="button" onClick={() => saveBalCertDates(r, list.filter((_, j) => j !== i))} title="この日付を削除" className="text-gray-300 hover:text-red-500 flex-none"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <button type="button" onClick={() => saveBalCertDates(r, [...list, ''])}
          className="self-start inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700">
          <Plus className="w-3 h-3" strokeWidth={2.5} />日付を追加
        </button>
      </div>
    )
  }

  // 投信有無・貸金庫有無（預金・実務のみ）。貸金庫ありでタスク生成ポップアップ。
  const renderTrustSafeCell = (r: FinancialAssetRow) => (
    <div className="flex flex-col gap-1.5">
      <label className="inline-flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={r.has_investment_trust} onChange={e => patchReq(r, { has_investment_trust: e.target.checked })} className="w-4 h-4 accent-brand-600" />投信あり</label>
      <label className="inline-flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={r.has_safe_deposit} onChange={e => toggleSafeDeposit(r, e.target.checked)} className="w-4 h-4 accent-brand-600" />貸金庫あり</label>
    </div>
  )
  // 凍結済みフラグ（オーダーシート・事前凍結）
  const renderFreezeFlagCell = (r: FinancialAssetRow) => (
    <label className="inline-flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={r.freeze_confirmed} onChange={e => toggleFreezeFlag(r, e.target.checked)} className="w-4 h-4 accent-emerald-600" /><span className={r.freeze_confirmed ? 'text-emerald-700 font-semibold' : 'text-gray-500'}>凍結済み</span></label>
  )

  // 口座1件＝1カード（口座タブ／スマホ表示で共用）。請求日・到着日・備考結果は progressMode のみ。
  const renderCard = (r: FinancialAssetRow) => { const banned = isSurveyBanned(r); return (
    <div key={r.id} className={`rounded-xl border ${banned ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'}`}>
      {banned && <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-600 bg-gray-100 border-b border-gray-200 flex items-center gap-1"><Lock className="w-3 h-3" strokeWidth={2} />財産調査 ホールド中（調査禁止指定あり）調査は編集できません</div>}
      {showFreezeFlag && <CardRow label="凍結済み（事前凍結）">{renderFreezeFlagCell(r)}</CardRow>}
      {progressMode && (
        <CardRow label="凍結可否">
          {r.freeze_confirmed
            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><Lock className="w-3 h-3" strokeWidth={2} />凍結OK</span>
            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-600 border border-gray-200"><LockOpen className="w-3 h-3" strokeWidth={2} />未確認</span>}
        </CardRow>
      )}
      {/* 取得区分を先頭に */}
      <CardRow label="取得区分">
        <select value={r.acquirer ?? '自社'} onChange={e => save(r.id, 'acquirer', e.target.value)} className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">{ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}</select>
      </CardRow>
      {cols.map(c => (
        <CardRow key={c.key} label={c.label}>
          {c.type === 'text'
            ? <TextInput value={(r[c.key] as string) ?? null} onChange={v => setLocal(r.id, c.key, v)} onCommit={v => commit(r.id, c.key, v)} />
            : <SmallSelect value={(r[c.key] as string) ?? ''} options={c.type === 'cancel' ? CANCEL : c.type === 'accountType' ? ACCOUNT_TYPES : REQ} onChange={v => selectCol(r, c.key, v)} />}
        </CardRow>
      ))}
      {showTxPeriods && <CardRow label="取引明細の取得期間">{renderTxPeriodsCell(r)}</CardRow>}
      {showBalanceCols && <CardRow label="残高/評価額">{banned ? <span className="text-[12px] text-gray-400">禁止期間中は入力不可</span> : <MoneyInput value={r.balance_amount} onCommit={v => commit(r.id, 'balance_amount', v)} />}</CardRow>}
      {progressMode && (
        <CardRow label="凍結確認">
          {banned ? <span className="text-[12px] text-gray-400">禁止期間中はチェックできません</span>
            : <ConfirmCheck on={r.freeze_confirmed} at={r.freeze_confirmed_at} name={r.freeze_confirmed_name} onChange={v => setFreezeConfirmed(r, v)} />}
        </CardRow>
      )}
      {showConfirmed && (
        <CardRow label="残高確定">
          {banned ? <span className="text-[12px] text-gray-400">禁止期間中はチェックできません</span>
            : r.balance_amount != null
              ? <ConfirmCheck on={r.balance_confirmed} at={r.balance_confirmed_at} name={r.balance_confirmed_name} onChange={v => setBalanceConfirmed(r, v)} />
              : <span className="text-[12px] text-gray-400">残高を入れるとチェックできます</span>}
        </CardRow>
      )}
      {progressMode && <CardRow label="請求日"><input type="date" defaultValue={r.request_date ?? ''} onBlur={e => { if (e.target.value !== (r.request_date ?? '')) commit(r.id, 'request_date', e.target.value) }} className="w-full px-2 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white" /></CardRow>}
      {progressMode && (
        <CardRow label="到着日（受信簿）">
          {r.arrival_date
            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200"><Check className="w-3 h-3" />受信済 {r.arrival_date}</span>
            : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200">未受信</span>}
        </CardRow>
      )}
      {progressMode && <CardRow label="残高証明取得日">{renderBalanceCertCell(r)}</CardRow>}
      {showTrustSafe && <CardRow label="投信/貸金庫">{renderTrustSafeCell(r)}</CardRow>}
      <CardRow label="調査禁止">{renderBanCell(r)}</CardRow>
      <CardRow label="備考"><TextInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="特記事項" /></CardRow>
      {progressMode && <CardRow label="備考・結果"><TextInput value={r.survey_result} onChange={v => setLocal(r.id, 'survey_result', v)} onCommit={v => commit(r.id, 'survey_result', v)} placeholder="この口座で分かったこと" /></CardRow>}
      <div className="flex justify-end px-3 py-2">
        <button type="button" onClick={() => delRow(r)} className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" />この口座を削除</button>
      </div>
    </div>
  ) }

  // 口座カード（口座タブ用・1口座）。
  if (cardLayout) {
    const r = visibleRows[0]
    if (!r) return <div className="rounded-md border border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-[12px] text-gray-400">口座がありません。</div>
    return renderCard(r)
  }

  return (
    <div>
      {/* 契約時にお客様から受領済の書類（依頼者取得分）は別ブロックで上に表示。新規請求の表とは分ける。 */}
      <ContractReceivedBlock docs={contractDocs} caseId={caseId} onRefresh={onRefresh} />
      {/* 表示：PC(sm以上)は表・スマホはカード。案件詳細/オーダーシート共通（表に統一・横スクロール）。 */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="text-[13px] border-collapse" style={{ minWidth: progressMode ? 2820 : 1300, width: 'max-content' }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              {showFreezeFlag && <th className="px-2 py-2 text-left font-semibold w-28">凍結済み</th>}
              {progressMode && <th className="px-2 py-2 text-center font-semibold w-24">凍結可否</th>}
              <th className="px-2 py-2 text-left font-semibold w-28">取得区分</th>
              {cols.map(c => <th key={c.key} className={`px-2 py-2 text-left font-semibold ${c.width ?? ''}`}>{c.label}</th>)}
              {showBalanceCols && <th className="px-2 py-2 text-right font-semibold w-32">残高/評価額</th>}
              {showBalanceCols && <th className="px-2 py-2 text-center font-semibold w-20">根拠資料<span className="block text-[10px] font-normal text-brand-700">有無</span></th>}
              {showBalanceCols && <th className="px-2 py-2 text-left font-semibold w-56">根拠資料</th>}
              {progressMode && <th className="px-2 py-2 text-center font-semibold w-24">凍結確認</th>}
              {showConfirmed && <th className="px-2 py-2 text-center font-semibold w-24">残高確定</th>}
              {showTxPeriods && <th className="px-2 py-2 text-left font-semibold w-64">取引明細の取得期間</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-44">残高証明取得日</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-28">請求日</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-28">到着日</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-20">受信</th>}
              {showTrustSafe && <th className="px-2 py-2 text-left font-bold text-brand-700 w-28">投信/貸金庫</th>}
              <th className="px-2 py-2 text-left font-bold text-amber-700 w-56">調査禁止</th>
              <th className="px-2 py-2 text-left font-semibold">備考</th>
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-56">備考・結果</th>}
              {progressMode && <th className="px-2 py-2 text-left font-semibold w-36">受領ファイル</th>}
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-[13px] text-gray-400">登録されていません</td></tr>
            ) : (
              // セルは上ぞろえ（[&>td]:align-top）。調査禁止で「指定あり」を選ぶと欄が4段に伸びるため、
              // 中央ぞろえのままだと他のセルだけ下がって、上の行の続きに見えてしまう。
              visibleRows.map(r => { const banned = isSurveyBanned(r); const lock = banned ? 'pointer-events-none opacity-50' : ''; return (
                <tr key={r.id} className={`border-b border-gray-200 last:border-b-0 [&>td]:align-top ${banned ? 'bg-gray-100/70' : progressMode && !r.freeze_confirmed ? 'bg-amber-50/30' : ''}`}>
                  {/* 凍結確認済フラグ（オーダーシート・事前凍結） */}
                  {showFreezeFlag && <td className="px-2 py-1.5">{renderFreezeFlagCell(r)}</td>}
                  {/* 凍結状態バッジ（左端・目視用。依頼ボタンは右側の「凍結確認」列に別途配置） */}
                  {progressMode && (
                  <td className="px-2 py-1.5 text-center">
                    {r.freeze_confirmed
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><Lock className="w-3 h-3" strokeWidth={2} />凍結OK</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-gray-50 text-gray-600 border border-gray-200"><LockOpen className="w-3 h-3" strokeWidth={2} />未確認</span>}
                  </td>
                  )}
                  {/* 左端固定：取得区分（禁止期間中もロックしない） */}
                  <td className="px-2 py-1.5">
                    <select value={r.acquirer ?? '自社'} onChange={e => save(r.id, 'acquirer', e.target.value)} className="w-full px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">{ACQUIRERS.map(a => <option key={a} value={a}>{acquirerLabel(a)}</option>)}</select>
                  </td>
                  {cols.map(c => (
                    <td key={c.key} className={`px-2 py-1.5 ${lock}`}>
                      {c.type === 'text' ? (
                        <TextInput value={(r[c.key] as string) ?? null} onChange={v => setLocal(r.id, c.key, v)} onCommit={v => commit(r.id, c.key, v)} />
                      ) : (
                        <SmallSelect value={(r[c.key] as string) ?? ''} options={c.type === 'cancel' ? CANCEL : c.type === 'accountType' ? ACCOUNT_TYPES : REQ} onChange={v => selectCol(r, c.key, v)} />
                      )}
                    </td>
                  ))}
                  {/* 残高/評価額（目録・精算書の収入の源泉）。禁止期間中は入力不可＝禁止バッジを表示 */}
                  {showBalanceCols && (
                  <td className="px-2 py-1.5">
                    {banned
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold text-gray-500 bg-gray-100 border border-gray-300" title={r.survey_prohibited_reason ?? '財産調査禁止期間中'}><Lock className="w-3 h-3" strokeWidth={2} />禁止期間中〜{r.survey_prohibited_end?.slice(5).replace('-', '/')}</span>
                      : <MoneyInput value={r.balance_amount} onCommit={v => commit(r.id, 'balance_amount', v)} />}
                  </td>
                  )}
                  {/* 根拠資料：目録に載せる金額の裏付け。有無のチェックと、何で確認したかの種別。 */}
                  {showBalanceCols && (
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={!!r.has_evidence} onChange={e => commit(r.id, 'has_evidence', e.target.checked)} className="w-4 h-4 accent-brand-600" />
                  </td>
                  )}
                  {showBalanceCols && (
                  <td className="px-2 py-1.5">
                    <EvidenceDocsCell row={r} onCommit={commit} />
                  </td>
                  )}
                  {/* 凍結確認（解約タスクの着手ゲート）。確認簿を経由せずここで付ける。 */}
                  {progressMode && (
                    <td className={`px-2 py-1.5 text-center ${lock}`}>
                      {banned ? <span className="text-[11px] text-gray-300">—</span>
                        : <ConfirmCheck on={r.freeze_confirmed} at={r.freeze_confirmed_at} name={r.freeze_confirmed_name} onChange={v => setFreezeConfirmed(r, v)} />}
                    </td>
                  )}
                  {showConfirmed && (
                    <td className={`px-2 py-1.5 text-center ${lock}`}>
                      {banned ? <span className="text-[11px] text-gray-300">—</span>
                        : r.balance_amount != null
                          ? <ConfirmCheck on={r.balance_confirmed} at={r.balance_confirmed_at} name={r.balance_confirmed_name} onChange={v => setBalanceConfirmed(r, v)} />
                          : <span className="text-[11px] text-gray-300">残高待ち</span>}
                    </td>
                  )}
                  {/* 取引明細の取得期間（複数本） */}
                  {showTxPeriods && <td className={`px-2 py-1.5 ${lock}`}>{renderTxPeriodsCell(r)}</td>}
                  {/* 残高証明取得日（相続開始日のチェック＋任意の日付を何本でも）。実務タブのみ */}
                  {progressMode && <td className="px-2 py-1.5">{renderBalanceCertCell(r)}</td>}
                  {progressMode && (
                    <td className={`px-2 py-1.5 ${lock}`}><input type="date" value={r.request_date ?? ''} onChange={e => setLocal(r.id, 'request_date', e.target.value)} onBlur={e => commit(r.id, 'request_date', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" /></td>
                  )}
                  {progressMode && (
                    <td className={`px-2 py-1.5 ${lock}`}><input type="date" value={r.arrival_date ?? ''} onChange={e => setLocal(r.id, 'arrival_date', e.target.value)} onBlur={e => commit(r.id, 'arrival_date', e.target.value)} className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500" /></td>
                  )}
                  {progressMode && (
                    <td className="px-2 py-1.5">
                      {r.arrival_date
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">受信済</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400 border border-gray-200">未受信</span>}
                    </td>
                  )}
                  {showTrustSafe && <td className="px-2 py-1.5">{renderTrustSafeCell(r)}</td>}
                  <td className="px-2 py-1.5">{renderBanCell(r)}</td>
                  <td className="px-2 py-1.5"><TextInput value={r.notes} onChange={v => setLocal(r.id, 'notes', v)} onCommit={v => commit(r.id, 'notes', v)} placeholder="特記事項" /></td>
                  {progressMode && <td className={`px-2 py-1.5 ${lock}`}><TextInput value={r.survey_result} onChange={v => setLocal(r.id, 'survey_result', v)} onCommit={v => commit(r.id, 'survey_result', v)} placeholder="この口座で分かったこと" /></td>}
                  {progressMode && (
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col gap-1 items-start">
                        {receiptFilesFor(receipts, 'financial_asset', r.id).map((f, i) => (
                          <OpenStorageFile key={i} bucket={f.bucket} path={f.path} name={f.name} label="受領ファイル" />
                        ))}
                      </div>
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => delRow(r)} className="text-gray-300 hover:text-red-500 transition-colors" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ) })
            )}
          </tbody>
        </table>
      </div>

      {/* カード表示（1口座＝1カード）。スマホのみ（PCは上の表）。 */}
      <div className="sm:hidden space-y-2.5">
        {visibleRows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-gray-400">登録されていません</div>
        ) : (
          visibleRows.map(renderCard)
        )}
      </div>

      <div className="mt-2">
        <button type="button" onClick={addRow} disabled={busy} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> {kind === '証券' ? '証券を追加' : kind === '信託銀行' ? '信託を追加' : '口座を追加'}
        </button>
      </div>

      {/* 貸金庫ありでタスク作成ポップアップ（銀行単位） */}
      <Modal
        isOpen={!!safeDepositPrompt}
        onClose={() => setSafeDepositPrompt(null)}
        title={safeDepositPrompt ? `「${safeDepositPrompt.bank}」の貸金庫タスクを作成しますか？` : ''}
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSafeDepositPrompt(null)}>あとで</Button>
            <Button variant="primary" onClick={() => safeDepositPrompt && createSafeDepositTasks(safeDepositPrompt.bank)}>作成する</Button>
          </>
        }
      >
        <div className="text-[13px] text-gray-700 space-y-2">
          <p>この銀行の貸金庫タスクを作成します（既にあるものは作りません）。</p>
          <ul className="rounded-lg border border-gray-200 p-2.5 space-y-1 text-[12.5px]">
            <li>・【{safeDepositPrompt?.bank}】依頼者への貸金庫内容確認依頼</li>
            <li>・【{safeDepositPrompt?.bank}】貸金庫内容物の確認</li>
          </ul>
        </div>
      </Modal>
    </div>
  )
}

/**
 * 根拠資料セル。何で残高を確認したかを複数選べる（種別ごとに選択肢が変わる）。
 * 選択肢に無いものは「その他」に書く（evidence_note）。
 */
function EvidenceDocsCell({ row, onCommit }: {
  row: FinancialAssetRow
  onCommit: (id: string, field: keyof FinancialAssetRow, value: string | boolean | string[]) => void
}) {
  const [docs, setDocs] = useState<string[]>(row.evidence_docs ?? [])
  const [note, setNote] = useState(row.evidence_note ?? '')
  const options = evidenceDocsFor(row.asset_type)
  const toggle = (d: string) => {
    const next = docs.includes(d) ? docs.filter(x => x !== d) : [...docs, d]
    setDocs(next); onCommit(row.id, 'evidence_docs', next)
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {options.map(d => (
          <button key={d} type="button" onClick={() => toggle(d)}
            className={`text-[10.5px] px-1.5 py-0.5 rounded border transition-colors ${docs.includes(d) ? 'bg-brand-600 text-white border-brand-600 font-semibold' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
            {d}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={e => setNote(e.target.value)}
        onBlur={() => { if (note !== (row.evidence_note ?? '')) onCommit(row.id, 'evidence_note', note) }}
        placeholder="その他"
        className="w-full px-1.5 py-0.5 text-[11px] border border-gray-200 rounded bg-white outline-none focus:border-brand-400"
      />
    </div>
  )
}

function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  // 上にラベル・下に入力欄（他セクションのカードとテイストを統一）
  return (
    <div className="px-3 py-2 border-b border-gray-100 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-600 mb-1">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function TextInput({ value, onChange, onCommit, placeholder }: { value: string | null; onChange: (v: string) => void; onCommit: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      placeholder={placeholder}
      className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
    />
  )
}

// 全角→半角、数字以外を除去した「生の数字文字列」を返す。
const toDigits = (s: string) => s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[^\d]/g, '')

// 金額入力：数字だけ受け付け、全角は半角化、表示は3桁カンマ区切り。保存は生の数値文字列。
export function MoneyInput({ value, onCommit, placeholder }: { value: number | null | undefined; onCommit: (v: string) => void; placeholder?: string }) {
  const [raw, setRaw] = useState(value != null ? String(value) : '')
  const display = raw ? Number(raw).toLocaleString('en-US') : ''
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={e => setRaw(toDigits(e.target.value))}
      onBlur={() => onCommit(raw)}
      placeholder={placeholder ?? '0'}
      className="w-full px-1.5 py-1.5 text-[12px] text-right bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition tabular-nums"
    />
  )
}

function SmallSelect({ value, options, onChange, placeholder, className }: { value: string; options: readonly string[]; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`${className ?? 'w-full'} px-1 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500`}>
      <option value="">{placeholder ?? '—'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// 確認済みのチェック。押した人と日時をその場で記録する（確認簿を経由しない）。
function ConfirmCheck({ on, at, name, onChange }: {
  on: boolean | null | undefined
  at: string | null
  name: string | null
  onChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex flex-col items-center gap-0.5 cursor-pointer" title={on && name ? `${name} ${at?.slice(0, 10) ?? ''}` : '確認したらチェック'}>
      <input type="checkbox" checked={!!on} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-emerald-600 cursor-pointer" />
      {on && name && <span className="text-[10px] text-gray-500 leading-tight max-w-[80px] truncate">{name}</span>}
    </label>
  )
}
