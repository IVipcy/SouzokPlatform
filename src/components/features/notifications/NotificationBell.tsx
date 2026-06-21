'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/providers/AuthProvider'
import { ALERT_SEVERITY_STYLE, type AlertItem } from '@/lib/alerts'

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

export default function NotificationBell({ collapsed = false }: { collapsed?: boolean } = {}) {
  const user = useAuth()
  const memberId = user?.memberId ?? null
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchItems = useCallback(async () => {
    if (!memberId) return
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data }, alertRes] = await Promise.all([
        supabase.from('notifications').select('*').eq('member_id', memberId).order('created_at', { ascending: false }).limit(FETCH_LIMIT),
        fetch('/api/alerts').then(r => r.ok ? r.json() : { alerts: [] }).catch(() => ({ alerts: [] })),
      ])
      setItems((data ?? []) as Notification[])
      setAlerts((alertRes?.alerts ?? []) as AlertItem[])
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
  const totalCount = alerts.length + unreadCount

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
        title={collapsed ? `アラート${totalCount > 0 ? ` (${totalCount}件)` : ''}` : undefined}
        className={`relative flex items-center ${collapsed ? 'justify-center px-2' : 'gap-2 px-3'} w-full py-2 rounded-lg text-sm font-medium transition-colors ${
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
          {totalCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          )}
        </span>
        {!collapsed && 'アラート'}
        {!collapsed && totalCount > 0 && (
          <span className="ml-auto text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-1.5">
            {totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full bottom-0 ml-2 w-[340px] bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          {/* ヘッダー */}
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <h4 className="text-[13px] font-bold text-gray-800">アラート {totalCount > 0 && <span className="text-red-500">({totalCount})</span>}</h4>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                >
                  <CheckCheck className="w-3 h-3" />
                  通知を既読
                </button>
              )}
            </div>
          </div>

          {/* リスト */}
          <div className="max-h-[460px] overflow-y-auto">
            {/* ライブアラート（優先度順・クリックで該当へ） */}
            {alerts.length > 0 && (
              <ul className="divide-y divide-gray-100 border-b border-gray-100">
                {alerts.map(a => {
                  const sv = ALERT_SEVERITY_STYLE[a.severity]
                  const body = (
                    <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${sv.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${sv.chip}`}>{a.category}</span>
                        </div>
                        <div className="text-[13px] font-semibold text-gray-900 truncate">{a.title}</div>
                        {a.body && <div className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{a.body}</div>}
                      </div>
                    </div>
                  )
                  return (
                    <li key={a.id}>
                      {a.href ? (
                        <Link href={a.href} className="block" onClick={() => setOpen(false)}>{body}</Link>
                      ) : <div>{body}</div>}
                    </li>
                  )
                })}
              </ul>
            )}

            {loading && items.length === 0 && alerts.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-gray-400">読み込み中...</div>
            ) : items.length === 0 && alerts.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-gray-400">対応すべきアラートはありません</div>
            ) : items.length === 0 ? null : (
              <ul className="divide-y divide-gray-100">
                {items.map(n => {
                  const href = n.task_id
                    ? `/tasks/${n.task_id}`
                    : n.case_id
                      ? (n.type === 'doc_received' ? `/cases/${n.case_id}?tab=docs`
                        : n.type === 'payment_confirmed' ? `/billing?case=${n.case_id}`
                        : `/cases/${n.case_id}`)
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
