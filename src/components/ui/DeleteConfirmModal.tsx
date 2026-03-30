'use client'

import { useState } from 'react'
import Modal from './Modal'

type Props = {
  isOpen: boolean
  onClose: () => void
  title?: string
  message?: string
  onConfirm: () => Promise<void>
}

export default function DeleteConfirmModal({ isOpen, onClose, title = '削除確認', message = 'この操作は取り消せません。本当に削除しますか？', onConfirm }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    setDeleting(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? '削除中...' : '削除する'}
          </button>
        </>
      }
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-3">{error}</div>
      )}
      <p className="text-sm text-gray-600">{message}</p>
    </Modal>
  )
}
