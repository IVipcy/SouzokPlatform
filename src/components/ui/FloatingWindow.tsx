'use client'

// 暗幕なしのドラッグ移動できるフローティングウィンドウ。
// Modal と違い背景をブロックしないので、案件詳細を見ながら／触りながら入力できる。
// ヘッダーを掴んでドラッグ移動、最小化・閉じるが可能。位置は開いている間だけ保持。

import { useRef, useState, useEffect, type ReactNode } from 'react'
import { X, Minus, GripVertical } from 'lucide-react'

export default function FloatingWindow({ isOpen, onClose, title, children, footer, width = 400, resizable = false, height = 460 }: {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: number
  /** 右下のつまみで大きさを変えられるようにする */
  resizable?: boolean
  /** resizable のときの初期の高さ */
  height?: number
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: width, h: height })
  const [minimized, setMinimized] = useState(false)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  // 初回オープン時に右上寄りへ配置（以降は保持）。閉じたら最小化を解除。
  useEffect(() => {
    if (isOpen && pos === null) {
      setPos({ x: Math.max(16, window.innerWidth - width - 40), y: 92 })
    }
    if (!isOpen) setMinimized(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizeRef.current) {
        // 右下のつまみ：掴んだ位置からの差分でサイズを変える（小さくしすぎないよう下限を置く）
        const r = resizeRef.current
        setSize({
          w: Math.max(320, Math.min(window.innerWidth - 40, r.w + (e.clientX - r.x))),
          h: Math.max(260, Math.min(window.innerHeight - 80, r.h + (e.clientY - r.y))),
        })
        return
      }
      if (!dragRef.current) return
      const nx = Math.min(window.innerWidth - 60, Math.max(0, e.clientX - dragRef.current.dx))
      const ny = Math.min(window.innerHeight - 40, Math.max(0, e.clientY - dragRef.current.dy))
      setPos({ x: nx, y: ny })
    }
    const onUp = () => { dragRef.current = null; resizeRef.current = null; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  if (!isOpen || !pos) return null

  const startDrag = (e: React.MouseEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    document.body.style.userSelect = 'none'
  }
  const startResize = (e: React.MouseEvent) => {
    e.stopPropagation()
    resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }
    document.body.style.userSelect = 'none'
  }

  return (
    <div
      className="fixed z-[70] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: resizable ? size.w : width, maxWidth: 'calc(100vw - 24px)' }}
      role="dialog"
    >
      <div
        onMouseDown={startDrag}
        className="flex items-center gap-2 px-3 py-2 rounded-t-xl bg-gradient-to-b from-brand-50 to-brand-100 border-b border-brand-200 cursor-grab active:cursor-grabbing select-none"
      >
        <GripVertical className="w-4 h-4 text-brand-400 flex-none" strokeWidth={2} />
        <span className="text-[13.5px] font-bold text-brand-800 truncate">{title}</span>
        <span className="ml-auto flex items-center gap-1 flex-none">
          <span className="hidden sm:inline text-[10.5px] text-brand-500 mr-1">ドラッグで移動</span>
          <button type="button" onClick={() => setMinimized(m => !m)} className="w-6 h-6 rounded-md flex items-center justify-center text-brand-600 hover:bg-white/70" title={minimized ? '展開' : '最小化'}>
            <Minus className="w-3.5 h-3.5" strokeWidth={2.25} />
          </button>
          <button type="button" onClick={onClose} className="w-6 h-6 rounded-md flex items-center justify-center text-brand-600 hover:bg-white/70" title="閉じる">
            <X className="w-3.5 h-3.5" strokeWidth={2.25} />
          </button>
        </span>
      </div>
      {!minimized && (
        <>
          <div className="p-3.5 overflow-y-auto" style={resizable ? { height: size.h } : { maxHeight: '68vh' }}>{children}</div>
          {footer && <div className="flex justify-end gap-2 px-3.5 py-2.5 border-t border-gray-100 bg-gray-50 rounded-b-xl">{footer}</div>}
          {/* 右下のつまみ（掴んで大きさを変える） */}
          {resizable && (
            <div onMouseDown={startResize} title="ドラッグで大きさを変える"
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
              style={{ background: 'linear-gradient(135deg, transparent 50%, rgb(203 213 225) 50%, rgb(203 213 225) 60%, transparent 60%, transparent 70%, rgb(203 213 225) 70%, rgb(203 213 225) 80%, transparent 80%)' }} />
          )}
        </>
      )}
    </div>
  )
}
