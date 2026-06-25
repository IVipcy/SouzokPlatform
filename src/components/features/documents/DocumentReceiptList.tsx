'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { Check, Hand, Loader2, Play, Link2, Paperclip } from 'lucide-react'
import OpenStorageFile from './OpenStorageFile'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import { deliverableLinkLabel } from '@/lib/deliverables'
import { categoriesOf, kindForTask } from '@/lib/serviceMaster'
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

export default function DocumentReceiptList({ receipts, currentMemberId, currentMember, fileByDocId, onChanged }: Props) {
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
                  fileByDocId={fileByDocId}
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

// 到着物ごとの受領ファイル（case_documents の received_file）を添付/開く。
function ItemFileCell({ caseId, caseDocumentId, file, onChanged }: {
  caseId: string
  caseDocumentId: string
  file: { bucket: string; path: string; name: string | null } | null
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = async (f: File) => {
    setBusy(true)
    const supabase = createClient()
    const ext = f.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const path = `${caseId}/${caseDocumentId}/received-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('documents').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: true })
    if (upErr) { setBusy(false); showToast(`アップロードに失敗しました: ${upErr.message}`, 'error'); return }
    const { error: dbErr } = await supabase.from('case_documents').update({
      received_file_path: path,
      received_file_name: f.name,
      received_file_type: f.type || f.name.split('.').pop()?.toUpperCase() || null,
      received_file_bucket: 'documents',
    }).eq('id', caseDocumentId)
    setBusy(false)
    if (dbErr) { showToast(`保存に失敗しました: ${dbErr.message}`, 'error'); return }
    showToast('ファイルを添付しました', 'success')
    onChanged()
  }
  if (file) {
    return <OpenStorageFile bucket={file.bucket} path={file.path} name={file.name} label="ファイル" />
  }
  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
        title="受領ファイルを添付（各調査表・到着物一覧から参照できます）"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}添付
      </button>
    </>
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
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; status: string; source_rid: string | null }>>([])
  const [intakeRoles, setIntakeRoles] = useState<RoleRow[]>([])
  const [cats, setCats] = useState<string[]>([])
  // 契約時受領書類 id → 区分(category)。区分で結べるタスクを出し分ける。
  const [contractCat, setContractCat] = useState<Map<string, string | null>>(new Map())
  // 到着物(item)ごとに結ぶ既存タスクid集合 / 新規タスク名
  const [itemSel, setItemSel] = useState<Record<string, Set<string>>>({})
  const [itemNew, setItemNew] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const items = (receipt.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const [tk, cs, cd] = await Promise.all([
        supabase.from('tasks').select('id,title,status,source_rid').eq('case_id', receipt.case_id).neq('status', '完了').order('sort_order'),
        supabase.from('cases').select('service_category, service_category_2, intake_roles').eq('id', receipt.case_id).single(),
        supabase.from('contract_documents').select('id, category').eq('case_id', receipt.case_id),
      ])
      setTasks((tk.data ?? []) as Array<{ id: string; title: string; status: string; source_rid: string | null }>)
      const c = cs.data as { service_category: string | null; service_category_2: string | null; intake_roles: RoleRow[] | null } | null
      setIntakeRoles((c?.intake_roles ?? []) as RoleRow[])
      setCats(categoriesOf(c?.service_category, c?.service_category_2))
      setContractCat(new Map(((cd.data ?? []) as Array<{ id: string; category: string | null }>).map(d => [d.id, d.category])))
      setLoading(false)
    })()
  }, [receipt.case_id])

  // 実施タスク（作業区分=作業）の候補。datalistで提示し、選ぶ/一致すると source_rid で紐付ける。
  const isTaskKind = (r: RoleRow) => (r.kind ?? kindForTask(cats, r.gyomu, r.sagyou)) === 'task'
  const taskRoles = intakeRoles.filter(r => r.sagyou?.trim() && r.owner !== '不要' && isTaskKind(r))
  // 契約時受領書類の区分（戸籍/評価証明等は調査系）。区分=契約/その他のみタスク不要。
  const contractGyomuFor = (it: { linked_kind: string | null; linked_id: string | null }): string[] | undefined =>
    CONTRACT_CATEGORY_GYOMU[contractCat.get(it.linked_id ?? '') ?? '']
  // 到着物ごとに、関係する業務の実施タスクだけ候補に出す。
  // 契約書類は区分で出し分け（戸籍・評価証明など調査系は該当タスクに結べる／契約・その他はタスク不要）。
  const candidateNamesForItem = (it: { linked_kind: string | null; linked_id: string | null }): string[] => {
    let gy: string[] | undefined
    if (it.linked_kind === 'contract_doc') {
      gy = contractGyomuFor(it)
      if (!gy) return [] // 区分=契約/その他 ＝ タスク不要
    } else {
      gy = it.linked_kind ? KIND_GYOMU[it.linked_kind] : undefined
    }
    const rs = gy ? taskRoles.filter(r => gy!.includes(r.gyomu)) : taskRoles
    return [...new Set(rs.map(r => r.sagyou))]
  }
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
    const startExistingIds = new Set<string>()
    let firstTaskId: string | null = null

    // 実施タスク行のrid採番（作成時に更新）／既存タスクの rid→id（重複生成防止）
    const roles = [...intakeRoles]
    let rolesChanged = false
    const ridToTaskId = new Map(tasks.filter(t => t.source_rid).map(t => [t.source_rid as string, t.id]))

    // 到着物ごとに：新規タスク作成（実施タスク候補に一致すれば source_rid 連携）＋既存タスク紐付け
    for (const it of items) {
      const newTitle = (itemNew[it.id] ?? '').trim()
      if (newTitle) {
        // 実施タスク（作業）に一致したら rid を採番して紐付け
        const idx = roles.findIndex(r => r.sagyou === newTitle && r.owner !== '不要' && isTaskKind(r))
        let sourceRid: string | null = null
        let gyomu = ''
        if (idx >= 0) {
          gyomu = roles[idx].gyomu
          let rid = roles[idx].rid
          if (!rid) { rid = crypto.randomUUID(); roles[idx] = { ...roles[idx], rid }; rolesChanged = true }
          sourceRid = rid
        }
        const existingId = sourceRid ? ridToTaskId.get(sourceRid) : undefined
        if (existingId) {
          // その実施タスクのタスクが既にある → 新規作成せず結ぶ
          joinRows.push({ receipt_item_id: it.id, task_id: existingId })
          startExistingIds.add(existingId)
          firstTaskId = firstTaskId ?? existingId
        } else {
          const { data: nt, error } = await supabase.from('tasks')
            .insert({ case_id: receipt.case_id, title: newTitle, task_kind: 'case', phase: gyomu || 'phase1', category: gyomu || '', status: '対応中', priority: '通常', source_rid: sourceRid, started_by: currentMemberId, started_at: nowIso, sort_order: 99 })
            .select('id').single()
          if (!error && nt) {
            const id = (nt as { id: string }).id
            await supabase.from('task_assignees').insert({ task_id: id, member_id: currentMemberId, role: 'primary' })
            if (sourceRid) ridToTaskId.set(sourceRid, id)
            joinRows.push({ receipt_item_id: it.id, task_id: id })
            firstTaskId = firstTaskId ?? id
          }
        }
      }
      for (const taskId of itemSel[it.id] ?? []) {
        joinRows.push({ receipt_item_id: it.id, task_id: taskId })
        startExistingIds.add(taskId)
        firstTaskId = firstTaskId ?? taskId
      }
    }

    if (rolesChanged) await supabase.from('cases').update({ intake_roles: roles }).eq('id', receipt.case_id)
    if (startExistingIds.size > 0) {
      await supabase.from('tasks').update({ status: '対応中', started_by: currentMemberId, started_at: nowIso }).in('id', [...startExistingIds])
    }
    if (joinRows.length > 0) {
      const { error } = await supabase.from('document_receipt_item_tasks').upsert(joinRows, { onConflict: 'receipt_item_id,task_id', ignoreDuplicates: true })
      if (error) { setSaving(false); showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    }
    // 後方互換：受信単位の代表タスク
    if (firstTaskId) await supabase.from('document_receipts').update({ started_task_id: firstTaskId }).eq('id', receipt.id)

    setSaving(false)
    showToast(totalLinks > 0 ? `着手し、${totalLinks}件をタスクに紐付けました` : '着手しました', 'success')
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
            {totalLinks > 0 ? `タスクを作成・着手 (${totalLinks})` : 'タスクなしで完了'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-gray-600">
          届いた到着物ごとに、進めるタスクを結びます（戸籍→相続人調査、通帳コピー→金融資産調査 のように）。既存タスクが無くても、実施タスクから選ぶ／自由入力で<strong>その場で作成</strong>できます（対応中前でもOK。タスクタブ表示後に出てきます）。契約書類などタスク不要なものは、何も選ばず<strong>「タスクなしで完了」</strong>（受信を処理済みとして閉じるだけ）でOK。
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
              return (
              <div key={it.id} className="border border-gray-200 rounded-lg p-3">
                <div className="text-[13px] font-semibold text-gray-800 mb-1.5">{it.item_name}</div>
                {tasks.length === 0 ? (
                  <p className="text-[11px] text-gray-400 mb-2">既存タスクはありません（下で作成できます）</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tasks.map(t => {
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
                    })}
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
                  </>
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
  fileByDocId,
  onChanged,
  onStartRequest,
}: {
  receipt: DocumentReceiptRow
  rowBg: string
  currentMemberId: string | null
  currentMember: MemberRow | null
  fileByDocId: ReceiptFileMap
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
                {it?.case_document_id && (
                  <ItemFileCell
                    caseId={receipt.case_id}
                    caseDocumentId={it.case_document_id}
                    file={fileByDocId[it.case_document_id] ?? null}
                    onChanged={onChanged}
                  />
                )}
              </div>
            </td>
            <td className="px-2.5 py-1.5 text-right font-mono text-gray-700">
              {it?.quantity != null ? `${it.quantity}通` : <span className="text-gray-300">-</span>}
            </td>
            <td className="px-2.5 py-1.5 text-gray-700">
              {it?.received_from ?? <span className="text-gray-300">-</span>}
            </td>

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
