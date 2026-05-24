'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/providers/AuthProvider'

type Notification = {
  id: string
  member_id: string
  type: string
  case_id: string | null
  task_id: string | null
  title: string
  body: string | null
  is_read: boolean
  created_at: string
}

const FETCH_LIMIT = 20
const POLL_INTERVAL_MS = 60_000 // 1分ごとに再フェッチ

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  if (diff < 60_000) return 'たった今'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`
  const d = Math.floor(diff / 86_400_000)
  if (d < 7) return `${d}日前`
  return iso.slice(0, 10)
}

export default function NotificationBell() {
  const user = useAuth()
  const memberId = user?.memberId ?? null
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchItems = useCallback(async () => {
    if (!memberId) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT)
      setItems((data ?? []) as Notification[])
    } finally {
      setLoading(false)
    }
  }, [memberId])

  useEffect(() => {
    if (!memberId) return
    fetchItems()
    const timer = setInterval(fetchItems, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [memberId, fetchItems])

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const unreadCount = items.filter(n => !n.is_read).length

  const markRead = async (id: string) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  }

  const markAllRead = async () => {
    if (!memberId || unreadCount === 0) return
    const unreadIds = items.filter(n => !n.is_read).map(n => n.id)
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    const supabase = createClient()
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds)
  }

  const removeOne = async (id: string) => {
    setItems(prev => prev.filter(n => n.id !== id))
    const supabase = createClient()
    await supabase.from('notifications').delete().eq('id', id)
  }

  if (!memberId) return null

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`relative flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          open
            ? 'bg-brand-50 text-brand-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
        aria-label="通知"
      >
        <span className="relative">
          <Bell
            className={`w-[18px] h-[18px] flex-shrink-0 ${open ? 'text-brand-600' : 'text-gray-400'}`}
            strokeWidth={open ? 2.25 : 1.75}
          />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        通知
        {unreadCount > 0 && (
          <span className="ml-auto text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-1.5">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full bottom-0 ml-2 w-[340px] bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          {/* ヘッダー */}
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <h4 className="text-[13px] font-bold text-gray-800">通知 {unreadCount > 0 && <span className="text-red-500">({unreadCount})</span>}</h4>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                >
                  <CheckCheck className="w-3 h-3" />
                  すべて既読
                </button>
              )}
            </div>
          </div>

          {/* リスト */}
          <div className="max-h-[420px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-gray-400">読み込み中...</div>
            ) : items.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-gray-400">通知はありません</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map(n => {
                  const href = n.task_id
                    ? `/tasks/${n.task_id}`
                    : n.case_id
                      ? `/cases/${n.case_id}`
                      : null
                  const body = (
                    <div className={`flex items-start gap-2 px-3 py-2.5 ${n.is_read ? '' : 'bg-amber-50/50'}`}>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] leading-snug ${n.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
                          {n.title}
                        </div>
                        {n.body && (
                          <div className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{n.body}</div>
                        )}
                        <div className="text-[11px] text-gray-400 mt-0.5">{relativeTime(n.created_at)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={e => {
                          e.preventDefault()
                          e.stopPropagation()
                          removeOne(n.id)
                        }}
                        className="text-gray-300 hover:text-red-500 flex-shrink-0"
                        title="削除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                  return (
                    <li key={n.id}>
                      {href ? (
                        <Link
                          href={href}
                          className="block hover:bg-gray-50"
                          onClick={() => {
                            if (!n.is_read) markRead(n.id)
                            setOpen(false)
                          }}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => { if (!n.is_read) markRead(n.id) }}
                          className="block hover:bg-gray-50 cursor-pointer"
                        >
                          {body}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
