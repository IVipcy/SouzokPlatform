'use client'

// 不満・クレームタブ（案件報告タブ内サブタブ）。受注担当への報告用。
// 追加すると受注担当へ自動通知。severity∈{クレーム,大クレーム}なら has_complaint も自動セット(migration 197 のトリガー)。

import { useState, useEffect } from 'react'
import { Plus, Trash2, MessageSquare } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { useCurrentMember } from '@/lib/useCurrentMember'
import HourenSouModal from './HourenSouModal'
import AddTaskModal from './AddTaskModal'
import type { CaseRow, MemberRow, CaseComplaintRow, ComplaintSeverity, ComplaintAction } from '@/types'

const SEVERITY_OPTIONS: ComplaintSeverity[] = ['少し不満', '不満', 'クレーム', '大クレーム']
const ACTION_OPTIONS: ComplaintAction[] = ['謝罪・即対応（完結）', '謝罪・受注相談']
const CONTACT_METHOD_OPTIONS = ['電話', 'LINE', 'メール', '手紙']

// severity バッジ配色（薄アンバー→濃赤・大クレームはソリッド赤）
const SEVERITY_CHIP: Record<ComplaintSeverity, string> = {
  '少し不満': 'bg-amber-50 text-amber-800 border border-amber-200',
  '不満':     'bg-red-50 text-red-700 border border-red-200',
  'クレーム':  'bg-red-100 text-red-800 border border-red-300 font-semibold',
  '大クレーム': 'bg-red-600 text-white font-semibold',
}
const ACTION_CHIP: Record<ComplaintAction, string> = {
  '謝罪・即対応（完結）': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  '謝罪・受注相談':       'bg-amber-50 text-amber-700 border border-amber-200',
}

type Props = {
  caseData: CaseRow
  currentMemberId: string | null
  salesMemberId?: string | null
  allMembers: MemberRow[]
}

export default function ComplaintsTab({ caseData, currentMemberId: serverMemberId, salesMemberId = null, allMembers }: Props) {
  const currentMemberId = useCurrentMember(serverMemberId)
  const [rows, setRows] = useState<CaseComplaintRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [hourenSouOpen, setHourenSouOpen] = useState(false)
  const [addTaskOpen, setAddTaskOpen] = useState(false)

  const fetchRows = async () => {
    const supabase = createClient()
    try {
      const { data } = await supabase.from('case_complaints').select('*').eq('case_id', caseData.id).order('occurred_at', { ascending: false })
      setRows((data ?? []) as CaseComplaintRow[])
    } catch { /* migration 197 未適用環境では空扱い */ }
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchRows() }, [caseData.id])

  // 行追加：既定=今日・severity=少し不満・空欄で1行作り、その場で編集させる。受注担当へ通知。
  const handleAdd = async () => {
    if (adding) return
    setAdding(true)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase.from('case_complaints').insert({
      case_id: caseData.id,
      occurred_at: today,
      severity: '少し不満' as ComplaintSeverity,
      created_by: currentMemberId || null,
    }).select('*').single()
    setAdding(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [data as CaseComplaintRow, ...prev])
    // 受注担当へ通知（追加＝報告）。severityは初期「少し不満」だが、後で編集された時点で
    // 重要度が上がる想定なので、まずは記録の事実だけを通知しておく。
    if (salesMemberId && salesMemberId !== currentMemberId) {
      await supabase.from('notifications').insert({
        member_id: salesMemberId,
        type: 'case_complaint',
        case_id: caseData.id,
        title: '不満・クレームが記録されました',
        body: `${caseData.case_number} ${caseData.deal_name}：内容を確認してください`,
      })
    }
    showToast('記録しました', 'success')
  }

  const updateField = async (id: string, patch: Partial<CaseComplaintRow>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } as CaseComplaintRow : r)))
    const supabase = createClient()
    const { error } = await supabase.from('case_complaints').update(patch).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    // severity がクレーム/大クレームへ格上げされたタイミングで受注担当へ再通知
    if (patch.severity && (patch.severity === 'クレーム' || patch.severity === '大クレーム') && salesMemberId && salesMemberId !== currentMemberId) {
      await supabase.from('notifications').insert({
        member_id: salesMemberId,
        type: 'case_complaint',
        case_id: caseData.id,
        title: `【重要】${patch.severity}が記録されました`,
        body: `${caseData.case_number} ${caseData.deal_name}：${patch.severity}として登録されました。至急ご確認ください`,
      })
    }
  }

  const del = async (id: string) => {
    if (!confirm('この記録を削除しますか？')) return
    const supabase = createClient()
    const { error } = await supabase.from('case_complaints').delete().eq('id', id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="space-y-3.5">
      <Section title="不満・クレーム">
        <p className="text-[11px] text-gray-400 mb-2.5">お客様から寄せられた不満・クレームを記録します。追加すると受注担当へ通知され、クレーム／大クレームは案件のクレームフラグ（紫）が自動で立ちます。</p>

        <div className="flex flex-wrap justify-end gap-2 mb-2.5">
          <Button variant="secondary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" strokeWidth={2} />} onClick={handleAdd} loading={adding}>
            クレーム・不満を記録
          </Button>
          <Button variant="secondary" size="sm" leftIcon={<MessageSquare className="w-3.5 h-3.5" strokeWidth={2} />} onClick={() => setHourenSouOpen(true)}>
            報連相
          </Button>
          <Button variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" strokeWidth={2.25} />} onClick={() => setAddTaskOpen(true)}>
            タスク化
          </Button>
        </div>

        {loading ? (
          <div className="text-center text-sm text-gray-400 py-4">読み込み中...</div>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-gray-400 italic py-2">不満・クレームの記録はまだありません。「クレーム・不満を記録」から追加できます。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="bg-brand-700">
                  <th className="px-2 py-1.5 text-left font-semibold text-white border border-brand-600" style={{ width: 130 }}>日付</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-white border border-brand-600" style={{ width: 140 }}>不満・クレーム</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-white border border-brand-600" style={{ width: 100 }}>連絡方法</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-white border border-brand-600">やり取り詳細</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-white border border-brand-600" style={{ width: 180 }}>対応内容</th>
                  <th className="px-2 py-1.5 text-center font-semibold text-white border border-brand-600" style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => <ComplaintRow key={r.id} row={r} onUpdate={updateField} onDelete={() => del(r.id)} />)}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <HourenSouModal
        isOpen={hourenSouOpen}
        onClose={() => setHourenSouOpen(false)}
        caseData={caseData}
        currentMemberId={currentMemberId}
        salesMemberId={salesMemberId}
        allMembers={allMembers}
      />
      <AddTaskModal
        isOpen={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        caseId={caseData.id}
        allMembers={allMembers}
        onSaved={fetchRows}
      />
    </div>
  )
}

