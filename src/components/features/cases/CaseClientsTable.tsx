'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { HEIR_RELATIONSHIPS } from '@/lib/constants'
import type { CaseClientRow } from '@/types'
import NameHint from '@/components/ui/NameHint'
import { normalizePersonName } from '@/lib/personName'

type Props = {
  caseId: string
  clients: CaseClientRow[]
  onRefresh?: () => void
  // メイン依頼者の氏名→案件名(deal_name)・clients.name 同期用
  clientId?: string | null
  // 未作成（下書き）モードで、書き込み前に案件を遅延作成して実IDを返す
  ensureCaseId?: () => Promise<string>
}

/** 依頼者一覧（同行者含む）。表形式で複数人をインライン編集・追加・削除する。 */
export default function CaseClientsTable({ caseId, clients, onRefresh, clientId, ensureCaseId }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<CaseClientRow[]>(clients)
  const [busy, setBusy] = useState(false)

  const setLocal = (id: string, field: keyof CaseClientRow, value: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as CaseClientRow : r)))

  // メイン依頼者の氏名を、案件名(cases.deal_name)と clients.name(書類で使う正本)へ反映
  const syncMainName = async (name: string) => {
    const dealName = name.trim() || '無題'
    const cid = ensureCaseId ? await ensureCaseId() : caseId
    await supabase.from('cases').update({ deal_name: dealName }).eq('id', cid)
    if (clientId) await supabase.from('clients').update({ name: dealName }).eq('id', clientId)
    onRefresh?.()
  }

  const commit = async (id: string, field: keyof CaseClientRow, value: string) => {
    // 前後の空白・改行を落として保存する。貼り付けで紛れ込むと、氏名の検索・入金の突合・
    // 重複チェックが「見えない文字」でずれる。姓名のあいだのスペースには手を触れない。
    value = value.trim()
    const { error } = await supabase.from('case_clients').update({ [field]: value === '' ? null : value }).eq('id', id)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    // メイン依頼者の氏名編集 → 案件名へ反映
    if (field === 'name' && rows.find(r => r.id === id)?.priority === 'main') {
      await syncMainName(value)
    }
    // 優先度をメインに変更 → その行の氏名を案件名へ反映
    if (field === 'priority' && value === 'main') {
      await syncMainName(rows.find(r => r.id === id)?.name ?? '')
    }
  }

  // 配列・真偽値など文字列以外の即時保存（連絡先希望 / 外字有無）
  const commitVal = async (id: string, field: keyof CaseClientRow, value: unknown) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } as CaseClientRow : r)))
    const { error } = await supabase.from('case_clients').update({ [field]: value }).eq('id', id)
    if (error) showToast(`保存に失敗しました: ${error.message}`, 'error')
  }

  const addRow = async () => {
    setBusy(true)
    const cid = ensureCaseId ? await ensureCaseId() : caseId
    // 既にメイン依頼者がいない場合は 最初の1件を自動でメインにする（そうしないと 案件名 / clients.name への同期が動かない）
    const hasMain = rows.some(r => r.priority === 'main')
    const priority = hasMain ? 'companion' : 'main'
    const { data, error } = await supabase
      .from('case_clients')
      .insert({ case_id: cid, name: '', priority, sort_order: rows.length })
      .select('*')
      .single()
    setBusy(false)
    if (error || !data) { showToast(`追加に失敗しました: ${error?.message ?? ''}`, 'error'); return }
    setRows(prev => [...prev, data as CaseClientRow])
    onRefresh?.()
  }

  const delRow = async (row: CaseClientRow) => {
    if (!confirm(`「${row.name || '未入力の依頼者'}」を削除しますか？`)) return
    const { error } = await supabase.from('case_clients').delete().eq('id', row.id)
    if (error) { showToast(`削除に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.filter(r => r.id !== row.id))
    onRefresh?.()
  }

  return (
    <div>
      {/* PC: 表（スマホは非表示・下のカード表示） */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-[13px] border-collapse" style={{ minWidth: 760 }}>
          <thead>
            <tr className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
              <th className="px-2 py-2 text-left font-semibold w-28">優先度</th>
              <th className="px-2 py-2 text-left font-semibold">氏名</th>
              <th className="px-2 py-2 text-left font-semibold">ふりがな</th>
              <th className="px-2 py-2 text-left font-semibold w-24">続柄</th>
              <th className="px-2 py-2 text-left font-semibold">TEL（携帯）</th>
              <th className="px-2 py-2 text-left font-semibold w-56">連絡先希望</th>
              <th className="px-2 py-2 text-center font-semibold w-12">外字</th>
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[13px] text-gray-400">依頼者が登録されていません</td></tr>
            ) : (
              rows.map(r => {
                return (
                  <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-2 py-1.5">
                      <select
                        value={r.priority}
                        onChange={e => { setLocal(r.id, 'priority', e.target.value); commit(r.id, 'priority', e.target.value) }}
                        className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500"
                      >
                        <option value="main">メイン依頼人</option>
                        <option value="companion">同行者</option>
                      </select>
                    </td>
                    <Cell value={r.name} onChange={v => setLocal(r.id, 'name', v)} onCommit={v => commit(r.id, 'name', v)} placeholder="山田 太郎" />
                    <Cell value={r.furigana} onChange={v => setLocal(r.id, 'furigana', v)} onCommit={v => commit(r.id, 'furigana', v)} placeholder="やまだ たろう" />
                    <td className="px-2 py-1.5">
                      <select value={r.relationship ?? ''} onChange={e => { setLocal(r.id, 'relationship', e.target.value); commit(r.id, 'relationship', e.target.value) }} className="w-full px-1.5 py-1.5 text-[12px] border border-gray-200 rounded bg-white outline-none focus:border-brand-500">
                        <option value="">選択</option>
                        {r.relationship && !(HEIR_RELATIONSHIPS as readonly string[]).includes(r.relationship) && <option value={r.relationship}>{r.relationship}</option>}
                        {HEIR_RELATIONSHIPS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <Cell value={r.mobile_phone} type="tel" onChange={v => setLocal(r.id, 'mobile_phone', v)} onCommit={v => commit(r.id, 'mobile_phone', v)} placeholder="携帯 090-..." />
                    <PrefContactCell value={r.preferred_contact} onChange={v => commitVal(r.id, 'preferred_contact', v.length > 0 ? v : null)} />
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={!!r.has_special_chars} onChange={e => commitVal(r.id, 'has_special_chars', e.target.checked)} className="w-4 h-4 accent-brand-600 cursor-pointer" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button type="button" onClick={() => delRow(r)} className="text-gray-300 hover:text-red-500 transition-colors" title="削除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* スマホ: カード表示（1人＝1カード） */}
      <div className="sm:hidden space-y-2.5">
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-gray-400">依頼者が登録されていません</div>
        ) : (
          rows.map(r => (
            <ClientCard key={r.id} r={r} setLocal={setLocal} commit={commit} commitVal={commitVal} onDelete={() => delRow(r)} />
          ))
        )}
      </div>

      <button
        type="button"
        onClick={addRow}
        disabled={busy}
        className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
      >
        <Plus className="w-3.5 h-3.5" /> 依頼者を追加
      </button>
    </div>
  )
}

// 連絡先希望（自宅TEL/携帯TEL/メール）を小さなトグルで複数選択
const PREF_CONTACTS: { key: string; label: string }[] = [
  { key: '自宅TEL', label: '自宅' },
  { key: '携帯TEL', label: '携帯' },
  { key: 'LINE', label: 'LINE' },
]
function PrefContactCell({ value, onChange }: { value: string[] | null; onChange: (v: string[]) => void }) {
  const selected = value ?? []
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key])
  return (
    <td className="px-2 py-1.5">
      <div className="flex items-center gap-1">
        {PREF_CONTACTS.map(p => {
          const on = selected.includes(p.key)
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => toggle(p.key)}
              className={`px-1.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </td>
  )
}

// スマホ用：依頼者1人＝1カード（表の代わり）
function CFieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[13px] font-medium text-slate-600 mb-1">{label}</div>{children}</div>
}

