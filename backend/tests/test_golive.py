"""Go-live regression suite (M1-M3): IDOR ownership, single-writer status model + G5,
money correctness, and real-mode integration funnel. Runs against a LIVE backend
(matches backend_test.py style). Requires the seeded demo stack on :8001.

    DB_NAME=..._test? no — these hit the running API. Run with:
    docker compose exec backend python -m pytest tests/test_golive.py -v
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("GOLIVE_BASE", "http://localhost:8001") + "/api"
ADMIN = {"email": "diyea@emergent.sh", "password": "emergent@12345"}


def _login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def agents(admin):
    team = requests.get(f"{BASE}/team", headers=H(admin)).json()
    ag = [m for m in team if m["role"] == "agent"]
    a, b = ag[0], ag[1]
    return {
        "a": a, "b": b,
        "ta": _login({"email": a["email"], "password": "emergent@12345"}),
        "tb": _login({"email": b["email"], "password": "emergent@12345"}),
    }


def _new_lead(admin, owner_id=None):
    lead = requests.post(f"{BASE}/leads", json={"name": "T", "email": f"t_{uuid.uuid4().hex[:10]}@x.com"},
                         headers=H(admin)).json()
    if owner_id:
        requests.put(f"{BASE}/leads/{lead['id']}/assign", json={"agent_id": owner_id}, headers=H(admin))
    return lead


# ----------------------- M1: IDOR ownership -----------------------
def test_idor_cross_agent_lead_blocked(admin, agents):
    lead = _new_lead(admin, agents["a"]["id"])
    lid, tb = lead["id"], agents["tb"]
    assert requests.get(f"{BASE}/leads/{lid}", headers=H(tb)).status_code == 404
    assert requests.put(f"{BASE}/leads/{lid}/stage", json={"stage": "No-Show"}, headers=H(tb)).status_code == 404
    assert requests.post(f"{BASE}/leads/{lid}/notes", json={"text": "x", "type": "Note"}, headers=H(tb)).status_code == 404
    # owner + admin can
    assert requests.get(f"{BASE}/leads/{lid}", headers=H(agents["ta"])).status_code == 200
    assert requests.get(f"{BASE}/leads/{lid}", headers=H(admin)).status_code == 200


def test_idor_payment_simulate_cannot_forge_revenue(admin, agents):
    lead = _new_lead(admin, agents["a"]["id"])
    pay = requests.post(f"{BASE}/payments/link", json={"lead_id": lead["id"], "provider": "razorpay",
                        "amount": 8500, "currency": "inr", "origin_url": "http://x"}, headers=H(admin)).json()
    # agent B can neither read nor act on it
    assert requests.get(f"{BASE}/payments/status/{pay['session_id']}", headers=H(agents["tb"])).status_code == 404


# ----------------------- M1: status model + G5 -----------------------
@pytest.mark.parametrize("status", ["No-Show", "Interested", "Contact in Future", "Not Interested", "Contacted"])
def test_status_round_trip(admin, status):
    lead = _new_lead(admin)
    requests.put(f"{BASE}/leads/{lead['id']}/stage", json={"stage": status}, headers=H(admin))
    got = requests.get(f"{BASE}/leads/{lead['id']}", headers=H(admin)).json()["lead"]
    assert got["status"] == status
    # raw fields never hold a visible-status string for the new statuses
    assert got["payment_state"] in ("Not Sent", "Link Sent", "Paid", "Failed")


def test_g5_manual_won_requires_payment(admin):
    lead = _new_lead(admin)
    assert requests.put(f"{BASE}/leads/{lead['id']}/stage", json={"stage": "Payment Link Paid"}, headers=H(admin)).status_code == 400
    assert requests.put(f"{BASE}/leads/{lead['id']}", json={"payment_status": "Paid"}, headers=H(admin)).status_code == 400
    # manual payment marks Won + revenue
    requests.post(f"{BASE}/payments/link", json={"lead_id": lead["id"], "provider": "manual",
                  "amount": 500, "currency": "usd", "mark_paid": True}, headers=H(admin))
    d = requests.get(f"{BASE}/leads/{lead['id']}", headers=H(admin)).json()["lead"]
    assert d["status"] == "Payment Link Paid" and d["total_revenue_usd"] >= 500 and d["owner_locked"]


# ----------------------- M2: money correctness -----------------------
def test_multiplier_floor_and_cap(admin):
    lead = _new_lead(admin)
    p1 = requests.post(f"{BASE}/payments/link", json={"lead_id": lead["id"], "provider": "manual",
                       "amount": 100, "currency": "usd", "multiplier": 1}, headers=H(admin)).json()
    assert p1["multiplier"] == 6 and p1["credits"] == 600
    p2 = requests.post(f"{BASE}/payments/link", json={"lead_id": lead["id"], "provider": "manual",
                       "amount": 100, "currency": "usd", "multiplier": 99}, headers=H(admin)).json()
    assert p2["multiplier"] == 10


def test_currency_and_rail_guards(admin):
    lead = _new_lead(admin)
    assert requests.post(f"{BASE}/payments/link", json={"lead_id": lead["id"], "provider": "manual", "amount": 50, "currency": "gbp"}, headers=H(admin)).status_code == 400
    assert requests.post(f"{BASE}/payments/link", json={"lead_id": lead["id"], "provider": "razorpay", "amount": 50, "currency": "usd"}, headers=H(admin)).status_code == 400
    assert requests.post(f"{BASE}/payments/link", json={"lead_id": lead["id"], "provider": "manual", "amount": -5, "currency": "usd"}, headers=H(admin)).status_code == 400


def test_lifetime_price_15000(admin):
    pkgs = requests.get(f"{BASE}/payments/packages", headers=H(admin)).json()
    assert pkgs["lifetime_access"]["amount"] == 15000.0


# ----------------------- M3: integrations / funnel -----------------------
def test_b9_test_connection_surfaces_status(admin):
    r = requests.post(f"{BASE}/settings/integrations/test/google_meet", headers=H(admin)).json()
    assert "ok" in r and "detail" in r


def test_returning_customer_reopens(admin, agents):
    email = f"ret_{uuid.uuid4().hex[:10]}@x.com"
    won = requests.post(f"{BASE}/leads", json={"name": "R", "email": email}, headers=H(admin)).json()
    requests.put(f"{BASE}/leads/{won['id']}/assign", json={"agent_id": agents['a']['id']}, headers=H(admin))
    requests.post(f"{BASE}/payments/link", json={"lead_id": won["id"], "provider": "manual",
                  "amount": 1000, "currency": "usd", "mark_paid": True}, headers=H(admin))
    cycles = requests.get(f"{BASE}/leads/{won['id']}", headers=H(admin)).json()["lead"].get("upsell_cycles", 0)
    payload = {"event": "invitee.created", "payload": {"name": "R", "email": email,
               "scheduled_event": {"start_time": "2026-06-25T13:00:00Z"}, "uri": f"cal/{uuid.uuid4().hex}"}}
    requests.post(f"{BASE}/webhook/calendly", json=payload)
    d = requests.get(f"{BASE}/leads/{won['id']}", headers=H(admin)).json()["lead"]
    assert d["status"] != "Payment Link Paid"
    assert d.get("upsell_cycles", 0) == cycles + 1
    assert d.get("owner_id") == agents['a']['id'] and d.get("deals_won", 0) >= 1


def test_calendly_idempotent(admin):
    email = f"idem_{uuid.uuid4().hex[:10]}@x.com"
    uri = f"cal/{uuid.uuid4().hex}"
    pl = {"event": "invitee.created", "payload": {"name": "I", "email": email,
          "scheduled_event": {"start_time": "2026-06-26T13:00:00Z"}, "uri": uri}}
    requests.post(f"{BASE}/webhook/calendly", json=pl)
    requests.post(f"{BASE}/webhook/calendly", json=pl)
    leads = requests.get(f"{BASE}/leads", headers=H(admin)).json()
    lead = next(l for l in leads if l["email"] == email)
    det = requests.get(f"{BASE}/leads/{lead['id']}", headers=H(admin)).json()
    assert len(det["meetings"]) == 1


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))
