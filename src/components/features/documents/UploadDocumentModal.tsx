'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'

type CaseOption = { id: string; case_number: string; deal_name: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  cases: CaseOption[]
  defaultCaseId?: string
  onSaved: () => void
}

const FILE_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
}

export default function UploadDocumentModal({ isOpen, onClose, cases, defaultCaseId, onSaved }: Props) {
  const [form, setForm] = useState({
    name: '',
    case_id: defaultCaseId ?? '',
    status: '下書き',
  })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      if (!form.name) {
        setForm(prev => ({ ...prev, name: f.name.replace(/\.[^/.]+$/, '') }))
      }
    }
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('文書名は必須です'); return }
    if (!form.case_id) { setError('案件を選択してください'); return }

    setSaving(true)
    setError('')
    const supabase = createClient()

    let filePath: string | null = null
    let fileType = 'PDF'

    if (file) {
      fileType = FILE_TYPES[file.type] ?? file.name.split('.').pop()?.toUpperCase() ?? 'PDF'

      // Upload to Supabase Storage
      const ext = file.name.split('.').pop()
      const path = `${form.case_id}/${Date.now()}_${form.name.trim()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(path, file)

      if (uploadErr) {
        // If storage bucket doesn't exist, just save the DB record without file
        console.warn('File upload failed (storage may not be configured):', uploadErr.message)
        filePath = null
      } else {
        filePath = path
      }
    }

    // Insert document record
    const { error: insertErr } = await supabase.from('documents').insert({
      case_id: form.case_id,
      name: form.name.trim(),
      file_path: filePath,
      file_type: fileType,
      status: form.status,
      generated_by: 'manual',
    })

    if (insertErr) {
      setError(`登録に失敗しました: ${insertErr.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    setForm({ name: '', case_id: defaultCaseId ?? '', status: '下書き' })
    setFile(null)
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📤 ドキュメントアップロード"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'アップロード中...' : 'アップロード'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* File picker */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">ファイル</label>
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-blue-300 transition cursor-pointer">
            <input
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg"
              className="hidden"
              id="doc-upload"
            />
            <label htmlFor="doc-upload" className="cursor-pointer">
              {file ? (
                <div>
                  <div className="text-sm font-medium text-gray-700">{file.name}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</div>
                </div>
              ) : (
                <div>
                  <div className="text-2xl mb-1 opacity-40">📁</div>
                  <div className="text-xs text-gray-400">クリックしてファイルを選択</div>
                  <div className="text-[10px] text-gray-300 mt-1">PDF, Word, Excel, CSV, 画像</div>
                </div>
              )}
            </label>
          </div>
        </div>

        {/* Document name */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">文書名 *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="例：遺産分割協議書"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Case */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">案件 *</label>
          <select
            value={form.case_id}
            onChange={e => setForm(p => ({ ...p, case_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">選択してください</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.case_number} {c.deal_name}</option>)}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">ステータス</label>
          <select
            value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            {['下書き', '作成済', '送付済', '返送待ち', '完了'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}
