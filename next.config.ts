import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // マニュアル記事(content/manual/*.md)は実行時に fs で読むため、standalone 出力に同梱する
  outputFileTracingIncludes: {
    '/manual': ['./content/manual/**'],
    '/manual/[slug]': ['./content/manual/**'],
  },
};

export default nextConfig;
