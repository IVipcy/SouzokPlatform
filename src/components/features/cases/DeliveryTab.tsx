'use client'

// 納品タブ v3。案件基本情報ドロップダウンの直左に配置。
// 対象書類 = 受信簿(document_receipt_items) + 契約手続き書類(category='お客様預かり書類')。
// 表示: デフォルト=未選択、フィルタチップ「対象 N」/「対象外 N」で切替。書類名で自動集約(戸籍謄本 6通)。
// Wチェック: 受信簿の確認簿と同じ「ピア確認・ハンコ」テイスト。自分以外の任意メンバーが押せる。
// 納品完了ボタン: 対象書類がすべて Wチェック済み で活性化 → cases.status='納品完了' + delivery_status='納品済'。
//
// v3 追加 (Phase B):
//   - 名称インライン編集 (delivery_display_name)。他タブ(実務)には影響しない納品タブ限定リネーム。
//   - 権利証補足モーダル: 名前に「権利証/権利書」を含む行に対して、登記識別情報通知の
//     通知日+識別番号を手入力する。原本受領証の該当行にぶら下がる。
//   - 相続人紐付モーダル: 名前に「印鑑」を含む行に対して、相続人を複数選択し配列で保存。
//     原本受領証では「(A様、B様、C様 各1通)」形式で列挙。

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, PackageCheck, X, RotateCcw, UserCheck, FileText, Users, Mail } from 'lucide-react'
import { Section } from '@/components/ui/InlineFields'
import Button from '@/components/ui/Button'
import HankoStamp from '@/components/ui/HankoStamp'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import type { CaseRow, HeirRow, TaskRow } from '@/types'
import GenponJuryoshoModal from './GenponJuryoshoModal'
import EnvelopeDocumentModal from './EnvelopeDocumentModal'

type Props = {
  caseData: CaseRow  // CaseRow.clients?: ClientRow | null が既に定義済み
  currentMemberId: string | null
  canManage?: boolean  // 管理担当のみ「納品完了」ボタン可
  heirs?: HeirRow[]    // 相続人紐付モーダル(印鑑証明書)用 + 原本受領証/封筒の郵送先選択用
  tasks?: TaskRow[]    // 封筒生成時のタスク紐付用
}

type SourceKind = 'receipt' | 'contract'
type Selection = 'target' | 'exclude' | null

type DocRow = {
  key: string                        // 集約キー (source+name)
  source: SourceKind
  sourceLabel: string
  name: string                       // 元の書類名 (受信簿/契約手続き 側の name)
  displayName: string | null         // 納品タブ限定リネーム (優先表示)
  quantity: number                   // 集約後の通数
  latestDate: string | null
  selection: Selection               // 集約行の代表値
  itemIds: string[]                  // 元レコードID群
  checkedById: string | null
  checkedByName: string | null
  checkedAt: string | null
  toukiNoticeDate: string | null     // 権利証補足
  toukiNoticeNumber: string | null   // 権利証補足
  inkanClientNames: string[] | null  // 印鑑証明書に紐付く相続人名
}

