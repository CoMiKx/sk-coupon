# sk-coupon ⚔️

**Seven Knights Re:Birth — Bulk Coupon Redeemer**

A lightweight, single-file web app that automates coupon redemption for Seven Knights Re:Birth via the Netmarble coupon API. Paste in a list of UIDs and coupon codes, hit start, and let it run.

---

## ✨ Features

- **Bulk input** — paste multiple UIDs and coupon codes (one per line)
- **3 operation modes:**
  - `Validate → Redeem` — checks the GET endpoint first, skips invalid coupons, then POSTs to redeem
  - `Redeem only` — skips validation and goes straight to POST
  - `Validate only` — checks coupon validity without redeeming
- **Loop order control** — cycle each UID through all codes, or each code through all UIDs
- **Adjustable delay** between requests (default 600ms) to avoid rate limiting
- **Live log** with timestamps and color-coded `SUCCESS` / `FAIL` / `SKIP` entries
- **Progress bar + stats** — tracks total, success, failed, skipped, and remaining in real time
- **Results table** — shows reward names returned from the API
- **Export CSV** — download all results with one click

---

## 🚀 Usage

### Option A — Open locally
1. Download `index.html`
2. Open it directly in your browser — no install needed

### Option B — Deploy to Vercel
1. Clone this repo
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import this repo
3. Set **Output Directory** to `.` (dot), leave Build Command blank
4. Click **Deploy**

### Option C — Vercel CLI
```bash
npm install -g vercel
vercel
```

---

## ⚙️ API Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET`  | `https://coupon.netmarble.com/api/coupon/reward` | Validate coupon |
| `POST` | `https://coupon.netmarble.com/api/coupon` | Redeem coupon |

**GET params:** `gameCode=tskgb`, `couponCode`, `langCd=TH_TH`, `pid`

**POST body:** `{ gameCode, couponCode, langCd, pid }`

---

## ⚠️ CORS Notice

The Netmarble API does not allow cross-origin requests from arbitrary domains.

| Environment | Works? |
|-------------|--------|
| Open `index.html` locally (file://) | ✅ Yes |
| Browser extension / userscript on netmarble.com | ✅ Yes |
| Hosted on Vercel / any external domain | ❌ Blocked by CORS |

For hosted deployments, a serverless proxy is required to relay requests.

---

## 🛠️ Tech Stack

- Plain HTML + CSS + Vanilla JavaScript
- Zero dependencies, zero build step
- Single file (`index.html`)
- Claude Code

---

## 📄 License

For personal use only. Use responsibly and in accordance with Netmarble's Terms of Service.
