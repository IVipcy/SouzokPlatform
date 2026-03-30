'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import UploadDocumentModal from '@/components/features/documents/UploadDocumentModal'
import AiDocumentModal from '@/components/features/cases/AiDocumentModal'
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal'
import type { CaseRow, DocumentRow } from '@/types'

type Props = {
  caseData: CaseRow
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  '下書き': { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' },
  '作成済': { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  '送付済': { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
  '返送待ち': { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  '完了': { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
}

export default function DocsTab({ caseData }: Props) {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
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

  const handleStatusChange = async (docId: string, newStatus: string) => {
    const supabase = createClient()
    await supabase.from('documents').update({ status: newStatus }).eq('id', docId)
    fetchDocs()
  }

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

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-bold text-gray-900 flex-1">書類一覧</h2>
        <button
          onClick={() => setUploadOpen(true)}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          📤 アップロード
        </button>
        <button
          onClick={() => setAiOpen(true)}
          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          🤖 AI書類作成
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 tracking-wide">文書名</th>
              <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 tracking-wide">関連タスク</th>
              <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 tracking-wide">ステータス</th>
              <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 tracking-wide">作成日</th>
              <th className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 tracking-wide w-16">操作</th>
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
                  書類がありません。アップロードまたはAI書類作成で追加してください。
                </td>
              </tr>
            ) : (
              documents.map(doc => {
                const st = STATUS_STYLES[doc.status] ?? STATUS_STYLES['作成済']
                const taskTitle = (doc.tasks as DocumentRow['tasks'] & { title?: string })?.title ?? '-'
                return (
                  <tr key={doc.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 transition">
                    <td className="px-4 py-2.5">
                      <div className="text-xs font-semibold text-gray-900">{doc.name}</div>
                      <div className="text-[10px] text-gray-400">{doc.file_type ?? 'PDF'}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{taskTitle}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={doc.status}
                        onChange={(e) => handleStatusChange(doc.id, e.target.value)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border outline-none cursor-pointer ${st.bg} ${st.text} ${st.border}`}
                      >
                        {['下書き', '作成済', '送付済', '返送待ち', '完了'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">
                      {new Date(doc.created_at).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setDeleteDoc(doc)}
                        className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
                        title="削除"
                      >
                        🗑
                      </button>
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

      {/* AI Document Modal */}
      <AiDocumentModal
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        caseId={caseData.id}
        caseName={caseData.deal_name}
        onSaved={() => { setAiOpen(false); fetchDocs() }}
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
