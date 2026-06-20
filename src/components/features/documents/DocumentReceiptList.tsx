'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Hand, Loader2, Play, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import { deliverableLinkLabel } from '@/lib/deliverables'
import UserAvatar from '@/components/ui/UserAvatar'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { DocumentReceiptRow, MemberRow } from '@/types'

type Props = {
  receipts: DocumentReceiptRow[]
  currentMemberId: string | null
  currentMember: MemberRow | null
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
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <th className="px-2.5 py-2 text-left font-semibold">番号</th>
                <th className="px-2.5 py-2 text-left font-semibold">案件管理番号</th>
                <th className="px-2.5 py-2 text-left font-semibold">到着物</th>
                <th className="px-2.5 py-2 text-center font-semibold">通数</th>
                <th className="px-2.5 py-2 text-left font-semibold">受領先</th>
                <th className="px-2.5 py-2 text-center font-semibold" title="ダブルチェック＝受信確定（受領日が各タブに反映）">W-Check<span className="text-[10px] font-normal text-gray-400 block">受信確定</span></th>
                <th className="px-2.5 py-2 text-center font-semibold">タスク着手</th>
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

// 着手＝書類到着でタスク開始のトリガー。受信簿に着手記録を付け、選択した案件タスクを「対応中」にする。
function ReceiptStartModal({ receipt, currentMemberId, onClose, onDone }: {
  receipt: DocumentReceiptRow
  currentMemberId: string | null
  onClose: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; status: string }>>([])
  // 到着物(item)ごとに結ぶ既存タスクid集合 / 新規タスク名
  const [itemSel, setItemSel] = useState<Record<string, Set<string>>>({})
  const [itemNew, setItemNew] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const items = (receipt.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id,title,status')
        .eq('case_id', receipt.case_id)
        .neq('status', '完了')
        .order('sort_order')
      setTasks((data ?? []) as Array<{ id: string; title: string; status: string }>)
      setLoading(false)
    })()
  }, [receipt.case_id])

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

    // 到着物ごとに：新規タスク作成＋既存タスク紐付け
    for (const it of items) {
      const newTitle = (itemNew[it.id] ?? '').trim()
      if (newTitle) {
        const { data: nt, error } = await supabase.from('tasks')
          .insert({ case_id: receipt.case_id, title: newTitle, task_kind: 'case', phase: 'phase1', category: '', status: '対応中', priority: '通常', started_by: currentMemberId, started_at: nowIso, sort_order: 99 })
          .select('id').single()
        if (!error && nt) {
          const id = (nt as { id: string }).id
          await supabase.from('task_assignees').insert({ task_id: id, member_id: currentMemberId, role: 'primary' })
          joinRows.push({ receipt_item_id: it.id, task_id: id })
          firstTaskId = firstTaskId ?? id
        }
      }
      for (const taskId of itemSel[it.id] ?? []) {
        joinRows.push({ receipt_item_id: it.id, task_id: taskId })
        startExistingIds.add(taskId)
        firstTaskId = firstTaskId ?? taskId
      }
    }

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
    if (totalLinks === 1 && firstTaskId) router.push(`/tasks/${firstTaskId}`)
    else onDone()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="タスクに着手（到着物ごと）"
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={confirm} loading={saving}>
            {totalLinks > 0 ? `タスクを開始 (${totalLinks})` : '着手のみ記録'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-gray-600">
          届いた到着物ごとに、進めるタスクを結びます（残高証明→財産調査、解約書類→解約 のように別々に結べます）。タスク不要な受信は選ばず「着手のみ記録」でOK。
        </p>
        {loading ? (
          <div className="py-6 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />読み込み中…</div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-gray-400">到着物がありません</div>
        ) : (
          <div className="space-y-3 max-h-[28rem] overflow-y-auto">
            {items.map(it => (
              <div key={it.id} className="border border-gray-200 rounded-lg p-3">
                <div className="text-[13px] font-semibold text-gray-800 mb-1.5">{it.item_name}</div>
                {tasks.length === 0 ? (
                  <p className="text-[11px] text-gray-400 mb-2">未完了の既存タスクはありません</p>
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
                <input
                  type="text"
                  value={itemNew[it.id] ?? ''}
                  onChange={e => setItemNew(prev => ({ ...prev, [it.id]: e.target.value }))}
                  placeholder="＋新規タスクを作成して結ぶ（任意）"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-lg outline-none focus:border-brand-400"
                />
              </div>
            ))}
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
                    title={currentMember ? `${currentMember.name} としてタスクに着手` : 'タスクに着手'}
                  >
                    <Hand className="w-3.5 h-3.5" />
                    タスクに着手
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
