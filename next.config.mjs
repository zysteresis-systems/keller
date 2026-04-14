/** @type {import('next').NextConfig} */
const nextConfig = {
  // CRITICAL: Externalize WASM-based EDA packages so they run natively
  // in the Node.js runtime instead of being bundled by webpack/turbopack.
  // Without this, Next.js tries to bundle the multi-MB WASM binaries
  // into the server chunk, causing OOM and incompatible module errors.
  serverExternalPackages: ['@yowasp/yosys', '@yowasp/iverilog', '@aspect-build/yosys', '@aspect-build/iverilog', 'netlistsvg', 'elkjs'],

  // Increase server-side body size limit for large Verilog payloads
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },

  // Optimized build for Docker deployments (Render)
  output: 'standalone',
};

export default nextConfig;
