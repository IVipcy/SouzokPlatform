'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

type Props = {
  isAchieved: boolean
  // sessionStorage キー。同じセッションで再表示しないために使う。
  // 例: 'dash-popup-dept-2026-05'
  storageKey: string
}

// アニメーション設定
const NEUTRAL_DURATION_MS = 800   // 真顔表示時間
const FADE_DURATION_MS = 500      // クロスフェード時間

export default function DashboardAchievementPopup({ isAchieved, storageKey }: Props) {
  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState<0 | 1>(0)  // 0=neutral, 1=result

  useEffect(() => {
    if (typeof window === 'undefined') return
    // セッション中、同じキーで一度表示済みならスキップ
    if (sessionStorage.getItem(storageKey) === '1') return

    setShow(true)
    sessionStorage.setItem(storageKey, '1')

    // prefers-reduced-motion ならアニメーションなしで即結果表示
    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (prefersReducedMotion) {
      setPhase(1)
      return
    }

    // 真顔 → 結果画像へクロスフェード
    const t = setTimeout(() => setPhase(1), NEUTRAL_DURATION_MS)
    return () => clearTimeout(t)
  }, [storageKey])

  // Esc キーで閉じる
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShow(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  if (!show) return null

  const resultSrc = isAchieved
    ? '/dashboard-popup/celebration.png'
    : '/dashboard-popup/angry.png'
  const resultAlt = isAchieved ? '目標達成' : '目標未達'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm achievement-popup-overlay"
      onClick={() => setShow(false)}
      role="dialog"
      aria-modal="true"
      aria-label={isAchieved ? '目標達成のお知らせ' : '目標未達のお知らせ'}
    >
      <div
        className={`relative bg-white rounded-2xl shadow-2xl max-w-md w-[90vw] p-6 sm:p-8 text-center achievement-popup-card ${
          isAchieved ? 'achievement-popup-card-success' : 'achievement-popup-card-miss'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* 閉じるボタン */}
        <button
          type="button"
          onClick={() => setShow(false)}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition-colors p-1.5 rounded-full hover:bg-gray-100"
          title="閉じる"
        >
          <X className="w-4 h-4" strokeWidth={2.25} />
        </button>

        {/* 画像クロスフェードエリア */}
        <div className="relative mx-auto mb-5 w-[220px] h-[280px] sm:w-[260px] sm:h-[330px]">
          {/* eslint-disable @next/next/no-img-element */}
          <img
            src="/dashboard-popup/neutral.png"
            alt="判定中"
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
              phase === 0 ? 'opacity-100' : 'opacity-0'
            }`}
            draggable={false}
          />
          <img
            src={resultSrc}
            alt={resultAlt}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
              phase === 1 ? 'opacity-100 achievement-popup-result-img' : 'opacity-0'
            }`}
            style={{ transitionDuration: `${FADE_DURATION_MS}ms` }}
            draggable={false}
          />
          {/* eslint-enable @next/next/no-img-element */}
        </div>

        {/* メッセージ */}
        {isAchieved ? (
          <>
            <div className="text-[11px] font-semibold tracking-wider uppercase text-emerald-600 mb-1">
              CONGRATULATIONS
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-2">
              今月の目標を達成！
            </h3>
            <p className="text-[13px] text-gray-500 leading-relaxed">
              すべての KPI 目標を上回りました。<br />
              引き続き素晴らしい成績を期待しています 🎉
            </p>
          </>
        ) : (
          <>
            <div className="text-[11px] font-semibold tracking-wider uppercase text-red-600 mb-1">
              KEEP PUSHING
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-2">
              今月の目標は未達成
            </h3>
            <p className="text-[13px] text-gray-500 leading-relaxed">
              未達成の KPI を確認し、月末までに巻き返しましょう。<br />
              ダッシュボード上で各指標の達成率が見られます。
            </p>
          </>
        )}

        {/* ボタン */}
        <button
          type="button"
          onClick={() => setShow(false)}
          className={`mt-5 inline-flex items-center justify-center px-6 py-2 text-sm font-semibold rounded-lg transition-colors text-white shadow-sm ${
            isAchieved
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-brand-600 hover:bg-brand-700'
          }`}
        >
          {isAchieved ? 'ダッシュボードを見る' : 'がんばる'}
        </button>
      </div>
    </div>
  )
}
