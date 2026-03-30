'use client'

import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  onEdit: () => void
}

export default function ClientTab({ caseData, onEdit }: Props) {
  const client = caseData.clients

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-3.5">
          {/* Client info */}
          <Section title="依頼者情報" icon="👤" onEdit={onEdit}>
            <FieldGrid>
              <Field label="氏名" value={client?.name} />
              <Field label="ふりがな" value={client?.furigana} />
              <Field label="郵便番号" value={client?.postal_code ? `〒${client.postal_code}` : null} mono />
              <Field label="続柄" value={client?.relationship_to_deceased} />
              <FieldFull label="住所" value={client?.address} />
              <Field label="TEL" value={client?.phone} mono />
              <Field label="メール" value={client?.email} mono />
            </FieldGrid>
          </Section>

          {/* Deceased info */}
          <Section title="被相続人情報" icon="⚰️" onEdit={onEdit}>
            <FieldGrid>
              <Field label="氏名" value={caseData.deceased_name} />
              <Field label="相続開始日" value={caseData.date_of_death} mono />
            </FieldGrid>
          </Section>
        </div>
        <div />
      </div>

      {/* Heir table - placeholder */}
      <div className="mt-3.5">
        <Section title="相続人一覧" icon="👨‍👩‍👧‍👦">
          <div className="text-sm text-gray-400 text-center py-6">
            相続人データは今後の機能追加で表示されます
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, icon, children, onEdit }: { title: string; icon: string; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-[13px] font-semibold text-gray-900 flex-1">{title}</h3>
        {onEdit && (
          <button
            onClick={onEdit}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition"
          >
            ✏️ 編集
          </button>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-0">{children}</div>
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      <div className={`text-[13px] ${mono ? 'font-mono' : ''} ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
        {value ?? '未設定'}
      </div>
    </div>
  )
}

function FieldFull({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="py-1.5 border-b border-gray-50 col-span-2">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      <div className={`text-[13px] ${value ? 'text-gray-700 font-medium' : 'text-gray-300 italic text-xs'}`}>
        {value ?? '未設定'}
      </div>
    </div>
  )
}
