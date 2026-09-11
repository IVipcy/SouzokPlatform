'use client'

// 相続登記チームのダッシュボード：「依頼」タブ（登記依頼のキュー）と「タスク」タブ（従来の touki_team タスク）。
//   依頼 … 種別ごとの未処理件数 → 絞り込み（未処理／対応中／完了／自分の担当）→ 一覧（対応する／完了／修正あり）
//   タスク … チーム内で振る作業（製本など）。依頼とは役割が違うので残す
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TaskListClient from '@/components/features/tasks/TaskListClient'
import ToukiRequestsTable from '@/components/features/cases/ToukiRequestsTable'
import { TOUKI_REQUEST_TYPES, isOpenToukiRequest, toukiSeverity } from '@/lib/toukiRequests'
import type { TaskRow, ToukiRequestRow } from '@/types'
import type { loadTaskListData } from '@/lib/loadTaskListData'

type TaskData = Awaited<ReturnType<typeof loadTaskListData>>

type Filter = 'open' | 'doing' | 'done' | 'mine'

export default function ToukiTeamTabs({ requests, tasks, taskData, currentMemberId, todayStr }: {
  requests: ToukiRequestRow[]
  /** 相続登記チームのタスク（task_kind='touki_team'）。件数用 */
  tasks: TaskRow[]
  /** 事務管理のタスク一覧と同じ部品に渡すデータ（全タスク・案件・メンバー…）。担当区分の絞り込みで登記チームだけになる */
  taskData: TaskData
  currentMemberId: string
  todayStr: string
}) {
  const router = useRouter()
  const openCount = requests.filter(isOpenToukiRequest).length
  const activeTasks = tasks.filter(t => t.status !== '完了' && t.status !== 'キャンセル').length
  const [tab, setTab] = useState<'requests' | 'tasks'>('requests')
  const [filter, setFilter] = useState<Filter>('open')

  const rows = requests.filter(r =>
    filter === 'open' ? isOpenToukiRequest(r)
    : filter === 'doing' ? r.status === '対応中'
    : filter === 'done' ? !isOpenToukiRequest(r)
    : r.assignee_id === currentMemberId && isOpenToukiRequest(r))

  const tabBtn = (k: 'requests' | 'tasks', label: string, n: number) => (
    <button type="button" onClick={() => setTab(k)}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? 'text-brand-800 border-brand-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
      {label}<span className={`px-1.5 text-[11px] font-bold rounded ${n > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{n}</span>
    </button>
  )
  const filterBtn = (k: Filter, label: string) => (
    <button type="button" onClick={() => setFilter(k)}
      className={`px-3 py-1 rounded-md text-[12px] font-semibold border ${filter === k ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>{label}</button>
  )

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
        {tabBtn('requests', '依頼', openCount)}
        {tabBtn('tasks', 'タスク', activeTasks)}
      </div>
      {tab === 'tasks' ? (
        // 事務管理のタスク一覧と同じ見た目・操作（行を押すとタスク詳細、着手はそこで）。担当区分＝相続登記チーム
        <TaskListClient embedded roleScope="touki"
          tasks={taskData.tasks} caseMap={taskData.caseMap} allMembers={taskData.allMembers} currentMemberId={currentMemberId}
          receipts={taskData.receipts} financeBlockedCaseIds={taskData.financeBlockedCaseIds} freezeAssetsByCase={taskData.freezeAssetsByCase} />
      ) : (
        <div className="space-y-3.5">
          {/* 種別ごとの未処理件数。3営業日超があれば琥珀 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {TOUKI_REQUEST_TYPES.map(t => {
              const mine = requests.filter(r => r.request_type === t && isOpenToukiRequest(r))
              const chui = mine.filter(r => toukiSeverity(r, todayStr) === 'chui').length
              return (
                <div key={t} className={`bg-white border rounded-lg px-3 py-2.5 text-center ${chui > 0 ? 'border-amber-300' : 'border-gray-200'}`}>
                  <div className="text-[11.5px] text-gray-500">{t}</div>
                  <div className={`text-[20px] font-bold ${chui > 0 ? 'text-amber-700' : 'text-gray-800'}`}>{mine.length}</div>
                  {chui > 0 && <div className="text-[11px] text-amber-700">{chui}件 3営業日超</div>}
                </div>
              )
            })}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-1.5 mb-3">
              {filterBtn('open', '未処理')}
              {filterBtn('doing', '対応中')}
              {filterBtn('done', '完了・修正あり')}
              {filterBtn('mine', '自分の担当')}
              <span className="ml-auto text-[11.5px] text-gray-400">「対応する」で担当になり、「完了」「修正あり（コメント必須）」で依頼者に返します</span>
            </div>
            <ToukiRequestsTable rows={rows} mode="team" todayStr={todayStr} showDone onChanged={() => router.refresh()} />
          </div>
        </div>
      )}
    </div>
  )
}
