// Unlinked API: a standalone Worker + D1. The server only ever sees public keys and handle-less announcements,
// so nothing here can link a payment to a person. The frontend (repo root) calls it through src/lib/api.ts.
type Env = { DB: D1Database; ONECLICK_JWT?: string }

// BN254 scalar field (shield spec section 3): a shieldPk must be below it
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
const HANDLE = /^[a-z0-9_]{3,20}$/
const PUB = /^0[23][0-9a-f]{64}$/
const FIELD_HEX = /^[0-9a-f]{64}$/
const isShieldPk = (h: string) => FIELD_HEX.test(h) && BigInt('0x' + h) < R
const obj = (x: unknown) => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {})
const str = (x: unknown, max = 200) => String(x ?? '').trim().slice(0, max)
const normalizeHandle = (h: string) => h.trim().toLowerCase().replace(/^@/, '')

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16))
async function fingerprint(scanPub: string, spendPub: string) {
  const h = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...unhex(scanPub), ...unhex(spendPub)])))).toUpperCase()
  return `${h.slice(0, 4)} ${h.slice(4, 8)} ${h.slice(8, 12)}`
}

type UserRow = { handle: string; scan_pub: string; spend_pub: string; shield_pk: string | null; display_name: string | null; bio: string | null }
const toProfile = async (r: UserRow) => ({
  handle: r.handle,
  scanPub: r.scan_pub,
  spendPub: r.spend_pub,
  shieldPk: r.shield_pk,
  displayName: r.display_name,
  bio: r.bio,
  fingerprint: await fingerprint(r.scan_pub, r.spend_pub),
})
type AnnRow = { id: number; ephemeral_pub: string; view_tag: number; note_ciphertext: string | null; created_at: number }
const toAnn = (r: AnnRow, hideNote = false) => ({
  id: r.id,
  ephemeralPub: r.ephemeral_pub,
  viewTag: r.view_tag,
  noteCiphertext: r.note_ciphertext && hideNote ? '(encrypted)' : r.note_ciphertext,
  createdAt: r.created_at,
})

