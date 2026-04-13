'use client'

import { useState, useEffect, useCallback } from 'react'

type ToastType = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  message: string
  type: ToastType
}

let toastId = 0
let addToastGlobal: ((message: string, type?: ToastType) => void) | null = null

/** グローバルにトーストを表示する関数 */
export function showToast(message: string, type: ToastType = 'success') {
  addToastGlobal?.(message, type)
}

/** トーストコンテナ - layoutに1回だけ配置 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    addToastGlobal = addToast
    return () => { addToastGlobal = null }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`
            px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2
            animate-[slideIn_0.3s_ease-out]
            ${toast.type === 'success' ? 'bg-green-600 text-white' : ''}
            ${toast.type === 'error' ? 'bg-red-600 text-white' : ''}
            ${toast.type === 'info' ? 'bg-blue-600 text-white' : ''}
          `}
          style={{
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          {toast.type === 'success' && <span className="text-lg">✅</span>}
          {toast.type === 'error' && <span className="text-lg">❌</span>}
          {toast.type === 'info' && <span className="text-lg">ℹ️</span>}
          {toast.message}
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
