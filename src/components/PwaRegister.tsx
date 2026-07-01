'use client'

import { useEffect } from 'react'

// サービスワーカーを登録してPWA（ホーム画面アプリ）として使えるようにする。
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => { /* 失敗しても通常のWebとして動く */ })
  }, [])
  return null
}
