'use client'

// 事務管理担当ダッシュボード。
//
// 事務管理は「朝いちで何から手を付けるか」を決めるのにいくつも画面を回る必要があった。
// そこで一日の入口をこの画面にまとめ、4つのタブに分けている。
//   ①-a ファイル化待ち … ファイル化がまだの案件（前受金の入金は関係ない。事務が今すぐやれる仕事）
//   ①-b 作業着手待ち  … ファイル化は済んだ案件（前受金の入金待ち、または着手できる状態）
//   ② タスク     … 事務管理タスク一覧（既定。朝いちで一番見る画面なので最初に出す）
//   ③ 郵便       … 前営業日と本日に届いて、まだ対応していない到着物（受信簿と同じ中身）
//   ④ 報連相     … 自分が出した報告・連絡・相談と、その確認状況
//
// 上部には要注意／要確認のバナーを出す。自分の持ち場のタスクだけを見た判定なので、
// マイページの案件アラート（案件全体の遅れ）とは別物。
// バナーとタスクタブの色は同じ4段階（taskSeverity）で動く。何営業日で色が上がるかは業務ごとに違う。
//   赤=大きく遅れ（＋急ぎ・超急ぎ）→ 要注意 ／ オレンジ=遅れが目立つ → 要確認 ／ 緑・青 → 色だけ

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList, Mail, MessageSquare, PlayCircle, FolderPlus, ListChecks, AlertTriangle, AlertCircle, ArrowRight } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import HelpHint from '@/components/ui/HelpHint'
import { SeverityLegend } from '@/components/ui/TaskSeverityHelp'
import OfficeManagerDashboard, { type OfficeRow } from './OfficeManagerDashboard'
import HourenSouTable, { type HourenSouItem } from '@/components/features/my/HourenSouTable'
import type { CaseReportStatus } from '@/types'
import TaskListClient, { isTaskInRoleScope, type CaseInfo, type TaskJump } from '@/components/features/tasks/TaskListClient'
import { bizDaysOverdue } from '@/lib/overdue'
import { getStartSignal, type ReadinessReceipt } from '@/lib/taskReadiness'
import {
  taskSeverity, worstSeverity, SEVERITY_TAB, SEVERITY_TAB_NOTE, type TaskSeverity,
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
  kind: string                // 情報共有 / 要対応
  message: string | null
  requestedDate: string
  status: CaseReportStatus
  recipientNames: string[]
  confirmerName: string | null
  confirmedDate: string | null
}

type TabKey = 'filing' | 'start' | 'tasks' | 'hourensou' | 'hourensouAction'

const normalizeStatus = (s: string) => {
  if (s === '未着手') return '着手前'
  if (['Wチェック待ち', '保留', '差戻し'].includes(s)) return '対応中'
  if (s === 'キャンセル') return '完了'
  return s
}

