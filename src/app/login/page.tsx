'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('メールアドレスまたはパスワードが正しくありません')
      setLoading(false)
      return
    }

    // ?next=/register 等があればそこへ戻す（PWAの相談案件登録からのログアウト→再ログイン対応）。
    // オープンリダイレクト防止のため同一オリジンのパス(/始まり・/login以外)のみ許可。
    const next = new URLSearchParams(window.location.search).get('next')
    const dest = next && next.startsWith('/') && !next.startsWith('/login') ? next : '/'
    router.push(dest)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden">
      {/* 背景: 柔らかいオーシャンの光 */}
      <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-brand-100/50 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-gradient-to-tr from-accent-50/60 to-transparent blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative">
        {/* ロゴ・タイトル */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ocean.svg" alt="オーシャン" className="h-14 w-auto mx-auto mb-4" />
          <h1 className="text-[26px] font-bold text-gray-900 tracking-tight">相続案件管理</h1>
        </div>

        {/* ログインフォーム */}
        <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(15,72,126,0.08)] border border-gray-200/70 p-8 backdrop-blur">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-300 focus:border-brand-500 outline-none transition text-gray-900"
                placeholder="name@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-300 focus:border-brand-500 outline-none transition text-gray-900"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-brand-700 focus:ring-4 focus:ring-brand-200 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2026 オーシャン
        </p>
      </div>
    </div>
  )
}
