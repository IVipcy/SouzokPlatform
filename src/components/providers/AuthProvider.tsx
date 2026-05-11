'use client'

import { createContext, useContext, useEffect } from 'react'
import type { UserWithRoles } from '@/lib/auth'

const AuthContext = createContext<UserWithRoles | null>(null)

export function AuthProvider({ user, children }: { user: UserWithRoles | null; children: React.ReactNode }) {
  // 全アプリ共通: <input type="date"> をクリックしたら即カレンダーを開く
  // （カレンダーアイコンを正確に押さなくても、入力欄のどこをクリックでもOK）
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t instanceof HTMLInputElement && t.type === 'date' && !t.disabled && !t.readOnly) {
        try { t.showPicker?.() } catch { /* unsupported browser */ }
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export function useHasRole(...roles: string[]) {
  const user = useAuth()
  if (!user) return false
  if (user.roles.includes('manager')) return true
  return roles.some(r => user.roles.includes(r))
}

export function useHasPermission(permission: string) {
  const user = useAuth()
  if (!user) return false
  if (user.roles.includes('manager')) return true
  return user.permissions.includes(permission)
}
