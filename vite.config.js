import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// Dev only: the Super Qi gateway sends no CORS headers, so forward /superqi-gateway/* to the URL in X-Superqi-Gateway
const superQiGatewayProxy = {
  name: 'superqi-gateway-proxy',
  configureServer(server) {
    server.middlewares.use('/superqi-gateway', async (req, res) => {
      const target = String(req.headers['x-superqi-gateway'] || '')
      if (!target.startsWith('https://')) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'X-Superqi-Gateway must be an https URL' }))
      }

      try {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const upstream = await fetch(`${target.replace(/\/$/, '')}${req.url}`, {
          method: req.method,
          headers: Object.fromEntries(['content-type', 'client-id', 'request-time', 'signature'].map(h => [h, req.headers[h] || ''])),
          body: Buffer.concat(chunks),
        })
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
        res.end(Buffer.from(await upstream.arrayBuffer()))
      } catch (error) {
        res.statusCode = 502
        res.end(JSON.stringify({ error: String(error?.cause?.message || error) }))
      }
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/fib-bridge/' : '/',
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    superQiGatewayProxy,
  ],
  server: {
    port: 3000
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
