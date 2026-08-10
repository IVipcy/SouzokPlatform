'use client'

// 事務管理担当ダッシュボード。
//
// 事務管理は「朝いちで何から手を付けるか」を決めるのにいくつも画面を回る必要があった。
// そこで一日の入口をこの画面にまとめ、4つのタブに分けている。
//   ① 作業着手待ち … 作業着手準備の案件（前受金入金・ファイル化が済めば着手OK）
//   ② タスク     … 事務管理タスク一覧（既定。朝いちで一番見る画面なので最初に出す）
//   ③ 郵便       … 前営業日と本日に届いて、まだ対応していない到着物（受信簿と同じ中身）
//   ④ 報連相     … 自分が出した報告・連絡・相談と、その確認状況
//
// 上部には要注意／要確認のバナーを出す。自分の持ち場のタスクだけを見た判定なので、
// マイページの案件アラート（案件全体の遅れ）とは別物。
// バナーとタスクタブの色は同じ4段階（taskSeverity）で動く。
//   赤=急ぎ・超急ぎ → 要注意 ／ 黄=5営業日以上超過 → 要確認 ／ 緑=期限超過 → 色だけ ／ 薄い青=期限内

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList, Mail, MessageSquare, PlayCircle, ListChecks, AlertTriangle, AlertCircle } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import HelpHint from '@/components/ui/HelpHint'
import { SeverityLegend } from '@/components/ui/TaskSeverityHelp'
import OfficeManagerDashboard, { type OfficeRow } from './OfficeManagerDashboard'
import TaskListClient, { isTaskInRoleScope, type CaseInfo } from '@/components/features/tasks/TaskListClient'
import { bizDaysOverdue } from '@/lib/overdue'
import { getStartSignal, type ReadinessReceipt } from '@/lib/taskReadiness'
import {
  taskSeverity, worstSeverity, SEVERITY_TAB, SEVERITY_TAB_NOTE, TASK_CHUI_BIZ_DAYS, type TaskSeverity,
} from '@/lib/taskSeverity'
import type { TaskRow, MemberRow } from '@/types'

export type MailRow = {
  id: string
  caseId: string
  caseNumber: string
  dealName: string
  receivedDate: string        // 'YYYY-MM-DD'。本日でなければ「前営業日」と出す
  numberText: string          // 受信簿と同じ「0513/001」形式
  location: string | null
  postalType: string | null
  sender: string | null
  isParcel: boolean
  opened: boolean
  items: Array<{ name: string; quantity: number | null }>
}

export type HourenSouRow = {
  id: string
  caseId: string
  caseNumber: string
  dealName: string
  kind: string                // 報告 / 連絡 / 相談
  message: string | null
  requestedDate: string
  status: '依頼中' | '確認済'
  recipientNames: string[]
  confirmerName: string | null
  confirmedDate: string | null
}

type TabKey = 'start' | 'tasks' | 'mail' | 'hourensou'

const normalizeStatus = (s: string) => {
  if (s === '未着手') return '着手前'
  if (['Wチェック待ち', '保留', '差戻し'].includes(s)) return '対応中'
  if (s === 'キャンセル') return '完了'
  return s
}

// sev を渡すと、タスクタブと同じ4色の点が付く（他のタブは点なし）。
function TabBtn({ v, label, icon: Icon, count, current, onSelect, sev }: {
  v: TabKey; label: string; icon: typeof Mail; count?: number; current: TabKey
  onSelect: (t: TabKey) => void; sev?: TaskSeverity
}) {
  const on = current === v
  const c = sev ? SEVERITY_TAB[sev] : null
  const colored = c && sev !== 'blue'
  return (
    <button
      type="button"
      onClick={() => onSelect(v)}
      title={sev ? SEVERITY_TAB_NOTE[sev] : undefined}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 transition-colors ${
        on
          ? `border-brand-600 ${colored ? c.text : 'text-brand-700'}`
          : `border-transparent ${colored ? c.text : 'text-gray-500'} hover:text-gray-800`}`}
    >
      <Icon className="w-4 h-4" strokeWidth={2} />
      {c && <span className={`w-1.5 h-1.5 rounded-full flex-none ${c.dot}`} />}
      {label}
      {count != null && count > 0 && (
        <span className={`font-mono text-[11.5px] px-1.5 py-0.5 rounded-full ${
          colored ? c.badge : on ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
      )}
    </button>
  )
}

