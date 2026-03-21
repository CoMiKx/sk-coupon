// Upstash Redis REST API — no SDK, plain fetch.
// Env vars injected automatically by Vercel's Upstash integration:
//   UPSTASH_REDIS_REST_KV_REST_API_URL
//   UPSTASH_REDIS_REST_KV_REST_API_TOKEN
// Plus one you add manually in Vercel → Settings → Environment Variables:
//   CHECK_UID  (your in-game UID, used to validate codes before adding)

const CODES_KEY      = 'sk_coupon_codes';
const LAST_CLEAN_KEY = 'sk_last_clean';

function getUpstashUrl()   { return process.env.UPSTASH_REDIS_REST_KV_REST_API_URL; }
function getUpstashToken() { return process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN; }

async function kvGet(key) {
  const res = await fetch(
    `${getUpstashUrl()}/get/${key}`,
    { headers: { Authorization: `Bearer ${getUpstashToken()}` } }
  );
  const { result } = await res.json();
  if (!result) return null;
  try { return JSON.parse(result); } catch { return result; }
}

async function kvSet(key, value) {
  await fetch(
    `${getUpstashUrl()}/set/${key}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getUpstashToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: JSON.stringify(value) }),
    }
  );
}

async function getCodes() {
  const data = await kvGet(CODES_KEY);
  return Array.isArray(data) ? data : [];
}

async function getDaysSinceClean() {
  const ts = await kvGet(LAST_CLEAN_KEY);
  if (ts) return (Date.now() - Number(ts)) / (1000 * 60 * 60 * 24);
  return 999;
}

async function isValidCode(code) {
  const CHECK_UID = process.env.CHECK_UID || '';
  if (!CHECK_UID) return false;
  const url = `https://coupon.netmarble.com/api/coupon/reward?gameCode=tskgb&couponCode=${encodeURIComponent(code)}&langCd=TH_TH&pid=${encodeURIComponent(CHECK_UID)}`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://coupon.netmarble.com/',
        'Origin': 'https://coupon.netmarble.com',
      },
    });
    const data = await r.json();
    return data.success === true;
  } catch {
    return false;
  }
}

async function pruneCodesBackground() {
  const codes = await getCodes();
  const valid = [];
  for (const code of codes) {
    if (await isValidCode(code)) valid.push(code);
    await new Promise(r => setTimeout(r, 60_000));
  }
  await kvSet(CODES_KEY, valid);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — return codes list
  if (req.method === 'GET') {
    if ((await getDaysSinceClean()) >= 7) {
      await kvSet(LAST_CLEAN_KEY, Date.now());
      pruneCodesBackground(); // fire-and-forget
    }
    return res.status(200).json(await getCodes());
  }

  // POST — validate + add new code
  if (req.method === 'POST') {
    const { newCode } = req.body || {};
    if (!newCode) return res.status(400).json({ error: 'Missing newCode' });

    const codes = await getCodes();
    if (codes.includes(newCode)) {
      return res.status(400).json({ error: 'Code already exists in Global list' });
    }

    if (!(await isValidCode(newCode))) {
      return res.status(400).json({ error: 'Code is invalid or expired' });
    }

    codes.push(newCode);
    await kvSet(CODES_KEY, codes);
    return res.status(200).json({ success: true, message: 'Added successfully' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
