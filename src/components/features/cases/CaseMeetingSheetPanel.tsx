'use client'

// 案件詳細で面談シートを見る／直すためのパネル。
//
// 面談登録アプリ（/intake）で作った案件は、聞き取った内容が面談シートにしか無く、
// 受注前のまま止まっている案件では案件詳細から一切辿れなかった。
// そこでオーダーシートと同じ位置に面談シートを出し、右上の「オーダーシートを作成」で
// そのままオーダーシートへ切り替えられるようにする（切り替えた印は cases.order_sheet_started_at）。
//
// 中身は面談登録アプリの①と同じ MeetingSheetTab をそのまま使う。
// 手書きメモ（meeting_memos）はここで読み込む。

import { useState, useEffect } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import MeetingSheetTab from '@/app/(standalone)/intake/[id]/MeetingSheetTab'
import type { MeetingMemoRow } from '@/app/(standalone)/intake/[id]/IntakeCaseClient'
import type {
  CaseRow, CaseClientRow, HeirRow, RealEstatePropertyRow, FinancialAssetRow, CaseOtherAssetRow,
} from '@/types'

export default function CaseMeetingSheetPanel({
  caseData, patchCase, patchClient, caseClients, heirs, properties, financialAssets, otherAssets = [],
  currentMemberId, onRefresh, onStartOrderSheet,
}: {
  caseData: CaseRow
  patchCase: (patch: Partial<CaseRow>) => Promise<void>
  patchClient: (patch: Record<string, unknown>) => Promise<void>
  caseClients: CaseClientRow[]
  heirs: HeirRow[]
  properties: RealEstatePropertyRow[]
  financialAssets: FinancialAssetRow[]
  otherAssets?: CaseOtherAssetRow[]
  currentMemberId: string | null
  onRefresh: () => void
  /** 「オーダーシートを作成」を押したとき（親が表示を切り替える） */
  onStartOrderSheet: () => void
}) {
  const [memos, setMemos] = useState<MeetingMemoRow[]>([])
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase.from('meeting_memos').select('*').eq('case_id', caseData.id).order('sort_order')
      if (alive) setMemos((data ?? []) as MeetingMemoRow[])
    })()
    return () => { alive = false }
  }, [caseData.id])

  // 作成を始めた印を残してから切り替える。次に開いたときもオーダーシートで出る。
  const startOrderSheet = async () => {
    setStarting(true)
    const supabase = createClient()
    const { error } = await supabase.from('cases')
      .update({ order_sheet_started_at: new Date().toISOString() }).eq('id', caseData.id)
    setStarting(false)
    if (error) { showToast(`保存に失敗しました: ${error.message}`, 'error'); return }
    onStartOrderSheet()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 flex-wrap bg-white border border-gray-200 rounded-lg px-3.5 py-2.5">
        <FileSpreadsheet className="w-4 h-4 text-brand-600" strokeWidth={2} />
        <span className="text-[13px] font-semibold text-gray-800">面談シート</span>
        <span className="text-[11.5px] text-gray-500">面談で聞き取った内容です。ここで直せます。</span>
        <div className="ml-auto">
          <Button variant="primary" size="sm" onClick={startOrderSheet} disabled={starting}>
            {starting ? '準備中…' : 'オーダーシートを作成'}
          </Button>
        </div>
      </div>
      <MeetingSheetTab
        caseData={caseData}
        patchCase={patchCase}
        patchClient={patchClient}
        currentMemberId={currentMemberId}
        memos={memos}
        setMemos={setMemos}
        caseClients={caseClients}
        heirs={heirs}
        properties={properties}
        financialAssets={financialAssets}
        otherAssets={otherAssets}
        onRefresh={onRefresh}
      />
    </div>
  )
}