export default function OfficeDashboardTabs({
  startRows, currentMemberId, currentMemberName, mails, hourenSou,
  tasks, caseMap, allMembers, receipts, financeBlockedCaseIds, freezeAssetsByCase, today,
}: {
  startRows: OfficeRow[]
  currentMemberId: string | null
  currentMemberName: string | null
  mails: MailRow[]
  hourenSou: HourenSouRow[]
  tasks: TaskRow[]
  caseMap: Record<string, CaseInfo>
  allMembers: MemberRow[]
  receipts: ReadinessReceipt[]
  financeBlockedCaseIds: string[]
  freezeAssetsByCase: Record<string, Array<{ institution_name?: string | null; freeze_confirmed?: boolean | null }>>
  today: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // タブはURLに残す。リロード・戻るで同じタブに戻れるようにする。既定はタスク。
  const urlTab = searchParams.get('tab')
  const tabFromUrl = (['start', 'tasks', 'mail', 'hourensou'] as string[]).includes(urlTab ?? '') ? (urlTab as TabKey) : 'tasks'
  const [tab, setTab] = useState<TabKey>(tabFromUrl)
  const selectTab = (t: TabKey) => {
    setTab(t)
    router.replace(t === 'tasks' ? '/dashboard/office' : `/dashboard/office?tab=${t}`, { scroll: false })
  }

  // 要注意／要確認バナー。タスクタブに出ているもの（着手OK・対応中）だけを見る。
  // タブと同じ4段階で判定する。
  //   要注意（赤）… 急ぎ・超急ぎ
  //   要確認（黄）… 期限を5営業日以上超過
  //   緑（期限超過・5営業日未満）はバナーを出さず、タブの色だけで知らせる
  const listedTasks = tasks.filter(t =>
    isTaskInRoleScope(t, 'assistant')
    && (normalizeStatus(t.status) !== '着手前' || getStartSignal(t, receipts).ready))
  const openTasks = listedTasks.filter(t => normalizeStatus(t.status) !== '完了')
  const readyCount = listedTasks.filter(t => normalizeStatus(t.status) === '着手前').length
  const chuiTasks = openTasks.filter(t => taskSeverity(t, today) === 'red')
  const kakuninTasks = openTasks.filter(t => taskSeverity(t, today) === 'amber')
  const taskSev = worstSeverity(openTasks, today)

  const pendingHourenSou = hourenSou.filter(h => h.status === '依頼中').length

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title="事務管理担当ダッシュボード"
        icon={ClipboardList}
        description="作業着手待ち・タスク・郵便・報連相をここにまとめています。"
      />

      {/* 要注意／要確認バナー（自分の持ち場のタスクだけ） */}
      {chuiTasks.length > 0 && (
        <TaskBanner tone="chui" tasks={chuiTasks} caseMap={caseMap} today={today}
          title={`要注意 ${chuiTasks.length}件`}
          note="急ぎ・超急ぎのタスク" />
      )}
      {kakuninTasks.length > 0 && (
        <TaskBanner tone="kakunin" tasks={kakuninTasks} caseMap={caseMap} today={today}
          title={`要確認 ${kakuninTasks.length}件`}
          note={`期限を${TASK_CHUI_BIZ_DAYS}営業日以上超過したタスク`} />
      )}

      <div className="flex items-center gap-1 border-b border-gray-200 mb-4 flex-wrap">
        <TabBtn v="start" label="作業着手待ち" icon={PlayCircle} count={startRows.length} current={tab} onSelect={selectTab} />
        <TabBtn v="tasks" label="タスク" icon={ListChecks} count={readyCount} current={tab} onSelect={selectTab} sev={taskSev} />
        <TabBtn v="mail" label="郵便" icon={Mail} count={mails.length} current={tab} onSelect={selectTab} />
        <TabBtn v="hourensou" label="報連相" icon={MessageSquare} count={pendingHourenSou} current={tab} onSelect={selectTab} />
      </div>

      {tab === 'start' && (
        <OfficeManagerDashboard rows={startRows} currentMemberId={currentMemberId} currentMemberName={currentMemberName} />
      )}

      {tab === 'tasks' && (
        <TaskListClient
          embedded
          tasks={tasks} caseMap={caseMap} allMembers={allMembers} currentMemberId={currentMemberId}
          receipts={receipts} financeBlockedCaseIds={financeBlockedCaseIds} freezeAssetsByCase={freezeAssetsByCase}
          roleScope="assistant"
        />
      )}

      {tab === 'mail' && <MailTab rows={mails} today={today} />}

      {tab === 'hourensou' && <HourenSouTab rows={hourenSou} />}
    </div>
  )
}