// sev を渡すと、タスクタブと同じ4色の点が付く（他のタブは点なし）。
function TabBtn({ v, label, icon: Icon, count, current, onSelect, sev, alwaysCount }: {
  v: TabKey; label: string; icon: typeof Mail; count?: number; current: TabKey
  onSelect: (t: TabKey) => void; sev?: TaskSeverity
  /** true なら 0 件でも件数バッジを出す（自分の仕事量を常に見せたいタブ用） */
  alwaysCount?: boolean
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
      {count != null && (count > 0 || alwaysCount) && (
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
  const tabFromUrl = (['filing', 'start', 'tasks', 'mail', 'hourensou'] as string[]).includes(urlTab ?? '') ? (urlTab as TabKey) : 'tasks'
  const [tab, setTab] = useState<TabKey>(tabFromUrl)
  const selectTab = (t: TabKey) => {
    setTab(t)
    router.replace(t === 'tasks' ? '/dashboard/office' : `/dashboard/office?tab=${t}`, { scroll: false })
  }

  // 作業着手準備の案件を2つに割る。
  //   ファイル化待ち … ファイル化がまだ。前受金が入っていようがいまいが関係なく、事務が今すぐやれる仕事
  //   作業着手待ち   … ファイル化は済んだ。あとは前受金の入金を待つだけか、もう着手できる
  const filingRows = startRows.filter(r => r.filingStatus !== '済')
  const filedRows = startRows.filter(r => r.filingStatus === '済')
  // 着手できるものを上に寄せる（タブの件数もこの数）
  const canStartRows = filedRows.filter(r => r.advancePaid)
  const startTabRows = [...canStartRows, ...filedRows.filter(r => !r.advancePaid)]

  // 要注意／要確認バナー。タスクタブに出ているもの（着手OK・対応中）だけを見る。
  // タブと同じ4段階で判定する。
  //   要注意（赤）… 大きく遅れているタスク／急ぎ・超急ぎ
  //   要確認（オレンジ）… 遅れが目立つタスク
  //   緑・青はバナーを出さず、タブの色だけで知らせる
  const listedTasks = tasks.filter(t =>
    isTaskInRoleScope(t, 'assistant')
    && (normalizeStatus(t.status) !== '着手前' || getStartSignal(t, receipts).ready))
  const openTasks = listedTasks.filter(t => normalizeStatus(t.status) !== '完了')
  const readyCount = listedTasks.filter(t => normalizeStatus(t.status) === '着手前').length
  const chuiTasks = openTasks.filter(t => taskSeverity(t, today) === 'red')
  const kakuninTasks = openTasks.filter(t => taskSeverity(t, today) === 'orange')
  const taskSev = worstSeverity(openTasks, today)

  // バナー →「すべて」タブを同じ条件で絞った状態にする。
  // key を毎回変えることで、同じバナーをもう一度押しても効く。
  const [jump, setJump] = useState<TaskJump | null>(null)
  const jumpTo = (j: Omit<TaskJump, 'key'>) => {
    setJump({ key: crypto.randomUUID(), ...j })
    selectTab('tasks')
  }

  // 郵便タブの色。未対応のうち「いちばん古いもの」で決める。
  //   当日に届いた分だけ＝青／翌営業日まで来た＝緑／2営業日以上そのまま＝オレンジ
  const mailTone: 'blue' | 'green' | 'orange' = (() => {
    let worst = 0
    for (const m of mails) {
      const d = m.receivedDate ? bizDaysOverdue(m.receivedDate, today) : 0
      if (d > worst) worst = d
    }
    return worst >= 2 ? 'orange' : worst === 1 ? 'green' : 'blue'
  })()

  // 情報共有＝見ておいてもらうもの／要対応＝回答が要るもの。タブを分ける。
  const shareSent = hourenSou.filter(h => h.kind !== '要対応')
  const actionSent = hourenSou.filter(h => h.kind === '要対応')
  const pendingHourenSou = shareSent.filter(h => h.status === '依頼中').length
  const pendingAction = actionSent.filter(h => h.status !== '確認済').length
  const toItems = (rows: HourenSouRow[]): HourenSouItem[] => rows.map(r => ({
    id: r.id, caseId: r.caseId, caseNumber: r.caseNumber, dealName: r.dealName,
    kind: r.kind, message: r.message, requestedDate: r.requestedDate,
    status: r.status, personLabel: r.recipientNames.join('、'),
    confirmerName: r.confirmerName, confirmedDate: r.confirmedDate, isMine: true,
  }))

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title="事務管理担当ダッシュボード"
        icon={ClipboardList}
        description="ファイル化待ち・作業着手待ち・タスク（郵便を含む）・報連相をここにまとめています。"
      />

      {/* 要注意／要確認バナー（自分の持ち場のタスクだけ） */}
      {chuiTasks.length > 0 && (
        <TaskBanner tone="chui" tasks={chuiTasks} caseMap={caseMap} today={today}
          title={`要注意 ${chuiTasks.length}件`}
          note="大きく遅れているタスク／急ぎ・超急ぎ"
          onJump={() => jumpTo({ sev: 'red' })} />
      )}
      {kakuninTasks.length > 0 && (
        <TaskBanner tone="kakunin" tasks={kakuninTasks} caseMap={caseMap} today={today}
          title={`要確認 ${kakuninTasks.length}件`}
          note="遅れが目立つタスク"
          onJump={() => jumpTo({ sev: 'orange' })} />
      )}

      <div className="flex items-center gap-1 border-b border-gray-200 mb-4 flex-wrap">
        <TabBtn v="filing" label="ファイル化待ち" icon={FolderPlus} count={filingRows.length} current={tab} onSelect={selectTab} alwaysCount />
        <TabBtn v="start" label="作業着手待ち" icon={PlayCircle} count={canStartRows.length} current={tab} onSelect={selectTab} alwaysCount />
        <TabBtn v="tasks" label="タスク" icon={ListChecks} count={readyCount} current={tab} onSelect={selectTab} sev={taskSev} />
        <TabBtn v="hourensou" label="報連相（情報共有）" icon={MessageSquare} count={pendingHourenSou} current={tab} onSelect={selectTab} />
        <TabBtn v="hourensouAction" label="報連相（要対応）" icon={MessageSquare} count={pendingAction} current={tab} onSelect={selectTab} />
      </div>

      {tab === 'filing' && (
        <OfficeManagerDashboard mode="filing" rows={filingRows} currentMemberId={currentMemberId} currentMemberName={currentMemberName} />
      )}

      {tab === 'start' && (
        <OfficeManagerDashboard mode="start" rows={startTabRows} currentMemberId={currentMemberId} currentMemberName={currentMemberName} />
      )}

      {tab === 'tasks' && (
        <TaskListClient
          embedded
          tasks={tasks} caseMap={caseMap} allMembers={allMembers} currentMemberId={currentMemberId}
          receipts={receipts} financeBlockedCaseIds={financeBlockedCaseIds} freezeAssetsByCase={freezeAssetsByCase}
          roleScope="assistant" jump={jump}
          extraTab={{
            key: 'mail', label: '郵便', count: mails.length, tone: mailTone,
            content: <MailTab rows={mails} today={today} />,
          }}
        />
      )}

      {tab === 'hourensou' && (
        <HourenSouTable rows={toItems(shareSent)} mode="sent" todayStr={today}
          title="報連相（情報共有・自分が出したもの）"
          note="見ておいてもらう共有です。相手が確認したかどうかだけ見えます" />
      )}

      {tab === 'hourensouAction' && (
        <HourenSouTable rows={toItems(actionSent)} mode="sent" todayStr={today}
          title="報連相（要対応・自分が出したもの）"
          note="回答が無いと自分の作業が止まるものです。1営業日で要確認・3営業日で要注意のアラートに出ます" />
      )}
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
            直近30日に届いた到着物のうち、<b className="font-bold text-gray-900">まだ対応していないもの</b>です。
            受信簿で受信の確定をすると、ここから消えます。
          </span>
          <span className="block text-gray-500">
            タブの色は、いちばん古い未対応で決まります。
            <b className="font-bold text-brand-700">青</b>＝本日届いたぶんだけ／
            <b className="font-bold text-emerald-700">緑</b>＝翌営業日まで来た／
            <b className="font-bold text-orange-700">オレンジ</b>＝2営業日以上そのまま。
            それより前のものは受信簿で探してください。
          </span>
        </HelpHint>
        <Link href="/documents" className="ml-auto text-[12px] font-semibold text-brand-700 hover:underline">受信簿を開く</Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">未対応の郵便はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: 980 }}>
            <thead className="bg-gray-50 border-b border-gray-300 text-[11px] text-gray-600">
              <tr>
                <th className={TH}>番号</th>
                <th className={TH}>拠点</th>
                <th className={TH}>案件管理番号</th>
                <th className={TH}>案件名</th>
                <th className={TH}>〒種類</th>
                <th className={TH}>差出人</th>
                <th className={TH}>到着物</th>
                <th className={`${TH} text-center`}>通数</th>
                <th className={`${TH} text-center`}>放置<span className="block text-[10px] font-normal text-brand-700">対応するまでの日数</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map(r => {
                // 対応（受信の確定）を押さずに何営業日ほったらかしか。タスクの「◯日超過」と同じ見た目。
                const left = r.receivedDate ? bizDaysOverdue(r.receivedDate, today) : 0
                const rowRed = left >= 3
                return (
                <tr key={r.id} className={`${rowRed ? 'bg-red-50/60 hover:bg-red-50' : r.isParcel && !r.opened ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-gray-50/60'}`}>
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
                  <td className="px-2.5 py-2 text-center whitespace-nowrap">
                    {left <= 0
                      ? <span className="text-[13px] text-gray-400">本日</span>
                      : (
                        <span className={`inline-flex items-baseline gap-0.5 ${left >= 3 ? 'text-red-600' : 'text-amber-700'}`}>
                          <span className="text-[19px] font-bold leading-none tabular-nums">{left}</span>
                          <span className="text-[11px] font-bold">営業日{left >= 3 ? '放置' : ''}</span>
                        </span>
                      )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


// ── 要注意／要確認のバナー ──
// 期限が近い順に5件だけ出す。バナーで全部を並べると画面が埋まってタブに届かないので、
// 続きは「一覧で見る」でタスクタブへ飛び、同じ条件で絞られた状態から見る。
const BANNER_PREVIEW = 5

function TaskBanner({ tone, title, note, tasks, caseMap, today, onJump }: {
  tone: 'chui' | 'kakunin'
  title: string
  note: string
  tasks: TaskRow[]
  caseMap: Record<string, CaseInfo>
  today: string
  onJump: () => void
}) {
  const chui = tone === 'chui'
  const Icon = chui ? AlertTriangle : AlertCircle
  const sorted = [...tasks].sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'))
  const shown = sorted.slice(0, BANNER_PREVIEW)
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 mb-3 ${chui ? 'border-red-200 bg-red-50/70' : 'border-orange-200 bg-orange-50/70'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Icon className={`w-4 h-4 flex-none ${chui ? 'text-red-600' : 'text-orange-600'}`} strokeWidth={2.25} />
        <span className={`text-[13px] font-bold ${chui ? 'text-red-800' : 'text-orange-800'}`}>{title}</span>
        <span className="text-[11.5px] text-gray-500">{note}</span>
        <HelpHint title="バナーに出る条件">
          <span className="block mb-2.5">
            {chui
              ? '色が赤になったタスクを出しています。急ぎ・超急ぎは、期限を過ぎていなくても赤になります。'
              : '色がオレンジになったタスクを出しています。赤まで進んだものは要注意バナーのほうに出ます。'}
          </span>
          <SeverityLegend />
          <span className="block mt-1.5 text-gray-500">
            対象はタスクタブに出ている自分の持ち場のタスク（着手OK・対応中）です。
            期限が近い順に{BANNER_PREVIEW}件だけ出します。
            下の「一覧で見る」を押すと、タスクタブの「すべて」が同じ条件で絞られた状態になります。
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
                  {over > 0 && <span className={chui ? 'text-red-700' : 'text-orange-700'}>（{over}営業日超過）</span>}
                </span>
              )}
            </Link>
          )
        })}
      </div>
      <button type="button" onClick={onJump}
        className={`mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold hover:underline ${chui ? 'text-red-700' : 'text-orange-800'}`}>
        {sorted.length > BANNER_PREVIEW ? `ほか ${sorted.length - BANNER_PREVIEW} 件を含めて一覧で見る` : '一覧で見る'}
        <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
      </button>
    </div>
  )
}
