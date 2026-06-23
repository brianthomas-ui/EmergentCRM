# Test Credentials — Emergent CRM

> Updated 2026-06-23. Two ABSOLUTELY ISOLATED workspaces via an `is_demo` flag on every
> user/lead/payment/meeting/activity/view. A demo user can only see/touch demo data; a
> real user only real data — enforced at the query level AND per-record access guards.

## Demo workspace (is_demo=true) — the ONLY advertised entry on the sign-in page
- Entered via the **"Demo View"** button (no credentials shown). Backend: `POST /api/auth/demo-login`.
- **demo@emergent.sh** / **demo12345** — Demo Manager (admin). Self-heals password on boot.
- Demo agents (role=agent, is_demo=true, password **demo12345** — not used for direct login,
  the manager impersonates them via "View as agent"):
  - olivia.hayes@demo.crm  (Olivia Hayes)
  - james.carter@demo.crm  (James Carter)
  - sophia.bennett@demo.crm (Sophia Bennett)
  - noah.brooks@demo.crm   (Noah Brooks)
  - liam.foster@demo.crm   (Liam Foster)
- Demo data: ~793 leads / 582 payments / ~12k meetings, owned by the demo agents.

## Real workspace (is_demo=false) — the actual team CRM (NOT shown on the login page)
- Manager (admin): **diyea@emergent.sh** / **emergent@12345**
- Agents (role=agent), all password **emergent@12345**:
  - aryan.f@emergent.sh
  - dipan@emergent.sh
  - vinay.p@emergent.sh
  - brian@emergent.sh
  - abhishek.u@emergent.sh
- Real workspace starts EMPTY (0 leads) — a clean slate for the real team to populate.

## Slack payment alerts
- Admin → Settings → "Slack — payment alerts" → paste an Incoming Webhook URL → Save → Test.
- Stored encrypted as `slack_webhook_url` in org integrations. Currently NOT configured.
- Fires ONLY for REAL (is_demo=false) payments that become paid (Stripe/Razorpay webhook
  + manual "mark as paid"). Demo payments and "Simulate payment" NEVER fire Slack.

## Notes
- CSRF: cookie-auth state-changing requests need the double-submit token; Bearer-token
  clients (curl/tests) are exempt — login returns a `token` field.
- `POST /api/demo/reset` (admin) wipes+reseeds ONLY the demo workspace (is_demo=true).
- Base URL (preview): https://pipeline-hub-70.preview.emergentagent.com
- Production: https://emergentcrm.com (separate env; redeploy required to push code changes).
