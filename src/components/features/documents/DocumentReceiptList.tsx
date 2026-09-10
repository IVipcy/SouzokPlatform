'use client'

import { useState, useEffect, useRef, useMemo, useTransition, Fragment, type ChangeEvent } from 'react'
import Link from 'next/link'
import { Hand, Loader2, Link2, Folder, FolderUp, Trash2, X, MapPin } from 'lucide-react'
import HankoStamp from '@/components/ui/HankoStamp'
import HintTip from '@/components/ui/HintTip'
import { createClient } from '@/lib/supabase/client'
import { uploadFilesToCaseFolder } from '@/lib/caseFolder'
import { showToast } from '@/components/ui/Toast'
import { deliverableLinkLabel } from '@/lib/deliverables'
import { READY_REASON_DOC } from '@/lib/taskReadiness'
import { applyReceiptLinkDates, receiptItemLanding, receiptTaskDefaults } from '@/lib/receiptLinks'
import NewTaskFields, { emptyNewTask, type NewTaskValue } from '@/components/features/tasks/NewTaskFields'
import Modal from '@/components/ui/Modal'
import FloatingWindow from '@/components/ui/FloatingWindow'
import Button from '@/components/ui/Button'
import { useCanOperateReceipts } from '@/components/providers/AuthProvider'
import type { DocumentReceiptRow, MemberRow } from '@/types'

type ReceiptFileMap = Record<string, { bucket: string; path: string; name: string | null }>

type Props = {
  receipts: DocumentReceiptRow[]
  currentMemberId: string | null
  currentMember: MemberRow | null
  fileByDocId: ReceiptFileMap
  teams: { id: string; name: string }[]
  onChanged: () => void
  /** 全体操作権限が無くても、この案件IDの受信簿だけは操作可（受注/管理担当が自分の案件を開封・紐付けする用） */
  operableCaseIds?: string[]
  /** 郵送物一式（未開封）の「開封して再登録」ボタン押下 */
  onReRegister?: (r: DocumentReceiptRow) => void
  /** 上の「到着日」で1日に絞り込んでいる状態。当日分/過去日分のタブは意味が無くなるので出さない。 */
  singleDay?: boolean
}

// 列見出しの「?」に出す説明。
//   登録者 … 受信を登録した人（自動）。以前ここにあった W-Check（受信確定）は廃止した（migration 280）。
//            戸籍・不動産の請求には確認簿の着✓（返金額を見る二人目の確認）が別にあり、二重だったため。
//   対応   … その物で何を進めるか（業務の判断）
const REGISTERED_HELP = [
  'この受信を登録した人と時刻です。登録した時点で自動で入ります（押すものはありません）。',
  '各タブへの到着日（戸籍請求の到着日、契約手続きの「受信済」など）も登録した時点で入ります。間違い登録は番号横のゴミ箱で消すと取り消されます。',
].join('\n\n')

const TAIOU_HELP = [
  '届いた物で次に何を進めるかを決める場所です。押した人の認印が残ります。',
  '到着物ごとにタスクの名前・作業内容・業務が最初から入った状態で開くので、確認して「この内容で完了」を押すだけです。直したければその場で書き換えられます。契約書類は「タスクなしで完了」が既定です。',
  'ここで作ったタスクは、事務管理ダッシュボードの郵便タブに並びます。着地先（実務タブのどの行か）は到着物の結び先から自動で決まります。取り消すと結びつけが戻ります（作ったタスク自体は消えません）。',
].join('\n\n')

// 「0513/001」形式の番号を生成
function formatReceiptNumber(receivedDate: string, seq: number): string {
  // received_date は YYYY-MM-DD
  const mm = receivedDate.slice(5, 7)
  const dd = receivedDate.slice(8, 10)
  return `${mm}${dd}/${String(seq).padStart(3, '0')}`
}

// 登録者欄の時刻「9/10 10:42」
const fmtStamp = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 過去日分の日付見出し「7月10日（木）」。YYYY-MM-DD を素直に分解（TZずれ回避のため new Date しない）
const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土']
function formatReceiptDateHeader(ymd: string): string {
  if (!ymd || ymd.length < 10) return ymd || '日付不明'
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7)), d = Number(ymd.slice(8, 10))
  // 曜日は UTC 正午基準で算出（ローカルTZに依存しない）
  const wd = WEEKDAY_JA[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]
  return `${m}月${d}日（${wd}）`
}

