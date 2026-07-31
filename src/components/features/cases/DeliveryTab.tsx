'use client'

// 納品タブ v2。案件基本情報ドロップダウンの直左に配置。
// 対象書類 = 受信簿(document_receipt_items) + 契約手続き書類(category='お客様預かり書類')。
// 表示: デフォルト=未選択、フィルタチップ「対象 N」/「対象外 N」で切替。書類名で自動集約(戸籍謄本 6通)。
// Wチェック: 受信簿の確認簿と同じ「ピア確認・ハンコ」テイスト。自分以外の任意メンバーが押せる。
// 納品完了ボタン: 対象書類がすべて Wチェック済み で活性化 → cases.status='納品完了' + delivery_status='納品済'。

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, PackageCheck, X, RotateCcw, UserCheck } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import Button from '@/components/ui/Button'
import HankoStamp from '@/components/ui/HankoStamp'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow } from '@/types'

type Props = {
  caseData: CaseRow
  currentMemberId: string | null
  canManage?: boolean  // 管理担当のみ「納品完了」ボタン可
}

type SourceKind = 'receipt' | 'contract'
type Selection = 'target' | 'exclude' | null

type DocRow = {
  key: string                        // 集約キー (source+name)
  source: SourceKind
  sourceLabel: string
  name: string
  quantity: number                   // 集約後の通数
  latestDate: string | null
  selection: Selection               // 集約行の代表値 (メンバーが操作した状態)
  itemIds: string[]                  // 元レコードID群
  checkedById: string | null         // Wチェック押した人 (集約=全itemが同一人なら)
  checkedByName: string | null
  checkedAt: string | null
}

