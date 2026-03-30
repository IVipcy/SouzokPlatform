import { createClient } from '@/lib/supabase/server'

export type UserWithRoles = {
  id: string
  email: string
  memberId: string | null
  memberName: string | null
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
    .select('id, name, email')
    .eq('email', user.email!)
    .eq('is_active', true)
    .single()

  if (!member) {
    return {
      id: user.id,
      email: user.email!,
      memberId: null,
      memberName: null,
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
