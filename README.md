# BizPilot AI — AI API + website for businesses

One Python project (FastAPI) that gives you:

- **Website** (English by default, 10 interface languages) with sign-up, dashboard and a full **owner/admin panel**.
- **Client API** (`/v1`) your customers call from mobile apps, laptops, servers: products, orders, AI customer chat, Gmail send/auto-reply, ads checks. Interactive docs at `/docs`.
- **Dollar plans**: 1 month, 2 months, 1 year (you edit names and prices in Admin → Plans). When a plan ends, the client's API key stops working (HTTP 402) until they renew.
- **Database**: SQLite locally, Postgres when hosted.

## 1. Run it on your computer (VS Code)

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows   (Mac/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # Mac/Linux: cp .env.example .env   -> then edit .env
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000, register with the email you put in `ADMIN_EMAIL` (that account becomes the owner), then open **Admin**.
Run the logic tests: `python -m unittest discover -s tests -v`

## 2. How the business flow works

1. A client registers, describes their business (Settings) and adds products with full details (Products).
2. They test the AI in **AI Chat** (10 free test messages), then pick a plan in **Billing**, pay you, and send the transaction ID.
3. You open **Admin → Payments** and press **Approve** after you really received the money. The plan starts; the client creates an **API key** and uses `/v1/...`.
4. At the end of the period the key stops working by itself. Renewing early adds time to the current period.
   You can also give time manually (Admin → Clients → Give), e.g. a custom number of months.

Payments are **manual-approval** on purpose: card gateways (Stripe etc.) need business verification and are not available in every country. You can add one later in `routes_dashboard.py` (`/billing/checkout`) and call `services.activate_plan()` from its webhook.

## 3. AI provider (important)

`LLM_PROVIDER=demo` works without any key but only matches your product list (good for testing).
For real answers set one of:

| Provider | Settings |
|---|---|
| Claude | `LLM_PROVIDER=anthropic`, `LLM_API_KEY=...`, `LLM_MODEL=claude-haiku-5-5` |
| Any OpenAI-compatible (OpenAI, Groq, OpenRouter, Ollama) | `LLM_PROVIDER=openai`, `LLM_API_KEY=...`, `LLM_BASE_URL=...`, `LLM_MODEL=...` |

Some providers have a free tier; check their current limits. AI calls cost you money or free-tier quota, so keep **requests per month** in each plan sensible (Admin → Plans).

## 4. Gmail

Each client connects their own Gmail with a Google **App Password** (2-Step Verification required). It is stored encrypted. Sending is limited to `EMAIL_DAILY_LIMIT` per client per day, and auto-reply skips newsletters, no-reply and automatic senders to avoid loops.
For a large product, switch to Google OAuth (needs Google app verification).

## 5. Ads autopilot — what is real

The rule engine (`app/ads_engine.py`) is real and tested: it finds rejected ads, low CTR, zero delivery, budget limits, high cost per sale, no sales, and decides a fix. Budget changes are capped by the client's *max daily budget*.
**Applying** a fix inside Google Ads / Meta needs that platform's developer approval and the client's OAuth. Until you write an adapter (see `NoopAdapter`), fixes are shown as **recommended**, not applied. Problems that need a human (landing page, billing) are marked **needs_human**.

## 6. Put it online (free tiers)

1. Create a free Postgres database (e.g. Neon or Supabase) and copy its connection string.
2. Push this folder to a private GitHub repo.
3. On Render: **New → Blueprint** (uses `render.yaml`) or **New → Web Service**.
   Set environment variables: `ADMIN_EMAIL`, `DATABASE_URL`, `PAYMENT_INSTRUCTIONS`, `LLM_*` (`SECRET_KEY` is generated for you).
4. Open the URL, register with `ADMIN_EMAIL`. Add your own domain in the host's settings; HTTPS is automatic.

Free tiers change over time: Render's free web service sleeps when idle (first request is slow) and its disk is temporary — that is why a **hosted Postgres** is required and `SECRET_KEY` must stay the same. A Dockerfile and Procfile are included for Railway, Fly.io, a VPS, etc.

## 7. Security notes

- Passwords: scrypt. API keys: only a hash is stored; the full key is shown once. Gmail passwords: encrypted with a key derived from `SECRET_KEY` (never lose or change it).
- Login/register are rate-limited; API keys are rate-limited per minute (in memory, per server process).
- Clients must call `/v1` from **their server**, not from public browser code (the key would be visible).
- Before going public: set `ADMIN_EMAIL` and `SECRET_KEY`, use Postgres, keep `.env` out of GitHub.

## Files

```
app/main.py              app start, security headers
app/routes_dashboard.py  website API (login, billing, keys, Gmail)
app/routes_account.py    products, orders, chat, email, ads (shared by /api and /v1)
app/routes_v1.py         client API under /v1
app/routes_admin.py      owner panel API
app/services.py          business logic     app/deps.py  auth, limits, subscription check
app/llm.py  mailer.py  ads_engine.py   AI, Gmail, ads rules
static/                  website (index.html, app.js, i18n.js, styles.css)
```