// ── 郵便：前営業日と本日に届いて、まだ対応していない到着物。中身は受信簿と同じ並び。 ──
function MailTab({ rows, today }: { rows: MailRow[]; today: string }) {
  const TH = 'px-2.5 py-2 text-left font-semibold whitespace-nowrap'
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <span className="text-[14px] font-bold text-gray-900">郵便（未対応）</span>
        <span className="text-[12px] font-normal text-gray-400">{rows.length}件</span>
        <HelpHint title="ここに出るもの">
          <span className="block mb-1.5">
            <b className="font-bold text-gray-900">前営業日と本日</b>に届いた到着物のうち、まだ対応していないものです。
          </span>
          <span className="block mb-1.5 text-gray-500">
            受信簿で受信の確定をすると、ここから消えます。
          </span>
          <span className="block text-gray-500">
            月曜は前営業日が土曜になるので、土日に届いたぶんもここに残ります。
            それより前のものは受信簿で探してください。
          </span>
        </HelpHint>
        <Link href="/documents" className="ml-auto text-[12px] font-semibold text-brand-700 hover:underline">受信簿を開く</Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">前営業日・本日に届いて未対応の郵便はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 900 }}>
            <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
              <tr>
                <th className={TH}>番号</th>
                <th className={TH}>拠点</th>
                <th className={TH}>案件管理番号</th>
                <th className={TH}>案件名</th>
                <th className={TH}>〒種類</th>
                <th className={TH}>差出人</th>
                <th className={TH}>到着物</th>
                <th className={`${TH} text-center`}>通数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.id} className={`hover:bg-gray-50/60 ${r.isParcel && !r.opened ? 'bg-amber-50/60' : ''}`}>
                  <td className="px-2.5 py-2 font-mono text-gray-600 whitespace-nowrap">
                    {r.numberText}
                    {r.receivedDate !== today && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-sans font-semibold bg-gray-100 text-gray-600">前営業日</span>
                    )}
                  </td>
                  <td className="px-2.5 py-2 text-gray-700">{r.location ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-2.5 py-2 font-mono text-gray-500">{r.caseNumber}</td>
                  <td className="px-2.5 py-2">
                    <Link href={`/cases/${r.caseId}`} className="font-semibold text-gray-800 hover:text-brand-600 hover:underline">{r.dealName}</Link>
                  </td>
                  <td className="px-2.5 py-2">
                    {r.isParcel && !r.opened
                      ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">一式・未開封</span>
                      : r.postalType
                        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">{r.postalType}</span>
                        : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2.5 py-2 text-gray-700">{r.sender || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2.5 py-2 text-gray-800">
                    {r.items.length === 0 ? <span className="text-gray-300">—</span> : r.items.map(i => i.name).join(' / ')}
                  </td>
                  <td className="px-2.5 py-2 text-center font-mono text-gray-700">
                    {r.items.some(i => i.quantity != null)
                      ? `${r.items.reduce((s, i) => s + (i.quantity ?? 0), 0)}通`
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 報連相：自分が出した報告・連絡・相談。確認されたかどうかまで見える。 ──
const KIND_CHIP: Record<string, string> = {
  報告: 'bg-brand-50 text-brand-700 border-brand-200',
  連絡: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  相談: 'bg-amber-50 text-amber-800 border-amber-200',
}

function HourenSouTab({ rows }: { rows: HourenSouRow[] }) {
  const TH = 'px-2.5 py-2 text-left font-semibold whitespace-nowrap'
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <span className="text-[14px] font-bold text-gray-900">報連相（自分が出したもの）</span>
        <span className="text-[12px] font-normal text-gray-400">{rows.length}件</span>
        <span className="text-[11.5px] text-gray-400 ml-2">タスクや案件詳細から送った報告・連絡・相談です。</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">出している報連相はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 980 }}>
            <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
              <tr>
                <th className={TH}>種類</th>
                <th className={TH}>案件管理番号</th>
                <th className={TH}>案件名</th>
                <th className={TH}>内容</th>
                <th className={TH}>宛先</th>
                <th className={TH}>送信日</th>
                <th className={TH}>状態</th>
                <th className={TH}>確認者 / 確認日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-2.5 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold border ${KIND_CHIP[r.kind] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>{r.kind}</span>
                  </td>
                  <td className="px-2.5 py-2 font-mono text-gray-500">{r.caseNumber}</td>
                  <td className="px-2.5 py-2">
                    <Link href={`/cases/${r.caseId}?tab=progress&sub=report`} className="font-semibold text-gray-800 hover:text-brand-600 hover:underline">{r.dealName}</Link>
                  </td>
                  <td className="px-2.5 py-2 text-gray-700 whitespace-pre-wrap max-w-[320px]">{r.message || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2.5 py-2 text-gray-700">{r.recipientNames.join('、') || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2.5 py-2 font-mono text-gray-600">{r.requestedDate}</td>
                  <td className="px-2.5 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.status === '確認済' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {r.status === '確認済' ? '確認済' : '返事待ち'}
                    </span>
                  </td>
                  <td className="px-2.5 py-2 text-gray-700">
                    {r.confirmerName ? `${r.confirmerName}${r.confirmedDate ? ` / ${r.confirmedDate}` : ''}` : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 要注意／要確認のバナー ──
// 件数と、期限が近い順に5件だけ並べる。全部出すと画面が埋まるので、続きはタスクタブで見る。
function TaskBanner({ tone, title, note, tasks, caseMap, today }: {
  tone: 'chui' | 'kakunin'
  title: string
  note: string
  tasks: TaskRow[]
  caseMap: Record<string, CaseInfo>
  today: string
}) {
  const chui = tone === 'chui'
  const Icon = chui ? AlertTriangle : AlertCircle
  const shown = [...tasks]
    .sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'))
    .slice(0, 5)
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 mb-3 ${chui ? 'border-red-200 bg-red-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Icon className={`w-4 h-4 flex-none ${chui ? 'text-red-600' : 'text-amber-600'}`} strokeWidth={2.25} />
        <span className={`text-[13px] font-bold ${chui ? 'text-red-800' : 'text-amber-800'}`}>{title}</span>
        <span className="text-[11.5px] text-gray-500">{note}</span>
        <HelpHint title="バナーに出る条件">
          <span className="block mb-2.5">
            {chui
              ? '優先度が急ぎ・超急ぎのタスクを出しています。期限を過ぎていなくても出ます。'
              : `期限を${TASK_CHUI_BIZ_DAYS}営業日以上過ぎたタスクを出しています。急ぎ・超急ぎのものは要注意バナーのほうに出ます。`}
          </span>
          <SeverityLegend />
          <span className="block mt-1.5 text-gray-500">
            対象はタスクタブに出ている自分の持ち場のタスク（着手OK・対応中）です。
            期限が近い順に5件まで並べ、続きはタスクタブで見ます。
          </span>
        </HelpHint>
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5">
        {shown.map(t => {
          const c = caseMap[t.case_id]
          const over = t.due_date ? bizDaysOverdue(t.due_date, today) : 0
          return (
            <Link key={t.id} href={`/tasks/${t.id}`}
              className="flex items-center gap-2 text-[12px] text-gray-700 hover:text-brand-700 hover:underline">
              {t.priority === '超急ぎ' && <span className="inline-flex flex-none px-1.5 rounded text-[10.5px] font-bold bg-red-100 text-red-800 border border-red-300">超急ぎ</span>}
              {t.priority === '急ぎ' && <span className="inline-flex flex-none px-1.5 rounded text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300">急ぎ</span>}
              <span className="font-semibold truncate max-w-[280px]">{t.title}</span>
              <span className="text-gray-500 truncate max-w-[180px]">{c?.deal_name ?? ''}</span>
              {t.due_date && (
                <span className="text-gray-500 font-mono flex-none">
                  期限 {t.due_date.slice(5).replace('-', '/')}
                  {over > 0 && <span className={chui ? 'text-red-700' : 'text-amber-700'}>（{over}営業日超過）</span>}
                </span>
              )}
            </Link>
          )
        })}
        {tasks.length > shown.length && (
          <span className="text-[11.5px] text-gray-500">ほか {tasks.length - shown.length} 件（タスクタブで確認）</span>
        )}
      </div>
    </div>
  )
}
