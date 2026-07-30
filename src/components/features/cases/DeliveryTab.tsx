'use client'

// 納品タブ。案件詳細の実施タブ末端（案件基本情報の直左）に配置。
// 対象書類 = 受信簿(document_receipt_items) + 契約手続き書類(category='お客様預かり書類')。
// 各書類に「納品対象/対象外」フラグ。書類名で自動集約（戸籍謄本 6通など）。
// 案件レベルの納品ステータス: 準備中 → 確認申請中 → 納品待ち → 納品済
//   確認申請中 は 案件詳細「報告する」→ 分類=納品確認申請 で送信すると自動でセット。
//   納品待ち は 受注担当承認後。納品済 は 管理担当「納品済にする」ボタンで確定 → cases.status='納品完了'。
// 承認/差戻し UI は 案件報告(受信)タブと確認モーダル(HistoryTab)を流用するため、ここでは扱わない。

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, PackageCheck, Loader2 } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  currentMemberId: string | null
  canManage?: boolean  // 管理担当のみ「納品済にする」ボタン可
}

// 統合された書類の1行
type DocRow = {
  id: string
  source: 'receipt' | 'contract'    // 出所
  sourceLabel: string                // 表示用の出所ラベル
  name: string
  quantity: number                   // 通数（集約後）
  latestDate: string | null          // 最新の受領日
  deliveryTarget: boolean            // 納品対象フラグ
  itemIds: string[]                  // 集約前の元レコードID群（トグル時にまとめて更新）
}

const DELIVERY_STATUS_CHIP: Record<string, string> = {
  '準備中': 'bg-gray-100 text-gray-600 border-gray-200',
  '確認申請中': 'bg-amber-50 text-amber-800 border-amber-200',
  '納品待ち': 'bg-sky-100 text-sky-700 border-sky-200',
  '納品済': 'bg-emerald-100 text-emerald-800 border-emerald-300',
}

