'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Link2, Plus, X, FileText, ExternalLink, Check, CloudOff } from 'lucide-react'
import CaseDocumentTable from '@/components/features/documents/CaseDocumentTable'
import { Section } from '@/components/ui/InlineFields'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import TabHeader from './TabHeader'
import OpenStorageFile from '@/components/features/documents/OpenStorageFile'
import CaseFolderSection from './CaseFolderSection'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { isItemNotRequired } from '@/lib/receiptLink'
import { useIsManager } from '@/components/providers/AuthProvider'
import type { CaseRow, CaseDocumentRow, TaskRow, ContractDocumentRow, CaseFileRow, DocumentRow } from '@/types'
import type { TimelineReceipt } from './CaseTimeline'

type Props = {
  caseData: CaseRow
  documents: CaseDocumentRow[]
  documentReceipts?: TimelineReceipt[]
  tasks?: TaskRow[]
  /** 契約時に受領した書類（到着物タブでも一元的に見えるよう集約表示する） */
  contractDocuments?: ContractDocumentRow[]
  /** 案件フォルダのファイル（まとめてアップロード方式） */
  caseFiles?: CaseFileRow[]
  /** AI書類作成で作成した書類（documents テーブル）。案件フォルダの「AI作成」タブに表示。 */
  createdDocuments?: DocumentRow[]
  currentMemberId?: string | null
  /** 表示モード。folder=案件フォルダ（ファイル一式）、receipts=到着物一覧（受信簿）。別タブに分離。 */
  mode?: 'folder' | 'receipts'
}

type ReceiptItemRow = {
  receiptId: string
  itemId: string
  realItemId: string | null   // document_receipt_items.id（更新用。synthetic の場合 null）
  itemName: string
  receivedDate: string | null
  uploadedAt: string | null   // 共有フォルダにアップ済か（migration 137）
  sortOrder: number
  caseDocumentId: string | null
  file: { bucket: string; path: string; name: string | null } | null
  linkedTasks: { id: string; title: string }[]
  notRequired: boolean        // タスク紐づけ不要（契約書類の自動判定 or 手動フラグ）
  manualFlag: boolean | null  // link_not_required の生値（null=自動判定）
  settlementReflect: boolean  // 精算書(代理支払)へ反映
  settlementAmount: number | null
}

type FilterKey = 'all' | 'linked' | 'unlinked' | 'notrequired'

/**
 * 案件詳細「到着物」タブ。
 * 受信簿に登録された各到着物（item）を 1 行で並べ、
 *   - タスク紐づけ済 / 未紐づけ でフィルタ
 *   - 紐づいているタスク列
 *   - その場でタスクに紐付ける機能
 * を提供する。
 * 受信簿外の自社作成・授受ファイルは下段の「添付ファイル（受信簿外）」で管理する。
 */
