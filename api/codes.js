// Upstash Redis REST API — no SDK, plain fetch.
// Env vars injected automatically by Vercel's Upstash integration:
//   UPSTASH_REDIS_REST_KV_REST_API_URL
//   UPSTASH_REDIS_REST_KV_REST_API_TOKEN
// Plus one manual env var:
//   CHECK_UID  (your in-game UID, used to validate codes before adding)

const STORE_KEY = 'sk_store';

function upstashUrl()   { return process.env.UPSTASH_REDIS_REST_KV_REST_API_URL; }
function upstashToken() { return process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN; }

// ── Single-key read ───────────────────────────────────────────────────────
async function readStore() {
  try {
    const res = await fetch(`${upstashUrl()}/get/${STORE_KEY}`, {
      headers: { Authorization: `Bearer ${upstashToken()}` },
    });
    const { result } = await res.json();
    if (!result) return { codes: [], lastClean: 0 };
    const parsed = JSON.parse(result);
    return {
      codes:     Array.isArray(parsed.codes) ? parsed.codes : [],
      lastClean: Number(parsed.lastClean)    || 0,
    };
  } catch (e) {
    console.error('readStore error:', e);
    return { codes: [], lastClean: 0 };
  }
}

// ── Single-key write ──────────────────────────────────────────────────────
async function writeStore(store) {
  await fetch(`${upstashUrl()}/set/${STORE_KEY}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${upstashToken()}`,
      'Content-Type': 'application/octet-stream',
    },
    body: JSON.stringify(store),
  });
}

// ── Validate one code against Netmarble ──────────────────────────────────
async function isValidCode(code) {
  const CHECK_UID = process.env.CHECK_UID || '';
  if (!CHECK_UID) return false;
  const url =
    `https://coupon.netmarble.com/api/coupon/reward` +
    `?gameCode=tskgb&couponCode=${encodeURIComponent(code)}&langCd=TH_TH&pid=${encodeURIComponent(CHECK_UID)}`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':     'application/json',
        'Referer':    'https://coupon.netmarble.com/',
        'Origin':     'https://coupon.netmarble.com',
      },
    });
    const data = await r.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// ── Background prune (fire-and-forget, runs max once per 7 days) ──────────
async function pruneCodesBackground(store) {
  const valid = [];
  for (const code of store.codes) {
    if (await isValidCode(code)) valid.push(code);
    await new Promise(r => setTimeout(r, 60_000));
  }
  await writeStore({ codes: valid, lastClean: Date.now() });
}

// ── Parse raw body (Vercel doesn't always auto-parse JSON) ────────────────
async function parseBody(req) {
  // If Vercel already parsed it, use it directly
  if (req.body && typeof req.body === 'object') return req.body;

  // Otherwise read the raw stream
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

// ── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify env vars are present — surface a clear error if missing
  if (!upstashUrl() || !upstashToken()) {
    console.error('Missing Upstash env vars:', {
      url:   upstashUrl()   ? 'set' : 'MISSING',
      token: upstashToken() ? 'set' : 'MISSING',
    });
    return res.status(500).json({ error: 'Server misconfiguration: Upstash env vars not set' });
  }

  // GET — return codes list
  if (req.method === 'GET') {
    const store = await readStore();
    const daysSinceClean = (Date.now() - store.lastClean) / (1000 * 60 * 60 * 24);
    if (daysSinceClean >= 7) {
      await writeStore({ ...store, lastClean: Date.now() });
      pruneCodesBackground(store); // fire-and-forget
    }
    return res.status(200).json(store.codes);
  }

  // POST — validate + add new code
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { newCode } = body;
    if (!newCode) return res.status(400).json({ error: 'Missing newCode' });

    const store = await readStore();

    if (store.codes.includes(newCode)) {
      return res.status(400).json({ error: 'Code already exists in Global list' });
    }

    if (!(await isValidCode(newCode))) {
      return res.status(400).json({ error: 'Code is invalid or expired' });
    }

    store.codes.push(newCode);
    await writeStore(store);
    return res.status(200).json({ success: true, message: 'Added successfully' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