function ComplaintRow({ row, onUpdate, onDelete }: { row: CaseComplaintRow; onUpdate: (id: string, patch: Partial<CaseComplaintRow>) => Promise<void>; onDelete: () => void }) {
  const [detail, setDetail] = useState(row.detail ?? '')
  useEffect(() => setDetail(row.detail ?? ''), [row.detail])
  return (
    <tr className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60">
      <td className="px-2 py-1.5 border border-gray-200">
        <input
          type="date"
          value={row.occurred_at}
          onChange={e => onUpdate(row.id, { occurred_at: e.target.value })}
          className="w-full px-1.5 py-1 text-[12px] font-mono border border-gray-200 rounded bg-white outline-none focus:border-brand-500"
        />
      </td>
      <td className="px-2 py-1.5 border border-gray-200">
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex px-2 py-0.5 rounded-[5px] text-[11px] whitespace-nowrap ${SEVERITY_CHIP[row.severity]}`}>{row.severity}</span>
          <select
            value={row.severity}
            onChange={e => onUpdate(row.id, { severity: e.target.value as ComplaintSeverity })}
            className="text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white outline-none focus:border-brand-500"
            title="重要度を変更"
          >
            {SEVERITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </td>
      <td className="px-2 py-1.5 border border-gray-200">
        <select
          value={row.contact_method ?? ''}
          onChange={e => onUpdate(row.id, { contact_method: e.target.value || null })}
          className="w-full px-1.5 py-1 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500"
        >
          <option value="">選択</option>
          {CONTACT_METHOD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5 border border-gray-200">
        <input
          type="text"
          value={detail}
          onChange={e => setDetail(e.target.value)}
          onBlur={() => { if (detail !== (row.detail ?? '')) onUpdate(row.id, { detail: detail || null }) }}
          placeholder="やり取り詳細"
          className="w-full px-1.5 py-1 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500"
        />
      </td>
      <td className="px-2 py-1.5 border border-gray-200">
        <div className="flex items-center gap-1.5">
          {row.action && <span className={`inline-flex px-2 py-0.5 rounded-[5px] text-[11px] whitespace-nowrap ${ACTION_CHIP[row.action]}`}>{row.action}</span>}
          <select
            value={row.action ?? ''}
            onChange={e => onUpdate(row.id, { action: (e.target.value || null) as ComplaintAction | null })}
            className="text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white outline-none focus:border-brand-500 flex-1"
          >
            <option value="">未選択</option>
            {ACTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </td>
      <td className="px-2 py-1.5 border border-gray-200 text-center">
        <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors" title="削除">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}
