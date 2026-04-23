import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (and the underlying pdfjs-dist) load a worker chunk at runtime.
  // Marking them external keeps them as plain node require()s from node_modules
  // so the worker path resolves correctly.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
