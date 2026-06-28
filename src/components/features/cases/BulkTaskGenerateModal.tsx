'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import {
  categoriesOf, gyomuForCategories, CROSS_GYOMU, CROSS_SERVICE_ROWS, PROCEDURE_TEMPLATE_KEY,
} from '@/lib/serviceMaster'
import type { TaskRow, TaskTemplateRow } from '@/types'
import type { RoleRow } from './ProcedureIntakeSection'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseId: string
  // 実施タスク（役割分担）。kind=task の作業がタスク生成の候補。
  intakeRoles: RoleRow[]
  serviceCategory?: string | null
  serviceCategory2?: string | null
  existingTasks: TaskRow[]
  // 手順テンプレ（task_templates）。生成元ではなく procedure_text 流用のためだけに使う。
  taskTemplates: TaskTemplateRow[]
  onSaved: () => void
}

// 生成候補：実施タスク行（roleIdx付き）or 区分非依存（経理/相続税）。
type Candidate = { key: string; gyomu: string; title: string; roleIdx?: number; rid?: string }

/**
 * タスク一括生成。生成元は実施タスク（intake_roles の kind=task）＋経理/相続税。
 * 生成タスクは source_rid で実施タスク行に1対1リンク（手続き系タブ等の進捗表示と共通）。
 * 手順(procedure_text)は既存テンプレ本文を作業名→キー対応で流用（あるものだけ）。
 */
export default function BulkTaskGenerateModal({ isOpen, onClose, caseId, intakeRoles, serviceCategory, serviceCategory2, existingTasks, taskTemplates, onSaved }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const cats = categoriesOf(serviceCategory, serviceCategory2)
  const procByKey = useMemo(() => new Map(taskTemplates.map(t => [t.key, t.procedure_text])), [taskTemplates])
  const generatedRids = useMemo(() => new Set(existingTasks.map(t => t.source_rid).filter(Boolean) as string[]), [existingTasks])

  // 候補：役割分担で定義した作業は作業区分(作業/請求・受領)を問わず全部＋経理/相続税。表示は業務グループ順。
  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = []
    intakeRoles.forEach((r, idx) => {
      if (!r.sagyou?.trim() || r.owner === '不要') return
      out.push({ key: r.rid ?? `role:${idx}`, gyomu: r.gyomu, title: r.sagyou, roleIdx: idx, rid: r.rid })
    })
    for (const c of CROSS_SERVICE_ROWS) {
      out.push({ key: `cross:${c.gyomu}:${c.task}`, gyomu: c.gyomu, title: c.task, rid: `cross:${c.gyomu}:${c.task}` })
    }
    return out
  }, [intakeRoles])

  const isGenerated = (c: Candidate) => !!c.rid && generatedRids.has(c.rid)
  const selectable = candidates.filter(c => !isGenerated(c))

  const groups = useMemo(() => {
    const order = [...gyomuForCategories(cats), ...CROSS_GYOMU]
    const seen = new Set(order)
    const extra = [...new Set(candidates.map(c => c.gyomu).filter(g => !seen.has(g)))]
    return [...order, ...extra]
      .map(gyomu => ({ gyomu, items: candidates.filter(c => c.gyomu === gyomu) }))
      .filter(g => g.items.length > 0)
  }, [candidates, cats])

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next
  })
  const toggleAll = () => setSelected(prev => prev.size === selectable.length ? new Set() : new Set(selectable.map(c => c.key)))
  const toggleGyomu = (gyomu: string) => {
    const items = selectable.filter(c => c.gyomu === gyomu)
    const allOn = items.every(c => selected.has(c.key))
    setSelected(prev => { const next = new Set(prev); items.forEach(c => allOn ? next.delete(c.key) : next.add(c.key)); return next })
  }

  const handleGenerate = async () => {
    if (selected.size === 0) return
    setSaving(true); setError('')
    const supabase = createClient()
    const picked = candidates.filter(c => selected.has(c.key))

    // 1. 実施タスク行に rid を採番（未採番のみ）→ intake_roles を更新
    const roles = [...intakeRoles]
    let rolesChanged = false
    const ridByKey: Record<string, string> = {}
    for (const c of picked) {
      if (c.roleIdx != null) {
        let rid = roles[c.roleIdx]?.rid
        if (!rid) { rid = crypto.randomUUID(); roles[c.roleIdx] = { ...roles[c.roleIdx], rid }; rolesChanged = true }
        ridByKey[c.key] = rid
      } else if (c.rid) {
        ridByKey[c.key] = c.rid
      }
    }
    if (rolesChanged) {
      const { error: e } = await supabase.from('cases').update({ intake_roles: roles }).eq('id', caseId)
      if (e) { setSaving(false); setError(`実施タスクの更新に失敗しました: ${e.message}`); return }
    }

    // 2. タスク生成（source_rid リンク・手順は対応テンプレから流用）
    const rows = picked.map((c, i) => ({
      case_id: caseId,
      task_kind: 'case' as const,
      title: c.title,
      phase: c.gyomu,
      category: c.gyomu,
      status: '着手前',
      priority: '通常',
      source_rid: ridByKey[c.key] ?? null,
      procedure_text: procByKey.get(PROCEDURE_TEMPLATE_KEY[c.title] ?? '') ?? null,
      sort_order: i,
    }))
    const { error: e2 } = await supabase.from('tasks').insert(rows)
    if (e2) { setSaving(false); setError(`生成に失敗しました: ${e2.message}`); return }

    setSaving(false); setSelected(new Set()); onSaved(); onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="タスク一括生成"
      maxWidth="max-w-2xl"
      footer={
        <>
          <span className="text-sm text-gray-500 mr-auto">{selected.size} 件選択</span>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
          <button onClick={handleGenerate} disabled={saving || selected.size === 0} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {saving ? '生成中...' : `${selected.size} 件生成`}
          </button>
        </>
      }
    >
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {candidates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          生成できる実施タスクがありません。<br />
          先に「受注内容」タブで受注区分・役割分担（実施タスク）を設定してください。
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">実施タスク（役割分担）からタスクを生成します</p>
            <button onClick={toggleAll} className="text-xs text-brand-600 font-medium hover:underline">
              {selected.size === selectable.length ? '全解除' : '全選択'}
            </button>
          </div>
          <div className="space-y-3">
            {groups.map(group => {
              const sel = group.items.filter(c => !isGenerated(c))
              const selectedInGyomu = sel.filter(c => selected.has(c.key)).length
              return (
                <div key={group.gyomu} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => toggleGyomu(group.gyomu)} className="w-full px-4 py-2.5 flex items-center gap-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-brand-500" />
                    <span className="text-sm font-semibold text-gray-900 flex-1 text-left">{group.gyomu}</span>
                    <span className="text-xs text-gray-400">{selectedInGyomu}/{sel.length}</span>
                  </button>
                  <div className="divide-y divide-gray-50">
                    {group.items.map(c => {
                      const gen = isGenerated(c)
                      const hasProc = !!PROCEDURE_TEMPLATE_KEY[c.title]
                      return (
                        <label key={c.key} className={`flex items-center gap-3 px-4 py-2 text-sm ${gen ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}>
                          <input type="checkbox" checked={selected.has(c.key)} disabled={gen} onChange={() => toggle(c.key)} className="accent-brand-600 w-3.5 h-3.5" />
                          <span className="flex-1 text-gray-700">{c.title}</span>
                          {hasProc && <span className="text-[11px] text-gray-400" title="手順テンプレあり">手順</span>}
                          {gen && <span className="text-[12px] text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded">生成済</span>}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}
