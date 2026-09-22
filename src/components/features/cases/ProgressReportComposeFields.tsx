'use client'

// 案件報告（progress_check）を書く側の共通部品。案件詳細の作成ウィンドウとマイページの報告モーダルで同じものを出す。
//   案件の現状（フェーズ＝選択／最終連絡日・完了予定日＝案件の値をそのまま。ここでは直せない）
//   状態（順調／確認事項あり／相談・対応依頼／要至急対応）
//   報告内容（任意）
//   次回報告までの対応（ネクストアクション・担当者・対応期日。タスクにはしない。空でも報告できる）

import { PROGRESS_REPORT_PHASES, PROGRESS_REPORT_STATES, PROGRESS_REPORT_STATE_URGENT, reportStateChip } from '@/lib/constants'
import type { MemberRow } from '@/types'

export type ProgressReportDraft = {
  phase: string
  state: string
  point: string
  nextAction: string
  nextAssigneeId: string
  nextDue: string
}
export const emptyProgressReportDraft = (assigneeId: string | null): ProgressReportDraft => ({
  phase: '', state: PROGRESS_REPORT_STATES[0], point: '', nextAction: '', nextAssigneeId: assigneeId ?? '', nextDue: '',
})

const jp = (d: string | null | undefined) => {
  if (!d) return '—'
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : d
}

export default function ProgressReportComposeFields({ value, onChange, lastContactDate, expectedCompletionDate, allMembers, currentMemberId }: {
  value: ProgressReportDraft
  onChange: (patch: Partial<ProgressReportDraft>) => void
  /** 報告時点の値（案件から）。null＝未入力 */
  lastContactDate: string | null
  expectedCompletionDate: string | null
  allMembers: MemberRow[]
  currentMemberId: string | null
}) {
  const inp = 'w-full text-[13px] border border-gray-200 px-3 py-2 bg-white focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400'
  const ro = 'w-full text-[13px] border border-gray-200 px-3 py-2 bg-gray-50 text-gray-700'
  const members = [...allMembers].sort((a, b) => (a.id === currentMemberId ? -1 : b.id === currentMemberId ? 1 : a.name.localeCompare(b.name, 'ja')))
  return (
    <>
      <div className="border border-gray-200 bg-gray-50/70 px-3 py-2.5">
        <div className="text-[13px] font-semibold text-gray-700 mb-2">案件の現状</div>
        <div className="grid grid-cols-[6.5rem_1fr] gap-y-2 gap-x-3 items-center text-[13px]">
          <span className="text-gray-600">フェーズ</span>
          <select value={value.phase} onChange={e => onChange({ phase: e.target.value })} className={inp}>
            <option value="">フェーズを選択</option>
            {PROGRESS_REPORT_PHASES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="text-gray-600">最終連絡日</span>
          <span className={ro} title="依頼者連絡タブの最新の連絡日">{jp(lastContactDate)}</span>
          <span className="text-gray-600">完了予定日</span>
          <span className={ro} title="案件管理タブの完了予定日">{jp(expectedCompletionDate)}</span>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">最終連絡日・完了予定日は案件の値です。ここでは直せません（報告した時点の値が報告に残ります）。</p>
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-gray-600 mb-1">状態</label>
        <div className="grid grid-cols-2 gap-1.5">
          {PROGRESS_REPORT_STATES.map(s => {
            const on = value.state === s
            return (
              <button key={s} type="button" onClick={() => onChange({ state: s })}
                className={`px-2 py-2 text-[12.5px] font-semibold border-[1.5px] transition-colors ${on ? reportStateChip(s) + ' ring-2 ring-offset-1 ' + (s === PROGRESS_REPORT_STATE_URGENT ? 'ring-red-300' : 'ring-brand-200') : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                {s}
              </button>
            )
          })}
        </div>
        {value.state === PROGRESS_REPORT_STATE_URGENT && (
          <p className="text-[11px] text-red-600 mt-1.5 flex items-center gap-1"><span className="font-bold">⚠</span>「要至急対応」は受注担当の要注意バナー（赤）に表示されます。</p>
        )}
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-gray-600 mb-1">報告内容 <span className="font-normal text-gray-400">（任意）</span></label>
        <textarea value={value.point} onChange={e => onChange({ point: e.target.value })} placeholder="共有事項や確認してほしい内容を入力" rows={4}
          className={`${inp} resize-y`} />
      </div>

      <div className="border border-brand-200 bg-brand-50/40 px-3 py-2.5">
        <div className="text-[13px] font-bold text-brand-800 mb-2">次回報告までの対応</div>
        <label className="block text-[12px] font-semibold text-gray-600 mb-1">ネクストアクション</label>
        <input type="text" value={value.nextAction} onChange={e => onChange({ nextAction: e.target.value })} placeholder="例：相続人へ不足書類を案内" className={inp} />
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">担当者</label>
            <select value={value.nextAssigneeId} onChange={e => onChange({ nextAssigneeId: e.target.value })} className={inp}>
              <option value="">未定</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}{m.id === currentMemberId ? '（自分）' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">対応期日</label>
            <input type="date" value={value.nextDue} onChange={e => onChange({ nextDue: e.target.value })} className={inp} />
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">ここではタスクにしません。受注担当が確認するときに「ネクストアクションの追加」でタスクにできます。空でも報告できます。</p>
      </div>
    </>
  )
}
