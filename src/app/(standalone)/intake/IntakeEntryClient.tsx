'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PenSquare, Link2, Plus, ChevronRight } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import CaseSelectScreen from '@/app/(authenticated)/meeting/CaseSelectScreen'
import type { CaseData, SelectedCase } from '@/app/(authenticated)/meeting/MeetingPageClient'

type Props = { cases: CaseData[]; currentMemberId: string | null }
type RouteChoice = null | 'lp'

// 統合入力アプリの入口。ルート選択→ LP=面談設定済案件を選択（案件が確定）／OC=新規ドラフト案件を作成。
// どちらも /intake/[id] へ遷移し、①面談シートから入力する。
export default function IntakeEntryClient({ cases, currentMemberId }: Props) {
  const router = useRouter()
  const [routeChoice, setRouteChoice] = useState<RouteChoice>(null)
  const [creating, setCreating] = useState(false)

  // LP案件を選んだら、その案件で入力を開始
  const onSelectLp = useCallback((c: SelectedCase) => {
    if (c?.id) router.push(`/intake/${c.id}`)
  }, [router])

  // OC直・HP経由：新規ドラフト案件を作成して入力を開始（面談ルート詳細は②で確定）
  const createOcDraft = useCallback(async () => {
    if (creating) return
    setCreating(true)
    const supabase = createClient()
    try {
      const { data: client, error: ce } = await supabase.from('clients').insert({ name: '無題' }).select('id').single()
      if (ce || !client) throw new Error(ce?.message ?? '依頼者の作成に失敗しました')

      const now = new Date()
      const yy = String(now.getFullYear()).slice(2)
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const { data: todayCases } = await supabase.from('cases').select('case_number').gte('created_at', startOfDay)
      let seq = (todayCases ?? []).reduce((max, c) => {
        const n = parseInt(String(c.case_number ?? '').slice(-4), 10)
        return Number.isFinite(n) && n > max ? n : max
      }, 0) + 1

      const today = now.toLocaleDateString('sv-SE')
      let newId: string | null = null
      let lastErr = '不明なエラー'
      for (let attempt = 0; attempt < 20; attempt++) {
        // OC入口では面談ルート詳細が未確定のため経路コードは 'XX'（②面談結果登録で order_route を設定）。
        const caseNumber = `${yy}${mm}XX${String(seq).padStart(4, '0')}`
        const { data: newCase, error } = await supabase.from('cases').insert({
          case_number: caseNumber,
          client_id: client.id,
          deal_name: '無題',
          status: '検討中',
          meeting_owner_id: currentMemberId || null,
          meeting_executed_date: today,
        }).select('id').single()
        if (!error && newCase) { newId = newCase.id; break }
        lastErr = error?.message ?? lastErr
        if (error?.code === '23505') { seq += 1; continue }
        break
      }
      if (!newId) throw new Error(`案件の作成に失敗: ${lastErr}`)
      if (currentMemberId) {
        await supabase.from('case_members').insert({ case_id: newId, member_id: currentMemberId, role: 'sales' })
      }
      router.push(`/intake/${newId}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '作成に失敗しました', 'error')
      setCreating(false)
    }
  }, [creating, currentMemberId, router])

  return (
    <div>
      <PageHeader
        eyebrow="Intake"
        title="面談・受注入力"
        icon={PenSquare}
        description="面談シート → 面談結果登録 → オーダーシート"
        right={routeChoice ? (
          <button onClick={() => setRouteChoice(null)} className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">← 戻る</button>
        ) : null}
      />

      {!routeChoice ? (
        <div className="max-w-[480px] mx-auto mt-4">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-3"><PenSquare className="w-6 h-6 text-brand-600" /></div>
            <h2 className="text-[16px] font-bold text-gray-900 mb-1">どの案件を入力しますか？</h2>
            <p className="text-[13px] text-gray-500">案件を確定してから、面談シートに進みます。</p>
          </div>
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => setRouteChoice('lp')} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border-2 border-brand-200 bg-brand-50/50 hover:bg-brand-50 transition text-left">
              <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0"><Link2 className="w-[18px] h-[18px] text-white" /></div>
              <div className="flex-1"><div className="text-[14px] font-semibold text-gray-900">LP直案件</div><div className="text-[12px] text-gray-500 mt-0.5">相続ステーションから連携された面談設定済案件を選ぶ</div></div>
              <ChevronRight className="w-[18px] h-[18px] text-brand-400 flex-shrink-0" />
            </button>
            <button type="button" onClick={createOcDraft} disabled={creating} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg border border-gray-200 bg-gray-50/50 hover:bg-gray-50 transition text-left disabled:opacity-50">
              <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0"><Plus className="w-[18px] h-[18px] text-gray-500" /></div>
              <div className="flex-1"><div className="text-[14px] font-semibold text-gray-900">OC直・HP経由案件等</div><div className="text-[12px] text-gray-500 mt-0.5">{creating ? '作成中…' : '葬儀社・税理士・HP経由など新規案件を作成'}</div></div>
              <ChevronRight className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
            </button>
          </div>
        </div>
      ) : (
        <CaseSelectScreen cases={cases} onSelect={onSelectLp} />
      )}
    </div>
  )
}
