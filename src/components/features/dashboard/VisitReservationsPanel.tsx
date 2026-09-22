'use client'

// 事務管理ダッシュボード → タスク → 金融資産調査 の中の「来店予約一覧」。
// Google スプレッドシート（来店カレンダー）の行を出し、「来店準備完了」で案件の金融財産調査タブ（該当銀行）へ飛ぶ。
// 押した行はシステム側で覚えて一覧から消す（シートは書き換えない）。右上にシートを開くボタンと設定。

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Settings, CalendarDays, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { VISIT_COLUMNS, VISITS_SHEET_URL_KEY, VISITS_COLUMNS_KEY, type VisitData, type VisitColumns, type VisitRow } from '@/lib/visitReservations'

export default function VisitReservationsPanel({ data, today, currentMemberId }: {
  data: VisitData
  today: string
  currentMemberId: string | null
}) {
  const router = useRouter()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const complete = async (r: VisitRow) => {
    setBusyKey(r.key)
    const { error } = await createClient().from('visit_reservations_done').upsert({ row_key: r.key, case_id: r.caseId, done_by: currentMemberId }, { onConflict: 'row_key' })
    setBusyKey(null)
    if (error) { showToast(`記録に失敗: ${error.message}`, 'error'); return }
    if (r.caseId) {
      router.push(`/cases/${r.caseId}?tab=assets&focus=${encodeURIComponent(r.bank)}`)
    } else {
      showToast('案件が見つからないので一覧から消しただけです', 'success')
      router.refresh()
    }
  }

  const head = 'px-3 py-2 text-left text-[12px] font-bold text-gray-600 tracking-wider bg-gray-50 border-b border-gray-300'
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <CalendarDays className="w-4 h-4 text-brand-600" />
        <span className="text-[13px] font-semibold text-brand-900">来店予約一覧</span>
        <span className="text-[11.5px] text-gray-400">来店カレンダー（スプレッドシート）の行。「来店準備完了」を押すと該当銀行のページへ移り、この一覧から消えます</span>
        <div className="ml-auto flex items-center gap-1.5">
          {data.sheetUrl && (
            <a href={data.sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-8 px-3 text-[12.5px] font-semibold text-brand-700 bg-white border border-brand-300 hover:bg-brand-50">
              <ExternalLink className="w-3.5 h-3.5" />シートを開く
            </a>
          )}
          <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-1 h-8 px-3 text-[12.5px] font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50">
            <Settings className="w-3.5 h-3.5" />設定
          </button>
        </div>
      </div>

      {!data.configured ? (
        <div className="border border-dashed border-gray-300 px-4 py-8 text-center text-[13px] text-gray-500">
          来店カレンダーのシートがまだ設定されていません。右上の「設定」で、シートの URL（リンクを知っている全員が閲覧可）を入れてください。
        </div>
      ) : data.error ? (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />
          <span>{data.error}</span>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={head}>来店日</th>
                <th className={head}>案件名</th>
                <th className={head}>案件番号</th>
                <th className={head}>依頼者名</th>
                <th className={head}>金融機関名</th>
                <th className={`${head} w-40`}></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">準備待ちの来店予約はありません</td></tr>
              ) : data.rows.map(r => {
                const past = !!r.visitDateIso && r.visitDateIso < today
                const isToday = r.visitDateIso === today
                return (
                  <tr key={r.key} className={`border-b border-gray-100 last:border-b-0 ${isToday ? 'bg-amber-50/60' : past ? 'bg-red-50/40' : ''}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-gray-800">{r.visitDate || <span className="text-gray-300">—</span>}{isToday && <span className="ml-1.5 text-[10.5px] font-bold text-amber-700">今日</span>}{past && <span className="ml-1.5 text-[10.5px] font-bold text-red-600">過ぎています</span>}</td>
                    <td className="px-3 py-2.5 text-gray-800">{r.caseName || r.dealName || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-gray-600">{r.caseNumber || '—'}{r.caseNumber && !r.caseId && <span className="ml-1.5 text-[10.5px] text-red-600">案件なし</span>}</td>
                    <td className="px-3 py-2.5 text-gray-800">{r.clientName || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-800 font-medium">{r.bank || '—'}</td>
                    <td className="px-3 py-2">
                      <Button variant="primary" size="sm" onClick={() => void complete(r)} loading={busyKey === r.key} title={r.caseId ? '該当銀行のページへ移って準備書類を作ります。この行は一覧から消えます' : '案件番号に当たる案件がありません。押すと一覧から消すだけです'}>
                        来店準備完了
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {settingsOpen && <VisitSettingsModal data={data} currentMemberId={currentMemberId} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); router.refresh() }} />}
    </div>
  )
}

function VisitSettingsModal({ data, currentMemberId, onClose, onSaved }: { data: VisitData; currentMemberId: string | null; onClose: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState(data.sheetUrl)
  const [cols, setCols] = useState<VisitColumns>(data.columns)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    const supabase = createClient()
    const now = new Date().toISOString()
    const { error } = await supabase.from('app_settings').upsert([
      { key: VISITS_SHEET_URL_KEY, value: url.trim(), updated_at: now, updated_by: currentMemberId },
      { key: VISITS_COLUMNS_KEY, value: JSON.stringify(Object.fromEntries(Object.entries(cols).filter(([, v]) => (v ?? '').trim()))), updated_at: now, updated_by: currentMemberId },
    ], { onConflict: 'key' })
    setSaving(false)
    if (error) { showToast(`保存に失敗: ${error.message}`, 'error'); return }
    showToast('設定を保存しました', 'success')
    onSaved()
  }
  const inp = 'input-flat w-full px-2.5 py-1.5 text-[13.5px] text-gray-800 outline-none'
  return (
    <Modal isOpen onClose={onClose} title="来店予約一覧の設定" maxWidth="max-w-xl"
      footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>キャンセル</Button><Button variant="primary" onClick={() => void save()} loading={saving}>保存</Button></>}>
      <div className="space-y-4 text-[13px]">
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1">スプレッドシートの URL</label>
          <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0" className={inp} />
          <p className="mt-1 text-[11.5px] text-gray-500">ブラウザのアドレス欄の URL をそのまま貼ってください（開いているタブ＝gid のシートを読みます）。シートの共有は「リンクを知っている全員が閲覧可」にしてください。API キーは要りません。</p>
        </div>
        <div>
          <div className="text-[12px] font-semibold text-gray-600 mb-1">列の指定（空欄＝見出しの文字から自動）</div>
          <p className="mb-1.5 text-[11.5px] text-gray-500">自動で見つからないときだけ、見出しの文字（例：金融機関）か列記号（例：D）を入れてください。{data.headers.length > 0 && <>いまの見出し：{data.headers.filter(Boolean).map(h => `「${h}」`).join('')}</>}</p>
          <div className="grid grid-cols-[7rem_1fr] gap-y-1.5 gap-x-3 items-center">
            {VISIT_COLUMNS.map(c => (
              <div key={c.key} className="contents">
                <span className="text-gray-700">{c.label}</span>
                <input type="text" value={cols[c.key] ?? ''} onChange={e => setCols(prev => ({ ...prev, [c.key]: e.target.value }))}
                  placeholder={data.detected[c.key] ? `自動：「${data.detected[c.key]}」` : '見出しの文字 か 列記号'} className={inp} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
