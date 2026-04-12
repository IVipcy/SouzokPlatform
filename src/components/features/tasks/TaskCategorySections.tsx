'use client'

import { createClient } from '@/lib/supabase/client'
import { Section, FieldGrid, InlineEdit, InlineSelect, InlineDate, InlineCheckbox, InlineCurrency, InlineTextarea, Field } from '@/components/ui/InlineFields'
import { TASK_SECTION_DEFS } from '@/lib/taskSectionDefs'
import type { SectionField } from '@/lib/taskSectionDefs'
import type { TaskRow } from '@/types'

type Props = {
  task: TaskRow
  onRefresh: () => void
}

export default function TaskCategorySections({ task, onRefresh }: Props) {
  const ext = (task.ext_data ?? {}) as Record<string, unknown>

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

  return (
    <>
      {visibleSections.map(sec => (
        <Section key={sec.id} title={sec.title} icon={sec.icon}>
          <FieldGrid>
            {sec.fields.map(f => {
              if (f.full && f.type !== 'textarea') {
                // full幅のテキストフィールド
                return (
                  <div key={f.key} className="col-span-2">
                    {renderField(f)}
                  </div>
                )
              }
              return renderField(f)
            })}
          </FieldGrid>
        </Section>
      ))}
    </>
  )
}
