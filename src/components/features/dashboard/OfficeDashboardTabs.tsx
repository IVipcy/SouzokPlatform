'use client'

// 事務管理担当ダッシュボード。
//
// 事務管理は「朝いちで何から手を付けるか」を決めるのにいくつも画面を回る必要があった。
// そこで一日の入口をこの画面にまとめ、4つのタブに分けている。
//   ① 作業着手待ち … 作業着手準備の案件（前受金入金・ファイル化が済めば着手OK）
//   ② 郵便       … 本日届いてまだ対応していない到着物（受信簿と同じ中身）
//   ③ 報連相     … 自分が出した報告・連絡・相談と、その確認状況
//
// ※ 工程別タブは廃止。タスクの分類は事務管理タスク一覧側で作り直す。

import { useState } from 'react'
import Link from 'next/link'
import { ClipboardList, Mail, MessageSquare, PlayCircle } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import OfficeManagerDashboard, { type OfficeRow } from './OfficeManagerDashboard'

export type MailRow = {
  id: string
  caseId: string
  caseNumber: string
  dealName: string
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

type TabKey = 'start' | 'mail' | 'hourensou'

function TabBtn({ v, label, icon: Icon, count, current, onSelect }: {
  v: TabKey; label: string; icon: typeof Mail; count?: number; current: TabKey; onSelect: (t: TabKey) => void
}) {
  const on = current === v
  return (
    <button
      type="button"
      onClick={() => onSelect(v)}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 transition-colors ${
        on ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
    >
      <Icon className="w-4 h-4" strokeWidth={2} />
      {label}
      {count != null && count > 0 && (
        <span className={`font-mono text-[11.5px] px-1.5 py-0.5 rounded-full ${on ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
      )}
    </button>
  )
}

export default function OfficeDashboardTabs({
  startRows, currentMemberId, currentMemberName, mails, hourenSou,
}: {
  startRows: OfficeRow[]
  currentMemberId: string | null
  currentMemberName: string | null
  mails: MailRow[]
  hourenSou: HourenSouRow[]
}) {
  const [tab, setTab] = useState<TabKey>('start')

  const pendingHourenSou = hourenSou.filter(h => h.status === '依頼中').length

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title="事務管理担当ダッシュボード"
        icon={ClipboardList}
        description="作業着手待ち・本日の郵便・報連相をここにまとめています。"
      />

      <div className="flex items-center gap-1 border-b border-gray-200 mb-4 flex-wrap">
        <TabBtn v="start" label="作業着手待ち" icon={PlayCircle} count={startRows.length} current={tab} onSelect={setTab} />
        <TabBtn v="mail" label="郵便" icon={Mail} count={mails.length} current={tab} onSelect={setTab} />
        <TabBtn v="hourensou" label="報連相" icon={MessageSquare} count={pendingHourenSou} current={tab} onSelect={setTab} />
      </div>

      {tab === 'start' && (
        <OfficeManagerDashboard rows={startRows} currentMemberId={currentMemberId} currentMemberName={currentMemberName} />
      )}

      {tab === 'mail' && <MailTab rows={mails} />}

      {tab === 'hourensou' && <HourenSouTab rows={hourenSou} />}
    </div>
  )
}

// ── 郵便：本日届いてまだ対応していない到着物。中身は受信簿と同じ並び。 ──
function MailTab({ rows }: { rows: MailRow[] }) {
  const TH = 'px-2.5 py-2 text-left font-semibold whitespace-nowrap'
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <span className="text-[14px] font-bold text-gray-900">本日の郵便（未対応）</span>
        <span className="text-[12px] font-normal text-gray-400">{rows.length}件</span>
        <Link href="/documents" className="ml-auto text-[12px] font-semibold text-brand-700 hover:underline">受信簿を開く</Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">本日届いて未対応の郵便はありません</div>
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
                  <td className="px-2.5 py-2 font-mono text-gray-600">{r.numberText}</td>
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
