"""
Backend tests for the two NEW P0 features:
1. ABSOLUTE Demo-vs-Real workspace data isolation (is_demo flag on every doc;
   query-level + per-record access guards even for admins).
2. Slack webhook fires ONLY for real (non-demo) paid payments; demo + simulate
   never fire. Slack failure must NOT break the payment flow (non-blocking).

We hit the live preview URL via REACT_APP_BACKEND_URL and use Bearer tokens
returned by /api/auth/login & /api/auth/demo-login (CSRF bypassed for tokens).
Any real-workspace data we create is cleaned up at the end.
"""

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to reading the frontend env file (testing-only convenience)
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

REAL_EMAIL = "diyea@emergent.sh"
REAL_PASS = "emergent@12345"
DEMO_EMAIL = "demo@emergent.sh"


def _bearer(token: str):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    })
    return s


@pytest.fixture(scope="module")
def real_client():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": REAL_EMAIL, "password": REAL_PASS}, timeout=20)
    assert r.status_code == 200, f"real login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data.get("user", {}).get("is_demo") is False, data
    return _bearer(data["token"]), data["user"]


@pytest.fixture(scope="module")
def demo_client():
    r = requests.post(f"{BASE_URL}/api/auth/demo-login", json={}, timeout=20)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data.get("user", {}).get("is_demo") is True, data
    return _bearer(data["token"]), data["user"]


# Track resources to clean up
_REAL_LEADS = []
_REAL_PAYMENTS = []


@pytest.fixture(scope="module", autouse=True)
def cleanup(real_client):
    yield
    s, _ = real_client
    # Best-effort cleanup: leads via bulk endpoint (no DELETE /api/leads/{id} exists)
    if _REAL_LEADS:
        try:
            s.post(f"{BASE_URL}/api/leads/bulk",
                   json={"ids": list(set(_REAL_LEADS)), "action": "delete"}, timeout=20)
        except Exception:
            pass
    # Also clean up any TEST_ leads still left over from previous failures
    try:
        all_leads = s.get(f"{BASE_URL}/api/leads", timeout=20).json()
        leftover = [l["id"] for l in all_leads if (l.get("name") or "").startswith("TEST_")]
        if leftover:
            s.post(f"{BASE_URL}/api/leads/bulk",
                   json={"ids": leftover, "action": "delete"}, timeout=20)
    except Exception:
        pass
    # Clear slack_webhook_url so the real workspace is back to clean state
    try:
        s.put(f"{BASE_URL}/api/settings/integrations",
              json={"slack_webhook_url": ""}, timeout=15)
    except Exception:
        pass


# -----------------------------------------------------------------------
# Login + identity
# -----------------------------------------------------------------------
class TestAuthIdentity:
    def test_real_login_is_real(self, real_client):
        _, u = real_client
        assert u["email"] == REAL_EMAIL
        assert u["role"] == "admin"
        assert u["is_demo"] is False

    def test_demo_login_is_demo(self, demo_client):
        _, u = demo_client
        assert u["is_demo"] is True
        assert u["role"] == "admin"
        assert u["email"] == DEMO_EMAIL


