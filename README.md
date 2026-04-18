# Automated Website Business Pipeline

Finds local businesses without websites, generates a personalised preview site using Claude AI, deploys it to Vercel, finds the owner's email via Apollo.io, sends a cold email via Resend, and notifies you on Telegram when they reply.

Runs nightly at 2am with zero manual input.

---

## Architecture

```
Google Maps API  →  Apollo.io  →  Claude AI  →  Vercel
      ↓                                              ↓
  Find businesses                            Deploy preview site
  without websites                                  ↓
                                           Resend (cold email)
                                                    ↓
                                           Reply → Telegram alert
                                                    ↓
                                           Google Sheets log
```

---

## Prerequisites

- Node.js 18+
- A domain name (for Resend reply-to routing)
- Accounts and API keys for: Google Cloud, Anthropic, Vercel, Apollo.io, Resend, Telegram

---

## Quick Start

```bash
# 1. Install everything
npm run setup

# 2. Fill in API keys
nano .env

# 3. Test with ONE business (no emails sent)
npm run test-run

# 4. Go live
npm start
```

---

## API Keys Setup

### 1. Google Maps API
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **Places API**
3. Create an API key under **APIs & Services → Credentials**
4. Set `GOOGLE_MAPS_API_KEY` in `.env`
5. Optional: restrict the key to Places API + your server IP

### 2. Anthropic Claude API
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Set `ANTHROPIC_API_KEY` in `.env`
4. The pipeline uses `claude-haiku-4-5` (fast + cheap — ~$0.002 per site)