// delivery_status → 表示ラベル+チップ配色
// 内部値(DB): 準備中 / 確認申請中 / 納品待ち / 納品済
// 表示上: 準備中/確認申請中/納品待ち はすべて「未納品」(進行中)、納品済のみ確定
function statusView(delivery_status: string | null | undefined) {
  const s = delivery_status ?? '準備中'
  if (s === '納品済') return { label: '納品済', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
  return { label: '未納品', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
}

type FilterMode = 'unselected' | 'target' | 'exclude'

export default function DeliveryTab({ caseData, currentMemberId, canManage = false }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DocRow[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('unselected')
  const [memberNameById, setMemberNameById] = useState<Map<string, string>>(new Map())
  const deliveryStatus = (caseData.delivery_status ?? '準備中') as string

  const fetchDocs = async () => {
    const supabase = createClient()
    const [{ data: receiptItems }, { data: contractDocs }, { data: members }] = await Promise.all([
      supabase.from('document_receipt_items')
        .select('id, item_name, quantity, delivery_target, delivery_check_by, delivery_check_at, document_receipts!inner(case_id, received_date)')
        .eq('document_receipts.case_id', caseData.id),
      supabase.from('contract_documents')
        .select('id, name, arrival_date, category, delivery_target, delivery_check_by, delivery_check_at')
        .eq('case_id', caseData.id)
        .eq('category', 'お客様預かり書類'),
      supabase.from('members').select('id, name'),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (receiptItems ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = (contractDocs ?? []) as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memberMap = new Map<string, string>(((members ?? []) as any[]).map(m => [m.id, m.name]))
    setMemberNameById(memberMap)

    // 集約 (source + name)。selection=target/exclude/null、checked情報も集約時に統合。
    const map = new Map<string, DocRow>()
    const acc = (src: SourceKind, srcLabel: string, id: string, name: string, qty: number, date: string | null, deliveryTarget: boolean | null, checkedBy: string | null, checkedAt: string | null) => {
      const key = `${src}::${(name ?? '').trim()}`
      const r = map.get(key)
      const sel: Selection = deliveryTarget === true ? 'target' : deliveryTarget === false ? 'exclude' : null
      if (r) {
        r.quantity += qty
        if (date && (!r.latestDate || date > r.latestDate)) r.latestDate = date
        r.itemIds.push(id)
        // 集約: 対象が1件でもあれば対象。全て未選択なら未選択。全て exclude なら exclude。
        if (r.selection !== 'target') {
          if (sel === 'target') r.selection = 'target'
          else if (sel === 'exclude' && r.selection !== 'exclude') r.selection = 'exclude'
        }
        // Wチェック: 全 item が同一人なら情報を保持、それ以外は null (未チェック扱い)
        if (r.checkedById === null && checkedBy) { r.checkedById = checkedBy; r.checkedAt = checkedAt; r.checkedByName = memberMap.get(checkedBy) ?? null }
        else if (r.checkedById !== checkedBy) { r.checkedById = null; r.checkedAt = null; r.checkedByName = null }
      } else {
        map.set(key, {
          key, source: src, sourceLabel: srcLabel, name: name ?? '（無題）', quantity: qty,
          latestDate: date, selection: sel, itemIds: [id],
          checkedById: checkedBy, checkedAt: checkedAt,
          checkedByName: checkedBy ? memberMap.get(checkedBy) ?? null : null,
        })
      }
    }
    for (const it of items) acc('receipt', '受信簿', it.id, it.item_name, it.quantity ?? 1, it.document_receipts?.received_date ?? null, it.delivery_target ?? null, it.delivery_check_by ?? null, it.delivery_check_at ?? null)
    for (const d of docs) acc('contract', '契約手続き / お客様預かり書類', d.id, d.name, 1, d.arrival_date ?? null, d.delivery_target ?? null, d.delivery_check_by ?? null, d.delivery_check_at ?? null)

    const list = [...map.values()].sort((a, b) => {
      if (a.source !== b.source) return a.source === 'contract' ? -1 : 1
      return a.name.localeCompare(b.name, 'ja')
    })
    setRows(list)
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchDocs() }, [caseData.id])

  // 対象/対象外 選択 (集約された同名書類を一括更新)
  const setSelection = async (row: DocRow, next: Selection) => {
    setSaving(row.key)
    const supabase = createClient()
    const table = row.source === 'receipt' ? 'document_receipt_items' : 'contract_documents'
    const val = next === 'target' ? true : next === 'exclude' ? false : null
    const { error } = await supabase.from(table).update({ delivery_target: val }).in('id', row.itemIds)
    setSaving(null)
    if (error) { showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
    await fetchDocs()
  }

  // Wチェック: 自分以外の任意メンバーがハンコを押す。同一書類の元レコード全部にスタンプ。
  const toggleCheck = async (row: DocRow) => {
    if (!currentMemberId) { showToast('ログイン情報が取得できません', 'error'); return }
    setSaving(row.key)
    const supabase = createClient()
    const table = row.source === 'receipt' ? 'document_receipt_items' : 'contract_documents'
    const isChecked = !!row.checkedAt
    // 既にチェック済みなら解除(誰でも取り消せる)、未チェックなら自分がハンコ押す
    const payload = isChecked
      ? { delivery_check_by: null, delivery_check_at: null }
      : { delivery_check_by: currentMemberId, delivery_check_at: new Date().toISOString() }
    const { error } = await supabase.from(table).update(payload).in('id', row.itemIds)
    setSaving(null)
    if (error) { showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
    await fetchDocs()
  }

  // 納品完了 (対象書類 全件 Wチェック済み で活性)
  const markDelivered = async () => {
    if (!canManage) return
    if (!confirm('納品完了にします。案件ステータスも「納品完了」に更新されます。よろしいですか？')) return
    setConfirming(true)
    const supabase = createClient()
    const { error } = await supabase.from('cases').update({ delivery_status: '納品済', status: '納品完了', completion_date: new Date().toISOString().split('T')[0] }).eq('id', caseData.id)
    setConfirming(false)
    if (error) { showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
    showToast('納品完了にしました', 'success')
    router.refresh()
  }

  const targetRows = useMemo(() => rows.filter(r => r.selection === 'target'), [rows])
  const excludeRows = useMemo(() => rows.filter(r => r.selection === 'exclude'), [rows])
  const unselectedRows = useMemo(() => rows.filter(r => r.selection === null), [rows])
  const checkedCount = useMemo(() => targetRows.filter(r => !!r.checkedAt).length, [targetRows])
  const canComplete = canManage && targetRows.length > 0 && checkedCount === targetRows.length && deliveryStatus !== '納品済'

  const shownRows = filter === 'target' ? targetRows : filter === 'exclude' ? excludeRows : unselectedRows

  return (
    <div className="space-y-3.5">
      <Section title="納品">
        {/* ヘッダー: ステータス + フィルタチップ + 納品完了ボタン */}
        {(() => { const sv = statusView(deliveryStatus); return (
        <div className="flex items-center gap-2 flex-wrap mb-2.5">
          <span className="text-[13px] text-gray-500">納品ステータス</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-semibold border ${sv.cls}`}>{sv.label}</span>
          <div className="flex items-center gap-1 ml-4">
            <FilterChip label="未選択" active={filter === 'unselected'} count={unselectedRows.length} onClick={() => setFilter('unselected')} />
            <FilterChip label="✓ 対象" active={filter === 'target'} count={targetRows.length} onClick={() => setFilter('target')} tone="target" />
            <FilterChip label="✗ 対象外" active={filter === 'exclude'} count={excludeRows.length} onClick={() => setFilter('exclude')} tone="exclude" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {filter === 'target' && (
              <span className="text-[11.5px] text-gray-500">Wチェック済み <span className={`font-mono font-bold ${checkedCount === targetRows.length ? 'text-emerald-600' : 'text-amber-600'}`}>{checkedCount}</span> / {targetRows.length}</span>
            )}
            {canManage && (
              <Button variant="primary" size="sm" onClick={markDelivered} loading={confirming} disabled={!canComplete} leftIcon={<PackageCheck className="w-3.5 h-3.5" strokeWidth={2.25} />}>
                納品完了{canComplete ? '' : (targetRows.length === 0 ? ' (対象なし)' : ` (残 ${targetRows.length - checkedCount}件)`)}
              </Button>
            )}
          </div>
        </div>
        ) })()}

        <p className="text-[11.5px] text-gray-500 mb-2.5 leading-relaxed">
          対象書類 = 受信簿(実務タブ/タスク由来) ＋ 契約手続きの区分「お客様預かり書類」／同名は自動集約（例: 戸籍謄本 6通 と1行）。<br />
          対象/対象外 を選ぶと 未選択タブから消えて 対象/対象外 タブへ移動。対象タブで 各書類に Wチェック(ピア確認・自分以外がハンコ) → 全件済みで 納品完了 が押せます。
        </p>

        {loading ? (
          <div className="text-center py-8 text-[13px] text-gray-400">読み込み中...</div>
        ) : shownRows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-[13px] text-gray-400">
            {filter === 'unselected' && '未選択の書類はありません（対象/対象外 全件選択済み）'}
            {filter === 'target' && '対象の書類はありません'}
            {filter === 'exclude' && '対象外の書類はありません'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-[13px]">
              <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <tr>
                  <th className="px-2 py-2 text-center font-medium w-10">No</th>
                  <th className="px-3 py-2 text-left font-medium">書類名</th>
                  <th className="px-2 py-2 text-center font-medium w-14">個数</th>
                  <th className="px-3 py-2 text-left font-medium w-28">受領日(最新)</th>
                  <th className="px-3 py-2 text-left font-medium">出所</th>
                  {filter === 'target' && <th className="px-3 py-2 text-center font-medium w-56">Wチェック</th>}
                  <th className="px-3 py-2 text-center font-medium w-56">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shownRows.map((r, i) => (
                  <tr key={r.key} className="hover:bg-gray-50/60">
                    <td className="px-2 py-2.5 text-center text-[12px] font-mono text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2.5 text-[13px] font-medium text-gray-800">{r.name}</td>
                    <td className="px-2 py-2.5 text-center text-[12px] font-mono text-gray-700">{r.quantity} 通</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600">{r.latestDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-[11.5px] text-gray-600">{r.sourceLabel}</td>
                    {filter === 'target' && (
                      <td className="px-3 py-2.5 text-center">
                        {r.checkedAt ? (
                          <span className="inline-flex items-center gap-1 relative">
                            <HankoStamp name={r.checkedByName} at={r.checkedAt} size="sm" />
                            <button type="button" onClick={() => toggleCheck(r)} title="Wチェックを取消"
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ) : (
                          <button type="button" disabled={saving === r.key} onClick={() => toggleCheck(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-gray-500 bg-white border border-gray-300 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50">
                            <UserCheck className="w-3 h-3" />未確認
                          </button>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-center">
                      {r.selection === null && (
                        <div className="inline-flex items-center gap-1">
                          <button type="button" disabled={saving === r.key} onClick={() => setSelection(r, 'target')}
                            className="px-2.5 py-0.5 rounded-md text-[11.5px] font-semibold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50">対象</button>
                          <button type="button" disabled={saving === r.key} onClick={() => setSelection(r, 'exclude')}
                            className="px-2.5 py-0.5 rounded-md text-[11.5px] font-semibold bg-white text-red-700 border border-red-300 hover:bg-red-50">対象外</button>
                        </div>
                      )}
                      {r.selection === 'target' && (
                        <button type="button" disabled={saving === r.key} onClick={() => setSelection(r, 'exclude')}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11.5px] font-semibold text-red-700 bg-white border border-red-300 hover:bg-red-50">
                          <X className="w-3 h-3" strokeWidth={2.25} />対象外にする
                        </button>
                      )}
                      {r.selection === 'exclude' && (
                        <button type="button" disabled={saving === r.key} onClick={() => setSelection(r, 'target')}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11.5px] font-semibold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50">
                          <RotateCcw className="w-3 h-3" strokeWidth={2.25} />対象にする
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-2.5 flex items-center gap-1">
          <Package className="w-3 h-3" strokeWidth={2} />
          「納品完了」を押すと 案件ステータスが 業務完了 → 納品完了 に変わります。
        </p>
      </Section>
    </div>
  )
}

function FilterChip({ label, active, count, onClick, tone }: { label: string; active: boolean; count: number; onClick: () => void; tone?: 'target' | 'exclude' }) {
  const activeCls = tone === 'target' ? 'bg-emerald-600 text-white border-emerald-600' : tone === 'exclude' ? 'bg-red-600 text-white border-red-600' : 'bg-brand-600 text-white border-brand-600'
  const idleCls = 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold border transition ${active ? activeCls : idleCls}`}>
      {label} <span className={`font-mono ${active ? 'opacity-90' : 'opacity-70'}`}>{count}</span>
    </button>
  )
}
