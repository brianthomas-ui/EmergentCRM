"""End-to-end backend tests for Emergent Upsell CRM (iteration 2).

Covers: auth (new team), team listing, leads CRUD, assign + RR, notes, CSV import,
meetings with booking_driver + driver filter, FX settings (admin edit, agent read-only),
multi-currency payments (USD preset + INR custom), Stripe link, Razorpay simulate,
dashboard booking_drivers widget, campaigns, audit log.
"""
import os
import io
import pytest
import requests
from datetime import datetime, timezone, timedelta

# Resolve backend URL from frontend env
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"')
                break
BASE_URL = BASE_URL.rstrip('/')
API = f"{BASE_URL}/api"

ADMIN = {"email": "diyea@emergent.com", "password": "leader123"}
AGENT = {"email": "aryan@emergent.com", "password": "agent123"}


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "admin"
    assert data["user"]["name"].lower() == "diyea"
    return data["token"]


@pytest.fixture(scope="session")
def agent_token():
    r = requests.post(f"{API}/auth/login", json=AGENT, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "agent"
    return data["token"]


# -------- Auth --------
def test_login_bad_password():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"})
    assert r.status_code == 401


def test_auth_me_admin(admin_token):
    r = requests.get(f"{API}/auth/me", headers=H(admin_token))
    assert r.status_code == 200 and r.json()["role"] == "admin"


def test_auth_me_agent(agent_token):
    r = requests.get(f"{API}/auth/me", headers=H(agent_token))
    assert r.status_code == 200 and r.json()["role"] == "agent"


def test_unauth_protected():
    assert requests.get(f"{API}/leads").status_code == 401


# -------- Team --------
def test_team_has_new_members(admin_token):
    r = requests.get(f"{API}/team", headers=H(admin_token))
    assert r.status_code == 200
    members = r.json()
    emails = {m["email"] for m in members}
    for e in ["diyea@emergent.com", "aryan@emergent.com", "deepin@emergent.com",
              "vinay@emergent.com", "brian@emergent.com"]:
        assert e in emails, f"missing {e}"
    diyea = next(m for m in members if m["email"] == "diyea@emergent.com")
    assert diyea["role"] == "admin"
    assert all("password_hash" not in m and "_id" not in m for m in members)


def test_all_agent_logins():
    for email in ["aryan@emergent.com", "deepin@emergent.com", "vinay@emergent.com", "brian@emergent.com"]:
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "agent123"})
        assert r.status_code == 200, f"{email} login failed: {r.text}"


