import { PHASES } from './constants'

// Phase0 = 相続人調査(Phase1)より前の「初期対応・面談」を囲むフェーズ。
// PHASES(Phase1-6)はインデックス参照があるため変更せず、ここで別定義として追加する。
const PHASE0 = { key: 'Phase0:初期対応・面談', label: 'Phase0: 初期対応・面談', color: '#0F487E' } as const

// DB uses 'phase0', 'phase1', etc. Constants use 'Phase1:相続人調査' style keys.
const PHASE_MAP: Record<string, { key: string; label: string; color: string }> = {
  phase0: PHASE0,
  phase1: PHASES[0],
  phase2: PHASES[1],
  phase3: PHASES[2],
  phase4: PHASES[3],
  phase5: PHASES[4],
  phase6: PHASES[5],
}

export function getPhaseLabel(dbPhase: string): string {
  return PHASE_MAP[dbPhase]?.label ?? dbPhase
}

export function getPhaseColor(dbPhase: string): string {
  return PHASE_MAP[dbPhase]?.color ?? '#6B7280'
}

export function getPhaseDefinition(dbPhase: string) {
  return PHASE_MAP[dbPhase] ?? null
}

export const DB_PHASES = ['phase0', 'phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6'] as const
