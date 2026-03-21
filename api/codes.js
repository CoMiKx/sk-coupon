// Upstash Redis REST API — no SDK, plain fetch.
// Env vars injected automatically by Vercel's Upstash integration:
//   UPSTASH_REDIS_REST_KV_REST_API_URL
//   UPSTASH_REDIS_REST_KV_REST_API_TOKEN
// Plus one manual env var:
//   CHECK_UID  (your in-game UID, used to validate codes before adding)
//
// ── DB call budget ────────────────────────────────────────────────────────
//   GET  /api/codes  →  1 kvGet  (codes + lastClean stored together in one key)
//   POST /api/codes  →  1 kvGet + 1 external fetch (validate) + 1 kvSet
//   Background prune →  1 kvGet + N external fetches + 1 kvSet  (runs max once/7d)
// ─────────────────────────────────────────────────────────────────────────

const STORE_KEY = 'sk_store'; // single key holds { codes: [], lastClean: timestamp }

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
  } catch {
    return { codes: [], lastClean: 0 };
  }
}

// ── Single-key write ──────────────────────────────────────────────────────
async function writeStore(store) {
  await fetch(`${upstashUrl()}/set/${STORE_KEY}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${upstashToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value: JSON.stringify(store) }),
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
    await new Promise(r => setTimeout(r, 60_000)); // 1 min between checks
  }
  await writeStore({ codes: valid, lastClean: Date.now() }); // 1 kvSet
}

// ── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — return codes list
  // Total DB cost: 1 kvGet
  if (req.method === 'GET') {
    const store = await readStore(); // 1 kvGet
    const daysSinceClean = (Date.now() - store.lastClean) / (1000 * 60 * 60 * 24);
    if (daysSinceClean >= 7) {
      // Update lastClean immediately so concurrent requests don't also trigger a prune
      await writeStore({ ...store, lastClean: Date.now() }); // 1 kvSet (rare, once/7d)
      pruneCodesBackground(store); // fire-and-forget
    }
    return res.status(200).json(store.codes);
  }

  // POST — validate + add new code
  // Total DB cost: 1 kvGet + 1 kvSet
  if (req.method === 'POST') {
    const { newCode } = req.body || {};
    if (!newCode) return res.status(400).json({ error: 'Missing newCode' });

    const store = await readStore(); // 1 kvGet

    if (store.codes.includes(newCode)) {
      return res.status(400).json({ error: 'Code already exists in Global list' });
    }

    if (!(await isValidCode(newCode))) { // 1 external fetch (not a DB call)
      return res.status(400).json({ error: 'Code is invalid or expired' });
    }

    store.codes.push(newCode);
    await writeStore(store); // 1 kvSet
    return res.status(200).json({ success: true, message: 'Added successfully' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