# -------- Meta (booking drivers) --------
def test_meta_includes_booking_drivers(admin_token):
    r = requests.get(f"{API}/meta", headers=H(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert "booking_drivers" in data
    for d in ["Support", "Lifetime Access", "Top-Up Credits", "Discount"]:
        assert d in data["booking_drivers"]


# -------- Leads --------
@pytest.fixture
def created_lead(admin_token):
    payload = {
        "name": "TEST Lead", "email": f"TEST_lead_{datetime.utcnow().timestamp()}@example.com",
        "company": "TEST Co", "monthly_spend": 100, "lifetime_value": 500, "priority": "Hot",
    }
    r = requests.post(f"{API}/leads", json=payload, headers=H(admin_token))
    assert r.status_code == 200, r.text
    return r.json()


def test_create_and_get_lead(admin_token, created_lead):
    r = requests.get(f"{API}/leads/{created_lead['id']}", headers=H(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert data["lead"]["id"] == created_lead["id"]


def test_duplicate_lead_email(admin_token, created_lead):
    r = requests.post(f"{API}/leads", json={
        "name": "Dup", "email": created_lead["email"], "monthly_spend": 0, "lifetime_value": 0,
    }, headers=H(admin_token))
    assert r.status_code == 400


def test_agent_only_sees_own_leads(agent_token):
    r = requests.get(f"{API}/leads", headers=H(agent_token))
    assert r.status_code == 200
    me = requests.get(f"{API}/auth/me", headers=H(agent_token)).json()
    for l in r.json():
        assert l.get("owner_id") == me["id"]


def test_assign_and_round_robin(admin_token, agent_token, created_lead):
    lid = created_lead["id"]
    r = requests.put(f"{API}/leads/{lid}/assign", json={"agent_id": "x"}, headers=H(agent_token))
    assert r.status_code == 403
    team = requests.get(f"{API}/team", headers=H(admin_token)).json()
    agent = next(m for m in team if m["role"] == "agent")
    r = requests.put(f"{API}/leads/{lid}/assign", json={"agent_id": agent["id"]}, headers=H(admin_token))
    assert r.status_code == 200 and r.json()["owner_id"] == agent["id"]
    r = requests.post(f"{API}/leads/{lid}/round-robin", headers=H(admin_token))
    assert r.status_code == 200 and r.json()["owner_id"] is not None


def test_update_stage_and_notes(admin_token, created_lead):
    lid = created_lead["id"]
    r = requests.put(f"{API}/leads/{lid}/stage", json={"stage": "Meeting Scheduled"}, headers=H(admin_token))
    assert r.status_code == 200 and r.json()["stage"] == "Meeting Scheduled"
    r = requests.put(f"{API}/leads/{lid}/stage", json={"stage": "Bogus"}, headers=H(admin_token))
    assert r.status_code == 400
    r = requests.post(f"{API}/leads/{lid}/notes", json={"text": "TEST note", "type": "Note"}, headers=H(admin_token))
    assert r.status_code == 200


def test_csv_import(admin_token):
    csv_text = f"name,email,company,monthly_spend,lifetime_value\nTEST Importee,test_csv_{datetime.utcnow().timestamp()}@example.com,TestCo,150,800\n"
    files = {"file": ("leads.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = requests.post(f"{API}/leads/import", files=files, headers=H(admin_token))
    assert r.status_code == 200


# -------- Meetings (booking driver) --------
def test_meeting_with_booking_driver(admin_token, created_lead):
    lid = created_lead["id"]
    team = requests.get(f"{API}/team", headers=H(admin_token)).json()
    agent = next(m for m in team if m["role"] == "agent")
    sched = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
    r = requests.post(f"{API}/meetings", json={
        "lead_id": lid, "scheduled_at": sched, "agent_id": agent["id"],
        "source": "Manual", "booking_driver": "Discount",
    }, headers=H(admin_token))
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["booking_driver"] == "Discount"
    mid = m["id"]
    # lead stage advanced
    lead = requests.get(f"{API}/leads/{lid}", headers=H(admin_token)).json()["lead"]
    assert lead["stage"] == "Meeting Scheduled"
    # driver filter returns this meeting
    r = requests.get(f"{API}/meetings?driver=Discount", headers=H(admin_token))
    assert r.status_code == 200
    assert any(x["id"] == mid for x in r.json())
    # outcome completed
    r = requests.put(f"{API}/meetings/{mid}/outcome", json={"status": "completed", "outcome_notes": "ok"}, headers=H(admin_token))
    assert r.status_code == 200
    lead = requests.get(f"{API}/leads/{lid}", headers=H(admin_token)).json()["lead"]
    assert lead["stage"] == "Meeting Completed"


def test_meeting_no_show_followup(admin_token, created_lead):
    lid = created_lead["id"]
    team = requests.get(f"{API}/team", headers=H(admin_token)).json()
    agent = next(m for m in team if m["role"] == "agent")
    sched = (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat()
    r = requests.post(f"{API}/meetings", json={
        "lead_id": lid, "scheduled_at": sched, "agent_id": agent["id"],
        "source": "Manual", "booking_driver": "Support",
    }, headers=H(admin_token))
    mid = r.json()["id"]
    r = requests.put(f"{API}/meetings/{mid}/outcome", json={"status": "no_show", "no_show_reason": "didn't show"}, headers=H(admin_token))
    assert r.status_code == 200
    lead = requests.get(f"{API}/leads/{lid}", headers=H(admin_token)).json()["lead"]
    assert lead["stage"] == "Follow-up Later"


# -------- Settings (FX rate) --------
def test_settings_get_default_or_current(admin_token):
    r = requests.get(f"{API}/settings", headers=H(admin_token))
    assert r.status_code == 200
    assert "inr_per_usd" in r.json()
    assert r.json()["inr_per_usd"] > 0


def test_settings_admin_can_update(admin_token):
    # set to 80
    r = requests.put(f"{API}/settings", json={"inr_per_usd": 80.0}, headers=H(admin_token))
    assert r.status_code == 200 and r.json()["inr_per_usd"] == 80.0
    # verify via GET
    r = requests.get(f"{API}/settings", headers=H(admin_token))
    assert r.json()["inr_per_usd"] == 80.0
    # invalid (negative)
    r = requests.put(f"{API}/settings", json={"inr_per_usd": -1}, headers=H(admin_token))
    assert r.status_code == 400
    # restore default 85
    r = requests.put(f"{API}/settings", json={"inr_per_usd": 85.0}, headers=H(admin_token))
    assert r.status_code == 200


def test_settings_agent_cannot_update(agent_token):
    r = requests.get(f"{API}/settings", headers=H(agent_token))
    assert r.status_code == 200  # agent can read
    r = requests.put(f"{API}/settings", json={"inr_per_usd": 70.0}, headers=H(agent_token))
    assert r.status_code == 403


# -------- Payments (multi-currency) --------
def test_packages(admin_token):
    r = requests.get(f"{API}/payments/packages", headers=H(admin_token))
    assert r.status_code == 200 and "upsell_scale" in r.json()


def test_stripe_preset_usd(admin_token, created_lead):
    lid = created_lead["id"]
    r = requests.post(f"{API}/payments/link", json={
        "lead_id": lid, "provider": "stripe", "package_id": "upsell_scale",
        "origin_url": BASE_URL,
    }, headers=H(admin_token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["payment_link"] and data["session_id"]
    assert data["currency"] == "usd"
    assert data["amount"] == 2500.0
    assert data["amount_usd"] == 2500.0
    assert data["fx_rate"] > 0
    assert "stripe.com" in data["payment_link"]


def test_inr_payment_link_converts_to_usd(admin_token, created_lead):
    lid = created_lead["id"]
    # ensure rate is 85
    requests.put(f"{API}/settings", json={"inr_per_usd": 85.0}, headers=H(admin_token))
    r = requests.post(f"{API}/payments/link", json={
        "lead_id": lid, "provider": "razorpay", "amount": 8500.0, "currency": "inr",
        "description": "TEST INR upsell", "origin_url": BASE_URL,
    }, headers=H(admin_token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["currency"] == "inr"
    assert data["amount"] == 8500.0
    assert data["fx_rate"] == 85.0
    assert data["amount_usd"] == 100.0  # 8500/85
    assert data["session_id"].startswith("rzp_")


def test_razorpay_simulate_marks_paid_and_won(admin_token, created_lead):
    lid = created_lead["id"]
    # ensure fx=85
    requests.put(f"{API}/settings", json={"inr_per_usd": 85.0}, headers=H(admin_token))
    r = requests.post(f"{API}/payments/link", json={
        "lead_id": lid, "provider": "razorpay", "amount": 17000.0, "currency": "inr",
        "origin_url": BASE_URL,
    }, headers=H(admin_token))
    assert r.status_code == 200
    pay = r.json()
    assert pay["amount_usd"] == 200.0
    sid = pay["session_id"]
    r = requests.post(f"{API}/payments/simulate/{sid}", headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["payment_status"] == "paid"
    # lead -> Won
    lead = requests.get(f"{API}/leads/{lid}", headers=H(admin_token)).json()["lead"]
    assert lead["stage"] == "Won"


def test_payment_link_invalid_amount(admin_token, created_lead):
    r = requests.post(f"{API}/payments/link", json={
        "lead_id": created_lead["id"], "provider": "razorpay", "origin_url": BASE_URL,
    }, headers=H(admin_token))
    assert r.status_code == 400


# -------- Dashboard --------
def test_dashboard_admin_has_booking_drivers(admin_token):
    r = requests.get(f"{API}/dashboard", headers=H(admin_token))
    assert r.status_code == 200
    d = r.json()
    assert d["is_admin"] is True
    assert "booking_drivers" in d
    assert isinstance(d["booking_drivers"], list)
    # seed should have at least these drivers
    seen = {b["driver"] for b in d["booking_drivers"]}
    # tolerant: at least one of the seeded drivers should appear
    assert seen & {"Discount", "Lifetime Access", "Top-Up Credits", "Support"}, f"no expected driver in {seen}"
    for b in d["booking_drivers"]:
        assert "meetings" in b and "completed" in b and "won" in b
    # revenue is numeric (USD)
    assert isinstance(d["revenue_won"], (int, float))
    assert "per_agent" in d


def test_dashboard_agent_scoped(agent_token):
    r = requests.get(f"{API}/dashboard", headers=H(agent_token))
    assert r.status_code == 200
    d = r.json()
    assert d["is_admin"] is False
    assert "per_agent" not in d
    assert "booking_drivers" in d


def test_dashboard_revenue_usd_after_inr_payment(admin_token):
    # baseline
    base = requests.get(f"{API}/dashboard", headers=H(admin_token)).json()["revenue_won"]
    # create lead + INR razorpay payment, simulate paid
    payload = {
        "name": "TEST Rev", "email": f"TEST_rev_{datetime.utcnow().timestamp()}@example.com",
        "company": "TEST", "monthly_spend": 0, "lifetime_value": 0,
    }
    lead = requests.post(f"{API}/leads", json=payload, headers=H(admin_token)).json()
    requests.put(f"{API}/settings", json={"inr_per_usd": 85.0}, headers=H(admin_token))
    pay = requests.post(f"{API}/payments/link", json={
        "lead_id": lead["id"], "provider": "razorpay", "amount": 85000.0, "currency": "inr",
        "origin_url": BASE_URL,
    }, headers=H(admin_token)).json()
    assert pay["amount_usd"] == 1000.0
    requests.post(f"{API}/payments/simulate/{pay['session_id']}", headers=H(admin_token))
    after = requests.get(f"{API}/dashboard", headers=H(admin_token)).json()["revenue_won"]
    assert round(after - base, 2) == 1000.0, f"expected +1000 USD, got delta {after-base}"


# -------- Campaigns --------
def test_campaign_create_and_send(admin_token, agent_token):
    r = requests.get(f"{API}/campaigns", headers=H(agent_token))
    assert r.status_code == 403
    payload = {
        "name": f"TEST Campaign {datetime.utcnow().timestamp()}",
        "segment_label": "Power", "min_spend": 50,
        "template_subject": "Hi", "template_body": "Body",
    }
    r = requests.post(f"{API}/campaigns", json=payload, headers=H(admin_token))
    assert r.status_code == 200
    cid = r.json()["id"]
    r = requests.post(f"{API}/campaigns/{cid}/send", headers=H(admin_token))
    assert r.status_code == 200 and r.json()["status"] == "sent"


# -------- Audit logs --------
def test_audit_logs_include_fx_update(admin_token, agent_token):
    r = requests.get(f"{API}/audit-logs", headers=H(agent_token))
    assert r.status_code == 403
    r = requests.get(f"{API}/audit-logs", headers=H(admin_token))
    assert r.status_code == 200
    logs = r.json()
    actions = {l.get("action") for l in logs}
    # update_fx_rate should appear since we changed it above
    assert "update_fx_rate" in actions, f"actions: {actions}"
