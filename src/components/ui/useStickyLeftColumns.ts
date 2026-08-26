'use client'

import { useEffect, type RefObject } from 'react'

/**
 * 表の左端の列を、横スクロールしても残るように固定する。
 *
 * 横に長い一覧（請求・入金一覧は22列ある）は、右のほうを見に行くと
 * 「今どの案件の行を見ているのか」が分からなくなる。案件番号と案件名だけ左に残す。
 *
 * 固定したいセル（th / td の両方）に data-stick="0" のように列番号を振っておくと、
 * この hook が実際に描画された幅を測って left を入れる。
 * 幅を決め打ちにしないのは、列幅が可変の表（案件一覧は table-auto）でも効かせるため。
 *
 * 背景は CSS 側で行から受け継ぐ（globals.css の .stick-col）。
 * そのため tr には必ず不透明な背景を置くこと。半透明だと下の列が透けて見える。
 */
export function useStickyLeftColumns(ref: RefObject<HTMLTableElement | null>, count: number) {
  useEffect(() => {
    const table = ref.current
    if (!table || count <= 0) return

    const apply = () => {
      const head = table.tHead?.rows[0]
      if (!head) return
      let left = 0
      for (let i = 0; i < count; i++) {
        const px = `${Math.round(left)}px`
        table.querySelectorAll<HTMLElement>(`[data-stick="${i}"]`).forEach(el => { el.style.left = px })
        left += head.cells[i]?.getBoundingClientRect().width ?? 0
      }
    }

    apply()
    // 列幅はウィンドウ幅や中身で変わるので、表のサイズが変わったら測り直す
    const ro = new ResizeObserver(apply)
    ro.observe(table)
    return () => ro.disconnect()
  })
}
