import type { ContractDocumentRow } from '@/types'

/**
 * 調査表の「上」に置く、契約時にお客様から受領済み（依頼者取得分）の参照ブロック。
 * 新規に自社で請求する行とは表を分けて表示し、同じ書類を請求行として二重登録しないための参照に使う。
 * 編集は契約手続きタブ（再請求不要）。区分（戸籍/金融/不動産）で絞った contract_documents を渡す。
 */
export default function ContractReceivedBlock({ docs }: { docs: ContractDocumentRow[] }) {
  const rows = docs.filter(d => d.status !== '不要')
  if (rows.length === 0) return null
  return (
    <div className="mb-2.5 rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-[11px] font-bold text-emerald-700">事前に受領済み（依頼者取得・契約時）</span>
        <span className="ml-auto text-[10px] text-gray-400">契約手続きタブで編集（再請求不要）</span>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map(d => (
          <div key={`cd-${d.id}`} className="flex items-center gap-2 text-[12px] flex-wrap">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">契約時受領</span>
            <span className="font-medium text-gray-800">{d.name || '（名称未設定）'}</span>
            {d.arrival_date
              ? <span className="text-emerald-700 font-semibold">受領済 <span className="font-mono">{d.arrival_date}</span></span>
              : <span className="text-amber-600">未受領</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
