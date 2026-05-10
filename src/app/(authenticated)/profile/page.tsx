import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function ProfileIndexPage() {
  const user = await getCurrentUser()
  if (!user || !user.memberId) {
    redirect('/')
  }
  redirect(`/profile/${user.memberId}`)
}
