// Upstash Redis REST API — no SDK, plain fetch.
// Same Upstash instance as SK, but uses a separate key: sds_store
// Env vars (same as codes.js):
//   UPSTASH_REDIS_REST_KV_REST_API_URL
//   UPSTASH_REDIS_REST_KV_REST_API_TOKEN
//   SDS_CHECK_UID  (one of your 7DS Origin UIDs for code validation)

const STORE_KEY = 'sds_store'; // separate from SK's sk_store

function upstashUrl() { return process.env.UPSTASH_REDIS_REST_KV_REST_API_URL; }
function upstashToken() { return process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN; }

async function readStore() {
  try {
    const res = await fetch(`${upstashUrl()}/get/${STORE_KEY}`, {
      headers: { Authorization: `Bearer ${upstashToken()}` },
    });
    const { result } = await res.json();
    if (!result) return { codes: [], lastClean: 0 };
    const parsed = JSON.parse(result);
    return {
      codes: Array.isArray(parsed.codes) ? parsed.codes : [],
      lastClean: Number(parsed.lastClean) || 0,
    };
  } catch {
    return { codes: [], lastClean: 0 };
  }
}

async function writeStore(store) {
  await fetch(`${upstashUrl()}/set/${STORE_KEY}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${upstashToken()}`,
      'Content-Type': 'application/octet-stream',
    },
    body: JSON.stringify(store),
  });
}

async function isValidCode(code) {
  const CHECK_UID = process.env.SDS_CHECK_UID || '';
  if (!CHECK_UID) return false;

  // Step 1: resolve PID + CID from UID
  let pid, cid;
  try {
    const infoRes = await fetch(
      `https://coupon.netmarble.com/api/sign/userInfo?gameCode=nanaori&pid=${encodeURIComponent(CHECK_UID)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://coupon.netmarble.com/',
          'Origin': 'https://coupon.netmarble.com',
        },
      }
    );
    const infoData = await infoRes.json();
    if (!infoData.success || !infoData.resultData?.[0]) return false;
    pid = infoData.resultData[0].pid;
    cid = infoData.resultData[0].cid;  // ← declare inside same scope
  } catch { return false; }

  // Step 2: validate coupon (cid required for nanaori)
  try {
    const url =
      `https://coupon.netmarble.com/api/coupon/reward` +
      `?gameCode=nanaori&couponCode=${encodeURIComponent(code)}&langCd=TH_TH&pid=${encodeURIComponent(pid)}&cid=${encodeURIComponent(cid)}`;
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
  } catch { return false; }
}

async function pruneCodesBackground(store) {
  const valid = [];
  for (const code of store.codes) {
    if (await isValidCode(code)) valid.push(code);
    await new Promise(r => setTimeout(r, 60_000));
  }
  await writeStore({ codes: valid, lastClean: Date.now() });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const store = await readStore();
    const daysSinceClean = (Date.now() - store.lastClean) / (1000 * 60 * 60 * 24);
    if (daysSinceClean >= 7) {
      await writeStore({ ...store, lastClean: Date.now() });
      pruneCodesBackground(store);
    }
    return res.status(200).json(store.codes);
  }

  if (req.method === 'POST') {
    const { newCode } = req.body || {};
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