'use client'

import Link from 'next/link'
import { Lightbulb, ExternalLink } from 'lucide-react'
import { taskKeywordHint } from '@/lib/taskKeywordHint'

// フリータスク作成の入力に「本来は実務タブの行で管理すべき作業」のキーワードが入ったとき、
// やんわり実務タブへ誘導する（強制しない）。title が該当しなければ何も描画しない。
export default function TaskKeywordNudge({ title, caseId }: { title: string; caseId?: string | null }) {
  const hint = taskKeywordHint(title)
  if (!hint) return null
  return (
    <div className="mt-2 rounded-md bg-brand-50 border border-brand-200 px-3 py-2">
      <div className="text-[12px] font-semibold text-brand-700 flex items-center gap-1.5">
        <Lightbulb className="w-3.5 h-3.5 flex-none" />これは「{hint.domain}」の実務タブで管理する作業かも
      </div>
      <div className="text-[11.5px] text-gray-600 mt-0.5 leading-relaxed">
        「{hint.matched}」などは、{hint.tabLabel}に行を足すと<strong>タスクが自動で作られて表とつながります</strong>（進捗・費用・W-Checkもそこで管理）。フリーで作ると行に紐づかない単独タスクになります。
      </div>
      {caseId && (
        <Link
          href={`/cases/${caseId}?tab=${hint.tab}`}
          className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-700 bg-white border border-brand-200 rounded px-2.5 py-1 hover:bg-brand-50"
        >
          {hint.tabLabel}を開く<ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}
