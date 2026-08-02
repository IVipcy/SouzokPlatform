'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PenSquare, Link2, Plus, ChevronRight, FileEdit, Clock } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import CaseSelectScreen from '@/app/(authenticated)/meeting/CaseSelectScreen'
import type { CaseData, SelectedCase } from '@/app/(authenticated)/meeting/MeetingPageClient'

// 入力途中の下書き（再開リスト用）
export type IntakeDraft = {
  id: string
  case_number: string
  deal_name: string | null
  updated_at: string | null
  created_at: string | null
  clients: { name: string | null } | null
}

type Props = { cases: CaseData[]; drafts: IntakeDraft[]; currentMemberId: string | null }
type RouteChoice = null | 'lp'

// 統合入力アプリの入口。ルート選択→ LP=面談設定済案件を選択（案件が確定）／OC=新規（下書き未作成）で面談シートへ。
// OCは案件をまだ作らず /intake/new へ。面談シートで最初の入力があった時点で遅延作成する（IntakeCaseClient）。
export default function IntakeEntryClient({ cases, drafts }: Props) {
  const router = useRouter()
  const [routeChoice, setRouteChoice] = useState<RouteChoice>(null)

  // LP案件を選んだら、その案件で入力を開始
  const onSelectLp = useCallback((c: SelectedCase) => {
    if (c?.id) router.push(`/intake/${c.id}`)
  }, [router])

  // OC直・HP経由：案件は作らず新規モードで面談シートへ（最初の入力で遅延作成）
  const startNew = useCallback(() => router.push('/intake/new'), [router])

  return (
    <div>
      <PageHeader
        eyebrow="Intake"
        title="面談登録"
        icon={PenSquare}
        description="① 面談シート入力 → ② 面談結果登録 → ③ オーダーシート入力"
        right={routeChoice ? (
          <button onClick={() => setRouteChoice(null)} className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">← 戻る</button>
        ) : null}
      />

      {!routeChoice ? (
        <div className="max-w-[480px] mx-auto mt-4">
          {/* 入力途中の下書き（再開） */}
          {drafts.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-1.5 mb-2">
                <FileEdit className="w-4 h-4 text-amber-500" strokeWidth={2} />
                <span className="text-[13px] font-bold text-gray-800">入力途中の面談シート</span>
                <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">{drafts.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {drafts.map(d => {
                  const name = d.clients?.name && d.clients.name !== '無題' ? d.clients.name : (d.deal_name && d.deal_name !== '無題' ? d.deal_name : '無題（未入力）')
                  const when = d.updated_at || d.created_at
                  return (
                    <button key={d.id} type="button" onClick={() => router.push(`/intake/${d.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] rounded-lg border border-amber-200 bg-amber-50/40 hover:bg-amber-50 active:bg-amber-100 transition text-left">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold text-gray-900 truncate">{name}</div>
                        <div className="text-[12px] text-gray-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3.5 h-3.5" />
                          {when ? new Date(when).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'} に更新
                        </div>
                      </div>
                      <span className="text-[12px] font-semibold text-amber-700 shrink-0">再開</span>
                      <ChevronRight className="w-5 h-5 text-amber-400 shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-3"><PenSquare className="w-6 h-6 text-brand-600" /></div>
            <h2 className="text-[16px] font-bold text-gray-900 mb-1">どの案件を入力しますか？</h2>
            <p className="text-[13px] text-gray-500">案件を確定してから、面談シートに進みます。</p>
          </div>
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => setRouteChoice('lp')} className="w-full flex items-center gap-3 px-5 py-5 min-h-[64px] rounded-xl border-2 border-brand-200 bg-brand-50/50 hover:bg-brand-50 active:bg-brand-100 transition text-left">
              <div className="w-11 h-11 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0"><Link2 className="w-5 h-5 text-white" /></div>
              <div className="flex-1"><div className="text-[15px] font-semibold text-gray-900">LP直案件</div><div className="text-[13px] text-gray-500 mt-0.5">相続ステーションから連携された面談設定済案件を選ぶ</div></div>
              <ChevronRight className="w-5 h-5 text-brand-400 flex-shrink-0" />
            </button>
            <button type="button" onClick={startNew} className="w-full flex items-center gap-3 px-5 py-5 min-h-[64px] rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-gray-50 active:bg-gray-100 transition text-left">
              <div className="w-11 h-11 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0"><Plus className="w-5 h-5 text-gray-500" /></div>
              <div className="flex-1"><div className="text-[15px] font-semibold text-gray-900">OC直・HP経由案件等</div><div className="text-[13px] text-gray-500 mt-0.5">葬儀社・税理士・HP経由など新規で面談シートを開始（入力するまで案件は作られません）</div></div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </button>
          </div>
        </div>
      ) : (
        <CaseSelectScreen cases={cases} onSelect={onSelectLp} />
      )}
    </div>
  )
}
