'use client'

// マイページのアラート（コンパクト表示）。上部に「🔔アラート N」だけ置き、
// クリックでモーダルを開く。モーダルはアラート(やること)＋通知(履歴)を1つに統合した一覧。

import { useState } from 'react'
import Link from 'next/link'
import { Bell, X, CheckCheck, ChevronRight, Trash2 } from 'lucide-react'
import { useAlertCenter, type NotificationItem } from '@/components/providers/AlertCenterProvider'
import { ALERT_SEVERITY_STYLE, type AlertItem } from '@/lib/alerts'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'たった今'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`
  const d = Math.floor(diff / 86_400_000)
  return d < 7 ? `${d}日前` : iso.slice(0, 10)
}

function notificationHref(n: NotificationItem): string | null {
  if (n.task_id) return `/tasks/${n.task_id}`
  if (!n.case_id) return null
  if (n.type === 'doc_received') return `/cases/${n.case_id}?tab=docs`
  if (n.type === 'koseki_additional') return `/cases/${n.case_id}?tab=deceased`
  if (n.type === 'payment_confirmed') return `/billing?case=${n.case_id}`
  return `/cases/${n.case_id}`
}

export default function MyAlertCenter() {
  const { alerts, notifications, unreadCount, totalCount, markRead, markAllRead, removeOne } = useAlertCenter()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* コンパクト表示（名前のすぐ右）。押すとモーダル */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition"
        aria-label={`アラート${totalCount > 0 ? ` ${totalCount}件` : ''}`}
      >
        <span className="relative inline-flex">
          <Bell className={`w-[17px] h-[17px] ${totalCount > 0 ? 'text-red-500' : 'text-gray-400'}`} strokeWidth={2} />
          {totalCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">{totalCount > 99 ? '99+' : totalCount}</span>
          )}
        </span>
        <span className="text-[12px] font-semibold text-gray-700">アラート</span>
      </button>

      {/* モーダル（アラート＋通知を統合した一覧） */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="mt-10 w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <header className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
              <Bell className="w-5 h-5 text-brand-600" strokeWidth={2.25} />
              <h3 className="text-[16px] font-bold text-gray-900">アラート</h3>
              {totalCount > 0 && <span className="text-[12px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">{totalCount}</span>}
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
                  <CheckCheck className="w-3.5 h-3.5" />通知を既読
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className={`${unreadCount > 0 ? 'ml-2' : 'ml-auto'} text-gray-400 hover:text-gray-700`} aria-label="閉じる">
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="max-h-[72vh] overflow-y-auto p-3">
              {alerts.length === 0 && notifications.length === 0 ? (
                <div className="py-10 text-center text-[13px] text-gray-400">対応すべきことはありません</div>
              ) : (
                <ul className="space-y-1.5">
                  {/* アラート（やること・重大度順） */}
                  {alerts.map(a => <li key={a.id}><AlertRow a={a} onNavigate={() => setOpen(false)} /></li>)}
                  {/* 通知（履歴。既読/削除可） */}
                  {notifications.map(n => (
                    <li key={n.id}>
                      <NotificationRow n={n} onRead={() => markRead(n.id)} onRemove={() => removeOne(n.id)} onNavigate={() => setOpen(false)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function AlertRow({ a, onNavigate }: { a: AlertItem; onNavigate: () => void }) {
  const sv = ALERT_SEVERITY_STYLE[a.severity]
  const inner = (
    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-gray-100">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${sv.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${sv.chip}`}>{a.category}</span>
        </div>
        <div className="text-[13px] font-semibold text-gray-900 truncate">{a.title}</div>
        {a.body && <div className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{a.body}</div>}
      </div>
      {a.href && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />}
    </div>
  )
  return a.href ? <Link href={a.href} onClick={onNavigate} className="block">{inner}</Link> : <div>{inner}</div>
}

function NotificationRow({ n, onRead, onRemove, onNavigate }: { n: NotificationItem; onRead: () => void; onRemove: () => void; onNavigate: () => void }) {
  const href = notificationHref(n)
  const inner = (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-gray-100 ${n.is_read ? 'hover:bg-gray-50' : 'bg-amber-50/50 hover:bg-amber-50'}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${n.is_read ? 'bg-gray-300' : 'bg-amber-500'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">通知</span>
          <span className="text-[11px] text-gray-400">{relativeTime(n.created_at)}</span>
        </div>
        <div className={`text-[13px] leading-snug ${n.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>{n.title}</div>
        {n.body && <div className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{n.body}</div>}
      </div>
      <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove() }} className="text-gray-300 hover:text-red-500 flex-shrink-0" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  )
  return href ? (
    <Link href={href} className="block" onClick={() => { if (!n.is_read) onRead(); onNavigate() }}>{inner}</Link>
  ) : (
    <div role="button" tabIndex={0} onClick={() => { if (!n.is_read) onRead() }} className="block cursor-pointer">{inner}</div>
  )
}
