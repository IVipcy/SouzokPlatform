'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseId: string
  caseName: string
  onSaved: () => void
}

const TEMPLATES = [
  { key: 'division-agreement', label: '遺産分割協議書', icon: '📜', desc: '相続人間の遺産分割内容を記載' },
  { key: 'heir-survey', label: '相続人調査報告書', icon: '👨‍👩‍👧', desc: '戸籍に基づく法定相続人の確定結果' },
  { key: 'property-list', label: '財産目録', icon: '💰', desc: '不動産・金融資産等のカテゴリ別一覧' },
  { key: 'cover-letter', label: '送付状', icon: '📮', desc: '書類送付用のカバーレター' },
]

export default function AiDocumentModal({ isOpen, onClose, caseId, caseName, onSaved }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [additionalInstructions, setAdditionalInstructions] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ title: string; content: string } | null>(null)

  const handleGenerate = async () => {
    if (!selectedTemplate) { setError('テンプレートを選択してください'); return }

    setGenerating(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/ai-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          templateKey: selectedTemplate,
          additionalInstructions: additionalInstructions || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '生成に失敗しました')
        // If content was returned despite error (doc save failed), still show it
        if (data.content) {
          setResult({ title: TEMPLATES.find(t => t.key === selectedTemplate)?.label || '', content: data.content })
        }
      } else {
        setResult({ title: data.title, content: data.content })
        onSaved()
      }
    } catch {
      setError('APIリクエストに失敗しました')
    } finally {
      setGenerating(false)
    }
  }

  const handleClose = () => {
    setResult(null)
    setSelectedTemplate('')
    setAdditionalInstructions('')
    setError('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="🤖 AI書類作成"
      maxWidth="max-w-2xl"
      footer={
        result ? (
          <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            閉じる
          </button>
        ) : (
          <>
            <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
              キャンセル
            </button>
            <button onClick={handleGenerate} disabled={generating || !selectedTemplate} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {generating ? '🤖 AI生成中...' : '🤖 生成する'}
            </button>
          </>
        )
      }
    >
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">{error}</div>}

      {result ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-green-500 text-lg">✓</span>
            <span className="text-sm font-semibold text-gray-900">{result.title} を生成しました</span>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
            <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">{result.content}</pre>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">※ この内容は下書きとしてドキュメント一覧に保存されました。必要に応じて編集してください。</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <span className="font-semibold">対象案件:</span> {caseName}
          </div>

          {/* Template selection */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-2">書類テンプレート *</label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.key}
                  onClick={() => setSelectedTemplate(t.key)}
                  className={`text-left p-3 rounded-lg border-2 transition ${
                    selectedTemplate === t.key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-base mb-1">{t.icon}</div>
                  <div className="text-xs font-semibold text-gray-900">{t.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Additional instructions */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">追加指示（任意）</label>
            <textarea
              value={additionalInstructions}
              onChange={e => setAdditionalInstructions(e.target.value)}
              rows={3}
              placeholder="例：長男が不動産を取得する内容で作成してください"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>

          {generating && (
            <div className="flex items-center gap-2 py-3 text-sm text-blue-600">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              AI が書類を生成しています... （30秒ほどかかります）
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
