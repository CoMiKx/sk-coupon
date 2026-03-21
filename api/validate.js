module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { couponCode, pid } = req.query;
  if (!couponCode || !pid) {
    return res.status(400).json({ error: 'Missing couponCode or pid' });
  }

  const upstream =
    `https://coupon.netmarble.com/api/coupon/reward` +
    `?gameCode=tskgb&couponCode=${encodeURIComponent(couponCode)}&langCd=TH_TH&pid=${encodeURIComponent(pid)}`;

  try {
    const response = await fetch(upstream, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':     'application/json',
        'Referer':    'https://coupon.netmarble.com/',
        'Origin':     'https://coupon.netmarble.com',
      },
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, errorCode: -1, errorMessage: err.message });
  }
};
