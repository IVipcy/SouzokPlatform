'use client'

import { useState } from 'react'
import { ClipboardList, MessageSquare, Sparkles } from 'lucide-react'
import MyPageCasesTab, { type MyCaseRow } from '@/components/features/my/MyPageCasesTab'
import ConsultationCasesTable, { type ConsultCase } from '@/components/features/my/ConsultationCasesTable'
import ReferralCasesTable, { type ReferralRow } from '@/components/features/my/ReferralCasesTable'

type View = 'manage' | 'consult' | 'referral'

type Props = {
  managerRows: MyCaseRow[]
  consultRows: ConsultCase[]
  referralRows: ReferralRow[]
}

/**
 * 案件管理(/cases)の表示切替。
 * マイページで定義済みの3つの一覧（管理案件一覧 / 相談案件一覧 / 個別管理案件）の表示項目をそのまま流用する。
 */
export default function CaseViewsClient({ managerRows, consultRows, referralRows }: Props) {
  const [view, setView] = useState<View>('manage')

  const tabs: { key: View; label: string; Icon: typeof ClipboardList; count: number }[] = [
    { key: 'manage', label: '管理案件一覧', Icon: ClipboardList, count: managerRows.length },
    { key: 'consult', label: '相談案件一覧', Icon: MessageSquare, count: consultRows.length },
    { key: 'referral', label: '個別管理案件', Icon: Sparkles, count: referralRows.length },
  ]

  return (
    <div>
      <div className="flex gap-1 mb-4 border-b border-gray-200 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
              view === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
            }`}
          >
            <t.Icon className="w-4 h-4" strokeWidth={view === t.key ? 2.25 : 1.75} />
            {t.label}
            <span className={`text-[12px] font-mono ml-0.5 ${view === t.key ? 'opacity-80' : 'opacity-50'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {view === 'manage' && <MyPageCasesTab memberId="" cases={managerRows} />}
      {view === 'consult' && <ConsultationCasesTable cases={consultRows} />}
      {view === 'referral' && <ReferralCasesTable cases={referralRows} />}
    </div>
  )
}
