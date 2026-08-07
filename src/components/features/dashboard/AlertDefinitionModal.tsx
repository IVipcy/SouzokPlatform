'use client'

// 「アラート定義」ポップアップ。要確認/要注意バナーの横のリンクから開く。
// 中身は src/lib/alertRules.ts の ALERT_CATALOG を描いているだけなので、
// 判定のしきい値を変えればこの画面の説明も自動で追従する（資料と画面がずれない）。

import Modal from '@/components/ui/Modal'
import { ALERT_CATALOG, type AlertSeverity } from '@/lib/alertRules'

const DOT: Record<AlertSeverity, string> = {
  claim: 'bg-purple-500',
  high: 'bg-red-500',
  mid: 'bg-amber-500',
  info: 'bg-sky-500',
}

const LEGEND: Array<{ sev: AlertSeverity; label: string }> = [
  { sev: 'claim', label: 'クレーム' },
  { sev: 'high', label: '要注意バナー' },
  { sev: 'mid', label: '要確認バナー' },
  { sev: 'info', label: 'ベルのみ' },
]

export default function AlertDefinitionModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="アラートが出る条件" maxWidth="max-w-2xl">
      <div className="space-y-3.5">
        <p className="text-[12.5px] text-gray-600">営業日＝日曜と祝日を除く日。土曜は営業日です。</p>

        {/* 色の意味を先に。ここが分かれば、下の表は色を見るだけで済む。 */}
        <div className="grid grid-cols-4 gap-1.5">
          {LEGEND.map(l => (
            <div key={l.sev} className="border border-gray-200 rounded-lg p-2 text-center">
              <span className={`inline-block w-2.5 h-2.5 rounded-sm ${DOT[l.sev]}`} />
              <div className="text-[11.5px] text-gray-600 mt-1">{l.label}</div>
            </div>
          ))}
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-[12px] border-collapse">
            <tbody>
              {ALERT_CATALOG.map(g => (
                <>
                  <tr key={g.group} className="bg-gray-50 border-b border-gray-200">
                    <td colSpan={3} className="px-2.5 py-1.5 text-[11.5px] text-gray-500">{g.group}</td>
                  </tr>
                  {g.items.map(it => (
                    <tr key={g.group + it.label} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-2.5 py-1.5 w-7"><span className={`inline-block w-2 h-2 rounded-sm ${DOT[it.severity]}`} /></td>
                      <td className="px-2.5 py-1.5 text-gray-800 whitespace-nowrap">{it.label}</td>
                      <td className="px-2.5 py-1.5 text-gray-500">{it.when}</td>
                    </tr>
                  ))}
                </>
              ))}
              <tr className="bg-gray-50 border-y border-gray-200">
                <td colSpan={3} className="px-2.5 py-1.5 text-[11.5px] text-gray-500">案件の色</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-2.5 py-2 text-[12px] text-gray-600">
                  その案件に出ているアラートで<strong className="text-gray-800">一番重い色</strong>が、そのまま案件の色になります（紫 ＞ 赤 ＞ 黄 ＞ 青）。
                  何も出ていなければ青。何が赤くしているかは案件詳細のバッジに出ます。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
