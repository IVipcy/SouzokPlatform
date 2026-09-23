'use client'

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { getSelectableCaseStatuses, isContractProcDone, ORDERED_STATUSES, MANAGEMENT_STATUSES } from '@/lib/constants'
import type { MemberRow } from '@/types'

/**
 * 案件をいま「作業進行中（対応中）」にできるかを、ヘッダー・案件情報タブのステータス選択と同じゲート
 * （getSelectableCaseStatuses：オーダーシート完成＋管理担当アサイン＋契約手続き完了）で判定する。
 * 引継ぎ・案件再オープンが直接「対応中」に書いていたため、着手ゲートを飛ばせていた。
 *
 *   next    … 実際に書くステータス。null＝いまのままにする（既に管理ステータス・作業着手準備のとき）
 *   reasons … 対応中にできなかった理由（トーストに出す）。空なら対応中にできる
 */
export async function resolveStartStatus(supabase: SupabaseClient, caseId: string): Promise<{ next: string | null; reasons: string[]; current: string | null }> {
  const [{ data: c }, { data: cms }, { data: docs }] = await Promise.all([
    supabase.from('cases').select('status, order_sheet_completed_at').eq('id', caseId).maybeSingle(),
    supabase.from('case_members').select('role').eq('case_id', caseId).eq('role', 'manager'),
    supabase.from('contract_documents').select('status, arrival_date').eq('case_id', caseId),
  ])
  const row = (c ?? null) as { status: string; order_sheet_completed_at: string | null } | null
  const current = row?.status ?? null
  const orderSheetCompleted = !!row?.order_sheet_completed_at
  const managerAssigned = ((cms ?? []) as Array<{ role: string }>).length > 0
  const contractProcDone = isContractProcDone((docs ?? []) as Array<{ status?: string | null; arrival_date?: string | null }>)
  const allowed = new Set(getSelectableCaseStatuses(orderSheetCompleted, current, managerAssigned, true, contractProcDone))
  if (allowed.has('対応中')) return { next: '対応中', reasons: [], current }

  const reasons = [
    !orderSheetCompleted ? 'オーダーシートが完成していない' : null,
    !managerAssigned ? '管理担当が割り振られていない' : null,
    !contractProcDone ? '契約手続き（契約書類の受領）が終わっていない' : null,
  ].filter((s): s is string => !!s)
  // 受注・戻り受注なら「作業着手準備」に留める。それ以外（既に作業着手準備・完了など）はいまのまま
  const next = current && (ORDERED_STATUSES as readonly string[]).includes(current) && !(MANAGEMENT_STATUSES as readonly string[]).includes(current) && current !== '作業着手準備'
    ? '作業着手準備'
    : null
  return { next, reasons, current }
}

// 受注担当 → チームへの引き継ぎ。特定の人は指名せず、作業進行中へ移し、
// 受注担当と同じチームの管理担当 全員のマイページにアラート（通知）を出す。
// 受けた管理担当が担当者タブで自分をアサインすると、チームのアラートは解消される。
// 着手ゲート（オーダーシート完成・管理担当・契約手続き）が揃っていなければ「作業着手準備」に留める。
export default function HandoffModal({ isOpen, onClose, caseId, salesMemberId, allMembers, onDone }: {
  isOpen: boolean
  onClose: () => void
  caseId: string
  salesMemberId: string | null
  allMembers: MemberRow[]
  onDone: () => void
}) {
  const salesTeam = salesMemberId ? allMembers.find(m => m.id === salesMemberId)?.team_id ?? null : null
  const managers = allMembers.filter(m => m.is_active && m.primary_role === 'manager')
  const sameTeam = salesTeam ? managers.filter(m => m.team_id === salesTeam) : []
  const noSameTeam = sameTeam.length === 0
  // 同じチームに管理担当がいなければ全管理担当へ（案件が宙に浮くのを防ぐ）
  const targets = noSameTeam ? managers : sameTeam
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const supabase = createClient()
    // 作業進行中にできるかをゲートで確かめる。引継ぎ時点では管理担当が未設定なので、
    // ふつうは「作業着手準備」に留まり、管理担当が付いてから着手ゲートで進む。
    const gate = await resolveStartStatus(supabase, caseId)
    if (gate.next) {
      const { error } = await supabase.from('cases').update({ status: gate.next }).eq('id', caseId)
      if (error) { showToast(`引き継ぎに失敗しました: ${error.message}`, 'error'); setSaving(false); return }
    }
    // チームの管理担当 全員へアラート（通知）
    if (targets.length > 0) {
      await supabase.from('notifications').insert(targets.map(m => ({
        member_id: m.id, type: 'case_handoff', case_id: caseId,
        title: '相談案件が引き継がれました',
        body: '受注担当から相談案件が引き継がれました。管理担当を設定して、案件の処理を開始してください。',
      })))
    }
    setSaving(false)
    if (gate.next === '対応中') {
      showToast('チームへ引き継ぎました（作業進行中）。管理担当のマイページにアラートを出しました。', 'success')
    } else {
      showToast(`チームへ引き継ぎました。${gate.reasons.join('・')}ため、ステータスは「作業着手準備」に留めています（揃うと作業進行中へ進められます）。`, 'success')
    }
    onDone()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="管理担当へ引き継ぐ"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? '引き継ぎ中...' : '引き継ぐ'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-gray-700 leading-relaxed">
          この案件をチームに引き継ぎ、下のチームの管理担当 全員のマイページに「管理担当を設定してください」というアラートを出します。誰かが受けて自分をアサインすると、アラートは自動で消えます。
          ステータスは着手の条件（オーダーシート完成・管理担当・契約手続き）が揃っていれば<strong>作業進行中</strong>、揃っていなければ<strong>作業着手準備</strong>になります。
        </p>
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500">
            {noSameTeam ? '管理担当（同じチームに不在のため全員）' : 'このチームの管理担当'} {targets.length}名にアラート
          </div>
          {targets.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-gray-400">管理担当が登録されていません。</div>
          ) : (
            <div className="max-h-[240px] overflow-y-auto divide-y divide-gray-200">
              {targets.map(m => (
                <div key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>{m.name[0]}</span>
                  <span className="text-[13px] text-gray-800">{m.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[11px] text-gray-400">特定の人を指名しません。チームの誰でも受けられます。受注担当はここで手離れします。</p>
      </div>
    </Modal>
  )
}
