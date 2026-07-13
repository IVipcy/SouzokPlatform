'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X, Download, Share, SquarePlus } from 'lucide-react'

// ホーム画面未追加の人だけに、インストール案内を出す。
// 相談案件登録（/register）とオーダーシート入力（/order-sheet）の2アプリに対応し、
// パスに応じてアイコン・アプリ名・非表示キーを切り替える（それぞれ別アプリとして案内）。
// Android/Chrome: beforeinstallprompt を掴んでワンタップ「インストール」ボタン。
// iPhone/Safari: プログラムから促せないので手順ガイドを表示。
// すでにアプリとして起動中（standalone）／最近閉じた人には出さない。

const DISMISS_DAYS = 14

type BeforeInstallPromptEvent = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> }

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export default function InstallGuide() {
  const pathname = usePathname()
  // TOPだけでなく案件ページ（/order-sheet/[id]）でも誘導を出す
  const isOrderSheet = pathname.startsWith('/order-sheet')
  const isRegister = pathname.startsWith('/register')
  const enabled = isOrderSheet || isRegister
  const dismissKey = isOrderSheet ? 'orderSheetInstallGuideDismissedAt' : 'registerInstallGuideDismissedAt'
  const iconSrc = isOrderSheet ? '/icons/os-192.png' : '/icons/icon-192.png'
  const appLabel = isOrderSheet ? 'オーダーシート入力' : '相談案件登録'

  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (!enabled || isStandalone()) return
    try {
      const at = Number(localStorage.getItem(dismissKey) || 0)
      if (at && Date.now() - at < DISMISS_DAYS * 86400000) return
    } catch { /* noop */ }
    const ua = navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ios) { setIsIOS(true); setShow(true) }
    // Android等は beforeinstallprompt が来たら表示（下の effect）
  }, [enabled, dismissKey])

  useEffect(() => {
    if (!enabled) return
    const handler = (e: Event) => {
      e.preventDefault()
      if (isStandalone()) return
      try {
        const at = Number(localStorage.getItem(dismissKey) || 0)
        if (at && Date.now() - at < DISMISS_DAYS * 86400000) return
      } catch { /* noop */ }
      setDeferred(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [enabled, dismissKey])

  const dismiss = () => {
    try { localStorage.setItem(dismissKey, String(Date.now())) } catch { /* noop */ }
    setShow(false)
  }

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    setShow(false)
  }

  if (!show || !enabled) return null

  return (
    <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/70 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} alt="" className="w-9 h-9 rounded-lg flex-shrink-0 border border-brand-100" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-brand-900">「{appLabel}」をホーム画面に追加すると便利です</div>
          {isIOS ? (
            <p className="text-[12px] text-brand-800/90 mt-0.5 leading-relaxed">
              画面下の <Share className="inline w-3.5 h-3.5 -mt-0.5" /> 共有ボタン →「<SquarePlus className="inline w-3.5 h-3.5 -mt-0.5" /> ホーム画面に追加」で、次回からアイコンから直接開けます。
            </p>
          ) : (
            <p className="text-[12px] text-brand-800/90 mt-0.5 leading-relaxed">
              アプリとして追加すると、次回からアイコンをタップするだけでこの画面を開けます。
            </p>
          )}
          {!isIOS && deferred && (
            <button
              type="button"
              onClick={install}
              className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-[12.5px] font-bold hover:bg-brand-700 transition"
            >
              <Download className="w-4 h-4" strokeWidth={2} />アプリをインストール
            </button>
          )}
        </div>
        <button type="button" onClick={dismiss} aria-label="閉じる" className="flex-shrink-0 text-brand-400 hover:text-brand-700 p-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
