# Deploying EmergentCRM to emergentcrm.com (self-hosted)

This runs the app **off the Emergent platform** on a server you control, behind Cloudflare.
One origin serves everything: the SPA at `/` and the API at `/api` (same origin, so the secure
auth cookies just work). Verified locally: the production web image builds and serves the SPA;
the backend boots clean.

**Stack:** `docker-compose.prod.yml` → `mongo` (persistent volume) + `backend` (FastAPI) +
`web` (Caddy: serves the built SPA, reverse-proxies `/api`, terminates TLS).

---

## 0. Decide the mode (one line in `.env.prod`)
- `APP_MODE=demo` — the **showcase**: the full $100k/agent demo data, leaderboard, and the
  landing **Demo View** button. Use this to show emergentcrm.com off. *(default)*
- `APP_MODE=production` — a **real instance**: seeds only the admin, no demo data, demo paths off.

---

## 1. Provision a server
Any small Linux box with a public IP (≈$6–12/mo is plenty — e.g. DigitalOcean, Hetzner, Lightsail).
2 GB RAM minimum. Then install Docker:
```bash
curl -fsSL https://get.docker.com | sh
```

## 2. Get the code + configure
```bash
git clone -b Draft-June-20 https://github.com/brianthomas-ui/EmergentCRM.git
cd EmergentCRM
cp .env.prod.example .env.prod
# generate two DIFFERENT secrets:
openssl rand -base64 48   # paste as JWT_SECRET
openssl rand -base64 48   # paste as INTEGRATION_ENC_KEY
nano .env.prod            # set the two secrets + ADMIN_PASSWORD; leave APP_MODE=demo for the showcase
```

## 3. Launch
```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f backend   # watch for "reseeded believable demo dataset"
```
First boot seeds the demo data (a few seconds). Only ports **80/443** are exposed; Mongo and the
backend stay on the internal Docker network.

## 4. Point emergentcrm.com at the box (Cloudflare)
emergentcrm.com is already on Cloudflare. In the Cloudflare dashboard:
1. **DNS** → set/point an **A record** for `emergentcrm.com` (and `www`) to your server's IP,
   **Proxy status = Proxied (orange cloud)**.
2. **SSL/TLS** → **Overview** → set the mode to **Full**.
   - This keeps the secure cookies working (TLS end-to-end). Do **not** use "Flexible" — it breaks login.
   - *Optional, more secure:* generate a free **Origin Certificate** (SSL/TLS → Origin Server),
     save the two PEMs into `deploy/certs/` as `origin.pem` / `origin-key.pem`, change `tls internal`
     to `tls /etc/caddy/certs/origin.pem /etc/caddy/certs/origin-key.pem` in `deploy/Caddyfile`,
     redeploy, and switch the mode to **Full (strict)**.

DNS propagates in a minute or two.

## 5. Verify
- Visit **https://emergentcrm.com** → the new split-screen landing page, **Demo View** lands in the
  manager console with the rich data.
- `curl -sI https://emergentcrm.com/api/meta` returns a response (401 is expected — it needs auth).
- Log in: `diyea@emergent.sh` / your `ADMIN_PASSWORD` (or the demo team password in demo mode).

---

## Updating later
```bash
cd EmergentCRM && git pull origin Draft-June-20
docker compose -f docker-compose.prod.yml up -d --build
```
(Just tell me to push new changes to `Draft-June-20` and this picks them up.)

## Backups (do this before any real/production use)
Mongo data lives in the `mongo_prod_data` volume. Back it up on a schedule:
```bash
docker compose -f docker-compose.prod.yml exec -T mongo mongodump --archive --db="$DB_NAME" \
  | gzip > "backup-$(date +%F).gz"      # then copy off-box (S3/GCS/scp)
```
For a real production instance, consider **MongoDB Atlas** instead of the in-box Mongo (set
`MONGO_URL` to the Atlas connection string and drop the `mongo` service) for managed backups +
point-in-time restore.

## Notes
- Payments are **simulated** in demo (`EMERGENT_SIM_AUTOPAY=true`). For real charges, set the
  Stripe/Razorpay keys in `.env.prod` and register webhooks at `https://emergentcrm.com/api/webhook/{stripe,razorpay}`.
- The backend runs a single uvicorn worker (fine for a demo/small team). For higher concurrency,
  raise workers in `backend/Dockerfile`.
- `.env.prod` holds secrets — it is gitignored; never commit it.
