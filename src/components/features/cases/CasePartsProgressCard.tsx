'use client'

import { useRouter } from 'next/navigation'
import { Layers, Check, ArrowRight } from 'lucide-react'
import type { CaseRow, TaskRow } from '@/types'
import { partsForCase, currentPart, advanceToNext, isMultiPart, type ServicePart } from '@/lib/serviceParts'
import { gyomuForCategories } from '@/lib/serviceMaster'

// TasksTab と同じ正規化（着手前/対応中/完了に寄せる）
const normalizeStatus = (s: string) =>
  s === '未着手' ? '着手前' : ['Wチェック待ち', '保留'].includes(s) ? '対応中' : s === 'キャンセル' ? '完了' : s

const MARK = '①②③④⑤⑥'

/**
 * 受注区分パート制の進行バー。複数パート（先行→本体）の案件で、
 * 現在パート・完了/未着手を可視化し、「現在パートを完了して次へ」進める。
 * ゲート＝現在パートの“やる業務”(intake_roles 由来のタスク)が全完了。未完了があれば警告して確認。
 * 単独パートの案件では表示しない。
 */
export default function CasePartsProgressCard({
  caseData, tasks, patchCase,
}: { caseData: CaseRow; tasks: TaskRow[]; patchCase: (p: Partial<CaseRow>) => Promise<void> }) {
  const router = useRouter()
  const parts = partsForCase(caseData)
  const visible = parts.filter(p => p.status !== '中止')
  if (!isMultiPart(parts)) return null

  const cur = currentPart(parts)
  // 現在パートの次（order昇順で現在より後の未着手）
  const ordered = [...visible].sort((a, b) => a.order - b.order)
  const curIdx = cur ? ordered.findIndex(p => p.key === cur.key && p.order === cur.order) : -1
  const nextPart = curIdx >= 0 ? ordered.slice(curIdx + 1).find(p => p.status === '未着手') ?? null : null

  // 現在パートの業務 → そのタスク（source_rid→intake_roles[].rid→gyomu）で完了ゲートを判定
  const curGyomu = cur ? new Set(gyomuForCategories([cur.key])) : new Set<string>()
  const ridToGyomu = new Map((caseData.intake_roles ?? []).filter(r => r.rid).map(r => [r.rid as string, r.gyomu]))
  const curPartTasks = tasks.filter(t => t.task_kind !== 'system' && t.source_rid && curGyomu.has(ridToGyomu.get(t.source_rid) ?? ''))
  const incomplete = curPartTasks.filter(t => normalizeStatus(t.status) !== '完了')
  const gateOpen = incomplete.length === 0

  const canAdvance = caseData.status === '対応中' && !!cur && !!nextPart

  const advance = async () => {
    if (!cur || !nextPart) return
    const msg = gateOpen
      ? `「${cur.key}」パートを完了して、次の「${nextPart.key}」へ進みます。よろしいですか？`
      : `「${cur.key}」パートに未完了の作業が${incomplete.length}件あります。完了として次の「${nextPart.key}」へ進みますか？`
    if (!confirm(msg)) return
    await patchCase({ service_parts: advanceToNext(parts) })
    router.refresh()
  }

  const pillCls = (p: ServicePart) =>
    p.status === '完了' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : p.status === '進行中' ? 'bg-amber-100 text-amber-800 border-amber-300'
        : 'bg-gray-100 text-gray-400 border-gray-200'

  return (
    <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/40 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Layers className="w-4 h-4 text-brand-600" strokeWidth={2.25} />
        <span className="text-[12px] font-bold text-brand-800">受注区分の進行</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {ordered.map((p, i) => (
          <span key={`${p.key}-${p.order}`} className="inline-flex items-center gap-1.5">
            {i > 0 && <ArrowRight className="w-3.5 h-3.5 text-gray-300" />}
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[12px] font-semibold ${pillCls(p)}`}>
              <span className="font-bold">{MARK[i] ?? `(${i + 1})`}</span>
              {p.key}
              {p.status === '完了' && <Check className="w-3 h-3" strokeWidth={3} />}
              {p.status === '進行中' && <span className="text-[10px] font-bold">進行中</span>}
            </span>
          </span>
        ))}
      </div>

      {canAdvance && (
        <div className="pt-2.5 mt-2 border-t border-brand-100">
          <button
            type="button"
            onClick={advance}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition ${
              gateOpen
                ? 'text-white bg-brand-600 border-brand-600 hover:bg-brand-700'
                : 'text-amber-700 bg-amber-50 border-amber-300 hover:bg-amber-100'
            }`}
          >
            「{cur!.key}」を完了して次（{nextPart!.key}）へ
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          {!gateOpen && (
            <span className="ml-2 text-[11px] text-amber-700">未完了の作業が{incomplete.length}件あります</span>
          )}
        </div>
      )}
      {caseData.status === '対応中' && cur && !nextPart && (
        <p className="pt-2 mt-1.5 border-t border-brand-100 text-[11px] text-gray-500">
          最終パート「{cur.key}」です。完了したら案件ステータスを「完了」にしてください。
        </p>
      )}
    </div>
  )
}
