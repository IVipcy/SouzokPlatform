'use client'

// 受信簿 処理キュー：今日のサマリ＋未スキャン/未紐づけ(=未着手OK)のワークリスト。
// 行クリックでその案件の受信簿へジャンプして処理（アップ／紐づけ）する。

import { useMemo, useState } from 'react'
import { Scan, Flag, CheckCircle2, ClipboardCheck } from 'lucide-react'
import type { DocumentReceiptRow } from '@/types'

type Entry = {
  caseId: string
  caseNumber: string
  dealName: string
  receivedDate: string | null
  itemName: string
  receivedFrom: string | null
  stage: 'unscanned' | 'unlinked' | 'done'
}

const fmtDate = (d: string | null) => (d ? d.slice(5).replace('-', '/') : '—')

export default function ReceiptQueue({ receipts, onJumpToCase }: {
  receipts: DocumentReceiptRow[]
  onJumpToCase: (caseId: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [tab, setTab] = useState<'unscanned' | 'unlinked'>('unscanned')

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = []
    for (const r of receipts) {
      for (const it of r.items ?? []) {
        const uploaded = !!(it.uploaded_at || it.case_document_id)
        const linked = (it.item_tasks?.length ?? 0) > 0 || !!it.link_not_required
        const stage: Entry['stage'] = !uploaded ? 'unscanned' : !linked ? 'unlinked' : 'done'
        out.push({
          caseId: r.case_id,
          caseNumber: r.cases?.case_number ?? '',
          dealName: r.cases?.deal_name ?? '',
          receivedDate: r.received_date,
          itemName: it.item_name,
          receivedFrom: it.received_from,
          stage,
        })
      }
    }
    return out
  }, [receipts])

  const todays = entries.filter(e => e.receivedDate === today)
  const sum = (list: Entry[], s: Entry['stage']) => list.filter(e => e.stage === s).length
  const queue = entries.filter(e => e.stage === tab).sort((a, b) => (b.receivedDate ?? '').localeCompare(a.receivedDate ?? ''))

  const totalUnscanned = sum(entries, 'unscanned')
  const totalUnlinked = sum(entries, 'unlinked')

  return (
    <div className="space-y-4">
      {/* 今日のサマリ */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
        <div className="flex items-baseline gap-2.5 mb-3">
          <span className="text-[28px] font-semibold leading-none">{todays.length}</span>
          <span className="text-[13px] text-gray-400">件 到着（本日）</span>
          <span className="ml-auto text-[11.5px] text-gray-400">{today.replace(/-/g, '/')}</span>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          <SummaryCard icon={ClipboardCheck} label="受領記録済" value={todays.length} />
          <SummaryCard icon={Scan} label="未スキャン" value={sum(todays, 'unscanned')} tone="warn" />
          <SummaryCard icon={Flag} label="未紐づけ" value={sum(todays, 'unlinked')} tone="info" />
          <SummaryCard icon={CheckCircle2} label="処理済" value={sum(todays, 'done')} tone="ok" />
        </div>
      </div>

      {/* 未スキャン / 未紐づけ タブ（全件・バックログ込み） */}
      <div className="flex items-center gap-2">
        <TabBtn active={tab === 'unscanned'} onClick={() => setTab('unscanned')} icon={Scan} label="未スキャン" count={totalUnscanned} />
        <TabBtn active={tab === 'unlinked'} onClick={() => setTab('unlinked')} icon={Flag} label="未紐づけ（未着手OK）" count={totalUnlinked} />
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700">
              <th className="px-3 py-2 text-left font-semibold w-44">案件</th>
              <th className="px-3 py-2 text-left font-semibold">到着物</th>
              <th className="px-3 py-2 text-left font-semibold w-36">受領先</th>
              <th className="px-3 py-2 text-left font-semibold w-24">受領日</th>
              <th className="px-3 py-2 text-right font-semibold w-28">処理</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-[13px] text-gray-400">{tab === 'unscanned' ? '未スキャンの到着物はありません' : '未紐づけ（未着手OK）の到着物はありません'}</td></tr>
            ) : queue.map((e, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-b-0 hover:bg-brand-50/30 cursor-pointer" onClick={() => onJumpToCase(e.caseId)}>
                <td className="px-3 py-2"><span className="font-mono text-[11px] text-brand-700">{e.caseNumber}</span> <span className="text-gray-700">{e.dealName}</span></td>
                <td className="px-3 py-2 font-medium text-gray-800">{e.itemName}</td>
                <td className="px-3 py-2 text-gray-600">{e.receivedFrom || <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2 text-gray-600">{fmtDate(e.receivedDate)}</td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600">{tab === 'unscanned' ? 'スキャンへ' : '紐づけへ'}<span aria-hidden>→</span></span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">行をクリックすると、その案件の受信簿へ移動して処理（アップ／紐づけ＝着手OK）できます。タブの件数はバックログ全体です。</p>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone?: 'warn' | 'info' | 'ok' }) {
  const vc = tone === 'warn' ? 'text-amber-700' : tone === 'info' ? 'text-brand-700' : tone === 'ok' ? 'text-emerald-700' : 'text-gray-900'
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className={`text-[22px] font-semibold mt-0.5 ${vc}`}>{value}</div>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] rounded-md border ${active ? 'bg-brand-50 text-brand-700 border-brand-300 font-semibold' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
      <Icon className="w-3.5 h-3.5" />{label}
      <span className={`text-[10px] font-semibold px-1.5 rounded-full ${count > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>{count}</span>
    </button>
  )
}
