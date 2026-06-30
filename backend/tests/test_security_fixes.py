"""Security tests for SEC-001 (webhook signature verification fail-closed),
SEC-003 (server-side credit derivation), avatar hardening, and cross-workspace
IDOR sanity on /api/payments/id/{id}. SEC-002 is intentionally NOT tested."""
import os
import json
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"')
                break
BASE_URL = BASE_URL.rstrip('/')
API = f"{BASE_URL}/api"

DEMO = {"email": "demo@emergent.sh", "password": "demo12345"}
ADMIN = {"email": "diyea@emergent.sh", "password": "emergent@12345"}

# Tiny 1x1 transparent PNG (43 bytes base64).
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
SVG_B64 = "PHN2Zz48L3N2Zz4="  # <svg></svg>
HTML_B64 = "PGgxPmhpPC9oMT4="


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def demo_token():
    r = requests.post(f"{API}/auth/demo-login", timeout=30)
    if r.status_code != 200:
        r = requests.post(f"{API}/auth/login", json=DEMO, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ============================================================================
# SEC-001: Webhooks must FAIL CLOSED (no secret configured -> 400)
# ============================================================================
class TestSec001WebhookFailClosed:
    def test_stripe_webhook_no_signature_rejected(self):
        forged = {"type": "checkout.session.completed",
                  "data": {"object": {"id": "cs_test_forged_no_sig", "payment_status": "paid"}}}
        r = requests.post(f"{API}/webhook/stripe", json=forged, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_stripe_webhook_invalid_signature_rejected(self):
        forged = {"type": "checkout.session.completed",
                  "data": {"object": {"id": "cs_test_forged_bad_sig", "payment_status": "paid"}}}
        r = requests.post(f"{API}/webhook/stripe", json=forged,
                          headers={"Stripe-Signature": "t=1,v1=deadbeef"}, timeout=15)
        assert r.status_code == 400

    def test_razorpay_webhook_no_signature_rejected(self):
        forged = {"event": "payment_link.paid",
                  "payload": {"payment_link": {"entity": {"id": "plink_forged"}}}}
        r = requests.post(f"{API}/webhook/razorpay", json=forged, timeout=15)
        assert r.status_code == 400

    def test_razorpay_webhook_invalid_signature_rejected(self):
        forged = {"event": "payment_link.paid",
                  "payload": {"payment_link": {"entity": {"id": "plink_forged"}}}}
        r = requests.post(f"{API}/webhook/razorpay", json=forged,
                          headers={"X-Razorpay-Signature": "0" * 64}, timeout=15)
        # Per server: missing secret returns 400 before signature check; with secret it would be 401.
        assert r.status_code in (400, 401)


# ============================================================================
# SEC-001 proof-of-non-effect: forged webhook does NOT flip an existing payment paid.
# ============================================================================
class TestSec001NoEffect:
    def test_forged_stripe_webhook_does_not_flip_payment_to_paid(self, demo_token):
        # 1) Create a real demo payment link (custom amount, stripe provider).
        body = {"provider": "stripe", "amount": 50.0, "currency": "usd",
                "description": "TEST sec001 noeffect",
                "origin_url": BASE_URL}
        r = requests.post(f"{API}/payments/link", json=body, headers=H(demo_token), timeout=30)
        assert r.status_code == 200, r.text
        sid = r.json()["session_id"]
        assert sid

        # 2) Fire a forged stripe webhook targeting that exact session id.
        forged = {"type": "checkout.session.completed",
                  "data": {"object": {"id": sid, "payment_status": "paid"}}}
        wr = requests.post(f"{API}/webhook/stripe", json=forged, timeout=15)
        assert wr.status_code == 400  # rejected

        # 3) Confirm payment is still NOT paid.
        gs = requests.get(f"{API}/payments/status/{sid}", headers=H(demo_token), timeout=15)
        assert gs.status_code == 200, gs.text
        assert gs.json().get("payment_status") != "paid", \
            f"forged webhook flipped payment to paid: {gs.json()}"


# ============================================================================
# Demo flow regression check: authenticated simulate still marks paid.
# ============================================================================
class TestDemoSimulateNotRegressed:
    def test_demo_simulate_marks_paid(self, demo_token):
        body = {"provider": "stripe", "amount": 25.0, "currency": "usd",
                "description": "TEST simulate regression", "origin_url": BASE_URL}
        r = requests.post(f"{API}/payments/link", json=body, headers=H(demo_token), timeout=30)
        assert r.status_code == 200, r.text
        sid = r.json()["session_id"]

        sim = requests.post(f"{API}/payments/simulate/{sid}", headers=H(demo_token), timeout=30)
        assert sim.status_code == 200, sim.text
        assert sim.json().get("payment_status") == "paid"

        gs = requests.get(f"{API}/payments/status/{sid}", headers=H(demo_token), timeout=15)
        assert gs.status_code == 200 and gs.json().get("payment_status") == "paid"

    def test_demo_simulate_linked_lead_becomes_won(self, demo_token):
        # Use an existing demo lead (workspace has ~840 leads).
        ll = requests.get(f"{API}/leads?limit=5", headers=H(demo_token), timeout=15)
        assert ll.status_code == 200
        leads = ll.json()
        if not leads:
            pytest.skip("No demo leads available")
        lid = leads[0]["id"]
        body = {"lead_id": lid, "provider": "stripe", "amount": 30.0, "currency": "usd",
                "description": "TEST won regression", "origin_url": BASE_URL}
        r = requests.post(f"{API}/payments/link", json=body, headers=H(demo_token), timeout=30)
        assert r.status_code == 200, r.text
        sid = r.json()["session_id"]
        sim = requests.post(f"{API}/payments/simulate/{sid}", headers=H(demo_token), timeout=30)
        assert sim.status_code == 200
        assert sim.json().get("payment_status") == "paid"
        # Lead -> Won
        lead = requests.get(f"{API}/leads/{lid}", headers=H(demo_token), timeout=15).json()["lead"]
        assert lead["stage"] == "Won"


# ============================================================================
# SEC-003: server-side credit derivation; client credits/boost ignored.
# ============================================================================
class TestSec003ServerSideCredits:
    def test_forged_credits_ignored_multiplier_10(self, demo_token):
        body = {
            "provider": "stripe", "amount": 100, "currency": "usd",
            "multiplier": 10, "credits": 999999, "boost_credits": 50000,
            "origin_url": BASE_URL,
        }
        r = requests.post(f"{API}/payments/link", json=body, headers=H(demo_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # round(100 * 10) = 1000
        assert data.get("credits") == 1000, f"expected 1000 credits, got {data.get('credits')}: {data}"
        # boost should be None for credit top-up multiplier path
        assert data.get("boost_credits") in (None, 0), \
            f"forged boost_credits leaked: {data.get('boost_credits')}"

    def test_multiplier_clamped_to_max(self, demo_token):
        body = {
            "provider": "stripe", "amount": 100, "currency": "usd",
            "multiplier": 50,  # should clamp to <=15
            "credits": 999999, "boost_credits": 99999,
            "origin_url": BASE_URL,
        }
        r = requests.post(f"{API}/payments/link", json=body, headers=H(demo_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        credits = data.get("credits")
        # If clamped to max 15: 100*15=1500. Forged 999999 must be ignored.
        assert credits is not None and credits < 999999, f"forged credits not ignored: {credits}"
        assert credits <= 100 * 15, f"multiplier not clamped to <=15: credits={credits}"
        assert credits >= 100 * 1, f"clamp too aggressive: credits={credits}"


# ============================================================================
# Avatar hardening: SVG -> 400, PNG -> 200, non-image -> 400.
# ============================================================================
class TestAvatarHardening:
    def test_svg_rejected(self, demo_token):
        r = requests.post(f"{API}/profile/avatar",
                          json={"data_url": f"data:image/svg+xml;base64,{SVG_B64}"},
                          headers=H(demo_token), timeout=15)
        assert r.status_code == 400, f"SVG should be rejected, got {r.status_code}: {r.text}"

    def test_non_image_rejected(self, demo_token):
        r = requests.post(f"{API}/profile/avatar",
                          json={"data_url": f"data:text/html;base64,{HTML_B64}"},
                          headers=H(demo_token), timeout=15)
        assert r.status_code == 400

    def test_png_accepted(self, demo_token):
        data_url = f"data:image/png;base64,{TINY_PNG_B64}"
        r = requests.post(f"{API}/profile/avatar",
                          json={"data_url": data_url},
                          headers=H(demo_token), timeout=15)
        assert r.status_code == 200, f"PNG should be accepted, got {r.status_code}: {r.text}"
        # Verify avatar was set
        me = requests.get(f"{API}/auth/me", headers=H(demo_token), timeout=15).json()
        assert me.get("avatar_url", "").startswith("data:image/png;base64,"), \
            f"avatar not set: {me.get('avatar_url')!r:.80}"


# ============================================================================
# Cross-workspace IDOR sanity: /api/payments/id/{id} from OTHER workspace -> 404.
# ============================================================================
class TestCrossWorkspaceIsolation:
    def test_demo_payment_id_not_visible_to_real_admin(self, demo_token, admin_token):
        # Create a demo payment.
        body = {"provider": "stripe", "amount": 10.0, "currency": "usd",
                "description": "TEST idor demo", "origin_url": BASE_URL}
        r = requests.post(f"{API}/payments/link", json=body, headers=H(demo_token), timeout=30)
        assert r.status_code == 200, r.text
        demo_pid = r.json().get("id") or r.json().get("payment_id")
        # /payments/link may not return id; fall back to listing first payment for demo workspace
        if not demo_pid:
            lst = requests.get(f"{API}/payments", headers=H(demo_token), timeout=15).json()
            assert lst, "no demo payments to test isolation"
            demo_pid = lst[0]["id"]

        # Real admin tries to read demo payment by id -> must be 404.
        rr = requests.get(f"{API}/payments/id/{demo_pid}", headers=H(admin_token), timeout=15)
        assert rr.status_code == 404, \
            f"cross-workspace IDOR: real admin saw demo payment {demo_pid}: {rr.status_code} {rr.text}"

    def test_real_payment_id_not_visible_to_demo(self, demo_token, admin_token):
        # Try to create a real payment; real workspace starts empty but admin can create.
        body = {"provider": "stripe", "amount": 10.0, "currency": "usd",
                "description": "TEST idor real", "origin_url": BASE_URL}
        r = requests.post(f"{API}/payments/link", json=body, headers=H(admin_token), timeout=30)
        if r.status_code != 200:
            pytest.skip(f"could not create real payment for idor test: {r.text}")
        real_pid = r.json().get("id") or r.json().get("payment_id")
        if not real_pid:
            lst = requests.get(f"{API}/payments", headers=H(admin_token), timeout=15).json()
            if not lst:
                pytest.skip("no real payments to test")
            real_pid = lst[0]["id"]

        rr = requests.get(f"{API}/payments/id/{real_pid}", headers=H(demo_token), timeout=15)
        assert rr.status_code == 404, \
            f"cross-workspace IDOR: demo saw real payment {real_pid}: {rr.status_code}"