export default function DocsTab({ caseData, documents, documentReceipts = [], tasks = [], contractDocuments = [], caseFiles = [], createdDocuments = [], currentMemberId = null, mode = 'folder' }: Props) {
  const router = useRouter()
  const isManager = useIsManager()  // 到着物のタスク紐づけ・受信操作は管理担当のみ
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [fileFilter, setFileFilter] = useState<'all' | 'uploaded' | 'notuploaded'>('all')
  const [linkingItem, setLinkingItem] = useState<ReceiptItemRow | null>(null)

  // 契約時受領書類の区分（id → category）。紐づけ不要の自動判定に使う。
  const contractCat = useMemo(
    () => new Map((contractDocuments ?? []).map(d => [d.id, d.category ?? ''])),
    [contractDocuments],
  )

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
        // 紐づけ不要の判定：手動フラグ優先、無ければ契約書類のタスク不要カテゴリ(契約/その他)を自動判定
        const manualFlag = it.link_not_required ?? null
        const notRequired = isItemNotRequired(it, contractCat)
        out.push({
          receiptId: r.id,
          itemId: it.id ?? `${r.id}-${it.sort_order}`,
          realItemId: it.id ?? null,
          itemName: it.item_name,
          receivedDate: r.received_date,
          uploadedAt: it.uploaded_at ?? null,
          sortOrder: it.sort_order,
          caseDocumentId: it.case_document_id ?? null,
          file: cd && cd.received_file_path && cd.received_file_bucket
            ? { bucket: cd.received_file_bucket, path: cd.received_file_path, name: cd.received_file_name }
            : null,
          linkedTasks: linked,
          notRequired,
          manualFlag,
          settlementReflect: it.settlement_reflect === true,
          settlementAmount: it.settlement_amount ?? null,
        })
      }
    }
    out.sort((a, b) =>
      (b.receivedDate ?? '').localeCompare(a.receivedDate ?? '') ||
      a.receiptId.localeCompare(b.receiptId) ||
      a.sortOrder - b.sortOrder,
    )
    return out
  }, [documentReceipts, tasks, contractCat])

  const filtered = useMemo(() => rows.filter(r => {
    const linked = r.linkedTasks.length > 0
    // タスク紐づけフィルタ
    if (filter === 'linked' && !linked) return false
    if (filter === 'notrequired' && !(!linked && r.notRequired)) return false
    if (filter === 'unlinked' && !(!linked && !r.notRequired)) return false
    // ファイルアップフィルタ
    const uploaded = !!r.uploadedAt || !!r.file
    if (fileFilter === 'uploaded' && !uploaded) return false
    if (fileFilter === 'notuploaded' && uploaded) return false
    return true
  }), [rows, filter, fileFilter])

  const linkedCount = rows.filter(r => r.linkedTasks.length > 0).length
  const notRequiredCount = rows.filter(r => r.linkedTasks.length === 0 && r.notRequired).length
  const unlinkedCount = rows.length - linkedCount - notRequiredCount
  const uploadedCount = rows.filter(r => !!r.uploadedAt || !!r.file).length

  // 受信簿外の case_documents（item.case_document_id に登録されていないもの）。
  // 到着物タブは「受領した書類」だけを扱うので、受領ファイル(received_file)があるものに限る。
  // 自社が作成・発送した書類(outbound のみ。相続関係説明図など)はここには出さない（作成書類タブの管轄）。
  const usedDocIds = new Set(rows.map(r => r.caseDocumentId).filter((v): v is string => !!v))
  const orphanDocs = documents.filter(d => !usedDocIds.has(d.id) && !!d.received_file_path)
  // AI書類作成で作成した書類（documents テーブル・ファイルつき）＝案件フォルダの「AI作成」タブに表示
  const aiDocs = createdDocuments.filter(d => !!d.file_path)
  // アップ済＝アップ済フラグが立っている or 旧方式で受領ファイルが添付済
  const isUploaded = (r: ReceiptItemRow) => !!r.uploadedAt || !!r.file
  // 未アップ＝受領済（受領日あり）だが共有フォルダに未アップ
  const unuploadedCount = rows.filter(r => r.receivedDate && !isUploaded(r)).length
  // フォルダにアップした直後のポップアップ候補（受信済＆未アップ・実IDあり）
  const pendingItems = rows
    .filter(r => r.receivedDate && !isUploaded(r) && r.realItemId)
    .map(r => ({ id: r.realItemId as string, name: r.itemName, receivedDate: r.receivedDate }))

  const toggleUploaded = (itemId: string | null, makeUploaded: boolean) => {
    if (!itemId) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('document_receipt_items')
        .update({ uploaded_at: makeUploaded ? new Date().toISOString() : null })
        .eq('id', itemId)
      if (error) { showToast(`更新に失敗: ${error.message}`, 'error'); return }
      router.refresh()
    })
  }

  // 精算書（代理支払）への反映フラグ＋金額（お客様宛の支払請求書をオーシャンが支払う分）
  const setSettlement = (itemId: string | null, reflect: boolean, amount?: number | null) => {
    if (!itemId) return
    startTransition(async () => {
      const supabase = createClient()
      const patch: Record<string, unknown> = { settlement_reflect: reflect }
      if (amount !== undefined) patch.settlement_amount = amount
      const { error } = await supabase.from('document_receipt_items').update(patch).eq('id', itemId)
      if (error) { showToast(`更新に失敗: ${error.message}`, 'error'); return }
      router.refresh()
    })
  }

  // タスク紐づけ不要フラグの設定（true=不要 / false=必要に戻す）
  const setNotRequired = (itemId: string | null, value: boolean) => {
    if (!itemId) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('document_receipt_items')
        .update({ link_not_required: value })
        .eq('id', itemId)
      if (error) { showToast(`更新に失敗: ${error.message}`, 'error'); return }
      showToast(value ? 'タスク紐づけ不要にしました' : '紐づけ必要に戻しました', 'success')
      router.refresh()
    })
  }

  // 案件フォルダ（ファイル一式）タブ
  if (mode === 'folder') {
    return (
      <div className="space-y-3.5">
        <TabHeader title="案件フォルダ" description="書類一式のアップロード・AI作成書類の管理" />

        <CaseFolderSection caseId={caseData.id} files={caseFiles} aiDocs={aiDocs} pendingItems={pendingItems} currentMemberId={currentMemberId} onRefresh={() => router.refresh()} />

        {orphanDocs.length > 0 && (
          <Section title="添付ファイル（受信簿外）">
            <p className="text-[11px] text-gray-400 mb-2">
              受信簿に登録されていない、個別アップロードのファイル。ここから単独でファイル管理できます。
            </p>
            <CaseDocumentTable caseId={caseData.id} rows={orphanDocs} noun="到着物" />
          </Section>
        )}
      </div>
    )
  }

  // 到着物一覧（受信簿）タブ
  return (
    <div className="space-y-3.5">
      <TabHeader title="到着物" description="受信簿に登録された到着物（受領台帳）とタスク紐づけの管理" />

      <Section title="到着物一覧（受信簿）">
        {/* フィルタ（タスク紐づけ系＋ファイルアップ系の2系統） */}
        <div className="space-y-1.5 mb-2.5">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] text-gray-400 w-14 flex-shrink-0">タスク</span>
            <FilterPill label="すべて" count={rows.length} active={filter === 'all'} onClick={() => setFilter('all')} />
            <FilterPill label="タスク紐づけ済" count={linkedCount} active={filter === 'linked'} onClick={() => setFilter('linked')} />
            <FilterPill label="タスク未紐づけ" count={unlinkedCount} active={filter === 'unlinked'} onClick={() => setFilter('unlinked')} />
            <FilterPill label="タスク紐づけ不要" count={notRequiredCount} active={filter === 'notrequired'} onClick={() => setFilter('notrequired')} />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] text-gray-400 w-14 flex-shrink-0">ファイル</span>
            <FilterPill label="すべて" count={rows.length} active={fileFilter === 'all'} onClick={() => setFileFilter('all')} />
            <FilterPill label="ファイルアップ済" count={uploadedCount} active={fileFilter === 'uploaded'} onClick={() => setFileFilter('uploaded')} />
            <FilterPill label="ファイル未アップ" count={unuploadedCount} active={fileFilter === 'notuploaded'} onClick={() => setFileFilter('notuploaded')} />
            {unuploadedCount > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-1 rounded">
                <CloudOff className="w-3 h-3" strokeWidth={2} />未アップ {unuploadedCount}件
              </span>
            )}
          </div>
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
                <col style={{ width: 240 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
                <col />
                <col style={{ width: 216 }} />
              </colgroup>
              <thead>
                <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                  <th className="px-3 py-2 text-left font-semibold">到着物</th>
                  <th className="px-3 py-2 text-left font-semibold">受領日</th>
                  <th className="px-3 py-2 text-left font-semibold">アップ状況</th>
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
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200"><Check className="w-3 h-3" strokeWidth={2.5} />アップ済</span>
                          <OpenStorageFile bucket={row.file.bucket} path={row.file.path} name={row.file.name} label="開く" />
                        </span>
                      ) : row.uploadedAt ? (
                        <button type="button" onClick={() => toggleUploaded(row.realItemId, false)} title="クリックで未アップに戻す" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"><Check className="w-3 h-3" strokeWidth={2.5} />アップ済</button>
                      ) : (
                        <button type="button" onClick={() => toggleUploaded(row.realItemId, true)} disabled={!row.realItemId} title="クリックでアップ済にする" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 disabled:opacity-50"><CloudOff className="w-3 h-3" strokeWidth={2} />未アップ</button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.linkedTasks.length > 0 ? (
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
                      ) : row.notRequired ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded">紐づけ不要</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 italic">未紐づけ</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {!isManager ? (
                        <span className="text-[11px] text-gray-300" title="到着物の紐づけは管理担当のみ">—</span>
                      ) : (
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setLinkingItem(row)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 rounded-md"
                          title="この到着物にタスクを紐付ける"
                        >
                          <Plus className="w-3 h-3" strokeWidth={2.5} />紐付け
                        </button>
                        {row.linkedTasks.length === 0 && (
                          row.notRequired ? (
                            <button
                              type="button"
                              onClick={() => setNotRequired(row.realItemId, false)}
                              disabled={!row.realItemId}
                              className="px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 rounded-md disabled:opacity-50"
                              title="タスク紐づけが必要なものに戻す"
                            >
                              必要に戻す
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setNotRequired(row.realItemId, true)}
                              disabled={!row.realItemId}
                              className="px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-50"
                              title="タスク紐づけ不要にする（未紐づけの催促を消す）"
                            >
                              紐づけ不要
                            </button>
                          )
                        )}
                        {/* 精算書（代理支払）へ反映のON/OFFのみ。金額は精算書タブで入力する。 */}
                        {row.settlementReflect ? (
                          <button type="button" onClick={() => setSettlement(row.realItemId, false)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md" title="精算反映を解除（金額は精算書タブで入力）">
                            <Check className="w-3 h-3" strokeWidth={2.5} />精算反映
                          </button>
                        ) : (
                          <button type="button" onClick={() => setSettlement(row.realItemId, true)} disabled={!row.realItemId} className="px-2 py-1 text-[11px] font-medium text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-md disabled:opacity-50" title="精算書（代理支払）に反映する。金額は精算書タブで入力">
                            精算反映
                          </button>
                        )}
                      </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

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
  // 紐付け候補は未完了のみ（完了・キャンセルは出さない）。受注/管理担当の初期対応タスクも対象外。
  const candidates = tasks.filter(t => !linkedIds.has(t.id) && t.status !== '完了' && t.status !== 'キャンセル' && t.task_kind !== 'system')

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
                    {t.phase && <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 px-1 rounded">{t.phase === 'system' ? '受注/管理担当' : t.phase.replace(/^Phase\d+[:：]\s*/, '')}</span>}
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
