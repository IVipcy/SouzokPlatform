'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Send, Loader2, ClipboardCheck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { PROGRESS_REPORT_PHASES, PROGRESS_REPORT_STATES, PROGRESS_REPORT_STATE_URGENT } from '@/lib/constants'

// 案件詳細の報告モーダルと同じ配色。状態は受注担当が最初に見るところなので揃える。
const STATE_CHIP: Record<string, string> = {
  '問題なし順調に進行中': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '確認事項あり': 'bg-blue-50 text-blue-700 border-blue-200',
  '困りごとありHELP': 'bg-amber-50 text-amber-700 border-amber-200',
  '至急！！': 'bg-red-100 text-red-700 border-red-300',
}
const stateChip = (s: string) => STATE_CHIP[s] ?? 'bg-gray-50 text-gray-500 border-gray-200'

export type ManagerProgressRow = {
  case_id: string
  case_number: string
  deal_name: string
  sales_name: string | null
  sales_member_id: string | null
  reportId: string | null
  status: '未対応' | '依頼中' | '確認済'
  confirmerId: string | null
  confirmerName: string | null
  requestedDate: string | null
  confirmedDate: string | null
  reviewPoint: string | null
  confirmComment: string | null
}

type Candidate = { id: string; name: string }

type Props = {
  rows: ManagerProgressRow[]
  candidates: Candidate[]
  currentMemberId: string | null
}

const FILTERS = ['未対応', '依頼中', '確認済'] as const
// DB上のステータス値は既存互換のため '依頼中' のまま保持。表示ラベルだけ「報告中」に切替。
const STATUS_LABEL: Record<'未対応' | '依頼中' | '確認済', string> = {
  '未対応': '未対応',
  '依頼中': '報告中',
  '確認済': '確認済',
}
const STATUS_BADGE: Record<string, string> = {
  '未対応': 'bg-slate-100 text-slate-600',
  '依頼中': 'bg-amber-50 text-amber-700',
  '確認済': 'bg-emerald-50 text-emerald-700',
}

