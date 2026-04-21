import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // SSE streaming endpoint — bypass Vite proxy entirely to avoid buffering.
      // Vite's http-proxy buffers SSE even with X-Accel-Buffering: no.
      // This plugin manually pipes the response stream without buffering.
      '/channels': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req, res) => {
            if (!req.url?.endsWith('/stream')) return;

            // For SSE endpoints, manually pipe the response to bypass buffering
            res.setHeader('X-Accel-Buffering', 'no');
          });

          proxy.on('proxyRes', (proxyRes, req, res) => {
            if (!req.url?.endsWith('/stream')) return;

            const contentType = proxyRes.headers['content-type'] ?? '';
            if (!contentType.includes('text/event-stream')) return;

            // Copy headers
            res.writeHead(proxyRes.statusCode ?? 200, {
              ...proxyRes.headers,
              'Cache-Control': 'no-cache',
              'X-Accel-Buffering': 'no',
              Connection: 'keep-alive',
            });

            // Pipe and flush each chunk immediately
            proxyRes.on('data', (chunk: Buffer) => {
              res.write(chunk);
              // Force flush if supported (http.ServerResponse in Node)
              (res as unknown as { flush?: () => void }).flush?.();
            });

            proxyRes.on('end', () => res.end());
            proxyRes.on('error', () => res.end());
          });
        },
      },
    },
  },
})