export default function DeliveryTab({ caseData, canManage = false }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DocRow[]>([])
  const [saving, setSaving] = useState<string | null>(null)  // 更新中の row.id
  const [confirming, setConfirming] = useState(false)
  const deliveryStatus = (caseData.delivery_status ?? '準備中') as string

  const fetchDocs = async () => {
    const supabase = createClient()
    // 受信簿(items) と 契約手続き書類(お客様預かり) を並列取得
    const [{ data: receiptItems }, { data: contractDocs }] = await Promise.all([
      supabase.from('document_receipt_items')
        .select('id, item_name, quantity, delivery_target, document_receipts!inner(case_id, received_date)')
        .eq('document_receipts.case_id', caseData.id),
      supabase.from('contract_documents')
        .select('id, name, arrival_date, category, delivery_target')
        .eq('case_id', caseData.id)
        .eq('category', 'お客様預かり書類'),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (receiptItems ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = (contractDocs ?? []) as any[]

    // 書類名で自動集約（同名は 通数合算・受領日は最新・itemIdsに元IDを積む）
    const map = new Map<string, DocRow>()
    for (const it of items) {
      const key = `receipt::${(it.item_name ?? '').trim()}`
      const r = map.get(key)
      const date = it.document_receipts?.received_date ?? null
      if (r) {
        r.quantity += (it.quantity ?? 1)
        if (date && (!r.latestDate || date > r.latestDate)) r.latestDate = date
        r.itemIds.push(it.id)
        // 集約行の delivery_target は「1つでも対象」ならON扱い（表示用）
        if (it.delivery_target) r.deliveryTarget = true
      } else {
        map.set(key, {
          id: key,
          source: 'receipt',
          sourceLabel: '受信簿',
          name: it.item_name ?? '（無題）',
          quantity: it.quantity ?? 1,
          latestDate: date,
          deliveryTarget: !!it.delivery_target,
          itemIds: [it.id],
        })
      }
    }
    for (const d of docs) {
      const key = `contract::${(d.name ?? '').trim()}`
      const r = map.get(key)
      if (r) {
        r.quantity += 1
        if (d.arrival_date && (!r.latestDate || d.arrival_date > r.latestDate)) r.latestDate = d.arrival_date
        r.itemIds.push(d.id)
        if (d.delivery_target) r.deliveryTarget = true
      } else {
        map.set(key, {
          id: key,
          source: 'contract',
          sourceLabel: '契約手続き / お客様預かり書類',
          name: d.name ?? '（無題）',
          quantity: 1,
          latestDate: d.arrival_date ?? null,
          deliveryTarget: !!d.delivery_target,
          itemIds: [d.id],
        })
      }
    }
    const list = [...map.values()].sort((a, b) => {
      if (a.source !== b.source) return a.source === 'contract' ? -1 : 1
      return a.name.localeCompare(b.name, 'ja')
    })
    setRows(list)
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchDocs() }, [caseData.id])

  // 集約行の delivery_target を切替。同名の元レコードを一括更新。
  const toggleDelivery = async (row: DocRow, next: boolean) => {
    setSaving(row.id)
    const supabase = createClient()
    const table = row.source === 'receipt' ? 'document_receipt_items' : 'contract_documents'
    const { error } = await supabase.from(table).update({ delivery_target: next }).in('id', row.itemIds)
    setSaving(null)
    if (error) { showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, deliveryTarget: next } : r))
  }

  // 「納品済にする」ボタン（管理担当のみ・delivery_status='納品待ち' 時に表示）
  //   → cases.delivery_status='納品済' + cases.status='納品完了'
  const markDelivered = async () => {
    if (!canManage) return
    if (!confirm('納品済にします。案件ステータスも「納品完了」に更新されます。よろしいですか？')) return
    setConfirming(true)
    const supabase = createClient()
    const { error } = await supabase.from('cases').update({ delivery_status: '納品済', status: '納品完了', completion_date: new Date().toISOString().split('T')[0] }).eq('id', caseData.id)
    setConfirming(false)
    if (error) { showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
    showToast('納品完了にしました', 'success')
    router.refresh()
  }

  const targetCount = useMemo(() => rows.filter(r => r.deliveryTarget).length, [rows])

  return (
    <div className="space-y-3.5">
      <Section title="納品">
        <div className="flex items-center gap-2 flex-wrap mb-2.5">
          <span className="text-[13px] text-gray-500">案件レベルの納品ステータス</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-semibold border ${DELIVERY_STATUS_CHIP[deliveryStatus]}`}>{deliveryStatus}</span>
          <span className="text-[11px] text-gray-400 ml-2">対象書類 {targetCount} / 全 {rows.length} 件</span>
          <div className="ml-auto flex items-center gap-2">
            {canManage && deliveryStatus === '納品待ち' && (
              <Button variant="primary" size="sm" onClick={markDelivered} loading={confirming} leftIcon={<PackageCheck className="w-3.5 h-3.5" strokeWidth={2.25} />}>納品済にする</Button>
            )}
          </div>
        </div>

        <p className="text-[11.5px] text-gray-500 mb-2.5 leading-relaxed">
          対象書類 = 受信簿(実務タブ/タスク由来) ＋ 契約手続きの区分「お客様預かり書類」／同名は自動集約（例：戸籍謄本 6通 と1行）／
          対象・対象外を切り替えた後、案件詳細の「報告する」→ 分類「納品確認申請」で受注担当に確認依頼を送ります。
        </p>

        {loading ? (
          <div className="text-center py-8 text-[13px] text-gray-400">読み込み中...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-[13px] text-gray-400">
            納品対象になり得る書類がまだありません。<br />
            受信簿への書類受領登録、または契約手続き（区分＝お客様預かり書類）を登録してください。
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-[13px]">
              <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">書類名</th>
                  <th className="px-3 py-2 text-center font-medium w-16">通数</th>
                  <th className="px-3 py-2 text-left font-medium w-32">受領日(最新)</th>
                  <th className="px-3 py-2 text-left font-medium">出所</th>
                  <th className="px-3 py-2 text-center font-medium w-48">納品対象</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2.5 text-[13px] font-medium text-gray-800">{r.name}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] font-mono text-gray-700">{r.quantity} 通</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{r.latestDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[11.5px] text-gray-600">{r.sourceLabel}</td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" disabled={saving === r.id} onClick={() => toggleDelivery(r, true)}
                          className={`px-2.5 py-0.5 rounded-l-md text-[11.5px] font-semibold border ${r.deliveryTarget ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}>
                          対象
                        </button>
                        <button type="button" disabled={saving === r.id} onClick={() => toggleDelivery(r, false)}
                          className={`px-2.5 py-0.5 rounded-r-md text-[11.5px] font-semibold border -ml-px ${!r.deliveryTarget ? 'bg-red-100 text-red-800 border-red-300' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}>
                          対象外
                        </button>
                        {saving === r.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500 ml-1" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-2.5 flex items-center gap-1">
          <Package className="w-3 h-3" strokeWidth={2} />
          「納品済にする」を押すと案件ステータスが 業務完了 → 納品完了 に変わります。
        </p>
      </Section>
    </div>
  )
}
