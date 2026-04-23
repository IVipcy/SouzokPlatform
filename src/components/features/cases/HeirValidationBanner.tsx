'use client'

import { validateHeirs } from '@/lib/heirValidation'
import type { HeirRow } from '@/types'

export default function HeirValidationBanner({ heirs }: { heirs: HeirRow[] }) {
  const warnings = validateHeirs(heirs)
  if (warnings.length === 0) return null

  return (
    <div className="space-y-2 mb-3">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${
            w.severity === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <span className="text-base shrink-0 leading-none mt-0.5">
            {w.severity === 'error' ? '⚠️' : '💡'}
          </span>
          <div className="flex-1 text-xs">
            <div className="font-semibold">{w.message}</div>
            {w.detail && <div className="text-[11px] mt-0.5 opacity-90">{w.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
