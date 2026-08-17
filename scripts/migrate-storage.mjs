// Supabase のストレージ（添付ファイル）を別プロジェクトへ丸ごと写す。
//
// データベースは pg_dump で移せるが、ストレージの実ファイルはダンプに含まれない。
// このスクリプトで、旧プロジェクトの各バケットのファイルを1件ずつ読み出して新プロジェクトへ入れ直す。
// アップロードすると storage.objects の行は自動で作られるので、DBダンプ側では storage スキーマを除外する。
//
// 使い方（PowerShell）:
//   $env:SRC_SUPABASE_URL      = "https://<旧>.supabase.co"
//   $env:SRC_SERVICE_ROLE_KEY  = "<旧の service_role キー>"
//   $env:DST_SUPABASE_URL      = "https://<新>.supabase.co"
//   $env:DST_SERVICE_ROLE_KEY  = "<新の service_role キー>"
//   node scripts/migrate-storage.mjs
//
// 何度実行しても同じ結果になる（既にあるファイルは upsert で上書き）。
// 途中で止まったらもう一度実行してよい。

import { createClient } from '@supabase/supabase-js'

const BUCKETS = ['avatars', 'documents', 'koseki-images', 'manual-images', 'meeting-memos']
const PAGE = 100

const need = (name) => {
  const v = process.env[name]
  if (!v) { console.error(`環境変数 ${name} が設定されていません`); process.exit(1) }
  return v
}

const src = createClient(need('SRC_SUPABASE_URL'), need('SRC_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const dst = createClient(need('DST_SUPABASE_URL'), need('DST_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

/** バケット内のファイルを再帰的に列挙する（フォルダは id が null で返る） */
async function listAll(bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await src.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) throw new Error(`${bucket}/${prefix} の一覧取得に失敗: ${error.message}`)
    if (!data || data.length === 0) break
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) out.push(...await listAll(bucket, path))   // フォルダ
      else out.push({ path, mime: entry.metadata?.mimetype ?? 'application/octet-stream' })
    }
    if (data.length < PAGE) break
  }
  return out
}

let totalOk = 0
let totalNg = 0

for (const bucket of BUCKETS) {
  process.stdout.write(`\n[${bucket}] 一覧を取得中…`)
  let files
  try {
    files = await listAll(bucket)
  } catch (e) {
    console.log(`\n  スキップ（バケットが無い？）: ${e.message}`)
    continue
  }
  console.log(` ${files.length}件`)

  let i = 0
  for (const f of files) {
    i++
    try {
      const { data: blob, error: dlErr } = await src.storage.from(bucket).download(f.path)
      if (dlErr || !blob) throw new Error(dlErr?.message ?? 'ダウンロード失敗')
      const buf = Buffer.from(await blob.arrayBuffer())
      const { error: upErr } = await dst.storage.from(bucket).upload(f.path, buf, { contentType: f.mime, upsert: true })
      if (upErr) throw new Error(upErr.message)
      totalOk++
      if (i % 20 === 0 || i === files.length) process.stdout.write(`  ${i}/${files.length}\r`)
    } catch (e) {
      totalNg++
      console.log(`\n  失敗 ${bucket}/${f.path}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`\n  完了 ${files.length}件`)
}

console.log(`\n───────────────`)
console.log(`成功 ${totalOk}件 / 失敗 ${totalNg}件`)
if (totalNg > 0) {
  console.log('失敗したファイルがあります。もう一度実行すると再試行されます。')
  process.exit(1)
}