// NEAR Intents 1Click proxy. Stores nothing.
const ONECLICK = 'https://1click.chaindefuser.com/v0'
// a partner JWT (wrangler secret ONECLICK_JWT) drops the 0.25% unauthenticated platform fee
const ocHeaders = (env: Env): Record<string, string> => ({ 'content-type': 'application/json', ...(env.ONECLICK_JWT ? { 'X-API-Key': env.ONECLICK_JWT } : {}) })
const BCH_ASSET = 'nep141:bch.omft.near'

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } })

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const q = url.searchParams
  const body = req.method === 'POST' ? obj(await req.json().catch(() => ({}))) : {}
  const key = `${req.method} ${url.pathname.replace(/\/+$/, '')}`

  switch (key) {
    case 'GET /api/health':
      return json({ ok: true })

    case 'GET /api/profile': {
      const handle = normalizeHandle(str(q.get('handle'), 40))
      if (!HANDLE.test(handle)) return json(null)
      const r = await env.DB.prepare('select handle, scan_pub, spend_pub, shield_pk, display_name, bio from users where handle = ?').bind(handle).first<UserRow>()
      return json(r ? await toProfile(r) : null)
    }

    case 'GET /api/check': {
      const handle = normalizeHandle(str(q.get('handle'), 40))
      if (!HANDLE.test(handle)) return json({ valid: false, available: false })
      const r = await env.DB.prepare('select 1 as x from users where handle = ?').bind(handle).first()
      return json({ valid: true, available: !r })
    }

    case 'POST /api/claim': {
      const d = {
        handle: normalizeHandle(str(body.handle, 40)),
        scanPub: str(body.scanPub, 66).toLowerCase(),
        spendPub: str(body.spendPub, 66).toLowerCase(),
        authPub: str(body.authPub, 66).toLowerCase(),
        // optional: without it the handle still works, it just can't be paid from a private balance
        shieldPk: str(body.shieldPk, 80).toLowerCase() || null,
        displayName: str(body.displayName, 40) || null,
        bio: str(body.bio, 120) || null,
      }
      if (!HANDLE.test(d.handle)) return json({ ok: false, error: 'Use 3 to 20 letters, numbers or underscores.' })
      if (![d.scanPub, d.spendPub, d.authPub].every((k) => PUB.test(k))) return json({ ok: false, error: 'Invalid keys.' })
      if (d.shieldPk !== null && !isShieldPk(d.shieldPk)) return json({ ok: false, error: 'Invalid keys.' })
      // ponytail: no rate limit yet; add a Workers rate-limit binding if claims get spammed
      const r = await env.DB.prepare('insert into users (handle, scan_pub, spend_pub, auth_pub, shield_pk, display_name, bio, created_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict (handle) do nothing')
        .bind(d.handle, d.scanPub, d.spendPub, d.authPub, d.shieldPk, d.displayName, d.bio, Date.now())
        .run()
      if (r.meta.changes === 0) return json({ ok: false, error: 'That name is taken.' })
      return json({ ok: true, profile: await toProfile({ handle: d.handle, scan_pub: d.scanPub, spend_pub: d.spendPub, shield_pk: d.shieldPk, display_name: d.displayName, bio: d.bio }) })
    }

    case 'POST /api/announcements': {
      const ephemeralPub = str(body.ephemeralPub, 66).toLowerCase()
      const viewTag = Number(body.viewTag)
      const note = str(body.noteCiphertext, 1024) || null
      if (!PUB.test(ephemeralPub) || !Number.isInteger(viewTag) || viewTag < 0 || viewTag > 255) return json({ error: 'Invalid announcement' }, 400)
      await env.DB.prepare('insert into announcements (ephemeral_pub, view_tag, note_ciphertext, created_at) values (?, ?, ?, ?) on conflict (ephemeral_pub) do nothing').bind(ephemeralPub, viewTag, note, Date.now()).run()
      const row = await env.DB.prepare('select id from announcements where ephemeral_pub = ?').bind(ephemeralPub).first<{ id: number }>()
      return json({ id: row!.id })
    }

    case 'GET /api/announcements': {
      const after = Math.max(0, Number(q.get('after')) || 0)
      const limit = Math.min(500, Math.max(1, Number(q.get('limit')) || 500))
      const { results } = await env.DB.prepare('select * from announcements where id > ? order by id asc limit ?').bind(after, limit).all<AnnRow>()
      return json(results.map((r) => toAnn(r)))
    }

    case 'GET /api/announcements/recent': {
      const { results } = await env.DB.prepare('select * from announcements order by id desc limit 50').all<AnnRow>()
      return json(results.map((r) => toAnn(r, true)))
    }

    case 'GET /api/xchain/tokens': {
      const r = await fetch(`${ONECLICK}/tokens`, { headers: ocHeaders(env) })
      if (!r.ok) return json({ error: 'Could not load chains' }, 502)
      const all = (await r.json()) as Record<string, unknown>[]
      return json(all.map(({ assetId, symbol, blockchain, decimals, price, contractAddress }) => ({ assetId, symbol, blockchain, decimals, price, contractAddress })))
    }

    case 'POST /api/xchain/quote': {
      const amount = str(body.amount, 40)
      if (!/^\d+$/.test(amount)) return json({ error: 'Enter an amount.' })
      const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const req1c = {
        dry: Boolean(body.dry),
        swapType: 'EXACT_INPUT',
        slippageTolerance: 100,
        originAsset: str(body.originAsset, 120),
        depositType: 'ORIGIN_CHAIN',
        destinationAsset: str(body.destinationAsset, 120) || BCH_ASSET,
        amount,
        refundTo: str(body.refundTo, 120),
        refundType: 'ORIGIN_CHAIN',
        recipient: str(body.recipient, 120),
        recipientType: 'DESTINATION_CHAIN',
        deadline,
        referral: 'unlinked',
      }
      const r = await fetch(`${ONECLICK}/quote`, { method: 'POST', headers: ocHeaders(env), body: JSON.stringify(req1c) })
      const j = (await r.json().catch(() => ({}))) as { quote?: Record<string, unknown>; message?: string }
      if (!r.ok || !j.quote) return json({ error: j.message ? `Quote failed: ${j.message}` : 'Quote failed. Try again.' })
      const x = j.quote
      return json({
        depositAddress: String(x.depositAddress ?? ''),
        // some chains (Stellar, for one) only match a deposit that carries this memo
        ...(x.depositMemo ? { depositMemo: String(x.depositMemo) } : {}),
        amountIn: String(x.amountInFormatted ?? ''),
        amountOut: String(x.amountOutFormatted ?? ''),
        amountOutUsd: String(x.amountOutUsd ?? ''),
        timeEstimate: Number(x.timeEstimate ?? 0),
        deadline: String(x.deadline ?? deadline),
      })
    }

    case 'POST /api/xchain/submit': {
      // tells 1Click about the deposit tx, so it doesn't wait for its own (slow on some chains) detection
      const field = (x: unknown) => (typeof x === 'string' && x.trim() && x.trim().length <= 200 ? x.trim() : null)
      const txHash = field(body.txHash)
      const depositAddress = field(body.depositAddress)
      if (!txHash || !depositAddress) return json({ error: 'Enter a transaction hash.' }, 400)
      const r = await fetch(`${ONECLICK}/deposit/submit`, { method: 'POST', headers: ocHeaders(env), body: JSON.stringify({ txHash, depositAddress }) })
      const j = (await r.json().catch(() => ({}))) as { status?: string; message?: string }
      if (!r.ok) return json({ error: r.status < 500 && j.message ? j.message : "Couldn't send it. Check the hash and try again." }, 502)
      return json({ ok: true, status: j.status ?? 'UNKNOWN' })
    }

    case 'GET /api/xchain/status': {
      const memo = str(q.get('depositMemo'), 120)
      const r = await fetch(`${ONECLICK}/status?depositAddress=${encodeURIComponent(str(q.get('depositAddress'), 120))}${memo ? `&depositMemo=${encodeURIComponent(memo)}` : ''}`, { headers: ocHeaders(env) })
      if (!r.ok) return json('UNKNOWN')
      const j = (await r.json()) as { status?: string }
      return json(j.status ?? 'UNKNOWN')
    }
  }
  return json({ error: 'Not found' }, 404)
}

