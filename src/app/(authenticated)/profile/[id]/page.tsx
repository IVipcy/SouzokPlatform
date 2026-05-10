import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { notFound } from 'next/navigation'
import ProfileClient from '@/components/features/profile/ProfileClient'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ProfilePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('id', id)
    .single()

  if (!member) notFound()

  let teamName: string | null = null
  if (member.team_id) {
    const { data: t } = await supabase.from('teams').select('name').eq('id', member.team_id).single()
    teamName = t?.name ?? null
  }

  const isOwner = currentUser?.memberId === id

  return (
    <ProfileClient
      member={member}
      teamName={teamName}
      isOwner={isOwner}
    />
  )
}
