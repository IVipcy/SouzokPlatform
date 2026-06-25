import type { ContractDocumentRow } from '@/types'
import ContractDocFileCell from './ContractDocFileCell'

/**
 * 調査表の「上」に置く、契約時にお客様から受領済み（依頼者取得分）の参照ブロック。
 * 新規に自社で請求する行とは表を分けて表示し、同じ書類を請求行として二重登録しないための参照に使う。
 * 編集は契約手続きタブ（再請求不要）。区分（戸籍/金融/不動産）で絞った contract_documents を渡す。
 * 受領済の書類にはスキャンPDF等を添付・参照できる（任意。原本のみのこともある）。
 */
export default function ContractReceivedBlock({ docs, caseId, onRefresh }: { docs: ContractDocumentRow[]; caseId?: string; onRefresh?: () => void }) {
  const rows = docs.filter(d => d.status !== '不要')
  if (rows.length === 0) return null
  return (
    <div className="mb-2.5 rounded border border-brand-100 bg-brand-50/50 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-[11.5px] font-semibold text-brand-800">事前に受領済み（依頼者取得・契約時）</span>
        <span className="ml-auto text-[10px] text-gray-400">契約手続きタブで編集（再請求不要）</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map(d => (
          <div key={`cd-${d.id}`} className="flex items-center gap-2 text-[12px] flex-wrap bg-white border border-gray-100 rounded px-2.5 py-1.5">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-100 text-brand-800">契約時受領</span>
            <span className="font-medium text-gray-800">{d.name || '（名称未設定）'}</span>
            {d.arrival_date
              ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />受領済 <span className="font-mono">{d.arrival_date}</span></span>
              : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />未受領</span>}
            {caseId && (
              <span className="ml-1">
                <ContractDocFileCell caseId={caseId} docId={d.id} filePath={d.file_path} fileBucket={d.file_bucket} fileName={d.file_name} onChanged={onRefresh} />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
