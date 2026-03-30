'use client'

import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
}

export default function DivisionTab({ caseData }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-3.5">
        {/* Division policy */}
        <Section title="遺産分割" icon="⚖️">
          <div className="text-sm text-gray-400 text-center py-6">
            遺産分割情報は今後の機能追加で表示されます
          </div>
        </Section>

        {/* Will */}
        <Section title="遺言" icon="📜">
          <div className="text-sm text-gray-400 text-center py-6">
            遺言情報は今後の機能追加で表示されます
          </div>
        </Section>
      </div>

      <div className="space-y-3.5">
        {/* Division detail */}
        <Section title="分割内容" icon="📊">
          <div className="text-sm text-gray-400 text-center py-6">
            分割内容は今後の機能追加で表示されます
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
