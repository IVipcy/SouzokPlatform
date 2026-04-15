'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * ページ遷移時に画面上部に青いプログレスバーを表示する。
 * - <a>/Linkクリックや router.push を検知して開始
 * - pathname/searchParamsの変更で完了
 */
export default function TopProgressBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── 開始: <a>クリック検知 ───
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // 修飾キー押下時はネイティブ動作（新タブ等）に任せる
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return
      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href) return
      // ハッシュ・外部・mailto等は無視
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (anchor.target && anchor.target !== '_self') return

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      // 別オリジン（外部リンク）は無視
      if (url.origin !== window.location.origin) return
      // 同一URLは無視
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      start()
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [])

  // ─── 完了: pathname/searchParams変更を検知 ───
  useEffect(() => {
    if (visible) finish()
    // visibleの変化はトリガーにしない（pathname/search変更時のみ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  const start = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    setVisible(true)
    setProgress(8)
    timerRef.current = setInterval(() => {
      setProgress(p => {
        // 90%まで漸近的に増加
        if (p >= 90) return p
        return p + (90 - p) * 0.08
      })
    }, 180)
  }

  const finish = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setProgress(100)
    hideTimerRef.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 250)
  }

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 200ms ease' }}
    >
      <div
        className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 shadow-[0_0_10px_rgba(37,99,235,0.6)]"
        style={{
          width: `${progress}%`,
          transition: 'width 200ms ease-out',
        }}
      />
    </div>
  )
}
