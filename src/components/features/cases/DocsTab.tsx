'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import UploadDocumentModal from '@/components/features/documents/UploadDocumentModal'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import type { CaseRow, DocumentRow } from '@/types'

type Props = {
  caseData: CaseRow
}

export default function DocsTab({ caseData }: Props) {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteDoc, setDeleteDoc] = useState<DocumentRow | null>(null)

  const fetchDocs = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('documents')
      .select('*, tasks(id, title)')
      .eq('case_id', caseData.id)
      .order('created_at', { ascending: false })
    setDocuments((data ?? []) as DocumentRow[])
    setLoading(false)
  }

  useEffect(() => { fetchDocs() }, [caseData.id])

  const handleDelete = async () => {
    if (!deleteDoc) return
    const supabase = createClient()
    if (deleteDoc.file_path) {
      await supabase.storage.from('documents').remove([deleteDoc.file_path])
    }
    const { error } = await supabase.from('documents').delete().eq('id', deleteDoc.id)
    if (error) throw new Error(error.message)
    setDeleteDoc(null)
    fetchDocs()
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
    // revokeをasync化してダウンロード開始を待つ
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-base font-bold text-gray-900 flex-1">書類一覧</h2>
        <button
          onClick={() => setUploadOpen(true)}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          📤 アップロード
        </button>
      </div>
      <div className="text-[11px] text-gray-400 mb-3">
        ※ AI書類作成は各タスクの詳細画面から行えます。ここでは案件全体の書類を集約表示します。
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 tracking-wide">文書名</th>
              <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 tracking-wide">関連タスク</th>
              <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 tracking-wide">種別</th>
              <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 tracking-wide">作成日</th>
              <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 tracking-wide w-24">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">読み込み中...</td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  書類がありません。アップロード、または各タスクから生成してください。
                </td>
              </tr>
            ) : (
              documents.map(doc => {
                const taskTitle = (doc.tasks as DocumentRow['tasks'] & { title?: string; id?: string })?.title ?? null
                const taskId = (doc.tasks as DocumentRow['tasks'] & { id?: string })?.id ?? null
                const isAi = doc.generated_by === 'AI'
                return (
                  <tr key={doc.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 transition">
                    <td className="px-4 py-2.5">
                      <div className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                        {isAi && <span className="text-purple-500" title="AI生成">🤖</span>}
                        <span>{doc.name}</span>
                      </div>
                      <div className="text-[10px] text-gray-400">{doc.file_type ?? '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {taskId && taskTitle ? (
                        <button
                          onClick={() => router.push(`/tasks/${taskId}`)}
                          className="text-blue-600 hover:underline truncate"
                        >
                          {taskTitle}
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {isAi ? (
                        <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                          AI生成
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500">アップロード</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">
                      {new Date(doc.created_at).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={!doc.file_path}
                          className="w-7 h-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title={doc.file_path ? 'ダウンロード' : 'ファイル未添付'}
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
      </div>

      {/* Upload Modal */}
      <UploadDocumentModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        cases={[{ id: caseData.id, case_number: caseData.case_number, deal_name: caseData.deal_name }]}
        defaultCaseId={caseData.id}
        onSaved={() => { setUploadOpen(false); fetchDocs() }}
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
