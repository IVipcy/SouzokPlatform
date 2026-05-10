'use client'

import { AlertTriangle, Lightbulb } from 'lucide-react'
import { validateHeirs } from '@/lib/heirValidation'
import type { HeirRow } from '@/types'

export default function HeirValidationBanner({ heirs }: { heirs: HeirRow[] }) {
  const warnings = validateHeirs(heirs)
  if (warnings.length === 0) return null

  return (
    <div className="space-y-2 mb-3">
      {warnings.map((w, i) => {
        const isError = w.severity === 'error'
        const Icon = isError ? AlertTriangle : Lightbulb
        return (
          <div
            key={i}
            className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${
              isError
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <Icon
              className={`w-4 h-4 shrink-0 mt-0.5 ${isError ? 'text-red-600' : 'text-amber-600'}`}
              strokeWidth={2.25}
            />
            <div className="flex-1 text-xs">
              <div className="font-semibold">{w.message}</div>
              {w.detail && <div className="text-[13px] mt-0.5 opacity-90">{w.detail}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
