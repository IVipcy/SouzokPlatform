import type { ContractDocumentRow } from '@/types'

/**
 * 調査テーブルの先頭に差し込む「契約時にお客様から受領済み」の行（依頼者取得分）。
 * contract_documents（区分で絞った分）を、調査表と同じ表の中に受領済として並べることで、
 * 同じ書類を改めて請求行として二重登録しないようにする。編集は契約手続きタブ。
 */
export default function ContractReceivedRows({ docs, colSpan }: { docs: ContractDocumentRow[]; colSpan: number }) {
  const rows = docs.filter(d => d.status !== '不要')
  if (rows.length === 0) return null
  return (
    <>
      {rows.map(d => (
        <tr key={`cd-${d.id}`} className="bg-emerald-50/40 border-b border-emerald-100">
          <td colSpan={colSpan} className="px-2.5 py-1.5">
            <div className="flex items-center gap-2 text-[12px] flex-wrap">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">契約時受領</span>
              <span className="font-medium text-gray-800">{d.name || '（名称未設定）'}</span>
              {d.arrival_date
                ? <span className="text-emerald-700 font-semibold">受領済 <span className="font-mono">{d.arrival_date}</span></span>
                : <span className="text-amber-600">未受領</span>}
              <span className="ml-auto text-[11px] text-gray-400">依頼者取得・契約手続きタブで編集（再請求不要）</span>
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}