export default function ProgressReportManagerTab({ rows, currentMemberId }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<'all' | '未対応' | '依頼中' | '確認済'>('未対応')
  const [busy, setBusy] = useState<string | null>(null)
  // モーダル: どの案件を報告するか / その場で確認ポイント入力
  const [modalRow, setModalRow] = useState<ManagerProgressRow | null>(null)
  const [modalPoint, setModalPoint] = useState('')
  // 案件詳細の報告モーダルと同じ項目（フェーズ・状態）を持たせる
  const [modalPhase, setModalPhase] = useState('')
  const [modalState, setModalState] = useState<string>(PROGRESS_REPORT_STATES[0])

  const counts = {
    未対応: rows.filter(r => r.status === '未対応').length,
    依頼中: rows.filter(r => r.status === '依頼中').length,
    確認済: rows.filter(r => r.status === '確認済').length,
  }
  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter)

  const openReportModal = (row: ManagerProgressRow) => {
    setModalPoint('')
    setModalPhase('')
    setModalState(PROGRESS_REPORT_STATES[0])
    setModalRow(row)
  }

  const submitReport = async () => {
    if (!currentMemberId || !modalRow) return
    setBusy(modalRow.case_id)
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      let { error } = await supabase.from('progress_reports').insert({
        case_id: modalRow.case_id,
        requester_id: currentMemberId,
        confirmer_id: null,
        status: '依頼中',
        requested_date: today,
        review_point: modalPoint.trim() || null,
        kind: 'progress_check',
        phase: modalPhase || null,
        report_state: modalState,
      })
      // kind/phase/report_state 列が無い環境向けフォールバック（案件詳細側と同じ）
      if (error && /kind|phase|report_state/i.test(error.message ?? '')) {
        const retry = await supabase.from('progress_reports').insert({
          case_id: modalRow.case_id,
          requester_id: currentMemberId,
          confirmer_id: null,
          status: '依頼中',
          requested_date: today,
          review_point: modalPoint.trim() || null,
        })
        error = retry.error
      }
      if (error) throw error
      // 受注担当へ通知（案件詳細から送ったときと同じ本文にする）
      if (modalRow.sales_member_id) {
        const urgent = modalState === PROGRESS_REPORT_STATE_URGENT
        const meta = [modalPhase, modalState].filter(Boolean).join('・')
        await supabase.from('notifications').insert({
          member_id: modalRow.sales_member_id,
          type: 'progress_review_requested',
          case_id: modalRow.case_id,
          title: `${urgent ? '【至急】' : ''}案件報告が届きました`,
          body: `${modalRow.case_number} ${modalRow.deal_name}：${meta ? `[${meta}] ` : ''}${modalPoint.trim() || '案件報告をお願いします'}`,
        })
      }
      showToast('案件報告を送信しました', 'success')
      setModalRow(null)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('progress_reports insert failed:', e)
      showToast(`報告に失敗しました: ${msg}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <ClipboardCheck className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <h3 className="text-[14px] font-bold text-brand-900">案件報告</h3>
        <div className="flex gap-1 ml-2 bg-gray-50 border border-gray-200 rounded-md p-0.5">
          <FilterChip label="すべて" active={filter === 'all'} onClick={() => setFilter('all')} />
          {FILTERS.map(f => (
            <FilterChip key={f} label={STATUS_LABEL[f]} active={filter === f} onClick={() => setFilter(f)} count={counts[f]} />
          ))}
        </div>
        <span className="ml-auto text-[11px] text-gray-400">「報告する」→ 確認ポイントを添えて受注担当へ送信 → 案件詳細で本人以外が確認</span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-gray-400">該当する案件はありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 1000 }}>
            <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">案件管理番号</th>
                <th className="px-3 py-2 text-left font-medium">案件名</th>
                <th className="px-3 py-2 text-left font-medium">受注担当者名</th>
                <th className="px-3 py-2 text-left font-medium">案件報告日</th>
                <th className="px-3 py-2 text-left font-medium">確認ポイント</th>
                <th className="px-3 py-2 text-left font-medium">確認コメント</th>
                <th className="px-3 py-2 text-left font-medium">確認者</th>
                <th className="px-3 py-2 text-left font-medium">確認ステータス</th>
                <th className="px-3 py-2 text-left font-medium">確認日付</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map(row => {
                const isUnrequested = row.status === '未対応'
                const isBusy = busy === row.case_id
                return (
                  <tr key={row.case_id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-500">{row.case_number}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/cases/${row.case_id}`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-[200px]">
                        {row.deal_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{row.sales_name || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{row.requestedDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12px] text-gray-700 whitespace-pre-wrap max-w-[200px] inline-block">{row.reviewPoint || <span className="text-gray-300">—</span>}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700 whitespace-pre-wrap max-w-[200px]">{row.confirmComment || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-700">{row.confirmerName || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium ${STATUS_BADGE[row.status]}`}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{row.confirmedDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      {isUnrequested && (
                        <button
                          type="button"
                          onClick={() => openReportModal(row)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" strokeWidth={2.25} />}
                          報告する
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 案件報告モーダル: 「報告する」押下で開く。確認ポイント任意入力→送信で progress_reports insert */}
      {modalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !busy && setModalRow(null)}>
          <div className="bg-white rounded-xl shadow-xl w-[520px] max-w-[92vw]" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
              <h4 className="text-[14px] font-bold text-brand-900 flex-1">案件報告</h4>
              <button type="button" onClick={() => !busy && setModalRow(null)} className="text-gray-400 hover:text-gray-600" aria-label="閉じる">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="text-[12px] text-gray-500">
                <span className="font-mono text-gray-400">{modalRow.case_number}</span>
                <span className="ml-2 font-semibold text-gray-800">{modalRow.deal_name}</span>
              </div>
              <div>
                <span className="block text-[12px] font-semibold text-gray-700 mb-1">報告先</span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-brand-200 bg-brand-50 text-[12.5px] font-semibold text-brand-800">
                  {modalRow.sales_name || '受注担当 未設定'}
                </span>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">フェーズ</label>
                <select
                  value={modalPhase}
                  onChange={e => setModalPhase(e.target.value)}
                  className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400"
                >
                  <option value="">フェーズを選択</option>
                  {PROGRESS_REPORT_PHASES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">状態</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PROGRESS_REPORT_STATES.map(st => {
                    const on = modalState === st
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setModalState(st)}
                        className={`px-2 py-2 rounded-lg text-[12px] font-semibold border-[1.5px] transition-colors ${on ? stateChip(st) + ' ring-2 ring-offset-1 ' + (st === PROGRESS_REPORT_STATE_URGENT ? 'ring-red-300' : 'ring-brand-200') : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                      >
                        {st}
                      </button>
                    )
                  })}
                </div>
                {modalState === PROGRESS_REPORT_STATE_URGENT && (
                  <p className="mt-1 text-[11px] text-red-600">受注担当の要注意バナーに出ます。すぐ見てほしいときだけ選んでください。</p>
                )}
              </div>
              <label className="block">
                <span className="block text-[12px] font-semibold text-gray-700 mb-1">確認ポイント（任意）</span>
                <textarea
                  value={modalPoint}
                  onChange={e => setModalPoint(e.target.value)}
                  placeholder="受注担当に見てほしいポイントを記入（任意）"
                  className="w-full border border-gray-200 rounded-md px-2.5 py-2 text-[13px] focus:outline-none focus:border-brand-400 min-h-[96px]"
                />
              </label>
              <p className="text-[11px] text-gray-400">送信後、受注担当が案件詳細画面で内容を確認します。確認はチームの誰でも押せます。</p>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalRow(null)}
                disabled={!!busy}
                className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >キャンセル</button>
              <button
                type="button"
                onClick={submitReport}
                disabled={!!busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12.5px] font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" strokeWidth={2.25} />}
                報告する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-brand-600 text-white font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-white'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1 text-[10px] font-mono ${active ? 'opacity-80' : 'opacity-50'}`}>{count}</span>
      )}
    </button>
  )
}
