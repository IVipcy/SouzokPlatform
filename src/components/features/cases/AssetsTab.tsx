'use client'

import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  onEdit: () => void
}

export default function AssetsTab({ caseData, onEdit }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-3.5">
        {/* Real estate */}
        <Section title="不動産" icon="🏠" onEdit={onEdit}>
          <FieldGrid>
            <Field label="評価ランク">
              {caseData.property_rank && caseData.property_rank !== '確認中' ? (
                <span className="bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded font-extrabold text-sm inline-block mt-0.5">
                  {caseData.property_rank}
                </span>
              ) : (
                <span className="text-gray-300 italic text-xs">{caseData.property_rank ?? '未設定'}</span>
              )}
            </Field>
          </FieldGrid>
          <div className="text-xs text-gray-400 text-center py-4 mt-2 border-t border-gray-50">
            詳細な不動産情報は今後の機能追加で表示されます
          </div>
        </Section>

        {/* Financial assets */}
        <Section title="金融資産（預貯金）" icon="🏦">
          <div className="text-sm text-gray-400 text-center py-6">
            金融資産データは今後の機能追加で表示されます
          </div>
        </Section>

        {/* Securities */}
        <Section title="金融資産（証券）" icon="📈">
          <div className="text-sm text-gray-400 text-center py-6">
            証券データは今後の機能追加で表示されます
          </div>
        </Section>
      </div>

      <div className="space-y-3.5">
        {/* Asset summary */}
        <Section title="資産サマリー" icon="💰" onEdit={onEdit}>
          <QIRow label="資産合計概算">
            <span className="font-mono font-medium text-gray-700">
              {caseData.total_asset_estimate ? `¥${caseData.total_asset_estimate.toLocaleString()}` : '未設定'}
            </span>
          </QIRow>
          <QIRow label="相続税申告">
            {caseData.tax_filing_required ? (
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                caseData.tax_filing_required === '要'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : caseData.tax_filing_required === '不要'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {caseData.tax_filing_required}
              </span>
            ) : (
              <span className="text-gray-400">未設定</span>
            )}
          </QIRow>
          <QIRow label="申告期限">
            <span className={`font-mono ${caseData.tax_filing_deadline ? 'text-amber-600' : 'text-gray-400'}`}>
              {caseData.tax_filing_deadline ?? '未設定'}
            </span>
          </QIRow>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5 border-b border-gray-50">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      {children}
    </div>
  )
}

function QIRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-b-0 text-xs">
      <span className="text-gray-500">{label}</span>
      {children}
    </div>
  )
}
