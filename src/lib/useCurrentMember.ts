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
      console.log('[useCurrentMember] サーバーからmemberId取得:', serverMemberId)
      return
    }

    // サーバーからメンバーIDが来なかった場合、クライアント側で取得
    const fetchMember = async () => {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      console.log('[useCurrentMember] auth user:', user?.email, 'error:', authError?.message)
      if (!user?.email) {
        console.warn('[useCurrentMember] ログインユーザーのメールが取得できません')
        return
      }

      // まずis_activeなしで検索
      const { data: memberActive, error: memberError } = await supabase
        .from('members')
        .select('id, email, is_active')
        .eq('email', user.email)
        .eq('is_active', true)
        .single()

      console.log('[useCurrentMember] active member検索:', memberActive, 'error:', memberError?.message)

      if (memberActive) {
        setMemberId(memberActive.id)
        return
      }

      // is_active関係なく検索（無効になっているメンバーも含む）
      const { data: memberAny } = await supabase
        .from('members')
        .select('id, email, is_active')
        .eq('email', user.email)
        .single()

      console.log('[useCurrentMember] any member検索:', memberAny)

      if (memberAny) {
        // is_active=falseでもIDはセットする（着手できるように）
        setMemberId(memberAny.id)
        console.warn('[useCurrentMember] メンバーは存在するがis_active=false。IDは使用します:', memberAny.id)
      } else {
        console.error('[useCurrentMember] メンバーテーブルにメールが見つかりません:', user.email)
        // メンバーが全く見つからない場合、全メンバーのメールをログ出力
        const { data: allMembers } = await supabase.from('members').select('id, email, name, is_active')
        console.log('[useCurrentMember] 登録メンバー一覧:', allMembers)
      }
    }
    fetchMember()
  }, [serverMemberId])

  return memberId
}
