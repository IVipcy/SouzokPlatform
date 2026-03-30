'use client'

import { createContext, useContext } from 'react'
import type { UserWithRoles } from '@/lib/auth'

const AuthContext = createContext<UserWithRoles | null>(null)

export function AuthProvider({ user, children }: { user: UserWithRoles | null; children: React.ReactNode }) {
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