export default function DocumentReceiptList({ receipts, currentMemberId, currentMember, teams, onChanged, operableCaseIds, onReRegister, singleDay }: Props) {
  const globalCanManage = useCanOperateReceipts()  // 受信確定(W-Check)・タスク紐づけ等は事務管理担当の作業（管理担当も操作はできる）
  const opSet = useMemo(() => new Set(operableCaseIds ?? []), [operableCaseIds])
  // 全体権限が無くても、自分が担当の案件の受信簿だけは操作可（受注/管理担当の開封・紐付け）
  const canManageReceipt = (r: DocumentReceiptRow) => globalCanManage || opSet.has(r.case_id)
  const [startingReceipt, setStartingReceipt] = useState<DocumentReceiptRow | null>(null)
  const [cancelingReceipt, setCancelingReceipt] = useState<DocumentReceiptRow | null>(null)
  // 当日分/過去日分のタブは廃止（上の「到着日」で絞るので二重だった）。
  // 新しい日から順に並べ、日をまたぐときだけ日付の見出しを挟む。
  const list = [...receipts].sort((a, b) =>
    (b.received_date ?? '').localeCompare(a.received_date ?? '') || (b.sequence_no - a.sequence_no))
  const groups: { date: string; rows: typeof list }[] = []
  for (const r of list) {
    const d = r.received_date ?? ''
    const last = groups[groups.length - 1]
    if (last && last.date === d) last.rows.push(r)
    else groups.push({ date: d, rows: [r] })
  }
  const showDateHeader = groups.length > 1   // 1日ぶんだけなら見出しは邪魔

  return (
    <div>
      {list.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-[13px] text-gray-400">
          {singleDay ? 'この日の到着物はありません。' : 'まだ受信記録はありません。右上の「+ 新規作成」から登録できます。'}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-[3px] overflow-x-auto">
          <table className="w-full text-[13px] border-collapse" style={{ minWidth: 1520 }}>
            <colgroup>
              <col style={{ width: 104 }} />{/* 番号（未開封バッジ・開封して再登録が入る） */}
              <col style={{ width: 148 }} />{/* 案件管理番号 */}
              <col style={{ width: 94 }} />{/* 〒種類 */}
              <col style={{ width: 130 }} />{/* 差出人 */}
              <col style={{ width: 280 }} />{/* 到着物（複数項目＋種別チップが入るため広め） */}
              <col style={{ width: 60 }} />{/* 通数 */}
              <col style={{ width: 140 }} />{/* ファイル */}
              <col style={{ width: 148 }} />{/* 原本格納先 */}
              <col style={{ width: 112 }} />{/* 登録者 */}
              <col style={{ width: 120 }} />{/* 対応 */}
              <col style={{ width: 200 }} />{/* 紐付けタスク */}
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-300 text-gray-600">
                <th className="px-2.5 py-2 text-left font-semibold">番号</th>
                <th className="px-2.5 py-2 text-left font-semibold">案件管理番号</th>
                <th className="px-2.5 py-2 text-left font-semibold">〒種類</th>
                <th className="px-2.5 py-2 text-left font-semibold">差出人</th>
                <th className="px-2.5 py-2 text-left font-semibold">到着物</th>
                <th className="px-2.5 py-2 text-center font-semibold">通数</th>
                <th className="px-2.5 py-2 text-center font-semibold">ファイル<span className="text-[10px] font-normal text-brand-700 block">案件フォルダ</span></th>
                <th className="px-2.5 py-2 text-left font-semibold">原本格納先<span className="text-[10px] font-normal text-brand-700 block">チームのBOX</span></th>
                <th className="px-2.5 py-2 text-left font-semibold">
                  <span className="inline-flex items-center gap-1">
                    登録者
                    <HintTip width={300} text={REGISTERED_HELP} />
                  </span>
                  <span className="text-[10px] font-normal text-brand-700 block">自動記録</span>
                </th>
                <th className="px-2.5 py-2 text-center font-semibold">
                  <span className="inline-flex items-center gap-1">
                    対応
                    <HintTip width={300} text={TAIOU_HELP} />
                  </span>
                </th>
                <th className="px-2.5 py-2 text-left font-semibold">紐付けタスク<span className="text-[10px] font-normal text-brand-700 block">クリックで詳細</span></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <Fragment key={g.date}>
                  {showDateHeader && (
                    <tr className="bg-brand-50/50 border-y border-brand-100">
                      <td colSpan={11} className="px-2.5 py-1.5 text-[12px] font-semibold text-brand-700">
                        {formatReceiptDateHeader(g.date)}
                        <span className="ml-2 font-normal text-gray-500">{g.rows.length}件</span>
                      </td>
                    </tr>
                  )}
                  {g.rows.map((r, i) => (
                    <ReceiptRow
                      key={r.id}
                      receipt={r}
                      rowBg={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}
                      currentMemberId={currentMemberId}
                      currentMember={currentMember}
                      teams={teams}
                      onChanged={onChanged}
                      onStartRequest={setStartingReceipt}
                      onCancelRequest={setCancelingReceipt}
                      canManage={canManageReceipt(r)}
                      onReRegister={onReRegister}
                    />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {startingReceipt && (
        <ReceiptStartModal
          receipt={startingReceipt}
          currentMemberId={currentMemberId}
          onClose={() => setStartingReceipt(null)}
          onDone={() => { setStartingReceipt(null); onChanged() }}
        />
      )}

      {cancelingReceipt && (
        <ReceiptCancelModal
          receipt={cancelingReceipt}
          onClose={() => setCancelingReceipt(null)}
          onDone={() => { setCancelingReceipt(null); onChanged() }}
        />
      )}
    </div>
  )
}

// 「対応」の完全取り消し（確認付き）。対応スタンプ解除＋紐付け解除＋着手OK(必要書類受領済)を受領次第OKへ戻す。
// タスク実体は削除しない（他担当が着手済みの恐れ・元から存在するタスクもあるため）。
function ReceiptCancelModal({ receipt, onClose, onDone }: {
  receipt: DocumentReceiptRow
  onClose: () => void
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  const run = async () => {
    setSaving(true)
    const supabase = createClient()
    const itemIds = (receipt.items ?? []).map(i => i.id)
    let linkedTaskIds: string[] = []
    if (itemIds.length > 0) {
      const { data: joins } = await supabase.from('document_receipt_item_tasks').select('task_id').in('receipt_item_id', itemIds)
      linkedTaskIds = [...new Set(((joins ?? []) as { task_id: string }[]).map(j => j.task_id))]
      await supabase.from('document_receipt_item_tasks').delete().in('receipt_item_id', itemIds)
    }
    if (linkedTaskIds.length > 0) {
      const { data: rows } = await supabase.from('tasks').select('id, ext_data').in('id', linkedTaskIds)
      for (const row of (rows ?? []) as Array<{ id: string; ext_data: Record<string, unknown> | null }>) {
        const ext = (row.ext_data ?? {}) as Record<string, unknown>
        if (ext.ready_reason === READY_REASON_DOC) {
          await supabase.from('tasks').update({ ext_data: { ...ext, ready_reason: null, ready_on_receipt: true } }).eq('id', row.id)
        }
      }
    }
    const { error } = await supabase
      .from('document_receipts')
      .update({ started_by_member_id: null, started_at: null, started_task_id: null })
      .eq('id', receipt.id)
    setSaving(false)
    if (error) { showToast(`取り消しに失敗しました: ${error.message}`, 'error'); return }
    showToast('対応を取り消しました', 'success')
    onDone()
  }
  return (
    <Modal
      isOpen
      onClose={saving ? () => {} : onClose}
      title="対応を取り消しますか？"
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>戻る</Button>
          <Button variant="danger" onClick={run} loading={saving}>取り消す</Button>
        </>
      }
    >
      <div className="space-y-2 text-[13px] text-gray-700 leading-relaxed">
        <p>この到着物の<strong>対応（{receipt.started_by_member?.name} さん）</strong>を取り消します。次の状態に戻ります：</p>
        <ul className="list-disc pl-5 space-y-0.5 text-[12.5px] text-gray-600">
          <li>紐付けたタスクのリンクを解除</li>
          <li>この受領で付いた「着手OK」を「受領次第OK」に戻す</li>
          <li>対応担当の記録を解除（再度「対応」から結び直せます）</li>
        </ul>
        <p className="text-[12px] text-gray-500">※ タスク自体は削除しません。不要なタスクは案件のタスクタブで個別に削除してください。各タブの到着日はそのままです。</p>
      </div>
    </Modal>
  )
}

// 受信1件まとめて案件フォルダにアップ(A)＋案件フォルダを開く(B)。
// アップすると、この受信の到着物アイテムをすべて「アップ済」にする。
function ReceiptFolderActions({ receipt, currentMemberId, onChanged }: {
  receipt: DocumentReceiptRow
  currentMemberId: string | null
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList) => {
    const arr = Array.from(files)
    if (arr.length === 0) return
    setBusy(true)
    const { ok, failed } = await uploadFilesToCaseFolder(receipt.case_id, arr, currentMemberId)
    if (failed > 0) showToast(`${failed}件のアップロードに失敗しました`, 'error')
    if (ok > 0) {
      // この受信の到着物アイテムをまとめてアップ済に
      const ids = (receipt.items ?? []).map(i => i.id).filter(Boolean)
      if (ids.length > 0) {
        const supabase = createClient()
        await supabase.from('document_receipt_items').update({ uploaded_at: new Date().toISOString() }).in('id', ids)
      }
      showToast(`${ok}件を案件フォルダにアップしました`, 'success')
      onChanged()
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <input ref={inputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) upload(e.target.files); e.target.value = '' }} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-1 rounded text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 disabled:opacity-50"
        title="この受信の書類をまとめて案件フォルダにアップ"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderUp className="w-3 h-3" />}フォルダにアップ
      </button>
      <Link href={`/cases/${receipt.case_id}?tab=docs`} className="inline-flex items-center gap-1 whitespace-nowrap text-[10.5px] text-gray-500 hover:text-brand-700">
        <Folder className="w-3 h-3" />フォルダを開く
      </Link>
    </div>
  )
}


// 到着物の種類(linked_kind) → 関係する業務。候補タスクをこの業務に絞る。
const KIND_GYOMU: Record<string, string[]> = {
  koseki: ['戸籍', '相関図', '法定相続情報取得'],
  financial_asset: ['金融資産', '解約'],
  real_estate_acquisition: ['不動産'],
  real_estate: ['不動産'],
  agreement_dispatch: ['協議書'],
  legal_info: ['法定相続情報取得'],
}

// 契約時受領書類の区分(category) → 関係する業務。
// 契約書類でも戸籍・評価証明など調査系の書類が一緒に届くことがあり、その場合は該当タスクに結べるようにする。
// 区分=契約/その他（＝対応なし）はタスク不要。
const CONTRACT_CATEGORY_GYOMU: Record<string, string[]> = {
  '戸籍': ['戸籍', '相関図', '法定相続情報取得'],
  '金融': ['金融資産', '解約'],
  '不動産': ['不動産'],
  '登記': ['登記'],
  '財産': ['金融資産', '解約', '不動産'], // 旧データ（金融/不動産分割前の区分=財産）
}

// 到着物の「対応」＝届いた物ごとに、次に進めるタスクを決める。
//
// 開いた時点で中身が入っている。到着物の名前と種類から、タスク名・作業内容・業務を埋め、
// 着地先（実務タブのどの行か）は到着物の結び先（戸籍請求IDなど）から自動で決める。
// 押す人がやるのは「作る／作らない」の判断と、気になるところの書き換えだけ。
//   ・読込が要るもの（戸籍・不動産資料・金融資料・法定相続情報）と協議書の返送 … 「このタスクを作る」が既定
//   ・契約書類（区分＝契約／その他） … 「タスクなしで完了」が既定
//   ・同じ着地先の読込タスクが既にあれば、新しく作らずそれを結ぶ（二重に増やさない）
type ItemPrep = { landing: { rid: string | null; label: string }; existing: { id: string; title: string } | null }

function ReceiptStartModal({ receipt, currentMemberId, onClose, onDone }: {
  receipt: DocumentReceiptRow
  currentMemberId: string | null
  onClose: () => void
  onDone: () => void
}) {
  // 契約時受領書類 id → 区分(category)。既定の業務区分と「タスク不要」の判定に使う。
  const [contractCat, setContractCat] = useState<Map<string, string | null>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 到着物ごとの入力。mode='none' なら何も作らずに閉じるだけ。
  const [mode, setMode] = useState<Record<string, 'task' | 'none'>>({})
  const [forms, setForms] = useState<Record<string, NewTaskValue>>({})
  const [prep, setPrep] = useState<Record<string, ItemPrep>>({})

  const items = (receipt.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)

  useEffect(() => {
    const supabase = createClient()
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('contract_documents').select('id, category').eq('case_id', receipt.case_id)
      const catMap = new Map(((data ?? []) as Array<{ id: string; category: string | null }>).map(d => [d.id, d.category]))
      const its = (receipt.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
      const nextForms: Record<string, NewTaskValue> = {}
      const nextPrep: Record<string, ItemPrep> = {}
      for (const it of its) {
        const contractGyomu = it.linked_kind === 'contract_doc' ? CONTRACT_CATEGORY_GYOMU[catMap.get(it.linked_id ?? '') ?? '']?.[0] : undefined
        const d = receiptTaskDefaults(it.item_name, it.linked_kind, contractGyomu)
        const landing = await receiptItemLanding(supabase, it)
        let existing: { id: string; title: string } | null = null
        if (landing.rid) {
          const { data: ex } = await supabase.from('tasks').select('id, title')
            .eq('case_id', receipt.case_id).eq('source_rid', landing.rid).neq('status', '完了').order('created_at').limit(1)
          existing = ((ex ?? []) as Array<{ id: string; title: string }>)[0] ?? null
        }
        nextForms[it.id] = { ...emptyNewTask(), title: d.title, work: d.work, gyomu: d.gyomu }
        nextPrep[it.id] = { landing, existing }
      }
      if (!alive) return
      setContractCat(catMap)
      setForms(nextForms)
      setPrep(nextPrep)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [receipt])

  // 契約時受領書類の区分（戸籍・評価証明などは調査系）。区分=契約/その他だけタスク不要。
  const contractGyomuFor = (it: { linked_kind: string | null; linked_id: string | null }): string[] | undefined =>
    CONTRACT_CATEGORY_GYOMU[contractCat.get(it.linked_id ?? '') ?? '']
  const gyomuForItem = (it: { linked_kind: string | null; linked_id: string | null }): string[] | undefined => {
    if (it.linked_kind === 'contract_doc') return contractGyomuFor(it)
    return it.linked_kind ? KIND_GYOMU[it.linked_kind] : undefined
  }
  /** タスクを作る必要がない到着物（区分=契約/その他の契約書類）。既定を「タスクなし」にする。 */
  const isTaskFree = (it: { linked_kind: string | null; linked_id: string | null }): boolean =>
    it.linked_kind === 'contract_doc' && !contractGyomuFor(it)

  const modeOf = (it: { id: string; linked_kind: string | null; linked_id: string | null }) =>
    mode[it.id] ?? (isTaskFree(it) ? 'none' : 'task')
  const formOf = (id: string) => forms[id] ?? emptyNewTask()
  const patchForm = (id: string, p: Partial<NewTaskValue>) =>
    setForms(prev => ({ ...prev, [id]: { ...(prev[id] ?? emptyNewTask()), ...p } }))

  const taskItems = items.filter(it => modeOf(it) === 'task')

  const confirm = async () => {
    if (!currentMemberId) { showToast('ログイン情報が取得できませんでした', 'error'); return }
    // タスクを作る到着物には、タスク追加モーダルと同じ必須（タスク名・作業内容）を課す。
    for (const it of taskItems) {
      if (prep[it.id]?.existing) continue   // 既存を結ぶだけなら入力は要らない
      const f = formOf(it.id)
      if (!f.title.trim()) { setError(`「${it.item_name}」のタスク名を入れてください`); return }
      if (!f.work.trim()) { setError(`「${it.item_name}」の作業内容を入れてください`); return }
    }
    setSaving(true)
    setError('')
    const supabase = createClient()

    await supabase.from('document_receipts')
      .update({ started_by_member_id: currentMemberId, started_at: new Date().toISOString() })
      .eq('id', receipt.id)

    const joinRows: { receipt_item_id: string; task_id: string }[] = []
    let firstTaskId: string | null = null
    const madeTitles: string[] = []
    const linkedTitles: string[] = []

    for (const it of taskItems) {
      const f = formOf(it.id)
      const p = prep[it.id]
      // 同じ着地先の読込タスクが既にあれば、それを結ぶ（着手OKにして）。新しくは作らない。
      if (p?.existing) {
        const { data: row } = await supabase.from('tasks').select('ext_data').eq('id', p.existing.id).maybeSingle()
        const ext = ((row as { ext_data: Record<string, unknown> | null } | null)?.ext_data ?? {}) as Record<string, unknown>
        if (ext.ready_on_receipt || !ext.ready_reason) {
          await supabase.from('tasks').update({ ext_data: { ...ext, ready_reason: READY_REASON_DOC, ready_on_receipt: false } }).eq('id', p.existing.id)
        }
        joinRows.push({ receipt_item_id: it.id, task_id: p.existing.id })
        firstTaskId = firstTaskId ?? p.existing.id
        linkedTitles.push(p.existing.title)
        continue
      }
      // 着地先（実務タブのどの行か）は到着物の結び先から。戸籍なら koseki-read:{請求ID}。
      const sourceRid = p?.landing.rid ?? null
      // タスクは作った時点で常に着手OK。ext_data もタスク追加モーダルと同じ。
      const readyExt: Record<string, unknown> = {
        ready_reason: '着手OK', ready_on_receipt: false,
        ...(f.outing ? { outing: true } : {}),
      }
      const isAssistant = f.roleKind === 'assistant'
      const isTouki = f.roleKind === 'touki'
      const { data: nt, error: taskErr } = await supabase.from('tasks').insert({
        case_id: receipt.case_id,
        task_kind: isTouki ? 'touki_team' : isAssistant ? 'case' : 'system',
        ...(isAssistant ? {} : isTouki ? { work_role: 'assistant' } : { assign_role: f.roleKind, work_role: f.roleKind }),
        title: f.title.trim(),
        phase: isTouki ? '登記' : isAssistant ? f.gyomu : (f.gyomu || 'その他'),
        category: isAssistant || isTouki ? (isTouki ? '登記' : f.gyomu) : '',
        status: '着手前',
        priority: f.priority,
        due_date: f.dueDate || null,
        sort_order: 99,
        created_by: currentMemberId,
        procedure_text: f.work.trim() || null,
        source_rid: sourceRid,
        ext_data: readyExt,
      }).select('id').single()
      if (taskErr || !nt) { setSaving(false); setError(`タスクの追加に失敗しました: ${taskErr?.message ?? ''}`); return }
      const taskId = (nt as { id: string }).id
      joinRows.push({ receipt_item_id: it.id, task_id: taskId })
      firstTaskId = firstTaskId ?? taskId
      madeTitles.push(f.title.trim())

      // 管理担当/受注担当タスクは、案件のその担当へ割当＋通知（タスク追加モーダルと同じ）
      if (!isAssistant && !isTouki) {
        const { data: cm } = await supabase.from('case_members').select('member_id').eq('case_id', receipt.case_id).eq('role', f.roleKind).limit(1)
        const assignee = ((cm ?? []) as Array<{ member_id: string }>)[0]?.member_id
        if (assignee) {
          await supabase.from('task_assignees').insert({ task_id: taskId, member_id: assignee, role: 'primary' })
          await supabase.from('notifications').insert({
            member_id: assignee,
            type: 'task_assigned',
            case_id: receipt.case_id,
            title: f.roleKind === 'manager' ? '管理担当タスクが追加されました' : '受注担当タスクが追加されました',
            body: f.title.trim(),
          })
        }
      }
    }

    if (joinRows.length > 0) {
      const { error: joinErr } = await supabase.from('document_receipt_item_tasks')
        .upsert(joinRows, { onConflict: 'receipt_item_id,task_id', ignoreDuplicates: true })
      if (joinErr) { setSaving(false); setError(`保存に失敗しました: ${joinErr.message}`); return }
    }
    // 後方互換：受信単位の代表タスク
    if (firstTaskId) await supabase.from('document_receipts').update({ started_task_id: firstTaskId }).eq('id', receipt.id)

    setSaving(false)
    // 何をしたかをチップで言う。「○○ の読み込みタスクを作りました（郵便タブに入っています）」
    const parts: string[] = []
    if (madeTitles.length === 1) parts.push(`「${madeTitles[0]}」タスクを作りました`)
    else if (madeTitles.length > 1) parts.push(`${madeTitles.length}件のタスクを作りました：${madeTitles.join('／')}`)
    if (linkedTitles.length > 0) parts.push(`既にある「${linkedTitles.join('」「')}」を結びました`)
    if (parts.length === 0) showToast('対応済にしました（タスクは作っていません）', 'success')
    else showToast(`${parts.join('。')}（事務管理ダッシュボードの郵便タブに入っています）`, 'success')
    onDone()
  }

  return (
    // 暗幕を出さないフローティングウィンドウ（報連相・タスク追加と同じ部品）。
    // 受信簿の一覧を見ながら／スクロールしながら、届いた物とタスクを結べるようにするため。
    // 暗幕が無いので背景クリックとEscでは閉じない。閉じるのは ✕ とキャンセルだけ。
    <FloatingWindow
      isOpen
      onClose={onClose}
      title="到着物の対応"
      width={672}
      height={560}
      resizable
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={confirm} loading={saving} disabled={loading}>
            {taskItems.length > 0 ? `この内容で完了（タスク ${taskItems.length}件）` : '対応を完了'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-gray-600">
          到着物ごとに、次に進めるタスクが入った状態で出ています。確認して右下を押してください。直したいところはその場で書き換えられます。
        </p>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
        {loading ? (
          <div className="py-6 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />到着物の結び先を確認しています…</div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-gray-400">到着物がありません</div>
        ) : (
          <div className="space-y-3 max-h-[30rem] overflow-y-auto">
            {items.map(it => {
              const m = modeOf(it)
              const f = formOf(it.id)
              const p = prep[it.id]
              const kindLabel = deliverableLinkLabel(it.linked_kind, it.linked_field)
              return (
                <div key={it.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[13px] font-semibold text-gray-800">{it.item_name}</span>
                    {kindLabel && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 font-semibold">{kindLabel}</span>}
                  </div>
                  <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden mb-3">
                    {([['task', p?.existing ? '既にあるタスクを結ぶ' : 'このタスクを作る'], ['none', 'タスクなしで完了']] as const).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setMode(prev => ({ ...prev, [it.id]: k }))}
                        className={`px-3.5 py-1.5 text-[12.5px] font-semibold transition ${m === k ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {m === 'task' ? (
                    p?.existing ? (
                      <div className="rounded-md border border-brand-200 bg-brand-50/50 px-3 py-2 text-[12.5px] text-brand-800">
                        既にある「<strong>{p.existing.title}</strong>」を結びます（新しくは作りません）。着地先：{p.landing.label}
                      </div>
                    ) : (
                      <>
                        <NewTaskFields
                          caseId={receipt.case_id}
                          value={f}
                          onChange={patch => patchForm(it.id, patch)}
                          defaultGyomu={gyomuForItem(it)?.[0]}
                          compact
                          workRequired
                        />
                        {/* 着地先は到着物の結び先から自動。選ぶものは無い（選び間違いが起きない） */}
                        <div className="mt-2.5 flex items-center gap-1.5 text-[12px] text-gray-600">
                          <MapPin className="w-3.5 h-3.5 text-brand-600 flex-none" />
                          <span className="font-semibold text-brand-700">着地先</span>
                          <span>{p?.landing.label ?? '—'}</span>
                          {p?.landing.rid && <span className="text-[11px] text-gray-400">（到着物の結び先から自動）</span>}
                        </div>
                      </>
                    )
                  ) : (
                    <p className="text-[11.5px] text-gray-400">
                      {isTaskFree(it)
                        ? '契約書類なのでタスクは作らず、対応済にします。到着日は登録した時点で契約手続きタブに入っています。'
                        : 'この到着物ではタスクを作りません。到着日は登録した時点で各タブに入っています。'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </FloatingWindow>
  )
}

function ReceiptRow({
  receipt,
  rowBg,
  currentMemberId,
  currentMember,
  teams,
  onChanged,
  onStartRequest,
  onCancelRequest,
  canManage,
  onReRegister,
}: {
  receipt: DocumentReceiptRow
  rowBg: string
  currentMemberId: string | null
  currentMember: MemberRow | null
  teams: { id: string; name: string }[]
  onChanged: () => void
  onStartRequest: (r: DocumentReceiptRow) => void
  onCancelRequest: (r: DocumentReceiptRow) => void
  canManage: boolean
  onReRegister?: (r: DocumentReceiptRow) => void
}) {
  // 受注/管理宛の郵送物一式（未開封）：W-Check/紐付けの前に「開封して再登録」で中身を入れ直す
  const isUnopenedParcel = !!receipt.is_parcel && !receipt.opened_at
  const items = (receipt.items ?? []).sort((a, b) => a.sort_order - b.sort_order)
  const rowCount = Math.max(items.length, 1)
  const numberText = formatReceiptNumber(receipt.received_date, receipt.sequence_no)
  // 差出人は封筒（受信）単位。通常1名だが、項目ごとに異なる場合は重複除去で並べる。
  const senderText = [...new Set(items.map(i => (i.received_from ?? '').trim()).filter(Boolean))].join(' / ')
  const rowClass = rowBg
  // この受信に紐付いた全タスク（到着物ごとの紐付けを集約・重複除去）。
  const linkedTasks = (() => {
    const seen = new Map<string, { id: string; title: string; status: string }>()
    for (const it of items) {
      for (const j of it.document_receipt_item_tasks ?? []) {
        if (j.task && !seen.has(j.task.id)) seen.set(j.task.id, j.task)
      }
    }
    return [...seen.values()]
  })()

  const [, startTransition] = useTransition()
  const [busyKind, setBusyKind] = useState<null | 'check' | 'start' | 'storage'>(null)

  // 原本格納先チームの変更（即保存）
  const handleStorageChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value || null
    setBusyKind('storage')
    const supabase = createClient()
    const { error } = await supabase.from('document_receipts').update({ storage_team_id: v }).eq('id', receipt.id)
    setBusyKind(null)
    if (error) { showToast(`格納先の保存に失敗: ${error.message}`, 'error'); return }
    startTransition(onChanged)
  }

  // 間違えて登録した受信を削除。各タブの到着日・着手OK・受領書類も巻き戻してから消す。
  const handleDelete = async () => {
    if (busyKind) return
    if (!window.confirm(`受信 ${numberText} を削除しますか？\nこの受信の到着物・紐付け・各タブの到着日・受領書類が取り消されます。取り消せません。`)) return
    setBusyKind('start')
    const supabase = createClient()
    const its = receipt.items ?? []
    // 1. 各タブの到着日（linked_field）を取り消し
    await applyReceiptLinkDates(supabase, its, null)
    // 2. 紐付けタスクの着手OK(必要書類受領済)を受領次第OKへ戻す
    const taskIds = [...new Set(its.flatMap(i => (i.document_receipt_item_tasks ?? []).map(j => j.task?.id).filter((v): v is string => !!v)))]
    if (taskIds.length > 0) {
      const { data: rows } = await supabase.from('tasks').select('id, ext_data').in('id', taskIds)
      for (const row of (rows ?? []) as Array<{ id: string; ext_data: Record<string, unknown> | null }>) {
        const ext = (row.ext_data ?? {}) as Record<string, unknown>
        if (ext.ready_reason === READY_REASON_DOC) await supabase.from('tasks').update({ ext_data: { ...ext, ready_reason: null, ready_on_receipt: true } }).eq('id', row.id)
      }
    }
    // 3. この受信で作成した受領書類(case_documents)を削除
    const docIds = its.map(i => i.case_document_id).filter((v): v is string => !!v)
    if (docIds.length > 0) await supabase.from('case_documents').delete().in('id', docIds)
    // 4. 受信レコード削除（items・item_tasksはカスケード）
    const { error } = await supabase.from('document_receipts').delete().eq('id', receipt.id)
    setBusyKind(null)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    showToast('受信を削除しました', 'success')
    startTransition(onChanged)
  }

  return (
    <>
      {(items.length > 0 ? items : [null]).map((it, idx) => {
        const isFirst = idx === 0
        return (
          <tr
            key={it?.id ?? `placeholder-${receipt.id}`}
            className={`border-b border-gray-100 ${rowClass} hover:bg-brand-50/30`}
          >
            {/* 番号（行統合） */}
            {isFirst && (
              <td
                rowSpan={rowCount}
                className="px-2.5 py-2 font-mono text-[12px] text-gray-700 align-middle border-r border-gray-100"
              >
                <div className="flex items-center gap-1.5">
                  <span>{numberText}</span>
                  {canManage && (
                    <button type="button" onClick={handleDelete} disabled={busyKind === 'start'} title="この受信を削除（間違い登録の取り消し）" className="text-gray-300 hover:text-red-500 disabled:opacity-40">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {isUnopenedParcel && (
                  <div className="mt-1.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">📦 未開封</span>
                    {canManage && onReRegister && (
                      <button type="button" onClick={() => onReRegister(receipt)}
                        className="mt-1 inline-flex items-center justify-center w-full h-[26px] px-1.5 text-[11px] font-bold text-white bg-brand-600 hover:bg-brand-700 rounded whitespace-nowrap">
                        開封して再登録
                      </button>
                    )}
                  </div>
                )}
              </td>
            )}
            {/* 案件管理番号（行統合） */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2.5 py-2 align-middle border-r border-gray-100">
                {receipt.cases ? (
                  <Link
                    href={`/cases/${receipt.cases.id}`}
                    className="block"
                  >
                    <div className="font-mono text-[12px] font-semibold text-brand-700 hover:underline">
                      {receipt.cases.case_number}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">{receipt.cases.deal_name}</div>
                  </Link>
                ) : (
                  <span className="text-gray-400 text-[12px]">案件未紐付</span>
                )}
              </td>
            )}
            {/* 〒種類（封筒単位・行統合） */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2.5 py-2 align-middle border-r border-gray-100">
                {receipt.postal_type
                  ? <span className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">{receipt.postal_type}</span>
                  : <span className="text-gray-300 text-[12px]">—</span>}
              </td>
            )}
            {/* 差出人（封筒単位・行統合） */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2.5 py-2 align-middle text-[12px] text-gray-700 border-r border-gray-100">
                {senderText || <span className="text-gray-300">—</span>}
              </td>
            )}

            {/* 到着物 / 通数（各項目で1行ずつ。差出人は封筒単位で上に集約） */}
            <td className="px-2.5 py-1.5 text-gray-800">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>{it?.item_name ?? <span className="text-gray-300">-</span>}</span>
                {it && deliverableLinkLabel(it.linked_kind, it.linked_field) && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-[10px] font-semibold"
                    title="この受領で取得物の受領日が更新されています"
                  >
                    <Link2 className="w-3 h-3" />
                    {deliverableLinkLabel(it.linked_kind, it.linked_field)}
                  </span>
                )}
              </div>
            </td>
            <td className="px-2.5 py-1.5 text-right font-mono text-gray-700">
              {it?.quantity != null ? `${it.quantity}通` : <span className="text-gray-300">-</span>}
            </td>

            {/* ファイル：受信1件まとめて案件フォルダにアップ／開く（行統合） */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2 py-2 text-center align-middle border-l border-gray-100">
                <ReceiptFolderActions receipt={receipt} currentMemberId={currentMemberId} onChanged={onChanged} />
              </td>
            )}

            {/* 原本格納先：紙の原本を格納したチームのBOX（行統合） */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2 py-2 align-middle border-l border-gray-100">
                {canManage ? (
                  <select
                    value={receipt.storage_team_id ?? ''}
                    onChange={handleStorageChange}
                    disabled={busyKind === 'storage'}
                    className={`w-full px-2 py-1.5 text-[12px] border rounded-md outline-none focus:border-brand-400 disabled:opacity-50 ${receipt.storage_team_id ? 'border-gray-300 bg-white text-gray-800' : 'border-dashed border-gray-300 bg-gray-50 text-gray-400'}`}
                    title="原本を格納したチームのメールボックス"
                  >
                    <option value="">格納先を選択</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (
                  <span className="text-[12px] text-gray-600">{receipt.storage_team?.name ?? <span className="text-gray-300">—</span>}</span>
                )}
              </td>
            )}

            {/* 登録者（行統合）。登録した人と時刻。自動で入るので押すものは無い */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2.5 py-2 align-middle border-l border-gray-100">
                {receipt.registered_by_member ? (
                  <div className="text-[12px] text-gray-800 leading-snug">
                    {receipt.registered_by_member.name}
                    <span className="block text-[11px] text-gray-400">{fmtStamp(receipt.created_at)}</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-gray-300" title="登録者の記録が無い受信（記録を始める前の登録）">—</span>
                )}
              </td>
            )}

            {/* 着手（行統合） */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2 py-2 text-center align-middle border-l border-gray-100">
                {receipt.started_by_member ? (
                  <span className="inline-flex items-center relative">
                    <HankoStamp name={receipt.started_by_member.name} at={receipt.started_at} size="sm" />
                    <button
                      type="button"
                      onClick={() => onCancelRequest(receipt)}
                      disabled={busyKind === 'start'}
                      title="対応済（クリックで取消）"
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center disabled:opacity-50"
                    ><X className="w-2.5 h-2.5" /></button>
                  </span>
                ) : !canManage ? (
                  <span className="text-[11px] text-gray-300" title="到着物の紐づけ・対応は管理担当のみ">管理担当</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStartRequest(receipt)}
                    disabled={!currentMemberId}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-gray-300 text-gray-500 hover:bg-brand-50 hover:border-brand-400 hover:text-brand-700 disabled:opacity-50 text-[11px] font-semibold"
                    title={currentMember ? `${currentMember.name} として対応（中身が入ったタスクを確認して作る／タスクなしで完了）` : '対応'}
                  >
                    <Hand className="w-3.5 h-3.5" />
                    対応
                  </button>
                )}
              </td>
            )}

            {/* 紐付けタスク（受信単位で集約・行統合）。クリックでタスク詳細へ */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2.5 py-2 align-middle border-l border-gray-100">
                {linkedTasks.length === 0 ? (
                  <span className="text-[11px] text-gray-300">紐付けなし</span>
                ) : (
                  <div className="flex flex-col gap-1 items-start">
                    {linkedTasks.map(t => (
                      <Link
                        key={t.id}
                        href={`/tasks/${t.id}`}
                        className={`inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-full border text-[11.5px] transition-colors ${t.status === '完了' ? 'bg-gray-50 border-gray-200 text-gray-400 line-through' : 'bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-100'}`}
                        title={t.title}
                      >
                        <Link2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{t.title}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
}
