'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Link2, Plus, X, FileText, ExternalLink } from 'lucide-react'
import CaseDocumentTable from '@/components/features/documents/CaseDocumentTable'
import { Section } from '@/components/ui/InlineFields'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import TabHeader from './TabHeader'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow, CaseDocumentRow, TaskRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Props = {
  caseData: CaseRow
  documents: CaseDocumentRow[]
  documentReceipts?: TimelineReceipt[]
  tasks?: TaskRow[]
}

type ReceiptItemRow = {
  receiptId: string
  itemId: string
  itemName: string
  receivedDate: string | null
  sortOrder: number
  caseDocumentId: string | null
  file: { bucket: string; path: string; name: string | null } | null
  linkedTasks: { id: string; title: string }[]
}

type FilterKey = 'all' | 'linked' | 'unlinked'

/**
 * 案件詳細「到着物」タブ。
 * 受信簿に登録された各到着物（item）を 1 行で並べ、
 *   - タスク紐づけ済 / 未紐づけ でフィルタ
 *   - 紐づいているタスク列
 *   - その場でタスクに紐付ける機能
 * を提供する。
 * 受信簿外の自社作成・授受ファイルは下段の「添付ファイル（受信簿外）」で管理する。
 */
export default function DocsTab({ caseData, documents, documentReceipts = [], tasks = [] }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [linkingItem, setLinkingItem] = useState<ReceiptItemRow | null>(null)

  // 受信簿 → 1 行 = 1 アイテム の表に展開
  const rows: ReceiptItemRow[] = useMemo(() => {
    const out: ReceiptItemRow[] = []
    for (const r of documentReceipts ?? []) {
      for (const it of (r.items ?? [])) {
        const taskIds = new Set<string>()
        const linked: { id: string; title: string }[] = []
        // started_task_id（受信単位の代表タスク）も同じ受信のアイテムとして表示しておく
        if (r.started_task_id) taskIds.add(r.started_task_id)
        for (const t of it.item_tasks ?? []) {
          if (t.task?.id && !taskIds.has(t.task.id)) {
            taskIds.add(t.task.id); linked.push({ id: t.task.id, title: t.task.title })
          }
        }
        // started_task_id 経由のタスクは title が無いので補完
        for (const id of taskIds) {
          if (linked.some(l => l.id === id)) continue
          const t = tasks.find(x => x.id === id)
          if (t) linked.push({ id: t.id, title: t.title })
        }
        const cd = it.case_document
        out.push({
          receiptId: r.id,
          itemId: it.id ?? `${r.id}-${it.sort_order}`,
          itemName: it.item_name,
          receivedDate: r.received_date,
          sortOrder: it.sort_order,
          caseDocumentId: it.case_document_id ?? null,
          file: cd && cd.received_file_path && cd.received_file_bucket
            ? { bucket: cd.received_file_bucket, path: cd.received_file_path, name: cd.received_file_name }
            : null,
          linkedTasks: linked,
        })
      }
    }
    out.sort((a, b) =>
      (b.receivedDate ?? '').localeCompare(a.receivedDate ?? '') ||
      a.receiptId.localeCompare(b.receiptId) ||
      a.sortOrder - b.sortOrder,
    )
    return out
  }, [documentReceipts, tasks])

  const filtered = useMemo(() => rows.filter(r => {
    if (filter === 'linked') return r.linkedTasks.length > 0
    if (filter === 'unlinked') return r.linkedTasks.length === 0
    return true
  }), [rows, filter])

  const linkedCount = rows.filter(r => r.linkedTasks.length > 0).length
  const unlinkedCount = rows.length - linkedCount

  // 受信簿外の case_documents（item.case_document_id に登録されていないもの）。
  // 受信簿外で個別アップロードしたファイル管理用。
  const usedDocIds = new Set(rows.map(r => r.caseDocumentId).filter((v): v is string => !!v))
  const orphanDocs = documents.filter(d => !usedDocIds.has(d.id))

  return (
    <div className="space-y-3.5">
      <TabHeader title="到着物" description="受信簿に登録された到着物のタスク紐付け管理＋添付ファイル管理" />

      <Section title="到着物一覧（受信簿）">
        {/* フィルタ */}
        <div className="flex items-center gap-1 mb-2.5">
          <FilterPill label="すべて" count={rows.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterPill label="タスク紐づけ済" count={linkedCount} active={filter === 'linked'} onClick={() => setFilter('linked')} />
          <FilterPill label="未紐づけ" count={unlinkedCount} active={filter === 'unlinked'} onClick={() => setFilter('unlinked')} />
        </div>

        {filtered.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center text-[13px] text-gray-400">
            {rows.length === 0
              ? '受信簿に登録された到着物はまだありません。受信簿（書類管理→受信簿）から登録できます。'
              : '該当する到着物はありません'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 180 }} />
                <col />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                  <th className="px-3 py-2 text-left font-semibold">到着物</th>
                  <th className="px-3 py-2 text-left font-semibold">受領日</th>
                  <th className="px-3 py-2 text-left font-semibold">ファイル</th>
                  <th className="px-3 py-2 text-left font-semibold">紐づきタスク</th>
                  <th className="px-3 py-2 text-center font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.itemId} className="border-b border-gray-100 hover:bg-gray-50/40 align-top">
                    <td className="px-3 py-2 text-gray-800 font-medium">{row.itemName}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-gray-600">{row.receivedDate ?? '—'}</td>
                    <td className="px-3 py-2">
                      {row.file ? (
                        <OpenStorageFile bucket={row.file.bucket} path={row.file.path} name={row.file.name} label="ファイル" />
                      ) : (
                        <span className="text-[11px] text-gray-300">未添付</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.linkedTasks.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 italic">
                          未紐づけ
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {row.linkedTasks.map(t => (
                            <Link
                              key={t.id}
                              href={`/tasks/${t.id}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded hover:bg-brand-100"
                              title={`「${t.title}」を開く`}
                            >
                              <Link2 className="w-2.5 h-2.5" />
                              <span className="truncate max-w-[180px]">{t.title}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setLinkingItem(row)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 rounded"
                        title="この到着物にタスクを紐付ける"
                      >
                        <Plus className="w-3 h-3" />
                        紐付け
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {orphanDocs.length > 0 && (
        <Section title="添付ファイル（受信簿外）">
          <p className="text-[11px] text-gray-400 mb-2">
            受信簿に登録されていない、個別アップロードのファイル。ここから単独でファイル管理できます。
          </p>
          <CaseDocumentTable caseId={caseData.id} rows={orphanDocs} noun="到着物" />
        </Section>
      )}

      {linkingItem && (
        <LinkTaskModal
          item={linkingItem}
          caseId={caseData.id}
          tasks={tasks}
          onClose={() => setLinkingItem(null)}
        />
      )}
    </div>
  )
}

function FilterPill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors ${
        active ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
      <span className={`ml-1 text-[11px] font-mono ${active ? 'opacity-80' : 'text-gray-400'}`}>{count}</span>
    </button>
  )
}

// 到着物アイテムにタスクを紐付けるモーダル。
// 既存タスクから選ぶ / その場で新規タスクを作成して紐付ける、の両方をサポート。
function LinkTaskModal({ item, caseId, tasks, onClose }: {
  item: ReceiptItemRow
  caseId: string
  tasks: TaskRow[]
  onClose: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const linkedIds = new Set(item.linkedTasks.map(t => t.id))
  const candidates = tasks.filter(t => !linkedIds.has(t.id))

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const totalToLink = selected.size + (newTitle.trim() ? 1 : 0)

  const handleConfirm = async () => {
    if (totalToLink === 0) return
    setSaving(true)
    try {
      const supabase = createClient()
      const linkRows: { receipt_item_id: string; task_id: string }[] = []

      for (const id of selected) {
        linkRows.push({ receipt_item_id: item.itemId, task_id: id })
      }

      const title = newTitle.trim()
      if (title) {
        const { data: nt, error } = await supabase.from('tasks')
          .insert({ case_id: caseId, title, task_kind: 'case', status: '着手前', priority: '通常', sort_order: 99 })
          .select('id').single()
        if (error || !nt) throw error ?? new Error('タスク作成失敗')
        linkRows.push({ receipt_item_id: item.itemId, task_id: (nt as { id: string }).id })
      }

      if (linkRows.length > 0) {
        const { error } = await supabase.from('document_receipt_item_tasks').upsert(linkRows, {
          onConflict: 'receipt_item_id,task_id', ignoreDuplicates: true,
        })
        if (error) throw error
      }

      showToast(`${totalToLink} 件のタスクに紐付けました`, 'success')
      startTransition(() => router.refresh())
      onClose()
    } catch (e) {
      console.error(e)
      showToast(e instanceof Error ? `失敗: ${e.message}` : '紐付けに失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleUnlink = async (taskId: string) => {
    if (!confirm(`「${item.linkedTasks.find(t => t.id === taskId)?.title}」との紐付けを解除しますか？`)) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('document_receipt_item_tasks')
        .delete().eq('receipt_item_id', item.itemId).eq('task_id', taskId)
      if (error) throw error
      showToast('紐付けを解除しました', 'success')
      startTransition(() => router.refresh())
      onClose()
    } catch (e) {
      console.error(e)
      showToast(e instanceof Error ? `失敗: ${e.message}` : '解除に失敗しました', 'error')
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`タスクを紐付け: ${item.itemName}`}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button variant="primary" onClick={handleConfirm} loading={saving} disabled={totalToLink === 0}>
            {totalToLink > 0 ? `紐付ける (${totalToLink})` : '対象を選んでください'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <div className="bg-brand-50/60 border border-brand-200 rounded px-2.5 py-1.5 flex items-center gap-2 text-[12px]">
          <FileText className="w-3.5 h-3.5 text-brand-700" />
          <span className="font-semibold text-brand-900">{item.itemName}</span>
          <span className="font-mono text-brand-700">{item.receivedDate ?? '受領日未設定'}</span>
        </div>

        {/* 既存の紐付き */}
        {item.linkedTasks.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-gray-500 mb-1.5">現在の紐付き</div>
            <div className="flex flex-wrap gap-1.5">
              {item.linkedTasks.map(t => (
                <span key={t.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded">
                  <Link2 className="w-3 h-3" />
                  {t.title}
                  <button type="button" onClick={() => handleUnlink(t.id)} className="text-gray-400 hover:text-red-500 ml-0.5" title="紐付けを解除">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 既存タスクから選択 */}
        <div>
          <div className="text-[11px] font-semibold text-gray-500 mb-1.5">既存タスクから選ぶ</div>
          {candidates.length === 0 ? (
            <p className="text-[11px] text-gray-400">紐付け候補のタスクがありません</p>
          ) : (
            <div className="max-h-[14rem] overflow-y-auto border border-gray-200 rounded">
              {candidates.map(t => {
                const on = selected.has(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle(t.id)}
                    className={`w-full px-3 py-1.5 text-left flex items-center gap-2 border-b border-gray-100 last:border-b-0 ${on ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-brand-600 border-brand-600' : 'bg-white border-gray-300'}`}>
                      {on && <span className="text-white text-[10px] font-bold">✓</span>}
                    </span>
                    {t.phase && <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 px-1 rounded">{t.phase.replace(/^Phase\d+[:：]\s*/, '')}</span>}
                    <span className="text-[12px] truncate flex-1">{t.title}</span>
                    <span className="text-[10px] text-gray-400">{t.status}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 新規タスク作成 */}
        <div>
          <div className="text-[11px] font-semibold text-gray-500 mb-1.5">＋新規タスクを作成して紐付ける</div>
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="例: 戸籍内容の確認・整理"
            className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded outline-none focus:border-brand-400"
          />
          <p className="text-[10px] text-gray-400 mt-1">新規タスクは status=着手前 で作成されます。</p>
        </div>

        <Link href={`/cases/${caseId}?tab=tasks`} className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline">
          <ExternalLink className="w-3 h-3" />
          案件のタスクタブを開く
        </Link>

        {saving && (
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> 保存中…
          </div>
        )}
      </div>
    </Modal>
  )
}
