'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Loader2, Check, Send } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { DISPATCH_DOCUMENT_NAMES } from '@/lib/constants'

type CaseLite = {
  id: string
  case_number: string
  deal_name: string
  status: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  cases: CaseLite[]
  onSaved: () => void
  defaultCaseId?: string
}

export default function NewDispatchModal({ isOpen, onClose, cases, onSaved, defaultCaseId }: Props) {
  const [caseSearch, setCaseSearch] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(defaultCaseId ?? null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [documentName, setDocumentName] = useState('戸籍謄本')
  const [sentDate, setSentDate] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [receivedDate, setReceivedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // モーダルを開いた時に状態をリセット
  useEffect(() => {
    if (isOpen) {
      setCaseSearch('')
      setSelectedCaseId(defaultCaseId ?? null)
      setShowDropdown(false)
      setDocumentName('戸籍謄本')
      setSentDate(new Date().toISOString().slice(0, 10))
      setSentTo('')
      setQuantity(1)
      setReceivedDate('')
    }
  }, [isOpen, defaultCaseId])

  // 外クリックでドロップダウン閉じる
  useEffect(() => {
    if (!showDropdown) return
    const onDoc = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showDropdown])

  const selectedCase = useMemo(() => cases.find(c => c.id === selectedCaseId) ?? null, [cases, selectedCaseId])

  const filteredCases = useMemo(() => {
    const q = caseSearch.trim().toLowerCase()
    if (!q) return cases.slice(0, 30)
    return cases
      .filter(c =>
        c.case_number.toLowerCase().includes(q) ||
        c.deal_name.toLowerCase().includes(q),
      )
      .slice(0, 30)
  }, [cases, caseSearch])

  const handleSelectCase = (c: CaseLite) => {
    setSelectedCaseId(c.id)
    setCaseSearch('')
    setShowDropdown(false)
  }

  const handleClearCase = () => {
    setSelectedCaseId(null)
    setCaseSearch('')
  }

  const canSave = selectedCaseId && documentName.trim()

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('document_dispatches').insert({
        case_id: selectedCaseId,
        document_name: documentName.trim(),
        sent_date: sentDate || null,
        sent_to: sentTo.trim() || null,
        quantity: Math.max(0, quantity),
        received_date: receivedDate || null,
      })
      if (error) throw error
      showToast('発送を記録しました', 'success')
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
      showToast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="新規発送を記録"
      maxWidth="max-w-xl"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-800"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            記録する
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 案件選択 */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">
            案件 <span className="text-red-400">*</span>
          </label>
          {selectedCase ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-md">
              <span className="text-[12px] font-mono text-brand-700 bg-white px-1.5 py-0.5 rounded border border-brand-200">
                {selectedCase.case_number}
              </span>
              <span className="text-[14px] font-semibold text-gray-900 flex-1 truncate">
                {selectedCase.deal_name}
              </span>
              <button
                onClick={handleClearCase}
                disabled={saving}
                className="text-[12px] text-gray-500 hover:text-red-500"
              >
                変更
              </button>
            </div>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={caseSearch}
                onChange={e => { setCaseSearch(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                placeholder="案件番号・案件名で検索"
                disabled={saving}
                className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none"
              />
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto z-10">
                  {filteredCases.length === 0 ? (
                    <div className="px-3 py-2 text-[13px] text-gray-400">該当する案件がありません</div>
                  ) : (
                    filteredCases.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectCase(c)}
                        className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-brand-50 flex items-center gap-2 border-b border-gray-50 last:border-b-0"
                      >
                        <span className="text-[12px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                          {c.case_number}
                        </span>
                        <span className="text-gray-900 flex-1 truncate">{c.deal_name}</span>
                        <span className="text-[11px] text-gray-400">{c.status}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 書類名 + 通数 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">
              書類名 <span className="text-red-400">*</span>
            </label>
            <input
              list="dispatch-doc-names-modal"
              value={documentName}
              onChange={e => setDocumentName(e.target.value)}
              disabled={saving}
              className="w-full px-2.5 py-2 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none"
            />
            <datalist id="dispatch-doc-names-modal">
              {DISPATCH_DOCUMENT_NAMES.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">通数</label>
            <input
              type="number"
              min={0}
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value, 10) || 0)}
              disabled={saving}
              className="w-full px-2.5 py-2 text-[13px] font-mono text-right border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none"
            />
          </div>
        </div>

        {/* 発送日 + 発送先 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">発送日</label>
            <input
              type="date"
              value={sentDate}
              onChange={e => setSentDate(e.target.value)}
              disabled={saving}
              className="w-full px-2.5 py-2 text-[13px] font-mono border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">届いた日付</label>
            <input
              type="date"
              value={receivedDate}
              onChange={e => setReceivedDate(e.target.value)}
              disabled={saving}
              className="w-full px-2.5 py-2 text-[13px] font-mono border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none"
            />
          </div>
        </div>

        {/* 発送先 */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">発送先</label>
          <input
            type="text"
            value={sentTo}
            onChange={e => setSentTo(e.target.value)}
            placeholder="例：法務局、年金事務所、〇〇銀行など"
            disabled={saving}
            className="w-full px-2.5 py-2 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none"
          />
        </div>

        <div className="text-[12px] text-gray-400 flex items-start gap-1.5 pt-1">
          <Check className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
          受領書類のアップロードは記録後に各行から行えます。
        </div>
      </div>
    </Modal>
  )
}
