import type { NextConfig } from "next";

// standalone 出力は Docker（Azure Container Apps）で使う形。
// Render は `next start` で動かしているが、standalone を出していると Next 16 は
//   ⚠ "next start" does not work with "output: standalone" configuration
// と警告する（想定していない組み合わせ）。Dockerでビルドするときだけ standalone にする。
const standalone = process.env.NEXT_OUTPUT_STANDALONE === '1'

const nextConfig: NextConfig = {
  ...(standalone ? { output: 'standalone' as const } : {}),
  // マニュアル記事(content/manual/*.md)は実行時に fs で読むため、standalone 出力に同梱する
  outputFileTracingIncludes: {
    '/manual': ['./content/manual/**'],
    '/manual/[slug]': ['./content/manual/**'],
  },
};

export default nextConfig;