function ClientCard({ r, setLocal, commit, commitVal, onDelete }: {
  r: CaseClientRow
  setLocal: (id: string, field: keyof CaseClientRow, value: string) => void
  commit: (id: string, field: keyof CaseClientRow, value: string) => void
  commitVal: (id: string, field: keyof CaseClientRow, value: unknown) => void
  onDelete: () => void
}) {
  const inputCls = 'w-full h-10 px-3 text-[13px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-brand-500 focus:bg-white transition'
  const selectedPref = r.preferred_contact ?? []
  const togglePref = (key: string) => {
    const next = selectedPref.includes(key) ? selectedPref.filter(k => k !== key) : [...selectedPref, key]
    commitVal(r.id, 'preferred_contact', next.length > 0 ? next : null)
  }
  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <select value={r.priority} onChange={e => { setLocal(r.id, 'priority', e.target.value); commit(r.id, 'priority', e.target.value) }} className="flex-1 h-10 px-3 text-[13px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-500">
          <option value="main">メイン依頼人</option>
          <option value="companion">同行者</option>
        </select>
        <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-500 p-1.5" title="削除"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2.5">
        <CFieldBlock label="氏名">
          <input type="text" value={r.name ?? ''} onChange={e => setLocal(r.id, 'name', e.target.value)}
            onBlur={e => { const v = normalizePersonName(e.target.value); setLocal(r.id, 'name', v); commit(r.id, 'name', v) }}
            placeholder="山田　太郎" className={inputCls} />
          <NameHint value={r.name} />
        </CFieldBlock>
        <CFieldBlock label="ふりがな"><input type="text" value={r.furigana ?? ''} onChange={e => setLocal(r.id, 'furigana', e.target.value)} onBlur={e => commit(r.id, 'furigana', e.target.value)} placeholder="やまだ たろう" className={inputCls} /></CFieldBlock>
        <div className="grid grid-cols-2 gap-2.5">
          <CFieldBlock label="続柄"><select value={r.relationship ?? ''} onChange={e => { setLocal(r.id, 'relationship', e.target.value); commit(r.id, 'relationship', e.target.value) }} className={inputCls}><option value="">選択</option>{r.relationship && !(HEIR_RELATIONSHIPS as readonly string[]).includes(r.relationship) && <option value={r.relationship}>{r.relationship}</option>}{HEIR_RELATIONSHIPS.map(o => <option key={o} value={o}>{o}</option>)}</select></CFieldBlock>
          <CFieldBlock label="外字有無"><label className="inline-flex items-center gap-2 h-10 text-[13px] text-gray-700"><input type="checkbox" checked={!!r.has_special_chars} onChange={e => commitVal(r.id, 'has_special_chars', e.target.checked)} className="w-4 h-4 accent-brand-600" />外字あり</label></CFieldBlock>
        </div>
        <CFieldBlock label="TEL（携帯）"><input type="tel" value={r.mobile_phone ?? ''} onChange={e => setLocal(r.id, 'mobile_phone', e.target.value)} onBlur={e => commit(r.id, 'mobile_phone', e.target.value)} placeholder="090-..." className={inputCls} /></CFieldBlock>
        <CFieldBlock label="連絡先希望">
          <div className="flex items-center gap-1.5">
            {PREF_CONTACTS.map(p => {
              const on = selectedPref.includes(p.key)
              return <button key={p.key} type="button" onClick={() => togglePref(p.key)} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-400'}`}>{p.label}</button>
            })}
          </div>
        </CFieldBlock>
      </div>
    </div>
  )
}

function Cell({ value, onChange, onCommit, placeholder, type = 'text' }: {
  value: string | null
  onChange: (v: string) => void
  onCommit: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <td className="px-2 py-1.5">
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        onBlur={e => onCommit(e.target.value)}
        placeholder={placeholder}
        className="w-full px-1.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded outline-none focus:border-brand-500 focus:bg-white transition"
      />
    </td>
  )
}
