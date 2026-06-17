"""End-to-end backend tests for Emergent Upsell CRM."""
import os
import io
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE_URL:
    # Read from frontend env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().strip('"').rstrip('/')
                break

API = f"{BASE_URL}/api"

ADMIN = {"email": "leader@emergent.com", "password": "leader123"}
AGENT = {"email": "sofia@emergent.com", "password": "agent123"}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def agent_token():
    r = requests.post(f"{API}/auth/login", json=AGENT, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---------------- Auth ----------------
def test_login_bad_password():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"})
    assert r.status_code == 401


def test_auth_me_admin(admin_token):
    r = requests.get(f"{API}/auth/me", headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_auth_me_agent(agent_token):
    r = requests.get(f"{API}/auth/me", headers=H(agent_token))
    assert r.status_code == 200
    assert r.json()["role"] == "agent"


def test_unauth_protected():
    assert requests.get(f"{API}/leads").status_code == 401


# ---------------- Team ----------------
def test_team_list(admin_token):
    r = requests.get(f"{API}/team", headers=H(admin_token))
    assert r.status_code == 200
    members = r.json()
    assert any(m["email"] == "sofia@emergent.com" for m in members)
    assert all("password_hash" not in m and "_id" not in m for m in members)


def test_create_agent_admin_only(admin_token, agent_token):
    # agent forbidden
    new_agent = {"name": "TEST Agent", "email": f"TEST_agent_{datetime.utcnow().timestamp()}@emergent.com", "password": "pass123"}
    r = requests.post(f"{API}/team", json=new_agent, headers=H(agent_token))
    assert r.status_code == 403
    # admin ok
    r = requests.post(f"{API}/team", json=new_agent, headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["role"] == "agent"


# ---------------- Leads ----------------
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
    lid = created_lead["id"]
    r = requests.get(f"{API}/leads/{lid}", headers=H(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert data["lead"]["id"] == lid
    assert "activities" in data and "meetings" in data and "payments" in data


def test_duplicate_lead_email(admin_token, created_lead):
    r = requests.post(f"{API}/leads", json={
        "name": "Dup", "email": created_lead["email"], "monthly_spend": 0, "lifetime_value": 0,
    }, headers=H(admin_token))
    assert r.status_code == 400


def test_list_leads_search_filter(admin_token):
    r = requests.get(f"{API}/leads?search=acme", headers=H(admin_token))
    assert r.status_code == 200
    leads = r.json()
    assert all("acme" in (l.get("company", "") + l.get("email", "") + l.get("name", "")).lower() for l in leads)


def test_agent_only_sees_own_leads(agent_token):
    r = requests.get(f"{API}/leads", headers=H(agent_token))
    assert r.status_code == 200
    me = requests.get(f"{API}/auth/me", headers=H(agent_token)).json()
    for l in r.json():
        assert l.get("owner_id") == me["id"]


def test_assign_lead_and_round_robin(admin_token, agent_token, created_lead):
    lid = created_lead["id"]
    # agent forbidden
    r = requests.put(f"{API}/leads/{lid}/assign", json={"agent_id": "x"}, headers=H(agent_token))
    assert r.status_code == 403
    # find an agent
    team = requests.get(f"{API}/team", headers=H(admin_token)).json()
    agent = next(m for m in team if m["role"] == "agent")
    r = requests.put(f"{API}/leads/{lid}/assign", json={"agent_id": agent["id"]}, headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["owner_id"] == agent["id"]
    # round robin
    r = requests.post(f"{API}/leads/{lid}/round-robin", headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["owner_id"] is not None


def test_update_stage_and_notes(admin_token, created_lead):
    lid = created_lead["id"]
    r = requests.put(f"{API}/leads/{lid}/stage", json={"stage": "Meeting Scheduled"}, headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["stage"] == "Meeting Scheduled"
    # invalid stage
    r = requests.put(f"{API}/leads/{lid}/stage", json={"stage": "Bogus"}, headers=H(admin_token))
    assert r.status_code == 400
    # add note
    r = requests.post(f"{API}/leads/{lid}/notes", json={"text": "TEST note", "type": "Note"}, headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["text"] == "TEST note"
    # verify persisted via GET
    r = requests.get(f"{API}/leads/{lid}", headers=H(admin_token))
    assert any(n["text"] == "TEST note" for n in r.json()["lead"]["notes"])


def test_csv_import(admin_token):
    csv_text = "name,email,company,monthly_spend,lifetime_value\nTEST Importee,test_csv_unique@example.com,TestCo,150,800\n"
    files = {"file": ("leads.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = requests.post(f"{API}/leads/import", files=files, headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["created"] >= 0


# ---------------- Meetings ----------------
def test_meeting_create_and_outcome(admin_token, created_lead):
    lid = created_lead["id"]
    team = requests.get(f"{API}/team", headers=H(admin_token)).json()
    agent = next(m for m in team if m["role"] == "agent")
    sched = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    r = requests.post(f"{API}/meetings", json={
        "lead_id": lid, "scheduled_at": sched, "agent_id": agent["id"], "source": "Manual",
    }, headers=H(admin_token))
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    # lead should be Meeting Scheduled
    lead = requests.get(f"{API}/leads/{lid}", headers=H(admin_token)).json()["lead"]
    assert lead["stage"] == "Meeting Scheduled"
    # outcome completed -> Meeting Completed
    r = requests.put(f"{API}/meetings/{mid}/outcome", json={"status": "completed", "outcome_notes": "good"}, headers=H(admin_token))
    assert r.status_code == 200
    lead = requests.get(f"{API}/leads/{lid}", headers=H(admin_token)).json()["lead"]
    assert lead["stage"] == "Meeting Completed"


def test_meetings_list(admin_token):
    r = requests.get(f"{API}/meetings", headers=H(admin_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------- Payments ----------------
def test_packages(admin_token):
    r = requests.get(f"{API}/payments/packages", headers=H(admin_token))
    assert r.status_code == 200
    assert "upsell_pro" in r.json()


def test_stripe_payment_link(admin_token, created_lead):
    lid = created_lead["id"]
    r = requests.post(f"{API}/payments/link", json={
        "lead_id": lid, "provider": "stripe", "package_id": "upsell_pro",
        "origin_url": BASE_URL,
    }, headers=H(admin_token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["payment_link"] and data["session_id"]
    assert "checkout.stripe.com" in data["payment_link"] or data["payment_link"].startswith("https://")
    # lead stage updated
    lead = requests.get(f"{API}/leads/{lid}", headers=H(admin_token)).json()["lead"]
    assert lead["stage"] == "Payment Link Sent"


def test_razorpay_simulate(admin_token, created_lead):
    lid = created_lead["id"]
    r = requests.post(f"{API}/payments/link", json={
        "lead_id": lid, "provider": "razorpay", "amount": 500.0,
        "origin_url": BASE_URL,
    }, headers=H(admin_token))
    assert r.status_code == 200
    sid = r.json()["session_id"]
    r = requests.post(f"{API}/payments/simulate/{sid}", headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["payment_status"] == "paid"
    # lead -> Won
    lead = requests.get(f"{API}/leads/{lid}", headers=H(admin_token)).json()["lead"]
    assert lead["stage"] == "Won"


# ---------------- Campaigns ----------------
def test_campaign_create_and_send(admin_token, agent_token):
    # agent forbidden
    r = requests.get(f"{API}/campaigns", headers=H(agent_token))
    assert r.status_code == 403
    payload = {
        "name": f"TEST Campaign {datetime.utcnow().timestamp()}",
        "segment_label": "Power Users", "min_spend": 50,
        "template_subject": "Hi", "template_body": "Body",
    }
    r = requests.post(f"{API}/campaigns", json=payload, headers=H(admin_token))
    assert r.status_code == 200
    cid = r.json()["id"]
    r = requests.post(f"{API}/campaigns/{cid}/send", headers=H(admin_token))
    assert r.status_code == 200
    sent = r.json()
    assert sent["status"] == "sent" and sent["sent_count"] > 0


# ---------------- Dashboard + Audit ----------------
def test_dashboard_admin(admin_token):
    r = requests.get(f"{API}/dashboard", headers=H(admin_token))
    assert r.status_code == 200
    d = r.json()
    assert d["is_admin"] is True
    assert "per_agent" in d and "stage_counts" in d


def test_dashboard_agent(agent_token):
    r = requests.get(f"{API}/dashboard", headers=H(agent_token))
    assert r.status_code == 200
    d = r.json()
    assert d["is_admin"] is False
    assert "per_agent" not in d


def test_audit_logs(admin_token, agent_token):
    r = requests.get(f"{API}/audit-logs", headers=H(agent_token))
    assert r.status_code == 403
    r = requests.get(f"{API}/audit-logs", headers=H(admin_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
