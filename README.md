# WhatsApp Release Bot

A lightweight Node.js bot that receives HTTP requests from GitHub Actions and sends notifications to your WhatsApp group.

---

## How It Works

```
GitHub Release created (via website tool)
        ↓
GitHub Actions job runs
        ↓
Job finishes → POST /notify to this bot (Railway)
        ↓
Bot sends message to your WhatsApp group 🎉
```

---

## Deploy to Railway (Free)

### 1. Push this project to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_NAME/whatsapp-release-bot.git
git push -u origin main
```

### 2. Create Railway project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select this repository
4. Railway auto-detects the Dockerfile and builds it

### 3. Add a persistent volume (important!)

WhatsApp session data must survive restarts:

1. In Railway dashboard → your service → **Volumes**
2. Click **Add Volume**
3. Mount path: `/data`
4. This keeps you logged in across deploys

### 4. Set environment variables in Railway

Go to your service → **Variables** and add:

| Variable | Value |
|---|---|
| `API_SECRET` | A strong random string (you choose, e.g. `openssl rand -hex 32`) |
| `WHATSAPP_GROUP_NAME` | Exact name of your WhatsApp group (e.g. `Edumate Working Group`) |
| `PORT` | `3000` |

### 5. Get your Railway public URL

In Railway → your service → **Settings → Networking → Generate Domain**

Your bot URL will be something like: `https://whatsapp-bot-production-xxxx.up.railway.app`

---

## Log In to WhatsApp

1. Open your bot URL + `/qr` in a browser:
   ```
   https://your-bot.up.railway.app/qr
   ```
2. A QR code will appear — scan it with WhatsApp on your phone:
   - Open WhatsApp → ⋮ Menu → Linked Devices → Link a Device
3. Once scanned, the page shows ✅ "Already logged in"
4. Check `/` endpoint — it should return `"status": "ready"`

---

## Find Your Group ID

If the group name doesn't match exactly, list all groups:

```bash
curl https://your-bot.up.railway.app/groups \
  -H "x-api-secret: YOUR_API_SECRET"
```

Use the exact `name` value for `WHATSAPP_GROUP_NAME`.

---

## Add GitHub Secrets

In your **project repo** (not this bot repo) → Settings → Secrets → Actions:

| Secret | Value |
|---|---|
| `WHATSAPP_BOT_URL` | `https://your-bot.up.railway.app` (no trailing slash) |
| `WHATSAPP_BOT_SECRET` | Same value as `API_SECRET` in Railway |

---

## Add the Workflow

Copy `release-notify.yml` to your project repo at:
```
.github/workflows/release-notify.yml
```

Replace the placeholder build/deploy steps with your real ones.

---

## Test It Manually

```bash
curl -X POST https://your-bot.up.railway.app/notify \
  -H "Content-Type: application/json" \
  -H "x-api-secret: YOUR_API_SECRET" \
  -d '{"message": "👋 Test from the bot!"}'
```

You should receive the message in your WhatsApp group within seconds.

---

## API Reference

| Endpoint | Auth | Description |
|---|---|---|
| `GET /` | None | Health check, returns status |
| `GET /qr` | None | QR code login page |
| `GET /groups` | ✅ | List all WhatsApp groups |
| `POST /notify` | ✅ | Send message to group |

### POST /notify body

```json
{
  "message": "Your message here",
  "groupId": "optional-override-group-id@g.us"
}
```
