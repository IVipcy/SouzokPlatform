'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Loader2, FileText } from 'lucide-react'
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

type DocKind = 'sent' | 'received' | 'memo'

export default function NewCaseDocumentModal({ isOpen, onClose, cases, onSaved, defaultCaseId }: Props) {
  const [caseSearch, setCaseSearch] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(defaultCaseId ?? null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [kind, setKind] = useState<DocKind>('sent')
  const [documentName, setDocumentName] = useState('戸籍謄本')
  const [sentDate, setSentDate] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [receivedDate, setReceivedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setCaseSearch('')
      setSelectedCaseId(defaultCaseId ?? null)
      setShowDropdown(false)
      setKind('sent')
      setDocumentName('戸籍謄本')
      setSentDate(new Date().toISOString().slice(0, 10))
      setSentTo('')
      setQuantity(1)
      setReceivedDate('')
    }
  }, [isOpen, defaultCaseId])

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
      const payload: Record<string, unknown> = {
        case_id: selectedCaseId,
        document_name: documentName.trim(),
        quantity: Math.max(0, quantity),
      }
      if (kind === 'sent') {
        payload.sent_date = sentDate || null
        payload.sent_to = sentTo.trim() || null
        if (receivedDate) payload.received_date = receivedDate
      } else if (kind === 'received') {
        payload.received_date = receivedDate || new Date().toISOString().slice(0, 10)
      }
      // memo は何も追加しない
      const { error } = await supabase.from('case_documents').insert(payload)
      if (error) throw error
      const msg = kind === 'sent' ? '発送を記録しました' : kind === 'received' ? '受領を記録しました' : 'メモを記録しました'
      showToast(msg, 'success')
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
      title="新規書類を記録"
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
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            記録する
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 種別タブ */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          <KindTab active={kind === 'sent'} onClick={() => setKind('sent')} label="📤 発送する" desc="お客さま・役所等へ送る" />
          <KindTab active={kind === 'received'} onClick={() => setKind('received')} label="📥 受領する" desc="一方的に届いた書類" />
          <KindTab active={kind === 'memo'} onClick={() => setKind('memo')} label="📝 メモ" desc="社内資料・面談メモ等" />
        </div>

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

        {/* 書類名 */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">
            書類名 <span className="text-red-400">*</span>
          </label>
          <input
            list="case-doc-names-modal"
            value={documentName}
            onChange={e => setDocumentName(e.target.value)}
            disabled={saving}
            className="w-full px-2.5 py-2 text-[13px] border border-gray-300 rounded-md focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none"
          />
          <datalist id="case-doc-names-modal">
            {DISPATCH_DOCUMENT_NAMES.map(n => <option key={n} value={n} />)}
          </datalist>
        </div>

        {/* 種別ごとの追加フィールド */}
        {kind === 'sent' && (
          <>
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
          </>
        )}

        {kind === 'received' && (
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
        )}

        <div className="text-[12px] text-gray-400 pt-1">
          {kind === 'sent' && '発送した書類の情報を記録します。受領（返送）が来たら同じ行で記録できます。'}
          {kind === 'received' && '一方的にお客様や役所から届いた書類（例：銀行口座情報）。'}
          {kind === 'memo' && '送らない社内資料・面談メモ等。ファイルは記録後にアップロードできます。'}
        </div>
      </div>
    </Modal>
  )
}

function KindTab({ active, onClick, label, desc }: { active: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-md text-[12px] font-semibold transition ${
        active ? 'bg-white text-brand-700 shadow-sm border border-brand-200' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      <div>{label}</div>
      <div className={`text-[11px] mt-0.5 font-normal ${active ? 'text-brand-500' : 'text-gray-400'}`}>{desc}</div>
    </button>
  )
}
