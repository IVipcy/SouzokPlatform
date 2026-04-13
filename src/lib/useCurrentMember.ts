'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * クライアントコンポーネントからログイン中のメンバーIDを取得するフック。
 * サーバーからcurrentMemberIdが渡ってこない場合のフォールバック。
 */
export function useCurrentMember(serverMemberId: string | null) {
  const [memberId, setMemberId] = useState<string | null>(serverMemberId)

  useEffect(() => {
    if (serverMemberId) {
      setMemberId(serverMemberId)
      return
    }

    // サーバーからメンバーIDが来なかった場合、クライアント側で取得
    const fetchMember = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return

      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('email', user.email)
        .eq('is_active', true)
        .single()

      if (member) {
        setMemberId(member.id)
      }
    }
    fetchMember()
  }, [serverMemberId])

  return memberId
}
