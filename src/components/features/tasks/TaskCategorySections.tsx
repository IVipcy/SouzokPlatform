'use client'

import { createClient } from '@/lib/supabase/client'
import { Section, FieldGrid, InlineEdit, InlineSelect, InlineDate, InlineCheckbox, InlineCurrency, InlineTextarea, Field } from '@/components/ui/InlineFields'
import { TASK_SECTION_DEFS } from '@/lib/taskSectionDefs'
import MultiBankSection from './MultiBankSection'
import type { SectionField } from '@/lib/taskSectionDefs'
import type { TaskRow } from '@/types'

type Props = {
  task: TaskRow
  onRefresh: () => void
}

export default function TaskCategorySections({ task, onRefresh }: Props) {
  const ext = (task.ext_data ?? {}) as Record<string, unknown>

  // 残高証明請求（複数銀行）は専用コンポーネントを使用
  if (task.template_key === 'bank_balance_request') {
    return <MultiBankSection task={task} onRefresh={onRefresh} />
  }

  const visibleSections = TASK_SECTION_DEFS.filter(sec => sec.showWhen(task.category))

  if (visibleSections.length === 0) return null

  const saveExtField = async (key: string, value: unknown) => {
    const supabase = createClient()
    const newExt = { ...ext, [key]: value ?? null }
    await supabase.from('tasks').update({ ext_data: newExt }).eq('id', task.id)
    onRefresh()
  }

  const renderField = (field: SectionField) => {
    const val = ext[field.key]

    switch (field.type) {
      case 'date':
        return (
          <InlineDate
            key={field.key}
            label={field.label}
            value={(val as string) ?? null}
            onSave={v => saveExtField(field.key, v)}
          />
        )
      case 'checkbox':
        return (
          <InlineCheckbox
            key={field.key}
            label={field.label}
            value={!!val}
            onSave={v => saveExtField(field.key, v)}
          />
        )
      case 'currency':
        return (
          <InlineCurrency
            key={field.key}
            label={field.label}
            value={(val as number) ?? null}
            onSave={v => saveExtField(field.key, v)}
          />
        )
      case 'picklist':
        return (
          <InlineSelect
            key={field.key}
            label={field.label}
            value={(val as string) ?? ''}
            options={field.options ?? []}
            onSave={v => saveExtField(field.key, v)}
          />
        )
      case 'textarea':
        return (
          <div key={field.key} className={field.full ? 'col-span-2' : ''}>
            <InlineTextarea
              label={field.label}
              value={(val as string) ?? ''}
              onSave={v => saveExtField(field.key, v)}
            />
          </div>
        )
      default: // text
        return (
          <InlineEdit
            key={field.key}
            label={field.label}
            value={(val as string) ?? ''}
            onSave={v => saveExtField(field.key, v)}
          />
        )
    }
  }

  const renderFieldWithFullWrap = (f: SectionField) => {
    if (f.full && f.type !== 'textarea') {
      return (
        <div key={f.key} className="col-span-2">
          {renderField(f)}
        </div>
      )
    }
    return renderField(f)
  }

  return (
    <>
      {visibleSections.map(sec => {
        // groupの有無で分岐
        const hasGroups = sec.fields.some(f => f.group)
        if (!hasGroups) {
          return (
            <Section key={sec.id} title={sec.title} icon={sec.icon}>
              <FieldGrid>
                {sec.fields.map(renderFieldWithFullWrap)}
              </FieldGrid>
            </Section>
          )
        }

        // グループ化（順序を保ったまま）
        const groups: { name: string | null; fields: SectionField[] }[] = []
        for (const f of sec.fields) {
          const gname = f.group ?? null
          const last = groups[groups.length - 1]
          if (last && last.name === gname) {
            last.fields.push(f)
          } else {
            groups.push({ name: gname, fields: [f] })
          }
        }

        return (
          <Section key={sec.id} title={sec.title} icon={sec.icon}>
            {groups.map((g, idx) => (
              <div key={idx} className={idx > 0 ? 'mt-4' : ''}>
                {g.name && (
                  <div className="text-[12px] font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-200">
                    ◼ {g.name}
                  </div>
                )}
                <FieldGrid>
                  {g.fields.map(renderFieldWithFullWrap)}
                </FieldGrid>
              </div>
            ))}
          </Section>
        )
      })}
    </>
  )
}
