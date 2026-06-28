'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Upload, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Modal from '@/components/ui/Modal'
import CreatedDocsList from '@/components/features/cases/CreatedDocsList'
import DocumentGenerators from '@/components/features/cases/DocumentGenerators'
import type { CaseRow, TaskRow, HeirRow, RealEstatePropertyRow, ContractDocumentRow, DocumentRow } from '@/types'

type Props = {
  task: TaskRow
  caseData: CaseRow
  /** 同一案件で作成された書類（documents テーブル）。このタスク発とそれ以外を分けて表示。 */
  documents: DocumentRow[]
  tasks: TaskRow[]
  heirs: HeirRow[]
  properties: RealEstatePropertyRow[]
  contractDocuments?: ContractDocumentRow[]
}

const ACCEPTED = 'application/pdf,image/jpeg,image/png,image/jpg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export default function TaskCreatedDocsSection({ task, caseData, documents, tasks, heirs, properties, contractDocuments = [] }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [aiOpen, setAiOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => startTransition(() => router.refresh())

  const thisTaskDocs = documents.filter(d => d.task_id === task.id)
  const otherDocs = documents.filter(d => d.task_id !== task.id)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = f.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const storagePath = `${task.case_id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, f, { contentType: f.type || 'application/octet-stream', upsert: false })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('documents').insert({
        case_id: task.case_id,
        task_id: task.id,
        name: f.name,
        file_path: storagePath,
        file_type: f.type?.includes('sheet') || ext === 'xlsx' ? 'Excel' : (ext.toUpperCase()),
        status: '作成済',
        generated_by: 'manual',
      })
      if (dbErr) throw dbErr
      showToast('アップロードしました', 'success')
      refresh()
    } catch (err) {
      console.error(err)
      showToast('アップロードに失敗しました', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <span className="text-base">📎</span>
        <h2 className="text-[14px] font-bold text-gray-900">作成物</h2>
        <span className="text-[12px] text-gray-400">このタスクで作成・アップロードした書類。案件全体は書類作成タブで確認できます</span>
        <span className="ml-auto text-[11px] font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">{thisTaskDocs.length}件</span>
      </div>

      {/* アクション: AI書類作成 / アップロード */}
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/40 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          <Sparkles className="w-4 h-4" strokeWidth={2} />
          AI書類作成
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          アップロード
        </button>
        <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleUpload} className="hidden" />
        <span className="text-[11px] text-gray-400">作成・アップロードした書類はこのタスクに紐づき、案件詳細の作成書類一覧にも表示されます</span>
      </div>

      <div className="p-3">
        <CreatedDocsList documents={thisTaskDocs} onRefresh={refresh} />
        {otherDocs.length > 0 && (
          <div className="mt-2 text-[12px] text-gray-500">
            他タスクで作成された書類が {otherDocs.length} 件あります。
            <Link href={`/cases/${caseData.id}?tab=documentCreate`} className="ml-1 text-brand-600 hover:underline font-semibold">書類作成タブで見る</Link>
          </div>
        )}
      </div>

      {/* AI書類作成モーダル（このタスクに紐づけて作成） */}
      <Modal isOpen={aiOpen} onClose={() => { setAiOpen(false); refresh() }} title="AI書類作成（このタスクに紐づけ）" maxWidth="max-w-3xl">
        <DocumentGenerators
          caseData={caseData}
          tasks={tasks}
          heirs={heirs}
          properties={properties}
          contractDocuments={contractDocuments}
          defaultTaskId={task.id}
          onGenerated={refresh}
        />
      </Modal>
    </section>
  )
}
