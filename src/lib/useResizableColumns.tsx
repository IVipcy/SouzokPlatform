'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * 列幅をドラッグでリサイズ可能にするフック。
 * localStorageに保存されるので次回ログイン時も維持される。
 *
 * @param storageKey   localStorage保存キー（例: "caseListColWidths"）
 * @param defaults     各列のデフォルト幅 (px)
 * @returns widths/setWidth/reset/resizeHandlers
 */
export function useResizableColumns<T extends Record<string, number>>(
  storageKey: string,
  defaults: T,
) {
  const [widths, setWidths] = useState<T>(defaults)

  // 初期ロード
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        setWidths({ ...defaults, ...parsed })
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const setWidth = useCallback((key: keyof T, w: number) => {
    setWidths(prev => {
      const next = { ...prev, [key]: Math.max(40, Math.round(w)) as T[keyof T] }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
      return next
    })
  }, [storageKey])

  const reset = useCallback(() => {
    setWidths(defaults)
    try { localStorage.removeItem(storageKey) } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  /**
   * <th>等のヘッダーに付ける mousedown ハンドラー生成
   */
  const startResize = useCallback((key: keyof T) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = widths[key]
    const onMove = (ev: MouseEvent) => setWidth(key, startWidth + (ev.clientX - startX))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [widths, setWidth])

  return { widths, setWidth, reset, startResize }
}

/**
 * ドラッグハンドル（縦バー）— `<th>` や `<div>` の relative 内に配置する
 */
export function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <span
      onMouseDown={onMouseDown}
      onClick={e => e.stopPropagation()}
      title="ドラッグして列幅を変更"
      className="absolute top-0 bottom-0 right-[-6px] w-[12px] cursor-col-resize z-10 flex items-center justify-center group/handle"
    >
      <span className="w-[2px] h-[60%] bg-gray-300 group-hover/handle:bg-blue-500 transition-colors rounded-full" />
    </span>
  )
}
