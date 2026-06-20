import type { RelatedTask } from '@/lib/relatedTasks'

/** 取得物の行に紐づく関連タスクをチップで表示（0〜複数）。受信簿の到着物→タスク多対多。 */
export default function RelatedTaskChips({ tasks }: { tasks: RelatedTask[] }) {
  if (tasks.length === 0) return <span className="text-gray-300 text-[11px]">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {tasks.map(t => (
        <a
          key={t.id}
          href={`/tasks/${t.id}`}
          title={t.title}
          className="inline-flex items-center max-w-[140px] px-1.5 py-0.5 rounded text-[11px] font-medium text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100"
        >
          <span className="truncate">{t.title}</span>
        </a>
      ))}
    </div>
  )
}
