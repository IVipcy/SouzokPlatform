'use client'

// アラートセンターの共有状態。ライブアラート(/api/alerts) ＋ 通知(notifications) を1か所で取得し、
// サイドバーの「マイページ」バッジ と マイページ内のアラートセンターで共有する（二重取得を避ける）。
//
// アラートは毎回計算されて保存されないので、人ごとに「初めて出た日時」「対応済にした日時」だけを
// alert_states（migration 286）に持つ。新着＝未対応（初出の新しい順）、完了済＝対応済（元の状態が解消されれば消える）。

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './AuthProvider'
import { ALERT_SEVERITY_ORDER, type AlertItem } from '@/lib/alerts'

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

/** アラート＋人ごとの状態 */
export type AlertWithState = AlertItem & { firstSeenAt: string; ackedAt: string | null }

type Ctx = {
  /** 全アラート（新着・完了済の両方。初出の新しい順） */
  alerts: AlertWithState[]
  /** 未対応のアラート */
  newAlerts: AlertWithState[]
  /** 対応済にしたアラート（まだ状態が解消されていないもの） */
  doneAlerts: AlertWithState[]
  notifications: NotificationItem[]
  unreadCount: number
  totalCount: number
  loading: boolean
  refetch: () => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  removeOne: (id: string) => Promise<void>
  ackAlert: (id: string) => Promise<void>
  unackAlert: (id: string) => Promise<void>
}

const EMPTY: Ctx = {
  alerts: [], newAlerts: [], doneAlerts: [], notifications: [], unreadCount: 0, totalCount: 0, loading: false,
  refetch: () => {}, markRead: async () => {}, markAllRead: async () => {}, removeOne: async () => {}, ackAlert: async () => {}, unackAlert: async () => {},
}

const AlertCenterContext = createContext<Ctx | null>(null)
export function useAlertCenter(): Ctx {
  return useContext(AlertCenterContext) ?? EMPTY
}

const FETCH_LIMIT = 30
const POLL_INTERVAL_MS = 60_000

type StateRow = { alert_key: string; first_seen_at: string; acked_at: string | null }

export function AlertCenterProvider({ children }: { children: React.ReactNode }) {
  const user = useAuth()
  const memberId = user?.memberId ?? null
  const [rawAlerts, setRawAlerts] = useState<AlertItem[]>([])
  const [states, setStates] = useState<Record<string, StateRow>>({})
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
      const list = (alertRes?.alerts ?? []) as AlertItem[]
      setRawAlerts(list)
      // 人ごとの状態。初めて見るアラートは「初出」を記録する（既にあれば触らない）
      const keys = list.map(a => a.id)
      let rows: StateRow[] = []
      if (keys.length > 0) {
        const { data: st } = await supabase.from('alert_states').select('alert_key, first_seen_at, acked_at').eq('member_id', memberId).in('alert_key', keys)
        rows = (st ?? []) as StateRow[]
        const known = new Set(rows.map(r => r.alert_key))
        const missing = keys.filter(k => !known.has(k))
        if (missing.length > 0) {
          const now = new Date().toISOString()
          await supabase.from('alert_states').upsert(missing.map(k => ({ member_id: memberId, alert_key: k, first_seen_at: now })), { onConflict: 'member_id,alert_key', ignoreDuplicates: true })
          rows = [...rows, ...missing.map(k => ({ alert_key: k, first_seen_at: now, acked_at: null }))]
        }
      }
      setStates(Object.fromEntries(rows.map(r => [r.alert_key, r])))
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

  const ackAlert = useCallback(async (id: string) => {
    if (!memberId) return
    const now = new Date().toISOString()
    setStates(prev => ({ ...prev, [id]: { alert_key: id, first_seen_at: prev[id]?.first_seen_at ?? now, acked_at: now } }))
    await createClient().from('alert_states').upsert({ member_id: memberId, alert_key: id, acked_at: now }, { onConflict: 'member_id,alert_key' })
  }, [memberId])
  const unackAlert = useCallback(async (id: string) => {
    if (!memberId) return
    setStates(prev => ({ ...prev, [id]: { alert_key: id, first_seen_at: prev[id]?.first_seen_at ?? new Date().toISOString(), acked_at: null } }))
    await createClient().from('alert_states').update({ acked_at: null }).eq('member_id', memberId).eq('alert_key', id)
  }, [memberId])

  // 初出の新しい順（同じなら重大度順）
  const alerts = useMemo<AlertWithState[]>(() => {
    const now = new Date().toISOString()
    return rawAlerts
      .map(a => ({ ...a, firstSeenAt: states[a.id]?.first_seen_at ?? now, ackedAt: states[a.id]?.acked_at ?? null }))
      .sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt) || ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity])
  }, [rawAlerts, states])
  const newAlerts = useMemo(() => alerts.filter(a => !a.ackedAt), [alerts])
  const doneAlerts = useMemo(() => alerts.filter(a => !!a.ackedAt), [alerts])

  const unreadCount = notifications.filter(n => !n.is_read).length
  const totalCount = newAlerts.length + unreadCount

  return (
    <AlertCenterContext.Provider value={{ alerts, newAlerts, doneAlerts, notifications, unreadCount, totalCount, loading, refetch: fetchAll, markRead, markAllRead, removeOne, ackAlert, unackAlert }}>
      {children}
    </AlertCenterContext.Provider>
  )
}
