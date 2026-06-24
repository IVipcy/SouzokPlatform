'use client'

// アラートセンターの共有状態。ライブアラート(/api/alerts) ＋ 通知(notifications) を1か所で取得し、
// サイドバーの「マイページ」バッジ と マイページ内のアラートセンターで共有する（二重取得を避ける）。

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './AuthProvider'
import type { AlertItem } from '@/lib/alerts'

export type NotificationItem = {
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

type Ctx = {
  alerts: AlertItem[]
  notifications: NotificationItem[]
  unreadCount: number
  totalCount: number
  loading: boolean
  refetch: () => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  removeOne: (id: string) => Promise<void>
}

const EMPTY: Ctx = {
  alerts: [], notifications: [], unreadCount: 0, totalCount: 0, loading: false,
  refetch: () => {}, markRead: async () => {}, markAllRead: async () => {}, removeOne: async () => {},
}

const AlertCenterContext = createContext<Ctx | null>(null)
export function useAlertCenter(): Ctx {
  return useContext(AlertCenterContext) ?? EMPTY
}

const FETCH_LIMIT = 30
const POLL_INTERVAL_MS = 60_000

export function AlertCenterProvider({ children }: { children: React.ReactNode }) {
  const user = useAuth()
  const memberId = user?.memberId ?? null
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!memberId) return
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data }, alertRes] = await Promise.all([
        supabase.from('notifications').select('*').eq('member_id', memberId).order('created_at', { ascending: false }).limit(FETCH_LIMIT),
        fetch('/api/alerts').then(r => r.ok ? r.json() : { alerts: [] }).catch(() => ({ alerts: [] })),
      ])
      setNotifications((data ?? []) as NotificationItem[])
      setAlerts((alertRes?.alerts ?? []) as AlertItem[])
    } finally {
      setLoading(false)
    }
  }, [memberId])

  useEffect(() => {
    if (!memberId) return
    fetchAll()
    const timer = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [memberId, fetchAll])

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)))
    await createClient().from('notifications').update({ is_read: true }).eq('id', id)
  }, [])

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    await createClient().from('notifications').update({ is_read: true }).in('id', unreadIds)
  }, [notifications])

  const removeOne = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await createClient().from('notifications').delete().eq('id', id)
  }, [])

  const unreadCount = notifications.filter(n => !n.is_read).length
  const totalCount = alerts.length + unreadCount

  return (
    <AlertCenterContext.Provider value={{ alerts, notifications, unreadCount, totalCount, loading, refetch: fetchAll, markRead, markAllRead, removeOne }}>
      {children}
    </AlertCenterContext.Provider>
  )
}