// Cloudflare Pages ignores Range requests, so a video there can't be scrubbed. This route serves the same file with
// byte ranges; getunlinked.pages.dev/demo.mp4 redirects here.
const DEMO_SRC = 'https://getunlinked.pages.dev/media/unlinked-demo.mp4'
let demo: Promise<ArrayBuffer> | null = null

async function demoVideo(req: Request): Promise<Response> {
  demo ??= fetch(DEMO_SRC).then((r) => {
    if (!r.ok) throw new Error(`demo source ${r.status}`)
    return r.arrayBuffer()
  })
  const buf = await demo.catch((e) => {
    demo = null
    throw e
  })
  const size = buf.byteLength
  const base = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=300', ...CORS }
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '')
  if (!m || (!m[1] && !m[2])) return new Response(req.method === 'HEAD' ? null : buf, { headers: { ...base, 'content-length': String(size) } })
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } })
  return new Response(req.method === 'HEAD' ? null : buf.slice(start, end + 1), {
    status: 206,
    headers: { ...base, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) },
  })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (new URL(req.url).pathname === '/demo.mp4' && (req.method === 'GET' || req.method === 'HEAD')) {
      return demoVideo(req).catch(() => json({ error: 'Video unavailable' }, 502))
    }
    try {
      return await route(req, env)
    } catch (e) {
      console.error(e)
      return json({ error: 'Server error' }, 500)
    }
  },
}
