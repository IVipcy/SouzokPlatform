'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Hand, Loader2, Play, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { todayJstYmd } from '@/lib/dashboardMetrics'
import { deliverableLinkLabel } from '@/lib/deliverables'
import { DB_PHASES, getPhaseLabel } from '@/lib/phases'
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
  // 過去日分 = 受信日が本日より前。未着手（着手者未設定）を上部に、その中は新しい順。
  const pastReceipts = receipts
    .filter(r => (r.received_date ?? '') < today)
    .sort((a, b) => {
      const aUn = !a.started_by_member_id, bUn = !b.started_by_member_id
      if (aUn !== bUn) return aUn ? -1 : 1
      return (b.received_date ?? '').localeCompare(a.received_date ?? '') || (b.sequence_no - a.sequence_no)
    })
  const pastUnstarted = pastReceipts.filter(r => !r.started_by_member_id).length

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
        <TabButton active={tab === 'past'} onClick={() => setTab('past')} label="過去日分" count={pastReceipts.length} badge={pastUnstarted > 0 ? `未着手 ${pastUnstarted}` : undefined} />
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
                  unstartedPast={tab === 'past' && !r.started_by_member_id}
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPhase, setNewTaskPhase] = useState('phase1')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const confirm = async () => {
    if (!currentMemberId) { showToast('ログイン情報が取得できませんでした', 'error'); return }
    setSaving(true)
    const supabase = createClient()
    const nowIso = new Date().toISOString()
    // 受信簿に着手記録
    const { error: e1 } = await supabase.from('document_receipts')
      .update({ started_by_member_id: currentMemberId, started_at: nowIso }).eq('id', receipt.id)
    // 選択タスクを「対応中」に（着手者も記録）
    let e2: { message: string } | null = null
    if (selected.size > 0) {
      const { error } = await supabase.from('tasks')
        .update({ status: '対応中', started_by: currentMemberId, started_at: nowIso })
        .in('id', [...selected])
      e2 = error
    }
    // 受信をきっかけに新規タスクを作成して開始
    let e3: { message: string } | null = null
    let newTaskId: string | null = null
    const newTitle = newTaskTitle.trim()
    if (newTitle) {
      const { data: nt, error } = await supabase.from('tasks')
        .insert({ case_id: receipt.case_id, title: newTitle, task_kind: 'case', phase: newTaskPhase, category: '', status: '対応中', priority: '通常', started_by: currentMemberId, started_at: nowIso, sort_order: 99 })
        .select('id').single()
      e3 = error
      if (!error && nt) {
        newTaskId = (nt as { id: string }).id
        if (currentMemberId) {
          await supabase.from('task_assignees').insert({ task_id: newTaskId, member_id: currentMemberId, role: 'primary' })
        }
      }
    }
    setSaving(false)
    if (e1 || e2 || e3) { showToast(`保存に失敗しました: ${(e1 ?? e2 ?? e3)?.message}`, 'error'); return }
    const startedCount = selected.size + (newTitle ? 1 : 0)
    showToast(startedCount > 0 ? `着手し、${startedCount}件のタスクを開始しました` : '着手しました', 'success')
    // 開始したタスクが1つに定まるなら、そのタスク詳細へ遷移
    const targetTaskId = newTaskId ?? (selected.size === 1 ? [...selected][0] : null)
    if (targetTaskId) {
      router.push(`/tasks/${targetTaskId}`)
    } else {
      onDone()
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="タスクに着手（任意）"
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={confirm} loading={saving}>
            {(selected.size > 0 || newTaskTitle.trim()) ? `タスクを開始 (${selected.size + (newTaskTitle.trim() ? 1 : 0)})` : '着手のみ記録'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-gray-600">
          この受信に関連するタスクを開始します。契約書類などタスク不要な受信は、W-Check（受信確定）だけで完了——押す必要はありません（選ばずに着手記録だけでもOK）。
        </p>
        {loading ? (
          <div className="py-6 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />読み込み中…</div>
        ) : tasks.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-gray-400">未完了のタスクはありません</div>
        ) : (
          <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {tasks.map(t => (
              <li key={t.id}>
                <label className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  <span className="flex-1 text-gray-800">{t.title}</span>
                  <span className="text-[11px] text-gray-400">{t.status}</span>
                  {selected.has(t.id) && <Play className="w-3 h-3 text-emerald-600" strokeWidth={2.5} />}
                </label>
              </li>
            ))}
          </ul>
        )}

        {/* 受信をきっかけに新規タスクを作成して開始 */}
        <div className="pt-2 border-t border-gray-100">
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">新規タスクを作成して開始（任意）</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              placeholder="例：契約書の確認"
              className="flex-1 px-3 py-2 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-brand-400"
            />
            <select
              value={newTaskPhase}
              onChange={e => setNewTaskPhase(e.target.value)}
              title="フェーズ"
              className="w-40 px-2 py-2 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400"
            >
              {DB_PHASES.map(p => <option key={p} value={p}>{getPhaseLabel(p)}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">この受信をきっかけに新しいタスクを作成し、すぐ「対応中」にします。作成後はそのタスクへ移動します。</p>
        </div>
      </div>
    </Modal>
  )
}

function ReceiptRow({
  receipt,
  rowBg,
  unstartedPast = false,
  currentMemberId,
  currentMember,
  onChanged,
  onStartRequest,
}: {
  receipt: DocumentReceiptRow
  rowBg: string
  unstartedPast?: boolean
  currentMemberId: string | null
  currentMember: MemberRow | null
  onChanged: () => void
  onStartRequest: (r: DocumentReceiptRow) => void
}) {
  const items = (receipt.items ?? []).sort((a, b) => a.sort_order - b.sort_order)
  const rowCount = Math.max(items.length, 1)
  const numberText = formatReceiptNumber(receipt.received_date, receipt.sequence_no)
  // 過去日分の未着手は薄いアンバーで強調（一覧上部に集まる）
  const rowClass = unstartedPast ? 'bg-amber-50/60' : rowBg

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
      ? { started_by_member_id: null, started_at: null }
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
                className={`px-2.5 py-2 font-mono text-[12px] text-gray-700 align-middle border-r border-gray-100 ${unstartedPast ? 'border-l-2 border-l-amber-400' : ''}`}
              >
                {numberText}
                {unstartedPast && <div className="text-[10px] font-bold text-amber-600 mt-0.5">未着手</div>}
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
