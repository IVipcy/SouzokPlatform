'use client'

// マイページのアラートセンター。アラート(やること)＋通知(履歴)を大きく表示し、
// ベルを押すと全件モーダルを開く。サイドバーの「マイページ」バッジと同じデータ(Provider)を共有。

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
  if (n.type === 'payment_confirmed') return `/billing?case=${n.case_id}`
  return `/cases/${n.case_id}`
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

export default function MyAlertCenter() {
  const { alerts, notifications, unreadCount, totalCount, markRead, markAllRead, removeOne } = useAlertCenter()
  const [open, setOpen] = useState(false)
  const topAlerts = alerts.slice(0, 5)

  return (
    <>
      {/* 大きいアラート表示（ページ上部） */}
      <div className="mb-5 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-white hover:text-brand-600 border border-transparent hover:border-gray-200 transition"
            aria-label="アラートと通知を開く"
            title="アラートと通知を開く"
          >
            <Bell className="w-[18px] h-[18px]" strokeWidth={2} />
            {totalCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">{totalCount > 99 ? '99+' : totalCount}</span>
            )}
          </button>
          <h2 className="text-[15px] font-bold text-gray-900">アラート</h2>
          {alerts.length > 0 && <span className="text-[12px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">{alerts.length}</span>}
          <button type="button" onClick={() => setOpen(true)} className="ml-auto inline-flex items-center gap-0.5 text-[12px] font-semibold text-brand-600 hover:text-brand-700">
            すべて表示<ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-3">
          {alerts.length === 0 ? (
            <div className="py-5 text-center text-[13px] text-gray-400">
              対応すべきアラートはありません{unreadCount > 0 && <span className="text-gray-500">（未読の通知が {unreadCount} 件）</span>}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {topAlerts.map(a => <li key={a.id}><AlertRow a={a} onNavigate={() => {}} /></li>)}
              {alerts.length > topAlerts.length && (
                <li>
                  <button type="button" onClick={() => setOpen(true)} className="w-full text-center py-2 text-[12px] font-semibold text-brand-600 hover:text-brand-700 hover:bg-brand-50/50 rounded-lg">
                    他 {alerts.length - topAlerts.length} 件のアラートを表示
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* モーダル（アラート＋通知の全件） */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="mt-10 w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <header className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
              <Bell className="w-5 h-5 text-brand-600" strokeWidth={2.25} />
              <h3 className="text-[16px] font-bold text-gray-900">アラート＆通知</h3>
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

            <div className="max-h-[72vh] overflow-y-auto px-5 py-4 space-y-5">
              {/* アラート（やること） */}
              <section>
                <h4 className="text-[12px] font-bold text-gray-500 mb-2">アラート（対応が必要なこと）{alerts.length > 0 && <span className="text-red-500">・{alerts.length}件</span>}</h4>
                {alerts.length === 0 ? (
                  <div className="py-4 text-center text-[12px] text-gray-400 bg-gray-50/60 rounded-lg">対応すべきアラートはありません</div>
                ) : (
                  <ul className="space-y-1.5">
                    {alerts.map(a => <li key={a.id}><AlertRow a={a} onNavigate={() => setOpen(false)} /></li>)}
                  </ul>
                )}
              </section>

              {/* 通知（履歴） */}
              <section>
                <h4 className="text-[12px] font-bold text-gray-500 mb-2">通知（お知らせ・履歴）{unreadCount > 0 && <span className="text-red-500">・未読{unreadCount}件</span>}</h4>
                {notifications.length === 0 ? (
                  <div className="py-4 text-center text-[12px] text-gray-400 bg-gray-50/60 rounded-lg">通知はありません</div>
                ) : (
                  <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                    {notifications.map(n => {
                      const href = notificationHref(n)
                      const inner = (
                        <div className={`flex items-start gap-2 px-3 py-2.5 ${n.is_read ? '' : 'bg-amber-50/50'}`}>
                          {!n.is_read && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />}
                          <div className="flex-1 min-w-0">
                            <div className={`text-[13px] leading-snug ${n.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>{n.title}</div>
                            {n.body && <div className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{n.body}</div>}
                            <div className="text-[11px] text-gray-400 mt-0.5">{relativeTime(n.created_at)}</div>
                          </div>
                          <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); removeOne(n.id) }} className="text-gray-300 hover:text-red-500 flex-shrink-0" title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )
                      return (
                        <li key={n.id}>
                          {href ? (
                            <Link href={href} className="block hover:bg-gray-50" onClick={() => { if (!n.is_read) markRead(n.id); setOpen(false) }}>{inner}</Link>
                          ) : (
                            <div role="button" tabIndex={0} onClick={() => { if (!n.is_read) markRead(n.id) }} className="block hover:bg-gray-50 cursor-pointer">{inner}</div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