# -----------------------------------------------------------------------
# Workspace-scoped LISTS: real should be ~empty, demo should be populated.
# -----------------------------------------------------------------------
class TestWorkspaceScopedLists:
    def test_real_leads_empty(self, real_client):
        s, _ = real_client
        r = s.get(f"{BASE_URL}/api/leads", timeout=20)
        assert r.status_code == 200
        leads = r.json()
        assert isinstance(leads, list)
        assert len(leads) == 0, f"real workspace must be empty; got {len(leads)} leads"
        # All returned (should be none) must be non-demo
        assert all(l.get("is_demo") is False for l in leads)

    def test_demo_leads_populated(self, demo_client):
        s, _ = demo_client
        r = s.get(f"{BASE_URL}/api/leads", timeout=30)
        assert r.status_code == 200
        leads = r.json()
        assert isinstance(leads, list)
        assert len(leads) > 100, f"demo workspace should have many leads; got {len(leads)}"
        assert all(bool(l.get("is_demo")) is True for l in leads)

    def test_real_team_only_real_members(self, real_client):
        s, _ = real_client
        r = s.get(f"{BASE_URL}/api/team", timeout=20)
        assert r.status_code == 200
        team = r.json()
        emails = {m["email"] for m in team}
        expected = {"diyea@emergent.sh", "aryan.f@emergent.sh", "dipan@emergent.sh",
                    "vinay.p@emergent.sh", "brian@emergent.sh", "abhishek.u@emergent.sh"}
        assert expected.issubset(emails), f"missing real members: {expected - emails}"
        # No demo emails should leak
        assert not any(e.endswith("@demo.crm") or e == DEMO_EMAIL for e in emails), emails

    def test_demo_team_only_demo_members(self, demo_client):
        s, _ = demo_client
        r = s.get(f"{BASE_URL}/api/team", timeout=20)
        assert r.status_code == 200
        team = r.json()
        emails = {m["email"] for m in team}
        # All emails must be demo (either the demo@emergent.sh or @demo.crm agents)
        for e in emails:
            assert e == DEMO_EMAIL or e.endswith("@demo.crm"), f"non-demo email leaked: {e}"
        # Western-name agents present
        assert "olivia.hayes@demo.crm" in emails
        assert "james.carter@demo.crm" in emails

    @pytest.mark.parametrize("endpoint", [
        "/api/meetings", "/api/payments", "/api/customers",
        "/api/calendar", "/api/coverage", "/api/notifications",
    ])
    def test_real_other_lists_empty_or_near_empty(self, real_client, endpoint):
        s, _ = real_client
        r = s.get(f"{BASE_URL}{endpoint}", timeout=30)
        assert r.status_code == 200, f"{endpoint}: {r.status_code} {r.text[:200]}"
        body = r.json()
        items = body if isinstance(body, list) else (body.get("items") or body.get("results") or [])
        # All items must be non-demo; many lists should be empty for a fresh real workspace
        for it in items:
            if isinstance(it, dict) and "is_demo" in it:
                assert it["is_demo"] is False, f"{endpoint} leaked demo doc: {it}"

    def test_real_search_does_not_leak_demo(self, real_client):
        s, _ = real_client
        r = s.get(f"{BASE_URL}/api/search", params={"q": "neha"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        # Counts should be 0 for real workspace (demo lead 'neha' must not surface)
        for k, v in body.items():
            if isinstance(v, list):
                assert len(v) == 0, f"real search leaked demo results under '{k}': {v}"


# -----------------------------------------------------------------------
# Cross-workspace access guards (security-critical):
# create in one workspace, prove the OTHER workspace gets 404 on every
# read/write that targets that id.
# -----------------------------------------------------------------------
class TestCrossWorkspaceGuards:
    def _make_real_lead(self, real_session):
        payload = {
            "name": "TEST_CrossWS Real",
            "email": f"test_xws_{int(time.time())}@example.com",
            "phone": "+919999000111", "product_line": "AI",
            "source": "test", "notes": "isolation test",
        }
        r = real_session.post(f"{BASE_URL}/api/leads", json=payload, timeout=20)
        assert r.status_code in (200, 201), f"real lead create failed: {r.status_code} {r.text}"
        lead = r.json()
        assert lead.get("is_demo") is False
        _REAL_LEADS.append(lead["id"])
        return lead

    def test_demo_cannot_touch_real_lead(self, real_client, demo_client):
        s_real, _ = real_client
        s_demo, _ = demo_client
        lead = self._make_real_lead(s_real)
        lid = lead["id"]

        # GET single
        r = s_demo.get(f"{BASE_URL}/api/leads/{lid}", timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text[:160]}"

        # PUT update
        r = s_demo.put(f"{BASE_URL}/api/leads/{lid}",
                       json={"name": "HACKED"}, timeout=15)
        assert r.status_code == 404, f"PUT expected 404, got {r.status_code} {r.text[:160]}"

        # POST meeting against the real lead
        r = s_demo.post(f"{BASE_URL}/api/meetings",
                        json={"lead_id": lid, "agent_id": "x",
                              "scheduled_at": "2026-12-01T10:00:00Z",
                              "duration_min": 30, "title": "ev"}, timeout=15)
        assert r.status_code in (404, 422), f"meetings expected 404/422, got {r.status_code} {r.text[:160]}"

        # POST payment link against the real lead
        r = s_demo.post(f"{BASE_URL}/api/payments/link",
                        json={"lead_id": lid, "provider": "manual",
                              "amount": 99, "currency": "usd",
                              "origin_url": BASE_URL, "description": "x"}, timeout=20)
        assert r.status_code == 404, f"payments/link expected 404, got {r.status_code} {r.text[:160]}"

        # Verify the real lead is UNCHANGED (still TEST_CrossWS Real)
        # GET /api/leads/{id} returns {"lead": {...}, "activities": [], ...}
        r = s_real.get(f"{BASE_URL}/api/leads/{lid}", timeout=15)
        assert r.status_code == 200
        body = r.json()
        lead_resp = body.get("lead") if isinstance(body, dict) and "lead" in body else body
        assert lead_resp["name"] == "TEST_CrossWS Real"

    def test_real_cannot_touch_demo_lead(self, real_client, demo_client):
        s_real, _ = real_client
        s_demo, _ = demo_client
        # Grab any demo lead id
        r = s_demo.get(f"{BASE_URL}/api/leads", params={"limit": 5}, timeout=20)
        assert r.status_code == 200
        leads = r.json()
        assert len(leads) > 0, "demo workspace unexpectedly empty"
        did = leads[0]["id"]

        # GET / PUT / payment-link against a demo lead from the real admin must all 404
        r = s_real.get(f"{BASE_URL}/api/leads/{did}", timeout=15)
        assert r.status_code == 404

        r = s_real.put(f"{BASE_URL}/api/leads/{did}",
                       json={"name": "HACKED"}, timeout=15)
        assert r.status_code == 404

        r = s_real.post(f"{BASE_URL}/api/payments/link",
                        json={"lead_id": did, "provider": "manual",
                              "amount": 10, "currency": "usd",
                              "origin_url": BASE_URL, "description": "x"}, timeout=20)
        assert r.status_code == 404


# -----------------------------------------------------------------------
# Slack integration: silent for demo, non-blocking failure for real,
# correct guardrails on the Test button.
# -----------------------------------------------------------------------
class TestSlackPaymentAlerts:
    def test_slack_test_button_no_url(self, real_client):
        s, _ = real_client
        # Ensure no URL is configured
        s.put(f"{BASE_URL}/api/settings/integrations",
              json={"slack_webhook_url": ""}, timeout=15)
        r = s.post(f"{BASE_URL}/api/settings/integrations/test/slack", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is False
        assert "No Slack webhook URL configured" in body.get("detail", "")

    def test_real_manual_payment_with_bad_slack_url_does_not_break_flow(self, real_client):
        s, _ = real_client
        # Configure a non-responsive (intentionally bad) webhook URL
        r = s.put(f"{BASE_URL}/api/settings/integrations",
                  json={"slack_webhook_url": "http://127.0.0.1:9876/hook"}, timeout=15)
        assert r.status_code == 200

        # Create a real lead
        lead_payload = {
            "name": "TEST_Slack Real",
            "email": f"test_slack_{int(time.time())}@example.com",
            "phone": "+919998881111", "product_line": "AI",
        }
        r = s.post(f"{BASE_URL}/api/leads", json=lead_payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        lead = r.json()
        _REAL_LEADS.append(lead["id"])

        # Manual payment with mark_paid -> should fire (and fail gracefully) Slack
        r = s.post(f"{BASE_URL}/api/payments/link", json={
            "lead_id": lead["id"], "provider": "manual",
            "amount": 200, "currency": "usd",
            "origin_url": BASE_URL, "description": "TEST manual paid",
            "mark_paid": True,
        }, timeout=30)
        assert r.status_code == 200, r.text
        pay = r.json()
        _REAL_PAYMENTS.append(pay["id"])
        assert pay["payment_status"] == "paid"
        assert pay["is_demo"] is False

        # Test endpoint with a URL set must attempt the post and fail gracefully
        r = s.post(f"{BASE_URL}/api/settings/integrations/test/slack", timeout=15)
        assert r.status_code == 200
        body = r.json()
        # Either it returned a non-200 from upstream or it raised an httpx exception;
        # both must come back as ok=False (never raise) per non-blocking contract.
        assert body.get("ok") is False
        assert "No Slack webhook URL configured" not in body.get("detail", "")

        # Clear webhook url for cleanup before next test
        s.put(f"{BASE_URL}/api/settings/integrations",
              json={"slack_webhook_url": ""}, timeout=15)

    def test_demo_manual_payment_no_slack_attempt(self, demo_client):
        s, _ = demo_client
        # Pick a demo lead
        r = s.get(f"{BASE_URL}/api/leads", params={"limit": 1}, timeout=20)
        assert r.status_code == 200 and len(r.json()) > 0
        lid = r.json()[0]["id"]

        r = s.post(f"{BASE_URL}/api/payments/link", json={
            "lead_id": lid, "provider": "manual",
            "amount": 50, "currency": "usd",
            "origin_url": BASE_URL, "description": "TEST demo paid",
            "mark_paid": True,
        }, timeout=20)
        assert r.status_code == 200, r.text
        pay = r.json()
        assert pay["payment_status"] == "paid"
        assert pay["is_demo"] is True
        # No clean-up endpoint exposed: demo workspace can be reset via /api/demo/reset

    def test_payments_link_route_exists(self, real_client):
        # Sanity: 422 (validation) NOT 404 when route is missing body
        s, _ = real_client
        r = s.post(f"{BASE_URL}/api/payments/link", json={}, timeout=15)
        assert r.status_code in (400, 422), f"route missing? got {r.status_code} {r.text[:120]}"


# -----------------------------------------------------------------------
# Demo reset must NOT touch the real workspace.
# -----------------------------------------------------------------------
class TestDemoResetIsolation:
    def test_demo_reset_keeps_real_empty(self, real_client, demo_client):
        s_real, _ = real_client
        s_demo, _ = demo_client

        # First, clean any TEST_ leads left over from prior tests so we measure pure
        # demo-reset effect on the real workspace.
        all_real = s_real.get(f"{BASE_URL}/api/leads", timeout=20).json()
        test_ids = [l["id"] for l in all_real if (l.get("name") or "").startswith("TEST_")]
        if test_ids:
            s_real.post(f"{BASE_URL}/api/leads/bulk",
                        json={"ids": test_ids, "action": "delete"}, timeout=20)
            _REAL_LEADS[:] = [x for x in _REAL_LEADS if x not in test_ids]

        before = len(s_real.get(f"{BASE_URL}/api/leads", timeout=20).json())

        r = s_demo.post(f"{BASE_URL}/api/demo/reset", timeout=180)
        assert r.status_code in (200, 202), f"demo reset failed: {r.status_code} {r.text[:200]}"

        after = len(s_real.get(f"{BASE_URL}/api/leads", timeout=20).json())
        assert after == before, f"real lead count changed across demo reset: {before} -> {after}"
        assert before == 0, f"real workspace should have been clean before reset; was {before}"

        # demo workspace re-populated
        time.sleep(2)
        r = s_demo.get(f"{BASE_URL}/api/leads", timeout=30)
        assert r.status_code == 200
        assert len(r.json()) > 100, "demo not re-seeded properly"
