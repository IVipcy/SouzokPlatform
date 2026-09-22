// PDF → 1ページ1枚の PNG（ブラウザで変換）。
// 戸籍のスキャンは PDF で届くことが多いので、画像と同じ流れ（1ページ＝1画像）で取り込む。
// pdf.js はブラウザでだけ読む（サーバーでは使わない）。worker は public/pdf.worker.min.mjs（pdfjs-dist からコピー）。

const WORKER_SRC = '/pdf.worker.min.mjs'
/** 出力の横幅（px）。戸籍の細かい字を読むのに足りる大きさ。大きすぎるとアップロードが重い */
const TARGET_WIDTH = 2000

export const isPdfFile = (file: File): boolean => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

export async function pdfToPngFiles(file: File): Promise<File[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  const base = file.name.replace(/\.pdf$/i, '')
  const out: File[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const v1 = page.getViewport({ scale: 1 })
    const scale = Math.min(4, Math.max(1, TARGET_WIDTH / v1.width))
    const vp = page.getViewport({ scale })
    const cv = document.createElement('canvas')
    cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height)
    const ctx = cv.getContext('2d')
    if (!ctx) continue
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
    await page.render({ canvasContext: ctx, canvas: cv, viewport: vp }).promise
    const blob = await new Promise<Blob | null>(res => cv.toBlob(res, 'image/png'))
    if (blob) out.push(new File([blob], `${base}${doc.numPages > 1 ? `_p${i}` : ''}.png`, { type: 'image/png' }))
    page.cleanup()
  }
  await task.destroy()
  return out
}
