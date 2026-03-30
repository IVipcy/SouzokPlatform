import { createClient } from '@/lib/supabase/server'
import { ScheduleClient } from '@/components/features/schedule/ScheduleClient'

export default async function SchedulePage() {
  const supabase = await createClient()

  const [eventsResult, membersResult, casesResult] = await Promise.all([
    supabase
      .from('events')
      .select('*, members(id, name, avatar_color), cases(id, case_number, deal_name)')
      .order('event_date'),
    supabase
      .from('members')
      .select('id, name, email, avatar_color, is_active')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('cases')
      .select('id, case_number, deal_name')
      .order('case_number'),
  ])

  return (
    <ScheduleClient
      events={eventsResult.data ?? []}
      members={membersResult.data ?? []}
      cases={casesResult.data ?? []}
    />
  )
}
