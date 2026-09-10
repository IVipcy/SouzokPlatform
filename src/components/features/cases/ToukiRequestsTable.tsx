'use client'

// 登記依頼の一覧。3か所で同じ表を使う。
//   case  … 相続登記タブ（その案件・その法務局）。列＝依頼日・種別・登記の種類・物件・一言・状態・登記部門・結果
//   mine  … マイページ（自分が出した依頼）。案件列が付く
//   team  … 登記チームのダッシュボード。案件・依頼者・経過が付き、操作（対応する／完了／修正あり）ができる

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { TOUKI_STATUS_CLS, toukiOverdueDays, toukiSeverity, notifyToukiRequester, isOpenToukiRequest } from '@/lib/toukiRequests'
import type { ToukiRequestRow } from '@/types'

const md = (iso: string | null | undefined) => (iso ? iso.slice(5, 10).replace('-', '/') : '')

export default function ToukiRequestsTable({ rows, mode, todayStr, showDone = true, onChanged, onRerequest, propertyLabel }: {
  rows: ToukiRequestRow[]
  mode: 'case' | 'mine' | 'team'
  todayStr: string
  showDone?: boolean
  onChanged?: () => void
  /** 修正ありの行の「直して再依頼」（case／mine で使う） */
  onRerequest?: (r: ToukiRequestRow) => void
  /** 物件IDの並びを「3件」などの文字に */
  propertyLabel?: (ids: string[] | null) => string
}) {
  const supabase = createClient()
  const memberId = useCurrentMember(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [commentFor, setCommentFor] = useState<ToukiRequestRow | null>(null)
  const [comment, setComment] = useState('')

  const list = rows.filter(r => showDone || isOpenToukiRequest(r) || r.status === '修正あり')
  const propText = (ids: string[] | null) => propertyLabel ? propertyLabel(ids) : (ids && ids.length > 0 ? `${ids.length}件` : '—')

  const myName = async () => {
    if (!memberId) return null
    const { data } = await supabase.from('members').select('name').eq('id', memberId).maybeSingle()
    return (data as { name?: string } | null)?.name ?? null
  }
  // 登記部門の操作
  const take = async (r: ToukiRequestRow) => {
    if (!memberId) return
    setBusyId(r.id)
    const { error } = await supabase.from('touki_requests').update({ status: '対応中', assignee_id: memberId, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error')
    else { await notifyToukiRequester(supabase, r, '対応中', null, await myName()); showToast('対応中にしました', 'success'); onChanged?.() }
    setBusyId(null)
  }
  const finish = async (r: ToukiRequestRow, result: '完了' | '修正あり', text: string | null) => {
    if (!memberId) return
    setBusyId(r.id)
    const { error } = await supabase.from('touki_requests').update({
      status: result, result_comment: text, responded_by: memberId, responded_at: new Date().toISOString(),
      assignee_id: r.assignee_id ?? memberId, updated_at: new Date().toISOString(),
    }).eq('id', r.id)
    if (error) showToast(`保存に失敗: ${error.message}`, 'error')
    else { await notifyToukiRequester(supabase, r, result, text, await myName()); showToast(`「${result}」で返しました（依頼者に通知）`, 'success'); onChanged?.() }
    setBusyId(null)
  }

  const th = 'px-2.5 py-2 text-left font-semibold whitespace-nowrap'
  const td = 'px-2.5 py-2 align-middle'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr>
            <th className={`${th} w-16`}>依頼日</th>
            {mode !== 'case' && <th className={th}>案件</th>}
            <th className={th}>種別</th>
            <th className={th}>法務局／登記の種類</th>
            <th className={`${th} w-16`}>物件</th>
            <th className={th}>一言</th>
            {mode === 'team' && <th className={`${th} w-20`}>依頼者</th>}
            <th className={`${th} w-24`}>経過</th>
            <th className={`${th} w-28`}>状態</th>
            <th className={`${th} w-24`}>登記部門</th>
            <th className={th}>結果</th>
            {(mode === 'team' || onRerequest) && <th className={`${th} w-40`}>操作</th>}
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={12} className="px-3 py-6 text-center text-[12.5px] text-gray-400">{mode === 'team' ? '依頼はありません' : 'まだ依頼はありません。上の操作バーのボタンから登記部門へ頼めます。'}</td></tr>
          ) : list.map(r => {
            const days = toukiOverdueDays(r, todayStr)
            const sev = toukiSeverity(r, todayStr)
            const open = isOpenToukiRequest(r)
            const rerequested = rows.some(x => x.parent_id === r.id)
            return (
              <tr key={r.id} className={`border-b border-gray-100 ${sev === 'chui' ? 'bg-amber-50/40' : ''}`}>
                <td className={`${td} whitespace-nowrap`}>{md(r.requested_at)}</td>
                {mode !== 'case' && (
                  <td className={td}>
                    <Link href={`/cases/${r.case_id}?tab=registration`} className="text-brand-700 hover:underline">
                      <span className="font-mono text-[11.5px]">{r.cases?.case_number ?? ''}</span> {r.cases?.deal_name ?? ''}
                    </Link>
                  </td>
                )}
                <td className={`${td} font-semibold text-gray-800 whitespace-nowrap`}>{r.request_type}{r.parent_id && <span className="ml-1 text-[10.5px] font-normal text-gray-400">再依頼</span>}</td>
                <td className={td}>{[r.office || '法務局未設定', r.registration_type].filter(Boolean).join('／')}</td>
                <td className={`${td} whitespace-nowrap`}>{propText(r.property_ids)}</td>
                <td className={`${td} text-gray-600 max-w-[240px] truncate`} title={r.note ?? ''}>{r.note || <span className="text-gray-300">—</span>}</td>
                {mode === 'team' && <td className={td}>{r.requester?.name ?? '—'}</td>}
                <td className={`${td} whitespace-nowrap`}>
                  {open
                    ? <span className={sev === 'chui' ? 'text-amber-700 font-bold' : sev === 'kakunin' ? 'text-amber-700' : 'text-gray-500'}>{days}営業日{sev === 'chui' ? ' 超過' : ''}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className={td}>
                  <span className={`inline-block px-2 py-[1px] rounded-full text-[11.5px] font-semibold ${TOUKI_STATUS_CLS[r.status]}`}>{r.status}</span>
                  {r.status === '修正あり' && rerequested && <span className="ml-1 text-[10.5px] text-gray-400">再依頼済</span>}
                </td>
                <td className={td}>{r.assignee?.name ?? (r.status === '依頼中' ? <span className="text-gray-300">未着手</span> : '—')}</td>
                <td className={`${td} text-[12px] text-gray-600`}>
                  {r.result_comment ? <span title={r.result_comment}>{r.result_comment}</span> : <span className="text-gray-300">—</span>}
                  {r.responded_at && <span className="ml-1 text-[11px] text-gray-400">（{r.responder?.name ?? ''} {md(r.responded_at)}）</span>}
                </td>
                {(mode === 'team' || onRerequest) && (
                  <td className={`${td} whitespace-nowrap`}>
                    {mode === 'team' && r.status === '依頼中' && (
                      <button type="button" disabled={busyId === r.id} onClick={() => take(r)} className="px-2.5 py-1 rounded-md text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50">対応する</button>
                    )}
                    {mode === 'team' && r.status === '対応中' && (
                      <span className="inline-flex gap-1.5">
                        <button type="button" disabled={busyId === r.id} onClick={() => finish(r, '完了', null)} className="px-2.5 py-1 rounded-md text-[12px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 disabled:opacity-50">完了</button>
                        <button type="button" disabled={busyId === r.id} onClick={() => { setCommentFor(r); setComment('') }} className="px-2.5 py-1 rounded-md text-[12px] font-semibold text-amber-900 bg-amber-50 border border-amber-400 hover:bg-amber-100 disabled:opacity-50">修正あり</button>
                      </span>
                    )}
                    {onRerequest && r.status === '修正あり' && !rerequested && (
                      <button type="button" onClick={() => onRerequest(r)} className="px-2.5 py-1 rounded-md text-[12px] font-semibold text-white bg-brand-600 border border-brand-600 hover:bg-brand-700">直して再依頼</button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* 修正あり：コメント必須 */}
      <Modal isOpen={!!commentFor} onClose={() => setCommentFor(null)} title="修正ありで返す" maxWidth="max-w-md"
        footer={<>
          <Button variant="secondary" onClick={() => setCommentFor(null)}>戻る</Button>
          <Button variant="primary" disabled={!comment.trim()} onClick={async () => { const r = commentFor; setCommentFor(null); if (r) await finish(r, '修正あり', comment.trim()) }}>修正ありで返す</Button>
        </>}>
        <div className="space-y-2">
          <p className="text-[13px] text-gray-700">{commentFor?.request_type}（{commentFor?.office || '法務局未設定'}）を「修正あり」で依頼者に返します。直してほしい点を書いてください。</p>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} autoFocus placeholder="例：持分の記載が協議書と不一致（12番7 は 1/6）"
            className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-brand-500 focus:bg-white" />
        </div>
      </Modal>
    </div>
  )
}
