'use client'

// タスクの色（4段階）の説明。バナーと業務タブの両方から使うので、文章はここ1か所だけ。
// 判定そのものは src/lib/taskSeverity.ts にある。

import { SEVERITY_TAB, TASK_CHUI_BIZ_DAYS, type TaskSeverity } from '@/lib/taskSeverity'

const ROWS: Array<{ sev: TaskSeverity; label: string; cond: string; where: string }> = [
  { sev: 'red', label: '赤', cond: '急ぎ・超急ぎ', where: '要注意バナー' },
  { sev: 'amber', label: '黄', cond: `期限を${TASK_CHUI_BIZ_DAYS}営業日以上超過`, where: '要確認バナー' },
  { sev: 'green', label: '緑', cond: '期限を過ぎている', where: 'バナーには出ない' },
  { sev: 'blue', label: '青', cond: '期限内', where: '—' },
]

export function SeverityLegend() {
  return (
    <span className="block">
      <span className="block mb-1.5">タスクの色は、上から重い順に4段階です。</span>
      {ROWS.map(r => (
        <span key={r.sev} className="flex items-center gap-1.5 py-0.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-none ${SEVERITY_TAB[r.sev].dot}`} />
          <span className={`font-bold flex-none w-4 ${SEVERITY_TAB[r.sev].text}`}>{r.label}</span>
          <span className="flex-1">{r.cond}</span>
          <span className="text-gray-400 flex-none">{r.where}</span>
        </span>
      ))}
      <span className="block mt-1.5 text-gray-500">
        営業日は日曜と祝日を除きます（土曜は営業日）。
      </span>
    </span>
  )
}

/** 業務タブの「?」の中身。数字の数え方と色の意味。 */
export function TaskTabHelp() {
  return (
    <span className="block">
      <span className="block mb-1.5">
        数字は<b className="font-bold text-gray-900">着手OK</b>の件数です。いま手をつけられるタスクだけで、
        対応中と完了は数えません。
      </span>
      <span className="block mb-2.5 text-gray-500">
        受領待ちや前段が終わっていないタスクは、一覧にも数にも出ません。
      </span>
      <SeverityLegend />
      <span className="block mt-1.5 text-gray-500">
        タブの点は、そのタブでいちばん重いタスクの色です。
      </span>
    </span>
  )
}
