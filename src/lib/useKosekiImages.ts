'use client'

// 戸籍のスキャン画像（koseki_images・migration 229）の読み込み。
//
// バケットが非公開なので、行を読むたびに署名付きURLを作り直す必要がある。
// 画像パネル（対象者タブ／TOP）と相続関係説明図の両方から同じ形で使うため、ここにまとめた。

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Anno } from '@/lib/imageAnnotations'

export type KosekiImageRow = {
  id: string
  case_id: string
  target_person: string | null
  /** どの戸籍請求（役所）で届いたぶんか。null=請求 未指定（migration 235） */
  koseki_request_id: string | null
  image_path: string
  image_bucket: string
  file_name: string | null
  annotations: Anno[] | null
  sort_order: number
}

export const KOSEKI_BUCKET = 'koseki-images'

export function useKosekiImages(caseId: string, targetPerson?: string) {
  const [rows, setRows] = useState<KosekiImageRow[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})

  const reload = useCallback(async () => {
    const supabase = createClient()
    let q = supabase.from('koseki_images').select('*').eq('case_id', caseId).order('sort_order')
    if (targetPerson !== undefined) q = q.eq('target_person', targetPerson)
    const { data } = await q
    const list = (data ?? []) as unknown as KosekiImageRow[]
    setRows(list)
    const next: Record<string, string> = {}
    await Promise.all(list.map(async r => {
      const { data: s } = await supabase.storage.from(r.image_bucket || KOSEKI_BUCKET).createSignedUrl(r.image_path, 3600)
      if (s?.signedUrl) next[r.id] = s.signedUrl
    }))
    setUrls(next)
  }, [caseId, targetPerson])

  useEffect(() => {
    let alive = true
    ;(async () => { await reload(); if (!alive) return })()
    return () => { alive = false }
  }, [reload])

  return { rows, urls, reload, setRows }
}
