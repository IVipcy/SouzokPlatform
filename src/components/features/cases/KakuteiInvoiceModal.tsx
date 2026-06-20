'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { recommendKakuteiOffice, computeKakutei, type ExpenseItem } from '@/lib/kakuteiVariants'
import { type StampLaw } from '@/lib/ininjoVariants'
import type { CaseRow, TaskRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseData: CaseRow
  tasks: TaskRow[]
  defaultTaskId?: string
  onSaved?: () => void
}

type Row = { id: string; name: string; amount: number | ''; taxable: boolean }

const NEW_ID = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const yen = (n: number) => `${n.toLocaleString('en-US')}円`

export default function KakuteiInvoiceModal({ isOpen, onClose, caseData, tasks, defaultTaskId, onSaved }: Props) {
  const recommendedOffice = useMemo(() => recommendKakuteiOffice(caseData.contract_type), [caseData.contract_type])
  const [office, setOffice] = useState<StampLaw>(recommendedOffice)
  const [kenmei, setKenmei] = useState('')
  const [fee, setFee] = useState<number | ''>('')
  const [advance, setAdvance] = useState<number | ''>('')
  const [rows, setRows] = useState<Row[]>([])
  const [taskId, setTaskId] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setOffice(recommendedOffice)
    setKenmei(`${caseData.deceased_name ? caseData.deceased_name + '様 ' : ''}相続手続き 確定請求`)
    setFee('')
    setAdvance('')
    setRows([{ id: NEW_ID(), name: '', amount: '', taxable: false }])
    setTaskId(defaultTaskId ?? '')
    // 案件に登録済みの立替実費を初期表示（空欄になる問題の解消）。課税フラグも引き継ぐ。
    ;(async () => {
      const { data } = await createClient()
        .from('expenses')
        .select('item_name, amount, taxable, expense_date')
        .eq('case_id', caseData.id)
        .order('expense_date', { ascending: true })
      const exp = (data ?? []) as Array<{ item_name: string | null; amount: number | null; taxable: boolean | null }>
      if (exp.length > 0) {
        setRows(exp.map(e => ({ id: NEW_ID(), name: e.item_name ?? '', amount: e.amount ?? 0, taxable: e.taxable !== false })))
      }
    })()
  }, [isOpen, recommendedOffice, caseData.deceased_name, caseData.id, defaultTaskId])

  const expenses: ExpenseItem[] = rows.map(r => ({ name: r.name.trim(), amount: Number(r.amount) || 0, taxable: r.taxable }))
  const calc = computeKakutei(Number(fee) || 0, Number(advance) || 0, expenses)

  const addRow = () => setRows(r => [...r, { id: NEW_ID(), name: '', amount: '', taxable: false }])
  const updateRow = (id: string, patch: Partial<Row>) => setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x))
  const delRow = (id: string) => setRows(r => r.filter(x => x.id !== id))

  const handleGenerate = async () => {
    if (fee === '' || Number(fee) < 0) { showToast('報酬額を入力してください', 'error'); return }
    if (!kenmei.trim()) { showToast('件名を入力してください', 'error'); return }
    setGenerating(true)
    try {
      const res = await fetch('/api/documents/kakutei', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          variant: office === 'shiho' ? 'kakutei_shiho' : 'kakutei_gyosei',
          kenmei: kenmei.trim(),
          fee: Number(fee),
          advanceReceived: Number(advance) || 0,
          expenses: expenses.filter(e => e.name || e.amount > 0),
          taskId: taskId || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '生成に失敗しました' }))
        showToast(`生成に失敗: ${err.error ?? '不明なエラー'}`, 'error')
        return
      }
      const blob = await res.blob()
      const filename = `確定請求書_立替実費_${office === 'gyosei' ? '行政' : '司法'}_${caseData.case_number ?? ''}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      showToast('確定請求書＋立替実費明細を生成しました', 'success')
      onSaved?.()
      onClose()
    } catch (e) {
      showToast(`通信エラー: ${(e as Error).message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="請求書（確定）＋立替実費明細 を作成"
      maxWidth="max-w-3xl"
      footer={
        <>
          <button onClick={onClose} disabled={generating} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50">キャンセル</button>
          <button onClick={handleGenerate} disabled={generating} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50">{generating ? '生成中…' : 'Excelで出力（2シート）'}</button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 発行主体 */}
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">発行主体<span className="ml-2 text-[12px] font-normal text-gray-400">契約形態「{caseData.contract_type ?? '未設定'}」から推奨</span></label>
          <div className="flex gap-2">
            {(['gyosei', 'shiho'] as StampLaw[]).map(o => (
              <button key={o} type="button" onClick={() => setOffice(o)}
                className={`flex-1 text-sm px-3 py-2 rounded-lg border transition-colors ${office === o ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'}`}>
                {o === 'gyosei' ? '行政書士法人オーシャン' : '司法書士法人オーシャン'}{o === recommendedOffice ? '（推奨）' : ''}
              </button>
            ))}
          </div>
        </section>

        {/* 件名 */}
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">件名</label>
          <input type="text" value={kenmei} onChange={e => setKenmei(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-400" />
        </section>

        {/* 報酬・前受金 */}
        <section className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">報酬額（税込）</label>
            <input type="number" min={0} value={fee} onChange={e => setFee(e.target.value === '' ? '' : Number(e.target.value))} placeholder="例: 330000" className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">前受金（受領済・差引）</label>
            <input type="number" min={0} value={advance} onChange={e => setAdvance(e.target.value === '' ? '' : Number(e.target.value))} placeholder="例: 110000" className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-brand-400" />
          </div>
        </section>

        {/* 立替実費明細 */}
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-700">立替実費明細（立替実費明細シートに反映）</label>
            <button type="button" onClick={addRow} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded"><Plus className="w-3 h-3" />明細を追加</button>
          </div>
          <div className="space-y-1.5">
            {rows.map(row => (
              <div key={row.id} className="flex items-center gap-2">
                <input type="text" value={row.name} onChange={e => updateRow(row.id, { name: e.target.value })} placeholder="名目（例: 戸籍取得手数料）" className="flex-1 text-[13px] border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-brand-400" />
                <input type="number" min={0} value={row.amount} onChange={e => updateRow(row.id, { amount: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="金額(税込)" className="w-28 text-[13px] border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-brand-400" />
                <label className="inline-flex items-center gap-1 text-[12px] text-gray-600 whitespace-nowrap">
                  <input type="checkbox" checked={row.taxable} onChange={e => updateRow(row.id, { taxable: e.target.checked })} />
                  課税
                </label>
                <button type="button" onClick={() => delRow(row.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">課税にチェックすると課税分（税込）として集計、未チェックは非課税（官公署手数料等）として集計します。</p>
        </section>

        {/* 計算プレビュー */}
        <section className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[13px] space-y-1">
          <Row label="報酬（税込）" value={yen(Number(fee) || 0)} sub={`内消費税 ${yen(calc.feeTax)}`} />
          <Row label="立替実費（課税・税込）" value={yen(calc.taxSubtotal)} sub={`内消費税 ${yen(calc.taxExpTax)}`} />
          <Row label="立替実費（非課税）" value={yen(calc.nonTaxSubtotal)} />
          <Row label="小計（税込）" value={yen(calc.subtotal)} />
          <Row label="前受金（差引）" value={`-${yen(Number(advance) || 0)}`} />
          <div className="flex items-center justify-between pt-1 border-t border-gray-200 mt-1">
            <span className="font-bold text-gray-800">請求額</span>
            <span className="font-bold text-brand-700 text-base">{yen(calc.billAmount)}</span>
          </div>
        </section>

        {/* 作成タスク */}
        <section>
          <label className="block text-xs font-semibold text-gray-700 mb-1">作成タスク（任意）</label>
          <select value={taskId} onChange={e => setTaskId(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-brand-400">
            <option value="">案件全体（タスク未指定）</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </section>

        <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
          ※ 1ファイルに「確定請求書」と「立替実費明細」の2シートを出力します。報酬・立替は税込入力、内消費税は自動計算。前受金は消費税対象外で差し引きます。発行日は空欄（手書き）です。
        </p>
      </div>
    </Modal>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}{sub && <span className="ml-2 text-[11px] text-gray-400">{sub}</span>}</span>
      <span className="text-gray-800 font-mono">{value}</span>
    </div>
  )
}
