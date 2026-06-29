'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { Check, Hand, Loader2, Play, Link2, Folder, FolderUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadFilesToCaseFolder } from '@/lib/caseFolder'
import { showToast } from '@/components/ui/Toast'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import { deliverableLinkLabel } from '@/lib/deliverables'
import { GYOMU_ALL } from '@/lib/serviceMaster'
import { koteiOf, KOTEI_GYOMU, KOTEI_ORDER } from '@/lib/kotei'
import { normalizeTaskStatus, READY_REASON_DOC } from '@/lib/taskReadiness'
import UserAvatar from '@/components/ui/UserAvatar'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { DocumentReceiptRow, MemberRow } from '@/types'
import type { RoleRow } from '@/components/features/cases/ProcedureIntakeSection'

type ReceiptFileMap = Record<string, { bucket: string; path: string; name: string | null }>

type Props = {
  receipts: DocumentReceiptRow[]
  currentMemberId: string | null
  currentMember: MemberRow | null
  fileByDocId: ReceiptFileMap
  onChanged: () => void
}

// 「0513/001」形式の番号を生成
function formatReceiptNumber(receivedDate: string, seq: number): string {
  // received_date は YYYY-MM-DD
  const mm = receivedDate.slice(5, 7)
  const dd = receivedDate.slice(8, 10)
  return `${mm}${dd}/${String(seq).padStart(3, '0')}`
}

