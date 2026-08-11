import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ManualStepView from '@/components/features/manual/ManualStepView'
import type { ManualStepRow } from '@/lib/manualStep'

export default async function ManualStepViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('manual_steps').select('*').eq('id', id).single()
  if (!data) notFound()
  return <ManualStepView step={data as unknown as ManualStepRow} />
}
