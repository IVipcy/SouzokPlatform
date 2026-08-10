'use client'

// タスクの色（4段階）の説明。バナーと業務タブの両方から使うので、文章はここ1か所だけ。
// 判定そのものは src/lib/taskSeverity.ts にある。しきい値もそこから読むので、
// 基準を変えたときに説明だけ古いまま残ることはない。

import {
  SEVERITY_TAB, SEVERITY_LABEL, THRESHOLDS_ASSETS, THRESHOLDS_HEIRS,
  severityRangeText, type TaskSeverity,
} from '@/lib/taskSeverity'

const ORDER: TaskSeverity[] = ['blue', 'green', 'orange', 'red']

export function SeverityLegend() {
  return (
    <span className="block">
      <span className="block mb-1.5">
        色は期限をどれだけ過ぎたかで決まります。何日で色が上がるかは業務ごとに違います。
      </span>
      <span className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-0.5 items-center">
        <span />
        <span className="text-[11px] text-gray-500">相続人調査</span>
        <span className="text-[11px] text-gray-500">財産調査・遺産分割・ほか</span>
        {ORDER.map(sev => (
          <SeverityRow key={sev} sev={sev} />
        ))}
      </span>
      <span className="block mt-1.5 text-gray-500">
        オレンジは要確認バナー、赤は要注意バナーに出ます。
        急ぎ・超急ぎのタスクは日数にかかわらず要注意バナーに出ます。
      </span>
      <span className="block mt-1 text-gray-500">
        営業日は日曜と祝日を除きます（土曜は営業日）。
      </span>
    </span>
  )
}

function SeverityRow({ sev }: { sev: TaskSeverity }) {
  return (
    <>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className={`w-1.5 h-1.5 rounded-full flex-none ${SEVERITY_TAB[sev].dot}`} />
        <span className={`font-bold ${SEVERITY_TAB[sev].text}`}>{SEVERITY_LABEL[sev]}</span>
      </span>
      <span className="text-[11.5px]">{severityRangeText(THRESHOLDS_HEIRS, sev)}</span>
      <span className="text-[11.5px]">{severityRangeText(THRESHOLDS_ASSETS, sev)}</span>
    </>
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
      <span className="block mt-2.5 text-gray-500">
        上の「遅れ」「優先度」の絞り込みは、どのタブでも同じように効きます。
        タブを切り替えても外れないので、業務をまたいで同じ条件で見られます。
      </span>
    </span>
  )
}
