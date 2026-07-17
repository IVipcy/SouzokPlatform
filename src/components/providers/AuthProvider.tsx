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

// 管理担当系アカウントか（凍結確認など管理担当限定操作の判定用）。
export function useIsManager() {
  const user = useAuth()
  if (!user) return false
  return (
    user.primaryRole === 'manager' ||
    user.primaryRole === 'sub_manager' ||
    user.primaryRole === 'system_manager' ||
    user.roles.includes('manager') ||
    user.roles.includes('system_manager')
  )
}

// 到着物受信簿を操作できるか（管理担当に加え、事務スタッフ=assistant も新規登録〜受信確定まで可）。
export function useCanOperateReceipts() {
  const user = useAuth()
  if (!user) return false
  if (user.primaryRole === 'assistant') return true
  return (
    user.primaryRole === 'manager' ||
    user.primaryRole === 'sub_manager' ||
    user.primaryRole === 'system_manager' ||
    user.roles.includes('manager') ||
    user.roles.includes('system_manager')
  )
}
