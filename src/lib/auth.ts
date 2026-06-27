import { createClient } from '@/lib/supabase/server'

export type UserWithRoles = {
  id: string
  email: string
  memberId: string | null
  memberName: string | null
  avatarColor: string | null
  avatarUrl: string | null
  primaryRole: string | null
  teamId: string | null
  roles: string[]
  permissions: string[]
}

/**
 * Get the current authenticated user with their roles and permissions.
 * Call this from server components.
 */
export async function getCurrentUser(): Promise<UserWithRoles | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Find matching member by email
  const { data: member } = await supabase
    .from('members')
    .select('id, name, email, avatar_color, avatar_url, primary_role, team_id')
    .eq('email', user.email!)
    .eq('is_active', true)
    .single()

  if (!member) {
    return {
      id: user.id,
      email: user.email!,
      memberId: null,
      memberName: null,
      avatarColor: null,
      avatarUrl: null,
      primaryRole: null,
      teamId: null,
      roles: [],
      permissions: [],
    }
  }

  // Get roles
  const { data: memberRoles } = await supabase
    .from('member_roles')
    .select('roles(key)')
    .eq('member_id', member.id)

  const roles = memberRoles?.map((mr: any) => mr.roles?.key).filter(Boolean) ?? []

  // Get permissions for those roles
  const { data: rolePermissions } = await supabase
    .from('role_permissions')
    .select('permission, roles!inner(key)')
    .eq('allowed', true)

  const permissions = rolePermissions
    ?.filter((rp: any) => roles.includes(rp.roles?.key))
    .map((rp: any) => rp.permission)
    .filter(Boolean) ?? []

  return {
    id: user.id,
    email: user.email!,
    memberId: member.id,
    memberName: member.name,
    avatarColor: member.avatar_color ?? null,
    avatarUrl: member.avatar_url ?? null,
    primaryRole: member.primary_role ?? null,
    teamId: (member as { team_id?: string | null }).team_id ?? null,
    roles: [...new Set(roles)],
    permissions: [...new Set(permissions)],
  }
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(user: UserWithRoles | null, permission: string): boolean {
  if (!user) return false
  // Admins / managers have all permissions
  if (user.roles.includes('manager')) return true
  return user.permissions.includes(permission)
}

/**
 * Check if a user has any of the specified roles
 */
export function hasRole(user: UserWithRoles | null, ...roles: string[]): boolean {
  if (!user) return false
  return roles.some(r => user.roles.includes(r))
}

// ──────────────────────────────────────────────────────────
// ロール別アクセス制御ヘルパー（manager全許可ショートカットを使わない明示版）
// system_manager は全許可。それ以外はロールに応じて個別判定する。
// ──────────────────────────────────────────────────────────

// 実運用は primary_role 一本のため、primary_role を主に判定する。
// member_roles（roles[]）が設定されている場合はそれも OR で見る（互換）。

/** システム管理者（全機能・全ダッシュボードのスーパーユーザー） */
export function isSystemManager(user: UserWithRoles | null): boolean {
  if (!user) return false
  return user.primaryRole === 'system_manager' || user.roles.includes('system_manager')
}

/** マイページを持つのは 受注/管理/システム管理者のみ（事務管理・経理は無し） */
export function canSeeMyPage(user: UserWithRoles | null): boolean {
  if (!user) return false
  if (isSystemManager(user)) return true
  return user.primaryRole === 'sales' || user.primaryRole === 'manager' || user.primaryRole === 'sub_manager'
}

/** 銀行CSV入金突合ができるのは 経理 と システム管理者のみ（manager不可） */
export function canReconcilePayments(user: UserWithRoles | null): boolean {
  if (!user) return false
  return isSystemManager(user) || user.primaryRole === 'accounting' || user.roles.includes('accounting')
}
