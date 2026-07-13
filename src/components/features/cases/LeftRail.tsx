'use client'

// 左レール（縦リスト）共通部品。TOP＋各項目＋追加ボタンを縦に並べ、横並びの深いタブを置き換える。
import { Table2, Inbox, Trash2 } from 'lucide-react'
import { summaryStatusClass } from './ProgressSummary'
import type { ReactNode } from 'react'

export type RailItem = { key: string; label: string; status?: string | null; locked?: boolean; received?: boolean }

export function LeftRail({ items, active, onChange, extra, onDelete }: {
  items: RailItem[]
  active: string
  onChange: (key: string) => void
  extra?: ReactNode
  onDelete?: (key: string) => void  // 指定時、TOP以外の各グループにホバーで削除ボタンを表示
}) {
  return (
    <div className="flex-none w-40 flex flex-col gap-0.5 border-r border-gray-200 pr-2">
      {items.map(it => {
        const isItem = it.key !== 'top'
        const dim = isItem && it.received === false  // 受信判定がある項目で未受信なら控えめ
        return (
          <div key={it.key} className="group/rail relative flex items-center">
            <button type="button" onClick={() => onChange(it.key)}
              className={`flex-1 min-w-0 text-left text-[12px] px-2.5 py-1.5 rounded-md flex items-center gap-1.5 ${active === it.key ? 'bg-brand-50 text-brand-700 font-semibold' : `text-gray-600 hover:bg-gray-50 ${dim ? 'opacity-70' : ''}`}`}>
              {it.key === 'top'
                ? <Table2 className="w-3.5 h-3.5 flex-none" />
                : <span className={`w-1.5 h-1.5 rounded-full flex-none border ${summaryStatusClass(it.status)}`} />}
              <span className="truncate flex-1">{it.label}</span>
              {it.received === true && <Inbox className="w-3 h-3 flex-none text-emerald-600" aria-label="受信済" />}
            </button>
            {onDelete && isItem && (
              <button type="button" onClick={() => onDelete(it.key)} title="このグループを一括削除"
                className="flex-none ml-0.5 p-1 rounded text-gray-300 opacity-0 group-hover/rail:opacity-100 hover:text-red-500 hover:bg-red-50 transition-opacity">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )
      })}
      {extra}
    </div>
  )
}