### 3. Vercel
1. Install the [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
2. Run `vercel login` and create a new project: `vercel --name business-previews`
3. Get your token: [vercel.com/account/tokens](https://vercel.com/account/tokens)
4. Set in `.env`:
   ```
   VERCEL_TOKEN=your_token
   VERCEL_PROJECT_NAME=business-previews
   ```
5. Your preview URLs will be `https://business-previews.vercel.app/preview/[slug]`

### 4. Apollo.io
1. Sign up at [apollo.io](https://apollo.io)
2. Go to **Settings → Integrations → API** to get your key
3. Set `APOLLO_API_KEY` in `.env`
4. The free plan allows limited searches — paid plans recommended for production

### 5. Resend (Email + Reply Detection)
1. Sign up at [resend.com](https://resend.com)
2. Add and verify your domain under **Domains**
3. Get your API key from **API Keys**
4. Set `RESEND_API_KEY` and `FROM_EMAIL` in `.env`

**Setting up reply detection (inbound routing):**
1. In Resend dashboard → **Inbound** tab
2. Add your domain and set the routing email: `replies@yourdomain.com`
3. Set the webhook endpoint to: `https://your-server.com/webhook/reply`
4. Set `REPLY_TO_EMAIL=replies@yourdomain.com` in `.env`
5. Copy the webhook secret and set `RESEND_WEBHOOK_SECRET` in `.env`

When a business replies to your email, Resend will POST the email to your webhook,
which triggers an instant Telegram notification.

### 6. Telegram Bot
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow prompts — you'll receive a bot token
3. Set `TELEGRAM_BOT_TOKEN` in `.env`
4. To get your chat ID: message [@userinfobot](https://t.me/userinfobot)
5. Set `TELEGRAM_CHAT_ID` in `.env` (it's a number, may be negative for groups)

### 7. Google Sheets
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Google Sheets API** for your project
3. Create a **Service Account**: IAM → Service Accounts → Create
4. Download the JSON key file
5. Create a Google Sheet and share it with the service account email (Editor access)
6. Copy the Sheet ID from the URL: `docs.google.com/spreadsheets/d/[SHEET_ID]/edit`
7. Set in `.env`:
   ```
   GOOGLE_SHEETS_ID=your_sheet_id
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":...}
   ```
   (paste the entire JSON content as a single line)

---

## Project Structure

```
src/
  pipeline/
    findBusinesses.ts     # Google Maps search — finds businesses without websites
    scrapeInfo.ts         # Google Maps Place Details — deep info + photos
    researchBusiness.ts   # Instagram, Google search, Facebook — enrichment
    generateSite.ts       # Claude API — generates personalised HTML
    deploySite.ts         # Vercel API — deploys HTML, returns live URL
    findEmail.ts          # Apollo.io — finds owner email
    sendEmail.ts          # Resend — sends cold email, tracks in SQLite
    logToSheets.ts        # Google Sheets — logs every business processed
  webhook/
    replyHandler.ts       # Handles Resend inbound webhooks (reply detection)
    telegramNotify.ts     # Sends Telegram messages
  server/
    index.ts              # Express server — POST /webhook/reply, GET /health
  scheduler/
    cron.ts               # node-cron — 2am nightly pipeline + orchestration
  utils/
    config.ts             # Typed env var loader
    logger.ts             # Winston logger (logs/ directory)
  prompts/
    teaserSite.ts         # Claude prompt for site generation
    emailTemplate.ts      # Cold email copy (plain + HTML)
  index.ts                # Entry point

data/
  sites/                  # Generated HTML files (persisted between runs)
  already-contacted.json  # Deduplication — place IDs we've already processed
  emails.db               # SQLite — tracks sent emails + reply status

logs/
  combined.log
  error.log

scripts/
  setup.sh                # First-time setup
  test-run.ts             # Verify pipeline with one business (no emails sent)
```

---

## Running the Pipeline Manually

You can trigger a manual run (outside the cron schedule) by adding a temporary call
in `src/index.ts`:

```typescript
import { runPipeline } from './scheduler/cron';
runPipeline('plumber', 'Auckland');
```

Or run the test script which processes exactly one business:
```bash
TARGET_NICHE=cafe TARGET_CITY=Wellington npm run test-run
```

---

## Exposing the Webhook (for Reply Detection)

The webhook server runs on port 3000. To receive Resend's inbound webhooks,
you need a public URL. Options:

**Option A — ngrok (development/testing)**
```bash
ngrok http 3000
# Use the https URL as your Resend webhook endpoint
```

**Option B — Deploy to a VPS (production)**
- Deploy this app to any Linux server (Hetzner, DigitalOcean, AWS EC2 etc.)
- Use nginx as a reverse proxy to port 3000
- Point your Resend webhook to `https://your-server.com/webhook/reply`

**Option C — Railway / Render / Fly.io**
- Push this repo to GitHub
- Connect to Railway or Render for automatic deployment
- Set your env vars in their dashboard

---

## Deploying to Hetzner (Self-Hosted)

```bash
# 1. Create a CX11 server (cheapest, ~€4/mo) running Ubuntu 22.04

# 2. SSH in and install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. Install PM2 (process manager)
npm install -g pm2

# 4. Clone your repo and set up
git clone your-repo /opt/website-business
cd /opt/website-business
npm run setup
nano .env  # fill in your keys

# 5. Start with PM2 (auto-restarts on crash, survives reboots)
pm2 start npm --name "website-pipeline" -- start
pm2 save
pm2 startup  # follow the printed instructions

# 6. Set up nginx as reverse proxy
apt-get install -y nginx certbot python3-certbot-nginx
# Configure nginx to proxy port 3000 → yourdomain.com
# Run certbot for free SSL
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | ✓ | Google Cloud API key with Places API enabled |
| `ANTHROPIC_API_KEY` | ✓ | Anthropic Claude API key |
| `VERCEL_TOKEN` | ✓ | Vercel API token |
| `VERCEL_PROJECT_NAME` | ✓ | Your Vercel project name (used in the preview URL) |
| `VERCEL_PROJECT_ID` | | Optional: link deployments to an existing project |
| `VERCEL_TEAM_ID` | | Optional: for team accounts |
| `APOLLO_API_KEY` | ✓ | Apollo.io API key |
| `RESEND_API_KEY` | ✓ | Resend API key |
| `RESEND_WEBHOOK_SECRET` | | Resend webhook signing secret (for validation) |
| `REPLY_TO_EMAIL` | ✓ | Email address that receives replies (Resend inbound) |
| `TELEGRAM_BOT_TOKEN` | ✓ | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | ✓ | Your personal Telegram chat ID |
| `GOOGLE_SHEETS_ID` | ✓ | Google Sheet ID for logging |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | ✓ | Service account credentials JSON (as string) |
| `FROM_EMAIL` | ✓ | Sending email address |
| `FROM_NAME` | ✓ | Your name (shown in emails) |
| `TARGET_NICHE` | | Business type to search (default: plumber) |
| `TARGET_CITY` | | City to search (default: Auckland) |
| `DAILY_LIMIT` | | Max businesses per run (default: 50) |
| `PORT` | | Webhook server port (default: 3000) |

---

## Cost Estimates (per 50 businesses/night)

| Service | Cost |
|---|---|
| Google Maps Places API | ~$0.00 (free tier: 28,500 calls/mo) |
| Claude Haiku API | ~$0.10 (2000 tokens × 50 = 100k tokens) |
| Vercel | $0.00 (Hobby plan: unlimited deployments) |
| Apollo.io | Varies (free: 50 exports/mo, paid from $49/mo) |
| Resend | $0.00 (free: 3,000 emails/mo) |
| Telegram | $0.00 (always free) |
| Google Sheets | $0.00 (always free) |
| **Total** | **~$0.10/night** on free tiers |

---

## Troubleshooting

**"Missing required environment variable"**
→ Check that your `.env` file exists and all required keys are filled in.

**Google Maps returns no results**
→ Verify the Places API is enabled in Google Cloud Console.
→ Try a broader niche: "restaurant", "cafe", "shop".

**Claude returns non-HTML**
→ This is rare — the HTML extraction regex handles most cases.
→ Check `logs/combined.log` for the raw response.

**Vercel deployment times out**
→ Check `VERCEL_TOKEN` is valid and the project name is correct.
→ The first deployment creates the project — subsequent ones update it.

**Apollo returns no emails**
→ Many small businesses aren't indexed. The free tier is limited.
→ Consider upgrading or supplementing with Hunter.io or Snov.io.

**Telegram not receiving messages**
→ Ensure you've started a conversation with your bot first.
→ Verify `TELEGRAM_CHAT_ID` — use a negative number for groups.

**Resend webhook not firing**
→ Check the webhook URL is publicly accessible.
→ Test with: `curl -X POST https://your-server.com/health`
