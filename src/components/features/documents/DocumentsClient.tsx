'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import UploadDocumentModal from './UploadDocumentModal'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import { useResizableColumns, ResizeHandle } from '@/lib/useResizableColumns'
import type { DocumentRow, MemberRow } from '@/types'

type CaseOption = { id: string; case_number: string; deal_name: string }

type Props = {
  documents: DocumentRow[]
  members: MemberRow[]
  cases: CaseOption[]
}

const FORMAT_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  PDF: { bg: 'bg-red-50', text: 'text-red-500', icon: '📄' },
  Word: { bg: 'bg-blue-50', text: 'text-blue-500', icon: '📝' },
  Excel: { bg: 'bg-green-50', text: 'text-green-500', icon: '📊' },
}

const DEFAULT_FORMAT = { bg: 'bg-gray-50', text: 'text-gray-500', icon: '📄' }

function getAssignee(doc: DocumentRow): { name: string; color: string } | null {
  const caseMembers = (doc.cases as DocumentRow['cases'] & { case_members?: Array<{ role: string; members: MemberRow }> })?.case_members
  if (!caseMembers || caseMembers.length === 0) return null
  const first = caseMembers[0]
  if (!first.members) return null
  return { name: first.members.name, color: first.members.avatar_color }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export default function DocumentsClient({ documents, members, cases }: Props) {
  const router = useRouter()
  const [typeFilter, setTypeFilter] = useState<'all' | 'ai' | 'manual'>('all')
  const [search, setSearch] = useState('')
  const [caseFilter, setCaseFilter] = useState('')

  // Modal states
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteDoc, setDeleteDoc] = useState<DocumentRow | null>(null)

  const { widths: colWidths, reset: resetColWidths, startResize: startColResize } = useResizableColumns('documentsListColWidths', {
    name: 280, case: 200, task: 180, kind: 110, assignee: 130, createdAt: 110, ops: 80,
  })
  const HEADERS: Array<{ key: keyof typeof colWidths; label: string; resizable?: boolean }> = [
    { key: 'name', label: '文書名' },
    { key: 'case', label: '案件' },
    { key: 'task', label: '関連タスク' },
    { key: 'kind', label: '種別' },
    { key: 'assignee', label: '担当者' },
    { key: 'createdAt', label: '作成日' },
    { key: 'ops', label: '操作', resizable: false },
  ]

  const caseOptions = useMemo(() => {
    const map = new Map<string, string>()
    documents.forEach(d => {
      if (d.cases) {
        map.set(d.cases.id, d.cases.deal_name)
      }
    })
    return [...map.entries()]
  }, [documents])

  const filtered = useMemo(() => {
    return documents.filter(d => {
      if (typeFilter === 'ai' && d.generated_by !== 'AI') return false
      if (typeFilter === 'manual' && d.generated_by === 'AI') return false
      if (caseFilter && d.cases?.id !== caseFilter) return false
      if (search) {
        const s = search.toLowerCase()
        const caseName = d.cases?.deal_name ?? ''
        const taskTitle = (d.tasks as DocumentRow['tasks'] & { title?: string })?.title ?? ''
        if (
          !d.name.toLowerCase().includes(s) &&
          !caseName.toLowerCase().includes(s) &&
          !taskTitle.toLowerCase().includes(s)
        ) return false
      }
      return true
    })
  }, [documents, typeFilter, caseFilter, search])

  const counts = useMemo(() => ({
    all: documents.length,
    ai: documents.filter(d => d.generated_by === 'AI').length,
    manual: documents.filter(d => d.generated_by !== 'AI').length,
  }), [documents])

  const summaryCards: Array<{ key: 'all' | 'ai' | 'manual'; label: string; count: number; sub: string; color: string }> = [
    { key: 'all',    label: '全ドキュメント', count: counts.all,    sub: '登録文書',        color: '' },
    { key: 'ai',     label: 'AI生成',        count: counts.ai,     sub: 'タスクから生成',  color: 'text-purple-600' },
    { key: 'manual', label: 'アップロード',   count: counts.manual, sub: '手動追加',        color: 'text-blue-600' },
  ]

  const handleDelete = async () => {
    if (!deleteDoc) return
    const supabase = createClient()
    // If file exists in storage, delete it
    if (deleteDoc.file_path) {
      await supabase.storage.from('documents').remove([deleteDoc.file_path])
    }
    const { error } = await supabase.from('documents').delete().eq('id', deleteDoc.id)
    if (error) throw new Error(error.message)
    setDeleteDoc(null)
    router.refresh()
  }

  const handleDownload = async (doc: DocumentRow) => {
    if (!doc.file_path) {
      alert('この書類にはファイルが紐付いていません')
      return
    }
    const supabase = createClient()
    const { data, error } = await supabase.storage.from('documents').download(doc.file_path)
    if (error || !data) {
      console.error('Download error:', error)
      alert(`ダウンロードに失敗しました: ${error?.message ?? '不明なエラー'}`)
      return
    }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    const ext = doc.file_type ? `.${doc.file_type.toLowerCase()}` : ''
    a.download = doc.name.endsWith(ext) ? doc.name : doc.name + ext
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">ドキュメント管理</h1>
          <p className="text-xs text-gray-400">文書の作成・送付・ステータスを一元管理</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <span className="text-gray-400 text-xs">🔍</span>
            <input
              type="text"
              placeholder="文書名・案件名で検索"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-gray-700 w-48 placeholder:text-gray-300"
            />
          </div>
          <button
            onClick={() => setUploadOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            📤 アップロード
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {summaryCards.map(card => (
          <button
            key={card.key}
            onClick={() => setTypeFilter(card.key)}
            className={`bg-white border rounded-xl p-3.5 text-left transition shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md ${
              typeFilter === card.key ? 'border-blue-300 bg-blue-50 border-t-[3px] border-t-blue-500' : 'border-gray-200 border-t-[3px] border-t-transparent'
            }`}
          >
            <div className="text-[11px] font-semibold text-gray-500 mb-2">{card.label}</div>
            <div className={`text-[22px] font-extrabold tracking-tight leading-none ${card.color}`}>{card.count}</div>
            <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <select
          value={caseFilter}
          onChange={e => setCaseFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 bg-white"
        >
          <option value="">全案件</option>
          {caseOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        {(caseFilter || typeFilter !== 'all') && (
          <button
            onClick={() => { setCaseFilter(''); setTypeFilter('all') }}
            className="ml-auto text-[11px] font-medium text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded-lg"
          >
            ✕ フィルタ解除
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="flex items-center justify-end px-3.5 py-1.5 border-b border-gray-100">
          <button
            onClick={resetColWidths}
            className="text-[10px] text-gray-400 hover:text-gray-600 transition"
            title="列幅をリセット"
          >
            列幅リセット
          </button>
        </div>
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {HEADERS.map(h => (
              <col key={h.key as string} style={{ width: colWidths[h.key] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {HEADERS.map(h => (
                <th
                  key={h.key as string}
                  className="relative bg-gray-50 border-b border-gray-200 px-3.5 py-2.5 text-left text-[10px] font-bold text-gray-400 tracking-wider uppercase"
                >
                  {h.label}
                  {h.resizable !== false && <ResizeHandle onMouseDown={startColResize(h.key)} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="text-3xl opacity-30 mb-2">📁</div>
                  <div className="text-sm text-gray-400">
                    {documents.length === 0 ? 'ドキュメントが登録されていません' : '該当するドキュメントがありません'}
                  </div>
                  <div className="text-[11px] text-gray-300 mt-1">
                    {documents.length === 0 ? '案件にドキュメントを追加してください' : 'フィルタ条件を変更してください'}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(doc => {
                const fileType = doc.file_type ?? 'PDF'
                const fmt = FORMAT_STYLES[fileType] ?? DEFAULT_FORMAT
                const isAi = doc.generated_by === 'AI'
                const assignee = getAssignee(doc)
                const taskTitle = (doc.tasks as DocumentRow['tasks'] & { title?: string })?.title ?? '-'

                return (
                  <tr key={doc.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 transition">
                    <td className="px-3.5 py-2.5 overflow-hidden">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center text-base flex-shrink-0 ${fmt.bg}`}>
                          {fmt.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-900 truncate">{doc.name}</div>
                          <div className="text-[10px] text-gray-400 truncate">{fileType} · {doc.generated_by ?? '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 overflow-hidden">
                      {doc.cases ? (
                        <>
                          <div className="text-xs font-medium text-blue-600 cursor-pointer hover:underline truncate">{doc.cases.deal_name}</div>
                          <div className="text-[10px] text-gray-400 truncate">{doc.cases.case_number}</div>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-gray-600 truncate">{taskTitle}</td>
                    <td className="px-3.5 py-2.5">
                      {isAi ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold border bg-purple-50 text-purple-600 border-purple-200">
                          🤖 AI生成
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold border bg-gray-50 text-gray-600 border-gray-200">
                          アップロード
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {assignee ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: assignee.color }}>
                            {assignee.name[0]}
                          </div>
                          <span className="text-xs text-gray-600">{assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-gray-500 font-mono">{formatDate(doc.created_at)}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="w-7 h-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition"
                          title="ダウンロード"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => setDeleteDoc(doc)}
                          className="w-7 h-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
                          title="削除"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-gray-200 bg-white">
            <div className="text-[11px] text-gray-400">{filtered.length} 件表示</div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadDocumentModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        cases={cases}
        onSaved={() => { setUploadOpen(false); router.refresh() }}
      />

      {/* Delete Confirm */}
      <DeleteConfirmModal
        isOpen={!!deleteDoc}
        onClose={() => setDeleteDoc(null)}
        title="ドキュメント削除"
        message={`「${deleteDoc?.name}」を削除しますか？`}
        onConfirm={handleDelete}
      />
    </div>
  )
}
