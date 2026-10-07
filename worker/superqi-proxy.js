// Cloudflare Worker, same contract as the dev proxy in vite.config.js: forwards to the https URL in X-Superqi-Gateway and adds CORS headers.
// Deploy: npx wrangler deploy worker/superqi-proxy.js --name superqi-proxy --compatibility-date 2026-10-01
const ALLOWED = /^https:\/\/[\w.-]*banqinonprod\.com\/?$/ // add the prod gateway host here when needed
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const target = req.headers.get('x-superqi-gateway') || ''
    if (!ALLOWED.test(target)) return new Response('{"error":"gateway not allowed"}', { status: 400, headers: CORS })

    const { pathname, search } = new URL(req.url)
    const headers = new Headers()
    for (const h of ['content-type', 'client-id', 'request-time', 'signature']) headers.set(h, req.headers.get(h) || '')

    const upstream = await fetch(`${target.replace(/\/$/, '')}${pathname}${search}`, { method: 'POST', headers, body: await req.arrayBuffer() })
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    })
  },
}
