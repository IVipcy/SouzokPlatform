'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import { getPhaseLabel, getPhaseColor, DB_PHASES } from '@/lib/phases'
import { TEMPLATE_FLOW_RULES } from '@/lib/taskFlowRules'
import type { TaskRow, TaskTemplateRow } from '@/types'

type Props = {
  isOpen: boolean
  onClose: () => void
  caseId: string
  taskTemplates: TaskTemplateRow[]
  existingTasks: TaskRow[]
  onSaved: () => void
}

export default function BulkTaskGenerateModal({ isOpen, onClose, caseId, taskTemplates, existingTasks, onSaved }: Props) {
  const existingKeys = new Set(existingTasks.map(t => t.template_key).filter(Boolean))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const templatesByPhase = DB_PHASES.map(phase => ({
    phase,
    label: getPhaseLabel(phase),
    color: getPhaseColor(phase),
    templates: taskTemplates.filter(t => t.phase === phase),
  })).filter(g => g.templates.length > 0)

  const selectableTemplates = taskTemplates.filter(t => !existingKeys.has(t.key))

  const toggleTemplate = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === selectableTemplates.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableTemplates.map(t => t.key)))
    }
  }

  const togglePhase = (phase: string) => {
    const phaseTemplates = selectableTemplates.filter(t => t.phase === phase)
    const allSelected = phaseTemplates.every(t => selected.has(t.key))
    setSelected(prev => {
      const next = new Set(prev)
      phaseTemplates.forEach(t => {
        if (allSelected) next.delete(t.key)
        else next.add(t.key)
      })
      return next
    })
  }

  const handleGenerate = async () => {
    if (selected.size === 0) return

    setSaving(true)
    setError('')

    const supabase = createClient()

    // 残高証明請求タスクがある場合、事前に金融資産（預貯金）を取得してext_dataに埋め込む
    const hasBankTask = selected.has('bank_balance_request')
    let bankExtData: Record<string, unknown> | null = null
    if (hasBankTask) {
      const { data: assets } = await supabase
        .from('financial_assets')
        .select('id, institution_name, branch_name')
        .eq('case_id', caseId)
        .eq('asset_type', '預貯金')
        .order('created_at')
      if (assets && assets.length > 0) {
        bankExtData = {
          banks: assets.map(a => ({
            financial_asset_id: a.id,
            institution_name: a.institution_name,
            branch_name: a.branch_name ?? null,
            frozen: false,
            reqDate: null,
            arrDate: null,
            memo: '',
          })),
        }
      }
    }

    const tasksToInsert = taskTemplates
      .filter(t => selected.has(t.key))
      .map(t => ({
        case_id: caseId,
        template_key: t.key,
        title: t.label,
        phase: t.phase,
        category: t.category,
        status: '着手前',
        priority: '通常',
        procedure_text: t.procedure_text,
        sort_order: t.sort_order,
        work_role: (['manager', 'assistant', 'accounting', 'sales'] as const).includes(t.default_role as 'manager' | 'assistant' | 'accounting' | 'sales')
          ? (t.default_role as 'manager' | 'assistant' | 'accounting' | 'sales')
          : null,
        ext_data: t.key === 'bank_balance_request' && bankExtData ? bankExtData : null,
      }))

    const { error: dbError } = await supabase.from('tasks').insert(tasksToInsert)

    if (dbError) {
      setSaving(false)
      setError(`生成に失敗しました: ${dbError.message}`)
      return
    }

    // 依存関係を自動生成
    try {
      // この案件の全タスク（既存+新規）を取得して template_key → task_id マップを作成
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('id, template_key')
        .eq('case_id', caseId)
        .not('template_key', 'is', null)

      if (allTasks && allTasks.length > 0) {
        const keyToId = new Map<string, string>()
        allTasks.forEach(t => {
          if (t.template_key) keyToId.set(t.template_key, t.id)
        })

        const depsToInsert = TEMPLATE_FLOW_RULES
          .filter(rule => keyToId.has(rule.from) && keyToId.has(rule.to))
          .map(rule => ({
            case_id: caseId,
            from_task_id: keyToId.get(rule.from)!,
            to_task_id: keyToId.get(rule.to)!,
            condition_type: rule.condition.type,
            checkpoint_field: rule.condition.checkpointField ?? null,
            label: rule.condition.label,
          }))

        if (depsToInsert.length > 0) {
          await supabase.from('task_dependencies').upsert(depsToInsert, {
            onConflict: 'from_task_id,to_task_id,condition_type',
            ignoreDuplicates: true,
          })
        }
      }
    } catch {
      // 依存関係生成の失敗はタスク生成自体には影響させない
      console.warn('依存関係の自動生成でエラーが発生しました')
    }

    setSaving(false)
    setSelected(new Set())
    onSaved()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="タスク一括生成"
      maxWidth="max-w-2xl"
      footer={
        <>
          <span className="text-sm text-gray-500 mr-auto">
            {selected.size} 件選択
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleGenerate}
            disabled={saving || selected.size === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '生成中...' : `${selected.size} 件生成`}
          </button>
        </>
      }
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          テンプレートから生成するタスクを選択してください
        </p>
        <button
          onClick={toggleAll}
          className="text-xs text-blue-600 font-medium hover:underline"
        >
          {selected.size === selectableTemplates.length ? '全解除' : '全選択'}
        </button>
      </div>

      <div className="space-y-3">
        {templatesByPhase.map(group => {
          const selectable = group.templates.filter(t => !existingKeys.has(t.key))
          const selectedInPhase = selectable.filter(t => selected.has(t.key)).length

          return (
            <div key={group.phase} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => togglePhase(group.phase)}
                className="w-full px-4 py-2.5 flex items-center gap-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: group.color }}
                />
                <span className="text-sm font-semibold text-gray-900 flex-1 text-left">
                  {group.label}
                </span>
                <span className="text-xs text-gray-400">
                  {selectedInPhase}/{selectable.length}
                </span>
              </button>
              <div className="divide-y divide-gray-50">
                {group.templates.map(template => {
                  const exists = existingKeys.has(template.key)
                  return (
                    <label
                      key={template.key}
                      className={`flex items-center gap-3 px-4 py-2 text-sm ${
                        exists
                          ? 'opacity-50 cursor-not-allowed'
                          : 'cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(template.key)}
                        disabled={exists}
                        onChange={() => toggleTemplate(template.key)}
                        className="accent-blue-600 w-3.5 h-3.5"
                      />
                      <span className="flex-1 text-gray-700">{template.label}</span>
                      <span className="text-[10px] text-gray-400 font-mono">{template.category}</span>
                      {exists && (
                        <span className="text-[10px] text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded">
                          生成済
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