function statusView(delivery_status: string | null | undefined) {
  const s = delivery_status ?? '準備中'
  if (s === '納品済') return { label: '納品済', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
  return { label: '未納品', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
}

type FilterMode = 'unselected' | 'target' | 'exclude'

// 権利証行 = 名前に権利証/権利書を含む
const isKenriRow = (r: DocRow) => /権利証|権利書/.test(r.displayName || r.name)
// 印鑑証明書行 = 名前に印鑑を含む
const isInkanRow = (r: DocRow) => /印鑑/.test(r.displayName || r.name)

export default function DeliveryTab({ caseData, currentMemberId, canManage = false, heirs = [], tasks = [] }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<DocRow[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [filter, setFilter] = useState<FilterMode>('unselected')
  const [memberNameById, setMemberNameById] = useState<Map<string, string>>(new Map())
  // 各行の displayName インライン編集の一時値 (キー=DocRow.key)
  const [editingName, setEditingName] = useState<Record<string, string>>({})
  // モーダル: 権利証補足 / 印鑑相続人紐付 / 原本受領証 / 封筒印刷
  const [toukiTarget, setToukiTarget] = useState<DocRow | null>(null)
  const [inkanTarget, setInkanTarget] = useState<DocRow | null>(null)
  const [genponOpen, setGenponOpen] = useState(false)
  const [envelopeOpen, setEnvelopeOpen] = useState(false)
  const deliveryStatus = (caseData.delivery_status ?? '準備中') as string

  const fetchDocs = async () => {
    const supabase = createClient()
    const [{ data: receiptItems }, { data: contractDocs }, { data: members }] = await Promise.all([
      supabase.from('document_receipt_items')
        .select('id, item_name, quantity, delivery_target, delivery_check_by, delivery_check_at, delivery_display_name, delivery_touki_notice_date, delivery_touki_notice_number, delivery_inkan_client_names, document_receipts!inner(case_id, received_date)')
        .eq('document_receipts.case_id', caseData.id),
      supabase.from('contract_documents')
        .select('id, name, arrival_date, category, delivery_target, delivery_check_by, delivery_check_at, delivery_display_name, delivery_touki_notice_date, delivery_touki_notice_number, delivery_inkan_client_names')
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

    const map = new Map<string, DocRow>()
    const acc = (
      src: SourceKind, srcLabel: string, id: string, name: string, qty: number,
      date: string | null, deliveryTarget: boolean | null,
      checkedBy: string | null, checkedAt: string | null,
      displayName: string | null, toukiDate: string | null, toukiNumber: string | null, inkanNames: string[] | null,
    ) => {
      const key = `${src}::${(name ?? '').trim()}`
      const r = map.get(key)
      const sel: Selection = deliveryTarget === true ? 'target' : deliveryTarget === false ? 'exclude' : null
      if (r) {
        r.quantity += qty
        if (date && (!r.latestDate || date > r.latestDate)) r.latestDate = date
        r.itemIds.push(id)
        if (r.selection !== 'target') {
          if (sel === 'target') r.selection = 'target'
          else if (sel === 'exclude' && r.selection !== 'exclude') r.selection = 'exclude'
        }
        if (r.checkedById === null && checkedBy) { r.checkedById = checkedBy; r.checkedAt = checkedAt; r.checkedByName = memberMap.get(checkedBy) ?? null }
        else if (r.checkedById !== checkedBy) { r.checkedById = null; r.checkedAt = null; r.checkedByName = null }
        // displayName/touki/inkan は 集約時 最初に非nullが見つかったものを採用 (通常アイテムは1件なのでほぼ差はない)
        if (!r.displayName && displayName) r.displayName = displayName
        if (!r.toukiNoticeDate && toukiDate) r.toukiNoticeDate = toukiDate
        if (!r.toukiNoticeNumber && toukiNumber) r.toukiNoticeNumber = toukiNumber
        if ((!r.inkanClientNames || r.inkanClientNames.length === 0) && inkanNames && inkanNames.length > 0) r.inkanClientNames = inkanNames
      } else {
        map.set(key, {
          key, source: src, sourceLabel: srcLabel, name: name ?? '（無題）',
          displayName, quantity: qty, latestDate: date, selection: sel, itemIds: [id],
          checkedById: checkedBy, checkedAt: checkedAt,
          checkedByName: checkedBy ? memberMap.get(checkedBy) ?? null : null,
          toukiNoticeDate: toukiDate, toukiNoticeNumber: toukiNumber, inkanClientNames: inkanNames,
        })
      }
    }
    for (const it of items) acc('receipt', '受信簿', it.id, it.item_name, it.quantity ?? 1, it.document_receipts?.received_date ?? null, it.delivery_target ?? null, it.delivery_check_by ?? null, it.delivery_check_at ?? null, it.delivery_display_name ?? null, it.delivery_touki_notice_date ?? null, it.delivery_touki_notice_number ?? null, it.delivery_inkan_client_names ?? null)
    for (const d of docs) acc('contract', '契約手続き / お客様預かり書類', d.id, d.name, 1, d.arrival_date ?? null, d.delivery_target ?? null, d.delivery_check_by ?? null, d.delivery_check_at ?? null, d.delivery_display_name ?? null, d.delivery_touki_notice_date ?? null, d.delivery_touki_notice_number ?? null, d.delivery_inkan_client_names ?? null)

    const list = [...map.values()].sort((a, b) => {
      if (a.source !== b.source) return a.source === 'contract' ? -1 : 1
      return (a.displayName || a.name).localeCompare(b.displayName || b.name, 'ja')
    })
    setRows(list)
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchDocs() }, [caseData.id])

  const tableForSource = (src: SourceKind) => src === 'receipt' ? 'document_receipt_items' : 'contract_documents'

  const setSelection = async (row: DocRow, next: Selection) => {
    setSaving(row.key)
    const supabase = createClient()
    const val = next === 'target' ? true : next === 'exclude' ? false : null
    const { error } = await supabase.from(tableForSource(row.source)).update({ delivery_target: val }).in('id', row.itemIds)
    setSaving(null)
    if (error) { showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
    await fetchDocs()
  }

  const toggleCheck = async (row: DocRow) => {
    if (!currentMemberId) { showToast('ログイン情報が取得できません', 'error'); return }
    setSaving(row.key)
    const supabase = createClient()
    const isChecked = !!row.checkedAt
    const payload = isChecked
      ? { delivery_check_by: null, delivery_check_at: null }
      : { delivery_check_by: currentMemberId, delivery_check_at: new Date().toISOString() }
    const { error } = await supabase.from(tableForSource(row.source)).update(payload).in('id', row.itemIds)
    setSaving(null)
    if (error) { showToast(`更新に失敗しました: ${error.message}`, 'error'); return }
    await fetchDocs()
  }

  // 名称リネーム保存 (blur時)。空文字は null にして 元の名前表示に戻す。
  const commitDisplayName = async (row: DocRow, next: string) => {
    const trimmed = next.trim()
    const currentEffective = row.displayName ?? ''
    if (trimmed === currentEffective) return
    setSaving(row.key)
    const supabase = createClient()
    const val = trimmed === '' ? null : trimmed
    const { error } = await supabase.from(tableForSource(row.source)).update({ delivery_display_name: val }).in('id', row.itemIds)
    setSaving(null)
    if (error) { showToast(`名称の保存に失敗しました: ${error.message}`, 'error'); return }
    setEditingName(prev => { const { [row.key]: _, ...rest } = prev; return rest })
    await fetchDocs()
  }

  const saveToukiNotice = async (row: DocRow, date: string, number: string) => {
    setSaving(row.key)
    const supabase = createClient()
    const { error } = await supabase.from(tableForSource(row.source))
      .update({ delivery_touki_notice_date: date.trim() || null, delivery_touki_notice_number: number.trim() || null })
      .in('id', row.itemIds)
    setSaving(null)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    setToukiTarget(null)
    await fetchDocs()
  }

  const saveInkanClientNames = async (row: DocRow, names: string[]) => {
    setSaving(row.key)
    const supabase = createClient()
    const { error } = await supabase.from(tableForSource(row.source))
      .update({ delivery_inkan_client_names: names.length > 0 ? names : null })
      .in('id', row.itemIds)
    setSaving(null)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    setInkanTarget(null)
    await fetchDocs()
  }

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
  const canComplete = targetRows.length > 0 && checkedCount === targetRows.length && deliveryStatus !== '納品済'

  const shownRows = filter === 'target' ? targetRows : filter === 'exclude' ? excludeRows : unselectedRows

  return (
    <div className="space-y-3.5">
      <Section title="納品">
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
            <button
              type="button"
              onClick={() => setGenponOpen(true)}
              disabled={targetRows.length === 0}
              title={targetRows.length === 0 ? '対象書類を1件以上選んでください' : 'お客様返却用の原本受領証を作成'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-brand-800 bg-brand-50 border border-brand-300 hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <FileText className="w-3.5 h-3.5" strokeWidth={2} />原本受領証を作成
            </button>
            <button
              type="button"
              onClick={() => setEnvelopeOpen(true)}
              title="返送用の封筒を作成"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" strokeWidth={2} />封筒印刷
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={markDelivered}
              loading={confirming}
              disabled={!canComplete || !canManage}
              leftIcon={<PackageCheck className="w-3.5 h-3.5" strokeWidth={2.25} />}
              title={!canManage ? 'この案件の管理担当のみ押せます' : (deliveryStatus === '納品済' ? '既に納品済です' : (targetRows.length === 0 ? '対象書類を1件以上選んでください' : (checkedCount < targetRows.length ? `Wチェックが残 ${targetRows.length - checkedCount} 件` : '')))}
            >
              納品完了{deliveryStatus === '納品済' ? ' (済)' : canComplete ? '' : targetRows.length === 0 ? ' (対象なし)' : ` (残 ${targetRows.length - checkedCount}件)`}
            </Button>
          </div>
        </div>
        ) })()}

        <p className="text-[11.5px] text-gray-500 mb-2.5 leading-relaxed">
          対象書類 = 受信簿(実務タブ/タスク由来) ＋ 契約手続きの区分「お客様預かり書類」／同名は自動集約（例: 戸籍謄本 6通 と1行）。<br />
          対象/対象外 を選ぶと 未選択タブから消えて 対象/対象外 タブへ移動。対象タブで 各書類に Wチェック(ピア確認・自分以外がハンコ) → 全件済みで 納品完了 が押せます。<br />
          <span className="text-brand-700">名称セルは直接編集して 納品タブ限定でリネーム可 (原本受領証には この名称で流し込まれます)。「権利証」を含む行は 登記識別情報通知(通知日+識別番号) を入力できます。「印鑑」を含む行は 相続人紐付が可能です。</span>
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
            <table className="w-full text-[13px]" style={{ minWidth: 900 }}>
              <thead className="bg-brand-50/60 border-b border-brand-100 text-[11px] text-brand-700 tracking-[0.04em]">
                <tr>
                  <th className="px-2 py-2 text-center font-medium w-10">No</th>
                  <th className="px-3 py-2 text-left font-medium">書類名（クリックで編集）</th>
                  <th className="px-2 py-2 text-center font-medium w-14">個数</th>
                  <th className="px-3 py-2 text-left font-medium w-28">受領日(最新)</th>
                  <th className="px-3 py-2 text-left font-medium w-48">補足</th>
                  {filter === 'target' && <th className="px-3 py-2 text-center font-medium w-40">Wチェック</th>}
                  <th className="px-3 py-2 text-center font-medium w-52">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shownRows.map((r, i) => {
                  const editing = editingName[r.key] ?? null
                  const shownName = editing !== null ? editing : (r.displayName ?? r.name)
                  return (
                  <tr key={r.key} className="hover:bg-gray-50/60">
                    <td className="px-2 py-2.5 text-center text-[12px] font-mono text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="text"
                        value={shownName}
                        onChange={e => setEditingName(prev => ({ ...prev, [r.key]: e.target.value }))}
                        onBlur={e => commitDisplayName(r, e.target.value)}
                        placeholder={r.name}
                        title="納品タブ限定のリネーム。原本受領証にはこの名前で流し込まれます。空にすると元の名前に戻ります。"
                        className="w-full px-2 py-1 text-[13px] font-medium text-gray-800 bg-transparent border border-transparent hover:border-gray-200 focus:border-brand-500 focus:bg-white rounded outline-none transition-colors"
                      />
                      {r.displayName && (
                        <div className="mt-0.5 pl-2 text-[10px] text-gray-400">元: {r.name}</div>
                      )}
                      <div className="mt-0.5 pl-2 text-[10px] text-gray-500">{r.sourceLabel}</div>
                    </td>
                    <td className="px-2 py-2.5 text-center text-[12px] font-mono text-gray-700 align-top">{r.quantity} 通</td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-600 align-top">{r.latestDate ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 align-top">
                      {/* 権利証補足 / 印鑑相続人紐付 の要否とサマリー */}
                      {isKenriRow(r) ? (
                        <button type="button" onClick={() => setToukiTarget(r)} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${r.toukiNoticeDate || r.toukiNoticeNumber ? 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100' : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'}`}>
                          <FileText className="w-3 h-3" strokeWidth={2} />
                          {r.toukiNoticeDate || r.toukiNoticeNumber ? '権利証補足 済' : '権利証補足'}
                        </button>
                      ) : isInkanRow(r) ? (
                        <button type="button" onClick={() => setInkanTarget(r)} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${r.inkanClientNames && r.inkanClientNames.length > 0 ? 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100' : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'}`}>
                          <Users className="w-3 h-3" strokeWidth={2} />
                          {r.inkanClientNames && r.inkanClientNames.length > 0 ? `相続人 ${r.inkanClientNames.length}名` : '相続人紐付'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-300 pl-1">—</span>
                      )}
                      {/* サマリー行 */}
                      {isKenriRow(r) && (r.toukiNoticeDate || r.toukiNoticeNumber) && (
                        <div className="mt-1 pl-1 text-[10px] text-purple-800 leading-snug">
                          {r.toukiNoticeDate}{r.toukiNoticeDate && r.toukiNoticeNumber ? ' / ' : ''}{r.toukiNoticeNumber}
                        </div>
                      )}
                      {isInkanRow(r) && r.inkanClientNames && r.inkanClientNames.length > 0 && (
                        <div className="mt-1 pl-1 text-[10px] text-purple-800 leading-snug">{r.inkanClientNames.join('、')}</div>
                      )}
                    </td>
                    {filter === 'target' && (
                      <td className="px-3 py-2.5 text-center align-top">
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
                    <td className="px-3 py-2.5 text-center align-top">
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
                )})}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-2.5 flex items-center gap-1">
          <Package className="w-3 h-3" strokeWidth={2} />
          「納品完了」を押すと 案件ステータスが 業務完了 → 納品完了 に変わります。
        </p>
      </Section>

      {toukiTarget && (
        <ToukiNoticeModal
          row={toukiTarget}
          onClose={() => setToukiTarget(null)}
          onSave={(date, number) => saveToukiNotice(toukiTarget, date, number)}
          saving={saving === toukiTarget.key}
        />
      )}
      {inkanTarget && (
        <InkanClientsModal
          row={inkanTarget}
          heirs={heirs}
          onClose={() => setInkanTarget(null)}
          onSave={(names) => saveInkanClientNames(inkanTarget, names)}
          saving={saving === inkanTarget.key}
        />
      )}
      <GenponJuryoshoModal
        isOpen={genponOpen}
        onClose={() => setGenponOpen(false)}
        caseData={caseData}
        heirs={heirs}
      />
      <EnvelopeDocumentModal
        isOpen={envelopeOpen}
        onClose={() => setEnvelopeOpen(false)}
        caseData={caseData}
        tasks={tasks}
        heirs={heirs}
      />
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

// ─────────────────────────────────────────────
// 権利証補足モーダル: 登記識別情報通知の 通知日 + 識別番号 手入力
// ─────────────────────────────────────────────
function ToukiNoticeModal({ row, onClose, onSave, saving }: {
  row: DocRow
  onClose: () => void
  onSave: (date: string, number: string) => void
  saving: boolean
}) {
  const [date, setDate] = useState(row.toukiNoticeDate ?? '')
  const [num, setNum] = useState(row.toukiNoticeNumber ?? '')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-[480px] max-w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-bold text-gray-900">権利証補足入力</div>
            <div className="text-[11.5px] text-gray-500 mt-0.5">{row.displayName ?? row.name}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[12px] text-gray-500 leading-relaxed">
            登記識別情報通知の <span className="font-semibold text-gray-700">通知日</span> と <span className="font-semibold text-gray-700">識別番号</span> を書面から手入力してください。原本受領証の該当行の下に自動でぶら下がります。
          </p>
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">通知日</label>
            <input type="text" value={date} onChange={e => setDate(e.target.value)} placeholder="例: 令和8年7月9日受付"
              className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">識別番号</label>
            <input type="text" value={num} onChange={e => setNum(e.target.value)} placeholder="例: 第29003号"
              className="w-full px-3 py-2 text-[13px] border border-gray-300 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-gray-50">キャンセル</button>
          <button onClick={() => onSave(date, num)} disabled={saving}
            className="px-5 py-2 text-[13px] font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 印鑑証明書 相続人紐付モーダル: 相続人を複数選択(名前で保存)
// ─────────────────────────────────────────────
function InkanClientsModal({ row, heirs, onClose, onSave, saving }: {
  row: DocRow
  heirs: HeirRow[]
  onClose: () => void
  onSave: (names: string[]) => void
  saving: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(row.inkanClientNames ?? []))
  const toggle = (name: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })
  const orderedNames = heirs.map(h => h.name).filter(n => !!n)
  // heirs にいない外部名(手入力履歴)も 残っている場合は末尾に表示
  const extras = (row.inkanClientNames ?? []).filter(n => !orderedNames.includes(n))
  const all = [...orderedNames, ...extras]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-[480px] max-w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-bold text-gray-900">相続人 紐付</div>
            <div className="text-[11.5px] text-gray-500 mt-0.5">{row.displayName ?? row.name}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[12px] text-gray-500 leading-relaxed">
            この書類が どの相続人分の 印鑑登録証明書か 選択してください。原本受領証には「（A様、B様、C様 各1通）」形式で列挙されます。
          </p>
          {all.length === 0 ? (
            <div className="text-center py-6 text-[12px] text-gray-400">相続人が登録されていません（相続人調査タブで登録してください）</div>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
              {all.map(name => {
                const isExtra = extras.includes(name)
                return (
                  <label key={name} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selected.has(name)} onChange={() => toggle(name)} className="w-4 h-4 accent-brand-600" />
                    <span className="text-[13px] text-gray-800 flex-1">{name}</span>
                    {isExtra && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">相続人リスト外</span>}
                  </label>
                )
              })}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
          <span className="text-[12px] text-gray-500">{selected.size} 名 選択中</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold text-gray-700 border border-gray-300 bg-white rounded-lg hover:bg-gray-50">キャンセル</button>
            <button onClick={() => onSave([...selected])} disabled={saving}
              className="px-5 py-2 text-[13px] font-bold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
