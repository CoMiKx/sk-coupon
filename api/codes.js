import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // Allow requests from any origin (our own frontend)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const codesPath = path.join(process.cwd(), 'codes.json');
  const CHECK_UID = process.env.CHECK_UID || '';

  // Helper to read codes
  const getCodes = () => {
    try {
      if (fs.existsSync(codesPath)) {
        return JSON.parse(fs.readFileSync(codesPath, 'utf8'));
      }
    } catch(e) {}
    return [];
  };

  // Helper to save codes
  const saveCodes = (codes) => {
    fs.writeFileSync(codesPath, JSON.stringify(codes, null, 2));
  };

  // Helper to validate a code
  const isValidCode = async (code) => {
    if (!CHECK_UID) return false;
    const url = `https://coupon.netmarble.com/api/coupon/reward?gameCode=tskgb&couponCode=${encodeURIComponent(code)}&langCd=TH_TH&pid=${encodeURIComponent(CHECK_UID)}`;
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://coupon.netmarble.com/',
          'Origin': 'https://coupon.netmarble.com'
        }
      });
      const data = await r.json();
      return data.success === true;
    } catch (err) {
      return false;
    }
  };

  const lastCleanPath = path.join(process.cwd(), 'last_clean.txt');

  const getDaysSinceClean = () => {
    try {
      if (fs.existsSync(lastCleanPath)) {
        const ts = parseInt(fs.readFileSync(lastCleanPath, 'utf8'));
        return (Date.now() - ts) / (1000 * 60 * 60 * 24);
      }
    } catch(e) {}
    return 999; // trigger full clean on first run
  };

  async function pruneCodesBackground() {
    let codes = getCodes();
    let validCodes = [];
    for (const code of codes) {
      const valid = await isValidCode(code);
      if (valid) {
        validCodes.push(code);
      }
      // 1 minute delay for each code to prevent lock
      await new Promise(r => setTimeout(r, 60000));
    }
    // Save valid codes back safely
    saveCodes(validCodes);
  }

  if (req.method === 'GET') {
    // Check if 7 days have passed since the last background clean
    if (getDaysSinceClean() >= 7) {
      fs.writeFileSync(lastCleanPath, Date.now().toString());
      pruneCodesBackground(); // Start async process in background
    }
    return res.status(200).json(getCodes());
  }

  if (req.method === 'POST') {
    const { newCode } = req.body || {};
    if (!newCode) return res.status(400).json({ error: 'Missing newCode' });

    let codes = getCodes();
    if (codes.includes(newCode)) {
      return res.status(400).json({ error: 'Code already exists in Global list' });
    }

    const valid = await isValidCode(newCode);
    if (!valid) {
      return res.status(400).json({ error: 'Code is invalid or expired' });
    }

    codes.push(newCode);
    saveCodes(codes);
    return res.status(200).json({ success: true, message: 'Added successfully' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
