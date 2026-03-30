import { PHASES } from './constants'

// DB uses 'phase1', 'phase2', etc. Constants use 'Phase1:相続人調査' style keys.
const PHASE_MAP: Record<string, typeof PHASES[number]> = {
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

export const DB_PHASES = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6'] as const
