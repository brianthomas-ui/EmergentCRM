# emergentintegrations — LOCAL DEV SHIM

`emergentintegrations` is **Emergent's proprietary package** (pinned `==0.2.0` in
`backend/requirements.txt`). It is **not published on public PyPI**, so a plain
`pip install -r requirements.txt` fails anywhere outside the Emergent platform.

`backend/server.py` only imports it in three places, all for Stripe checkout:

```python
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
```

This folder is a **drop-in simulation** of exactly that surface so the backend
imports and runs locally **without a real Stripe account**. It is installed only
into your local virtualenv:

```bash
pip install -e tools/dev-shims/emergentintegrations
```

## Why this design is safe for round-tripping back to Emergent

- It lives in `tools/dev-shims/` and is **never on `sys.path` unless you pip-install it**.
  On the Emergent platform the real package is installed from their index and this
  folder is simply ignored — `server.py` is untouched, so re-importing the repo to
  Emergent behaves exactly as before.
- It reports version `0.2.0` to match the pin.

## Behavior (simulation)

- `StripeCheckout.create_checkout_session(req)` → returns a fake `cs_sim_…` session id and
  a `url` that points at your app's `success_url` (so the `/payment-return` flow works).
- `StripeCheckout.get_checkout_status(session_id)` → returns `paid`/`complete` on the first
  poll **when `EMERGENT_SIM_AUTOPAY=true`** (default), so a local payment completes end-to-end
  and the lead moves to *Won*. Set `EMERGENT_SIM_AUTOPAY=false` to keep payments `pending`.
- `StripeCheckout.handle_webhook(body, sig)` → parses a JSON body `{session_id, payment_status}`.
  **Signature is NOT verified** (no real secret) — local only.

To test against **real Stripe** instead, `pip install stripe`, set a real `STRIPE_API_KEY`,
and replace the bodies here with calls to the official SDK (see `checkout.py` TODOs).