export default function DocumentReceiptList({ receipts, currentMemberId, currentMember, onChanged }: Props) {
  const [startingReceipt, setStartingReceipt] = useState<DocumentReceiptRow | null>(null)
  const [tab, setTab] = useState<'today' | 'past'>('today')

  const today = todayJstYmd(new Date())
  // 当日分 = 受信日が本日以降（基本は当日に届いたもの）
  const todayReceipts = receipts.filter(r => (r.received_date ?? '') >= today)
  // 過去日分 = 受信日が本日より前。新しい順。
  const pastReceipts = receipts
    .filter(r => (r.received_date ?? '') < today)
    .sort((a, b) => (b.received_date ?? '').localeCompare(a.received_date ?? '') || (b.sequence_no - a.sequence_no))

  if (receipts.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
        <p className="text-[13px] text-gray-500">まだ受信記録はありません。</p>
        <p className="text-[12px] text-gray-400 mt-1">右上の「+ 新規作成」から登録できます。</p>
      </div>
    )
  }

  const list = tab === 'today' ? todayReceipts : pastReceipts

  return (
    <div>
      {/* タブ: 当日分 / 過去日分 */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-3">
        <TabButton active={tab === 'today'} onClick={() => setTab('today')} label="当日分" count={todayReceipts.length} />
        <TabButton active={tab === 'past'} onClick={() => setTab('past')} label="過去日分" count={pastReceipts.length} />
      </div>

      {list.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-[13px] text-gray-400">
          {tab === 'today' ? '本日到着の到着物はありません。' : '過去日分の未処理の到着物はありません。'}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-[13px] border-collapse" style={{ minWidth: 1100 }}>
            <colgroup>
              <col style={{ width: 100 }} />
              <col style={{ width: 140 }} />
              <col />
              <col style={{ width: 70 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr className="bg-brand-50/60 border-b border-brand-100 text-brand-700">
                <th className="px-2.5 py-2 text-left font-semibold">番号</th>
                <th className="px-2.5 py-2 text-left font-semibold">案件管理番号</th>
                <th className="px-2.5 py-2 text-left font-semibold">到着物</th>
                <th className="px-2.5 py-2 text-center font-semibold">通数</th>
                <th className="px-2.5 py-2 text-left font-semibold">受領先</th>
                <th className="px-2.5 py-2 text-center font-semibold">ファイル<span className="text-[10px] font-normal text-gray-400 block">案件フォルダ</span></th>
                <th className="px-2.5 py-2 text-center font-semibold" title="ダブルチェック＝受信確定（受領日が各タブに反映）">W-Check<span className="text-[10px] font-normal text-gray-400 block">受信確定</span></th>
                <th className="px-2.5 py-2 text-center font-semibold">対応</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <ReceiptRow
                  key={r.id}
                  receipt={r}
                  rowBg={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}
                  currentMemberId={currentMemberId}
                  currentMember={currentMember}
                  onChanged={onChanged}
                  onStartRequest={setStartingReceipt}
                />
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
    </div>
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
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 disabled:opacity-50"
        title="この受信の書類をまとめて案件フォルダにアップ"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderUp className="w-3 h-3" />}フォルダにアップ
      </button>
      <Link href={`/cases/${receipt.case_id}?tab=docs`} className="inline-flex items-center gap-1 text-[10.5px] text-gray-500 hover:text-brand-700">
        <Folder className="w-3 h-3" />フォルダを開く
      </Link>
    </div>
  )
}

function TabButton({ active, onClick, label, count, badge }: { active: boolean; onClick: () => void; label: string; count: number; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {label}
      <span className={`text-[12px] font-mono ${active ? 'opacity-80' : 'opacity-50'}`}>{count}</span>
      {badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{badge}</span>}
    </button>
  )
}

// 到着物の種類(linked_kind) → 関係する業務。候補タスクをこの業務に絞る。
const KIND_GYOMU: Record<string, string[]> = {
  koseki: ['戸籍', '相関図', '法定相続情報取得'],
  financial_asset: ['金融資産', '解約'],
  real_estate_acquisition: ['不動産'],
  real_estate: ['不動産'],
  agreement_dispatch: ['協議書'],
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

// 着手＝書類到着でタスク開始のトリガー。受信簿に着手記録を付け、選択した案件タスクを「対応中」にする。
function ReceiptStartModal({ receipt, currentMemberId, onClose, onDone }: {
  receipt: DocumentReceiptRow
  currentMemberId: string | null
  onClose: () => void
  onDone: () => void
}) {
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; status: string; source_rid: string | null; phase: string | null; task_kind: string | null }>>([])
  const [intakeRoles, setIntakeRoles] = useState<RoleRow[]>([])
  // 契約時受領書類 id → 区分(category)。区分で結べるタスクを出し分ける。
  const [contractCat, setContractCat] = useState<Map<string, string | null>>(new Map())
  // 到着物(item)ごとに結ぶ既存タスクid集合 / 新規タスク名
  const [itemSel, setItemSel] = useState<Record<string, Set<string>>>({})
  const [itemNew, setItemNew] = useState<Record<string, string>>({})
  // 到着物(item)ごとに、自由入力で作る新規タスクの工程・業務区分
  const [itemKotei, setItemKotei] = useState<Record<string, string>>({})
  const [itemGyomu, setItemGyomu] = useState<Record<string, string>>({})
  // 到着物(item)ごとに「結んだタスクを着手OKにする（必要書類受領済）」
  const [itemReady, setItemReady] = useState<Record<string, boolean>>({})
  // 到着物(item)ごとに「関係しない業務のタスクも表示」を開いているか
  const [showAll, setShowAll] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const items = (receipt.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const [tk, cs, cd] = await Promise.all([
        // 全件取得（完了含む）。完了は候補に出さないが、「＋作成」候補の重複判定に使う。
        supabase.from('tasks').select('id,title,status,source_rid,phase,task_kind').eq('case_id', receipt.case_id).order('sort_order'),
        supabase.from('cases').select('service_category, service_category_2, intake_roles').eq('id', receipt.case_id).single(),
        supabase.from('contract_documents').select('id, category').eq('case_id', receipt.case_id),
      ])
      setTasks((tk.data ?? []) as Array<{ id: string; title: string; status: string; source_rid: string | null; phase: string | null; task_kind: string | null }>)
      const c = cs.data as { service_category: string | null; service_category_2: string | null; intake_roles: RoleRow[] | null } | null
      setIntakeRoles((c?.intake_roles ?? []) as RoleRow[])
      setContractCat(new Map(((cd.data ?? []) as Array<{ id: string; category: string | null }>).map(d => [d.id, d.category])))
      setLoading(false)
    })()
  }, [receipt.case_id])

  // タスク候補。役割分担で定義した作業は作業区分(作業/請求・受領)を問わず全部出す
  // （戸籍請求書を作って請求する・名寄帳を請求する等、請求・受領も立派なタスクのため）。
  const taskRoles = intakeRoles.filter(r => r.sagyou?.trim() && r.owner !== '不要')
  // 既にタスク化済みの作業名（完了/対応中問わず）。「＋作成」候補から除外して二重作成・完了済の再掲を防ぐ。
  const existingTaskTitles = new Set(tasks.map(t => t.title))
  // 契約時受領書類の区分（戸籍/評価証明等は調査系）。区分=契約/その他のみタスク不要。
  const contractGyomuFor = (it: { linked_kind: string | null; linked_id: string | null }): string[] | undefined =>
    CONTRACT_CATEGORY_GYOMU[contractCat.get(it.linked_id ?? '') ?? '']
  // 到着物の種類 → 関係する業務区分の集合。判定できないときは undefined（＝絞り込み不可）。
  const gyomuForItem = (it: { linked_kind: string | null; linked_id: string | null }): string[] | undefined => {
    if (it.linked_kind === 'contract_doc') return contractGyomuFor(it)
    return it.linked_kind ? KIND_GYOMU[it.linked_kind] : undefined
  }
  // 到着物ごとに、関係する業務の実施タスクだけ候補に出す。
  // 関係業務が判定できない到着物（自由入力等）は候補を出さず、自由入力に任せる（ダンプ防止）。
  const candidateNamesForItem = (it: { linked_kind: string | null; linked_id: string | null }): string[] => {
    if (it.linked_kind === 'contract_doc' && !contractGyomuFor(it)) return [] // 区分=契約/その他 ＝ タスク不要
    const gy = gyomuForItem(it)
    if (!gy) return []
    // 既にタスク化済みの作業は除外（対応中＝既存ピルで選ぶ／完了＝再掲しない）。
    const rs = taskRoles.filter(r => gy.includes(r.gyomu) && !existingTaskTitles.has(r.sagyou))
    return [...new Set(rs.map(r => r.sagyou))]
  }
  // 既存タスクの業務区分（phase の "PhaseN:" 接頭辞を除く）
  const gyomuOfTask = (t: { phase: string | null }) => (t.phase ?? '').replace(/^Phase\d+[:：]\s*/, '')
  // タスク不要＝区分が調査系にマップされない契約書類のみ。
  const isTaskFree = (it: { linked_kind: string | null; linked_id: string | null }): boolean =>
    it.linked_kind === 'contract_doc' && !contractGyomuFor(it)

  const toggle = (itemId: string, taskId: string) => setItemSel(prev => {
    const cur = new Set(prev[itemId] ?? [])
    if (cur.has(taskId)) cur.delete(taskId); else cur.add(taskId)
    return { ...prev, [itemId]: cur }
  })

  const totalLinks = items.reduce((n, it) => n + (itemSel[it.id]?.size ?? 0) + ((itemNew[it.id] ?? '').trim() ? 1 : 0), 0)

  const confirm = async () => {
    if (!currentMemberId) { showToast('ログイン情報が取得できませんでした', 'error'); return }
    setSaving(true)
    const supabase = createClient()
    const nowIso = new Date().toISOString()

    // 受信簿に着手記録
    await supabase.from('document_receipts').update({ started_by_member_id: currentMemberId, started_at: nowIso }).eq('id', receipt.id)

    const joinRows: { receipt_item_id: string; task_id: string }[] = []
    let firstTaskId: string | null = null
    // 「着手OKにする」がチェックされた到着物に結んだタスク（必要書類受領済として着手OK旗を立てる）
    const readyTaskIds = new Set<string>()

    // 実施タスク行のrid採番（作成時に更新）／既存タスクの rid→id（重複生成防止）
    const roles = [...intakeRoles]
    let rolesChanged = false
    const ridToTaskId = new Map(tasks.filter(t => t.source_rid).map(t => [t.source_rid as string, t.id]))

    // 到着物ごとに：新規タスク作成（実施タスク候補に一致すれば source_rid 連携）＋既存タスク紐付け。
    // ※ ここでは「着手」しない。紐付けた人と実際に着手する人が異なるため、未着手(着手前)で保存する。
    for (const it of items) {
      const linkedThisItem: string[] = []
      const newTitle = (itemNew[it.id] ?? '').trim()
      if (newTitle) {
        // 実施タスク（作業）に一致したら rid を採番して紐付け。一致時はその業務区分、
        // 自由入力時はユーザーが選んだ業務区分を使う。
        const idx = roles.findIndex(r => r.sagyou === newTitle && r.owner !== '不要')
        let sourceRid: string | null = null
        let gyomu = ''
        if (idx >= 0) {
          gyomu = roles[idx].gyomu
          let rid = roles[idx].rid
          if (!rid) { rid = crypto.randomUUID(); roles[idx] = { ...roles[idx], rid }; rolesChanged = true }
          sourceRid = rid
        } else {
          // ユーザー選択 → 無ければ到着物の種類から推定した既定業務区分
          gyomu = (itemGyomu[it.id] ?? gyomuForItem(it)?.[0] ?? '').trim()
        }
        const existingId = sourceRid ? ridToTaskId.get(sourceRid) : undefined
        if (existingId) {
          // その実施タスクのタスクが既にある → 新規作成せず結ぶ
          joinRows.push({ receipt_item_id: it.id, task_id: existingId })
          firstTaskId = firstTaskId ?? existingId
          linkedThisItem.push(existingId)
        } else {
          const { data: nt, error } = await supabase.from('tasks')
            .insert({ case_id: receipt.case_id, title: newTitle, task_kind: 'case', phase: gyomu || 'phase1', category: gyomu || '', status: '着手前', priority: '通常', source_rid: sourceRid, sort_order: 99 })
            .select('id').single()
          if (!error && nt) {
            const id = (nt as { id: string }).id
            if (sourceRid) ridToTaskId.set(sourceRid, id)
            joinRows.push({ receipt_item_id: it.id, task_id: id })
            firstTaskId = firstTaskId ?? id
            linkedThisItem.push(id)
          }
        }
      }
      for (const taskId of itemSel[it.id] ?? []) {
        joinRows.push({ receipt_item_id: it.id, task_id: taskId })
        firstTaskId = firstTaskId ?? taskId
        linkedThisItem.push(taskId)
      }
      if (itemReady[it.id]) for (const id of linkedThisItem) readyTaskIds.add(id)
    }

    if (rolesChanged) await supabase.from('cases').update({ intake_roles: roles }).eq('id', receipt.case_id)
    if (joinRows.length > 0) {
      const { error } = await supabase.from('document_receipt_item_tasks').upsert(joinRows, { onConflict: 'receipt_item_id,task_id', ignoreDuplicates: true })
      if (error) { setSaving(false); showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    }
    // 後方互換：受信単位の代表タスク
    if (firstTaskId) await supabase.from('document_receipts').update({ started_task_id: firstTaskId }).eq('id', receipt.id)

    // 着手OK旗を立てる（着手前のみ）。対象は2通り:
    //   ・「着手OKにする」がチェックされたタスク
    //   ・「受領次第OK」で待っていたタスク（受領が紐づいた＝着手OKへ自動昇格）
    const linkedTaskIds = [...new Set(joinRows.map(j => j.task_id))]
    if (linkedTaskIds.length > 0) {
      const { data: rows } = await supabase.from('tasks').select('id, ext_data, status').in('id', linkedTaskIds)
      for (const row of (rows ?? []) as Array<{ id: string; ext_data: Record<string, unknown> | null; status: string }>) {
        if (normalizeTaskStatus(row.status) !== '着手前') continue
        const ext = (row.ext_data ?? {}) as Record<string, unknown>
        const checked = readyTaskIds.has(row.id)
        const waitingReceipt = ext.ready_on_receipt === true && !(typeof ext.ready_reason === 'string' && ext.ready_reason.trim())
        if (!checked && !waitingReceipt) continue
        const next = { ...ext, ready_reason: READY_REASON_DOC, ready_on_receipt: false, ready_wait_note: null }
        await supabase.from('tasks').update({ ext_data: next }).eq('id', row.id)
      }
    }

    setSaving(false)
    showToast(totalLinks > 0 ? `${totalLinks}件のタスクに紐付けました（未着手）` : '処理済みにしました', 'success')
    // タスク詳細へは遷移しない（受信簿の流れを止めない）。
    onDone()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="タスクを結ぶ（到着物ごと）"
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={confirm} loading={saving}>
            {totalLinks > 0 ? `タスクを紐付け (${totalLinks})` : 'タスクなしで完了'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-gray-600">
          届いた到着物ごとに、進めるタスクを結びます（戸籍→相続人調査、通帳コピー→金融資産調査 のように）。既存タスクが無くても、実施タスクから選ぶ／自由入力で<strong>その場で作成</strong>できます。紐付けたタスクは<strong>未着手のまま</strong>保存され、シフトの担当者があとから着手します。契約書類などタスク不要なものは、何も選ばず<strong>「タスクなしで完了」</strong>（受信を処理済みとして閉じるだけ）でOK。
        </p>
        {loading ? (
          <div className="py-6 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />読み込み中…</div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-gray-400">到着物がありません</div>
        ) : (
          <div className="space-y-3 max-h-[28rem] overflow-y-auto">
            {items.map(it => {
              const cand = candidateNamesForItem(it)
              const isContract = isTaskFree(it)
              // この到着物に関係する業務区分。判定できれば既存タスクを「関係する業務」だけに絞る。
              const gy = gyomuForItem(it)
              // 事務管理タスク(task_kind='case')のうち、未完了のものだけ候補に（完了/キャンセルは出さない）。
              const linkable = tasks.filter(t => t.task_kind !== 'system' && t.status !== '完了' && t.status !== 'キャンセル')
              const relevant = gy ? linkable.filter(t => gy.includes(gyomuOfTask(t))) : []
              const relevantIds = new Set(relevant.map(t => t.id))
              const others = linkable.filter(t => !relevantIds.has(t.id))
              // 関係業務が判定できない（自由入力の到着物等）ときは絞り込めないので全件 others 扱いで畳む
              const primary = relevant.length > 0 ? relevant : []
              const showOthers = !!showAll[it.id]
              const renderPill = (t: { id: string; title: string }) => {
                const on = itemSel[it.id]?.has(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle(it.id, t.id)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[12px] transition-colors ${on ? 'bg-brand-600 border-brand-600 text-white font-semibold' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  >
                    {on && <Play className="w-3 h-3" strokeWidth={2.5} />}{t.title}
                  </button>
                )
              }
              return (
              <div key={it.id} className="border border-gray-200 rounded-lg p-3">
                <div className="text-[13px] font-semibold text-gray-800 mb-1.5">{it.item_name}</div>
                {linkable.length === 0 ? (
                  <p className="text-[11px] text-gray-400 mb-2">未完了の既存タスクはありません（下で作成できます）</p>
                ) : (
                  <div className="mb-2">
                    {/* 関係する業務のタスク（優先表示） */}
                    {primary.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {primary.map(renderPill)}
                      </div>
                    )}
                    {/* それ以外のタスク（折りたたみ） */}
                    {others.length > 0 && (
                      showOthers ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {primary.length > 0 && <span className="w-full text-[10px] text-gray-400">その他のタスク</span>}
                          {others.map(renderPill)}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAll(prev => ({ ...prev, [it.id]: true }))}
                          className="mt-1.5 text-[11px] text-brand-600 hover:text-brand-700 font-semibold"
                        >
                          {primary.length > 0 ? `＋ 他の業務のタスクも表示（${others.length}）` : `既存タスクから選ぶ（${others.length}）`}
                        </button>
                      )
                    )}
                  </div>
                )}
                {isContract ? (
                  <p className="text-[11px] text-gray-400">契約書類はタスク不要（W-Checkで確定済み）。結ぶ必要はありません。</p>
                ) : (
                  <>
                    {cand.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {cand.map(n => {
                          const on = (itemNew[it.id] ?? '') === n
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setItemNew(prev => ({ ...prev, [it.id]: on ? '' : n }))}
                              className={`inline-flex items-center px-2 py-1 rounded-full border text-[12px] transition-colors ${on ? 'bg-brand-600 border-brand-600 text-white font-semibold' : 'bg-white border-dashed border-gray-300 text-gray-600 hover:border-brand-400 hover:text-brand-700'}`}
                            >＋{n}</button>
                          )
                        })}
                      </div>
                    )}
                    <input
                      type="text"
                      value={itemNew[it.id] ?? ''}
                      onChange={e => setItemNew(prev => ({ ...prev, [it.id]: e.target.value }))}
                      placeholder={cand.length > 0 ? '＋自由入力で作成（任意）' : '＋新規タスクを作成して結ぶ（任意）'}
                      className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-brand-400"
                    />
                    {/* 自由入力で作る新規タスクの業務区分（候補一致時は自動なので不要） */}
                    {(() => {
                      const newVal = (itemNew[it.id] ?? '').trim()
                      if (!newVal || cand.includes(newVal)) return null
                      const defaultGy = gy?.[0] ?? ''
                      const curKotei = itemKotei[it.id] ?? koteiOf(itemGyomu[it.id] ?? defaultGy)
                      const koteiList = KOTEI_ORDER
                      const gyomuList = curKotei ? (KOTEI_GYOMU[curKotei] ?? GYOMU_ALL) : GYOMU_ALL
                      return (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className="text-[11px] text-gray-500">工程</span>
                          <select
                            value={curKotei}
                            onChange={e => { const k = e.target.value; setItemKotei(prev => ({ ...prev, [it.id]: k })); setItemGyomu(prev => ({ ...prev, [it.id]: (KOTEI_GYOMU[k] ?? [])[0] ?? '' })) }}
                            className="px-2 py-1 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400"
                          >
                            {koteiList.map(k => <option key={k} value={k}>{k}</option>)}
                          </select>
                          <span className="text-[11px] text-gray-500">業務区分</span>
                          <select
                            value={itemGyomu[it.id] ?? defaultGy}
                            onChange={e => setItemGyomu(prev => ({ ...prev, [it.id]: e.target.value }))}
                            className="flex-1 px-2 py-1 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400"
                          >
                            <option value="">未設定</option>
                            {gyomuList.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                      )
                    })()}
                  </>
                )}
                {/* 着手OKにする（この到着物に結んだタスクを「必要書類受領済」で着手OKに） */}
                {((itemSel[it.id]?.size ?? 0) > 0 || (itemNew[it.id] ?? '').trim()) && !isContract && (
                  <label className={`mt-2 flex items-center gap-2 text-[12px] rounded-lg px-2.5 py-1.5 cursor-pointer border transition-colors ${itemReady[it.id] ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                    <input
                      type="checkbox"
                      checked={!!itemReady[it.id]}
                      onChange={e => setItemReady(prev => ({ ...prev, [it.id]: e.target.checked }))}
                      className="w-4 h-4 accent-amber-500"
                    />
                    結んだタスクを<span className="font-semibold">着手OK</span>にする
                    <span className="ml-auto text-[10.5px] text-gray-400">理由：{READY_REASON_DOC}</span>
                  </label>
                )}
              </div>
            )})}
          </div>
        )}
      </div>
    </Modal>
  )
}

function ReceiptRow({
  receipt,
  rowBg,
  currentMemberId,
  currentMember,
  onChanged,
  onStartRequest,
}: {
  receipt: DocumentReceiptRow
  rowBg: string
  currentMemberId: string | null
  currentMember: MemberRow | null
  onChanged: () => void
  onStartRequest: (r: DocumentReceiptRow) => void
}) {
  const items = (receipt.items ?? []).sort((a, b) => a.sort_order - b.sort_order)
  const rowCount = Math.max(items.length, 1)
  const numberText = formatReceiptNumber(receipt.received_date, receipt.sequence_no)
  const rowClass = rowBg

  const [, startTransition] = useTransition()
  const [busyKind, setBusyKind] = useState<null | 'check' | 'start'>(null)

  const handleDualCheckToggle = async () => {
    if (busyKind) return
    if (!currentMemberId) {
      showToast('ログイン情報が取得できませんでした', 'error')
      return
    }
    setBusyKind('check')
    const supabase = createClient()
    const isChecked = !!receipt.dual_check_member_id
    const patch = isChecked
      ? { dual_check_member_id: null, dual_checked_at: null }
      : { dual_check_member_id: currentMemberId, dual_checked_at: new Date().toISOString() }
    const { error } = await supabase
      .from('document_receipts')
      .update(patch)
      .eq('id', receipt.id)
    if (error) {
      setBusyKind(null)
      showToast(`保存に失敗しました: ${error.message}`, 'error')
      return
    }

    // W-Check 完了（受信確定）に連動して、紐づけ先の受領日を反映する。
    // 確認前にマークが付かないよう、ここで初めて書き戻す（解除時は null に戻す）。
    const linkVal = isChecked ? null : (receipt.received_date ?? null)
    const linkUpdates = (receipt.items ?? [])
      .filter(i => i.linked_kind && i.linked_id && i.linked_field)
      .map(i => {
        // 協議書の返送は受領日＋受領済(boolean)も連動させる
        if (i.linked_kind === 'agreement_dispatch') {
          return supabase.from('agreement_dispatches').update({ received_date: linkVal, received: linkVal != null }).eq('id', i.linked_id as string)
        }
        const table = i.linked_kind === 'financial_asset' ? 'financial_assets'
          : i.linked_kind === 'koseki' ? 'koseki_requests'
          : i.linked_kind === 'contract_doc' ? 'contract_documents'
          : i.linked_kind === 'real_estate_acquisition' ? 'real_estate_acquisitions'
          : 'real_estate_properties'
        return supabase.from(table).update({ [i.linked_field as string]: linkVal }).eq('id', i.linked_id as string)
      })
    if (linkUpdates.length > 0) {
      const results = await Promise.all(linkUpdates)
      if (results.some(r => r.error)) {
        showToast('W-Checkは保存しましたが、一部の受領日反映に失敗しました', 'error')
      }
    }

    setBusyKind(null)
    startTransition(onChanged)
  }

  const handleStart = async () => {
    if (busyKind) return
    if (!currentMemberId) {
      showToast('ログイン情報が取得できませんでした', 'error')
      return
    }
    setBusyKind('start')
    const supabase = createClient()
    const isStarted = !!receipt.started_by_member_id
    const patch = isStarted
      ? { started_by_member_id: null, started_at: null, started_task_id: null }
      : { started_by_member_id: currentMemberId, started_at: new Date().toISOString() }
    const { error } = await supabase
      .from('document_receipts')
      .update(patch)
      .eq('id', receipt.id)
    setBusyKind(null)
    if (error) {
      showToast(`保存に失敗しました: ${error.message}`, 'error')
      return
    }
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
                {numberText}
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

            {/* 到着物 / 通数 / 受領先（各項目で1行ずつ） */}
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
            <td className="px-2.5 py-1.5 text-gray-700">
              {it?.received_from ?? <span className="text-gray-300">-</span>}
            </td>

            {/* ファイル：受信1件まとめて案件フォルダにアップ／開く（行統合） */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2 py-2 text-center align-middle border-l border-gray-100">
                <ReceiptFolderActions receipt={receipt} currentMemberId={currentMemberId} onChanged={onChanged} />
              </td>
            )}

            {/* W-Check（行統合） */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2 py-2 text-center align-middle border-l border-gray-100">
                {receipt.dual_check_member ? (
                  <button
                    type="button"
                    onClick={handleDualCheckToggle}
                    disabled={busyKind === 'check'}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    title={`${receipt.dual_check_member.name} がダブルチェック済み（クリックで取消）`}
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                    <UserAvatar
                      name={receipt.dual_check_member.name}
                      role={receipt.dual_check_member.primary_role as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | null}
                      url={receipt.dual_check_member.avatar_url}
                      size="xs"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDualCheckToggle}
                    disabled={busyKind === 'check' || !currentMemberId}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-gray-300 text-gray-500 hover:bg-brand-50 hover:border-brand-400 hover:text-brand-700 disabled:opacity-50 text-[11px] font-semibold"
                  >
                    <Check className="w-3.5 h-3.5" />
                    確認する
                  </button>
                )}
              </td>
            )}

            {/* 着手（行統合） */}
            {isFirst && (
              <td rowSpan={rowCount} className="px-2 py-2 text-center align-middle border-l border-gray-100">
                {receipt.started_by_member ? (
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={busyKind === 'start'}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-brand-50 border border-brand-300 hover:bg-brand-100 disabled:opacity-50"
                    title={`${receipt.started_by_member.name} が着手中（クリックで取消）`}
                  >
                    <UserAvatar
                      name={receipt.started_by_member.name}
                      role={receipt.started_by_member.primary_role as 'sales' | 'manager' | 'assistant' | 'accounting' | 'lp' | null}
                      url={receipt.started_by_member.avatar_url}
                      size="xs"
                    />
                    <span className="text-[12px] font-semibold text-brand-700">
                      {receipt.started_by_member.name}
                    </span>
                  </button>
                ) : !receipt.dual_check_member_id ? (
                  <span className="text-[11px] text-gray-400" title="W-Check（受信確定）後にタスク着手できます">
                    W-Check待ち
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStartRequest(receipt)}
                    disabled={!currentMemberId}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-gray-300 text-gray-500 hover:bg-brand-50 hover:border-brand-400 hover:text-brand-700 disabled:opacity-50 text-[11px] font-semibold"
                    title={currentMember ? `${currentMember.name} として対応（タスクを結ぶ／タスクなしで完了）` : '対応'}
                  >
                    <Hand className="w-3.5 h-3.5" />
                    対応
                  </button>
                )}
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
}
