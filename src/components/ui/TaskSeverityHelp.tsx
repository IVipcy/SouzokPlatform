'use client'

// タスクの色（4段階）の説明。バナーと業務タブの両方から使うので、文章はここ1か所だけ。
// 判定そのものは src/lib/taskSeverity.ts にある。しきい値もそこから読むので、
// 基準を変えたときに説明だけ古いまま残ることはない。

import {
  SEVERITY_TAB, SEVERITY_LABEL, TAB_THRESHOLDS, severityRangeText, type TaskSeverity,
} from '@/lib/taskSeverity'

const ORDER: TaskSeverity[] = ['blue', 'green', 'orange', 'red']

/** 4段階の意味（色そのものの説明）。バナーのヘルプで使う。 */
export function SeverityLegend() {
  return (
    <span className="block">
      <span className="block mb-1.5">色は期限をどれだけ過ぎたかで決まります。</span>
      {ORDER.map(sev => (
        <span key={sev} className="flex items-center gap-1.5 py-0.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-none ${SEVERITY_TAB[sev].dot}`} />
          <span className={`font-bold flex-1 ${SEVERITY_TAB[sev].text}`}>{SEVERITY_LABEL[sev]}</span>
          <span className="text-gray-400 flex-none">
            {sev === 'orange' ? '要確認バナー' : sev === 'red' ? '要注意バナー' : '—'}
          </span>
        </span>
      ))}
      <span className="block mt-1.5 text-gray-500">
        急ぎ・超急ぎのタスクは日数にかかわらず「大幅遅れ・急ぎ」になります。
      </span>
    </span>
  )
}

/** タブごとのしきい値の表。何営業日で色が上がるかは業務によって違う。 */
export function TabThresholdTable() {
  return (
    <span className="block">
      <span className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2.5 gap-y-0.5 items-center">
        <span className="text-[11px] text-gray-500">タブ</span>
        {(['green', 'orange', 'red'] as TaskSeverity[]).map(sev => (
          <span key={sev} className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full flex-none ${SEVERITY_TAB[sev].dot}`} />
            <span className={SEVERITY_TAB[sev].text}>{SEVERITY_LABEL[sev]}</span>
          </span>
        ))}
        {TAB_THRESHOLDS.map(({ tab, th }) => (
          <TabRow key={tab} tab={tab} th={th} />
        ))}
      </span>
      <span className="block mt-1.5 text-gray-500">
        日数は超過した営業日数（日曜と祝日を除く／土曜は営業日）。
        表に無い分（期限内〜{TAB_THRESHOLDS[1].th.green - 1}営業日超過）が「期限内」です。
      </span>
    </span>
  )
}

function TabRow({ tab, th }: { tab: string; th: typeof TAB_THRESHOLDS[number]['th'] }) {
  const cell = (sev: TaskSeverity) => severityRangeText(th, sev).replace('営業日超過〜', '日〜').replace('営業日超過', '日')
  return (
    <>
      <span className="text-[11.5px] text-gray-700 whitespace-nowrap">{tab}</span>
      <span className="text-[11.5px] tabular-nums text-right">{cell('green')}</span>
      <span className="text-[11.5px] tabular-nums text-right">{cell('orange')}</span>
      <span className="text-[11.5px] tabular-nums text-right">{cell('red')}</span>
    </>
  )
}

/** 業務タブの「?」の中身。数字の数え方と色の意味とタブごとのしきい値。 */
export function TaskTabHelp() {
  return (
    <span className="block">
      <span className="block mb-1.5">
        数字は<b className="font-bold text-gray-900">着手OK</b>の件数です。いま手をつけられるタスクだけで、
        対応中と完了は数えません。
      </span>
      <span className="block mb-2.5 text-gray-500">
        タブの色は、そのタブで<b className="font-bold text-gray-700">いちばん遅れているタスク</b>の色です。
        タブ名・件数も同じ色になります。
      </span>
      <SeverityLegend />
      <span className="block mt-2.5 mb-1 font-bold text-gray-900">タブごとの日数</span>
      <TabThresholdTable />
      <span className="block mt-2.5 text-gray-500">
        上の「遅れ」「優先度」の絞り込みは、どのタブでも同じように効きます。
        タブを切り替えても外れないので、業務をまたいで同じ条件で見られます。
      </span>
    </span>
  )
}
