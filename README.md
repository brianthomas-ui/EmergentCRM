# Emergent Upsell CRM

A dark, premium **inside-sales CRM for Emergent Labs** — converting existing power users into
credit top-ups, Annual Pro, Dedicated Support, and Lifetime Access. React + FastAPI + MongoDB.

## Read first
**[EMERGENT_HANDOFF.md](./EMERGENT_HANDOFF.md)** — the complete, context-free build & product
spec (stack, run steps, env vars, data/status model, products, pages, integrations, API).
UI mockups: [`docs/visual-spec/`](./docs/visual-spec/).

## Quickstart
```bash
# MongoDB must be reachable. Backend:
cd backend && cp .env.example .env && pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001
# Frontend:
cd frontend && cp .env.example .env && yarn install && yarn start   # http://localhost:3000
```
Runs in demo mode with no integration keys. Demo login: `diyea@emergent.sh` / `leader123`
(admin); agents `*@emergent.sh` / `agent123`.

## Going live
Add the integration keys documented in `backend/.env.example` (Stripe, Razorpay, Calendly,
Google Meet, Circleback, Emergent Users DB). Each is mock-by-default and activates when its
key is present — no code changes required.
