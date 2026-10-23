# Crezycall — Audio/Video Calling Platform

Web app with **3 portals**: Customer, Agent, Admin. Node.js + PostgreSQL.

## 3 Links (local)

| Portal | URL |
|--------|-----|
| **Customer** | http://localhost:3000/customer |
| **Agent** | http://localhost:3000/agent |
| **Admin** | http://localhost:3000/admin |

## Quick Start

### 1. PostgreSQL install & database

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16
createdb callconnect
```

### 2. Setup project

```bash
cd call
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT_SECRET

npm install
npm run db:setup
npm start
```

Open the 3 links above in browser (use Chrome for mic/camera).

## Demo Logins

| Role | Email | Password |
|------|-------|----------|
| Customer | user@demo.com | user123 |
| Agent | priya@agent.demo | agent123 |
| Admin | demo@admin.com | 1234567 |

More demo agents: `ananya@agent.demo`, `riya@agent.demo`, `kavya@agent.demo` (password: `agent123`)

## Features

### Customer (`/customer`)
- Agent list with photo, age, audio/video rates (₹5–15/min audio, ₹20–30/min video)
- Wallet recharge (demo — no payment gateway)
- Audio & video calls (WebRTC)
- Per-minute billing from wallet

### Agent (`/agent`)
- Register → admin approval required
- Go online/offline
- Accept/reject calls
- Earnings with **10% platform fee** (₹100 earned → ₹90 agent, ₹10 platform)
- Month-end withdrawal request (min ₹100)

### Admin (`/admin`)
- Approve/reject agents
- Set audio & video rates per agent
- Approve agent withdrawals (mark paid)
- Dashboard stats & call history

## Free Hosting (recommended)

### Database — [Neon](https://neon.tech) (free PostgreSQL)
1. Create project → copy connection string
2. Put in `DATABASE_URL` on Render

### Backend — [Render](https://render.com) (free web service)
1. Connect GitHub repo
2. Build: `npm install && npm run db:setup`
3. Start: `npm start`
4. Env vars: `DATABASE_URL`, `JWT_SECRET`, `PLATFORM_FEE_PERCENT=10`

Your live links will be:
- `https://your-app.onrender.com/customer`
- `https://your-app.onrender.com/agent`
- `https://your-app.onrender.com/admin`

> Render free tier sleeps after inactivity — first load may take ~30s.

### Alternative free DB: [Supabase](https://supabase.com)
Use the PostgreSQL connection string from Project Settings → Database.

## Project Structure

```
call/
├── server/
│   ├── index.js          # Express + Socket.io + billing
│   ├── schema.sql        # PostgreSQL tables
│   ├── setup-db.js       # Seed admin + demo data
│   └── routes/
├── public/
│   ├── customer/         # User app
│   ├── agent/            # Agent app
│   ├── admin/            # Admin dashboard
│   └── css/
└── package.json
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default 3000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Auth token secret |
| `PLATFORM_FEE_PERCENT` | Platform cut (default 10) |

## Notes

- Recharge is **demo only** — integrate Razorpay/PhonePe for production payments.
- WebRTC needs HTTPS in production (Render provides SSL).
- Billing runs every **60 seconds** while call is active.
