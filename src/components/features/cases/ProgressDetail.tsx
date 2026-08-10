'use client'

// 進捗サマリーの明細表示。
//
// 上に「いま何が遅れていて、何を待っていて、何を対応中か」を中身つきで並べ、
// 下に業務ごとの明細（戸籍は誰の分、金融は銀行ごと、不動産は市区町村ごと）を出す。
// 各表の上に文章のサマリーは置かない（表がすぐ下にあるので重複するため）。

import { AlertTriangle, Clock, Play } from 'lucide-react'
import { STAND_LABEL, type ProgressDetail as Detail, type DetailSection, type Stand } from '@/lib/caseProgressDetail'

const STAND_CLS: Record<Stand, string> = {
  late: 'bg-red-100 text-red-700',
  wait: 'bg-sky-100 text-sky-700',
  prog: 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-700',
  todo: 'bg-gray-100 text-gray-500',
}

export default function ProgressDetail({ detail }: { detail: Detail }) {
  return (
    <div className="space-y-3.5">
      <SummaryCard detail={detail} />
      {detail.sections.map(s => <SectionTable key={s.key} section={s} />)}
    </div>
  )
}

// 上部：件数だけでなく中身まで出す。件数だけだと結局どれか探しに行くことになるため。
function SummaryCard({ detail }: { detail: Detail }) {
  const { late, waiting, doing, todoCount } = detail
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3.5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Bucket
          icon={<AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.25} />}
          tone="late" title="遅れ" count={late.length} empty="期限を過ぎているタスクはありません">
          {late.slice(0, 6).map(t => (
            <li key={t.id} className="flex items-baseline gap-1.5">
              <span className="flex-1 truncate">{t.title}</span>
              <span className="flex-none text-[11px] text-red-700 tabular-nums">{t.days}営業日超過</span>
            </li>
          ))}
          {late.length > 6 && <li className="text-[11px] text-gray-400">ほか {late.length - 6} 件</li>}
        </Bucket>

        <Bucket
          icon={<Clock className="w-3.5 h-3.5" strokeWidth={2.25} />}
          tone="wait" title="待ち" count={waiting.length} empty="相手待ちのものはありません">
          {waiting.slice(0, 6).map((w, i) => (
            <li key={i} className="flex items-baseline gap-1.5">
              <span className="flex-none text-[11px] text-gray-400">{w.section}</span>
              <span className="flex-1 truncate">{w.label}</span>
              <span className="flex-none text-[11px] text-sky-700">{w.note}</span>
            </li>
          ))}
          {waiting.length > 6 && <li className="text-[11px] text-gray-400">ほか {waiting.length - 6} 件</li>}
        </Bucket>

        <Bucket
          icon={<Play className="w-3.5 h-3.5" strokeWidth={2.25} />}
          tone="prog" title="対応中" count={doing.length} empty="対応中のタスクはありません">
          {doing.slice(0, 6).map((d, i) => (
            <li key={i} className="flex items-baseline gap-1.5">
              <span className="flex-none text-[11px] text-gray-400">{d.section}</span>
              <span className="flex-1 truncate">{d.label}</span>
            </li>
          ))}
          {doing.length > 6 && <li className="text-[11px] text-gray-400">ほか {doing.length - 6} 件</li>}
        </Bucket>
      </div>
      <p className="mt-2.5 text-[11px] text-gray-400">
        未着手のタスクは {todoCount} 件です。「遅れ」はタスクの期限を過ぎたもの、「待ち」は請求済・確認依頼中・調査禁止期間中など、こちらの手が離れているものです。
      </p>
    </div>
  )
}

const BUCKET_HEAD: Record<'late' | 'wait' | 'prog', string> = {
  late: 'text-red-700', wait: 'text-sky-700', prog: 'text-amber-800',
}

function Bucket({ icon, tone, title, count, empty, children }: {
  icon: React.ReactNode
  tone: 'late' | 'wait' | 'prog'
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-gray-50/70 rounded-lg px-3 py-2.5 min-w-0">
      <div className={`flex items-center gap-1.5 mb-1.5 ${BUCKET_HEAD[tone]}`}>
        {icon}
        <span className="text-[12.5px] font-bold">{title}</span>
        <span className="text-[15px] font-bold tabular-nums">{count}</span>
      </div>
      {count === 0
        ? <p className="text-[11.5px] text-gray-400">{empty}</p>
        : <ul className="space-y-0.5 text-[12px] text-gray-700">{children}</ul>}
    </div>
  )
}

function SectionTable({ section }: { section: DetailSection }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3.5">
      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-gray-200 flex-wrap">
        <span className="inline-block w-1 h-4 bg-brand-600 rounded-full" />
        <span className="text-[13px] font-bold text-gray-900">{section.title}</span>
        <span className="text-[11px] text-gray-400">{section.rows.length}件</span>
        {section.overdue.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700"
            title={section.overdue.map(o => `${o.title}（${o.days}営業日超過）`).join('\n')}>
            <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />期限超過 {section.overdue.length}件
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
              {section.columns.map(c => <th key={c} className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">{c}</th>)}
              <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap w-44">状態</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map(r => (
              <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                {r.cells.map((c, i) => (
                  <td key={i} className="px-2.5 py-2 text-gray-700 align-top">
                    {c ? <span className={i === 0 ? 'font-medium text-gray-800' : ''}>{c}</span> : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="px-2.5 py-2 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STAND_CLS[r.stand]}`}>{STAND_LABEL[r.stand]}</span>
                  {r.note && <span className="ml-1.5 text-[11px] text-gray-500">{r.note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
