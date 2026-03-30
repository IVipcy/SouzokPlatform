'use client'

import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
}

export default function FinanceTab({ caseData }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-3.5">
        {/* Contract & fees */}
        <Section title="契約・報酬" icon="💴">
          <div className="text-sm text-gray-400 text-center py-6">
            契約・報酬情報は今後の機能追加で表示されます
          </div>
        </Section>

        {/* Additional revenue */}
        <Section title="付帯収益" icon="📈">
          <div className="text-sm text-gray-400 text-center py-6">
            付帯収益情報は今後の機能追加で表示されます
          </div>
        </Section>
      </div>

      <div className="space-y-3.5">
        {/* Revenue card */}
        <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg, #1E40AF, #2563EB)' }}>
          <div className="text-[10px] font-semibold opacity-70 tracking-wider uppercase mb-1.5">案件収益見込み</div>
          <div className="text-[26px] font-extrabold tracking-tight mb-2.5">
            {caseData.total_asset_estimate ? `¥${caseData.total_asset_estimate.toLocaleString()}` : '—'}
          </div>
        </div>

        {/* Partner fees */}
        <Section title="パートナー報酬" icon="🤝">
          <div className="text-sm text-gray-400 text-center py-6">
            パートナー報酬情報は今後の機能追加で表示されます
          </div>
        </Section>

        {/* Expenses */}
        <Section title="立替実費明細" icon="🧾">
          <div className="text-sm text-gray-400 text-center py-6">
            立替実費明細は今後の機能追加で表示されます
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}
