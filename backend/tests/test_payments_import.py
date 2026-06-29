"""Backend regression tests for PAYMENT amount/credit resolution and the HISTORICAL
IMPORT flows (leads / payments / meetings) + the legacy CSV import.

These complement backend_test.py (which already covers basic payment links + a single
CSV import) by exercising:
  - the credit-top-up multiplier pricing + clamping (min 6x / max 15x),
  - INR -> credits conversion,
  - legacy fixed-credit preset behaviour,
  - custom-amount-overrides-preset (agent discount),
  - currency/amount/rail validation guards,
  - manual "mark paid" -> Won,
  - the preview-then-commit, dedupe, update-existing semantics of /import/historical,
  - email linking for payment/meeting imports + per-row error reporting,
  - downloadable templates + RBAC.

Run: cd /app/backend && python -m pytest tests/test_payments_import.py -v
"""
import os
import io
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE = "http://localhost:8001/api"
ADMIN = {"email": "diyea@emergent.sh", "password": "emergent@12345"}
AGENT = {"email": "aryan.f@emergent.sh", "password": "emergent@12345"}
ORIGIN = "http://localhost:3000"


def H(t):
    return {"Authorization": f"Bearer {t}"}


def _uniq(prefix):
    return f"{prefix}_{int(time.time() * 1000)}_{os.getpid()}@example.com"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def agent_token():
    r = requests.post(f"{BASE}/auth/login", json=AGENT, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _make_lead(admin_token, **over):
    payload = {
        "name": "TEST PI Lead", "email": _uniq("TEST_pi_lead"),
        "company": "TEST PI Co", "monthly_spend": 100, "lifetime_value": 500,
    }
    payload.update(over)
    r = requests.post(f"{BASE}/leads", json=payload, headers=H(admin_token), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _link(admin_token, lead_id, **body):
    payload = {"lead_id": lead_id, "origin_url": ORIGIN, **body}
    return requests.post(f"{BASE}/payments/link", json=payload, headers=H(admin_token), timeout=30)


# ===========================================================================
# Payment packages catalog
# ===========================================================================
def test_packages_catalog(admin_token):
    r = requests.get(f"{BASE}/payments/packages", headers=H(admin_token), timeout=30)
    assert r.status_code == 200
    pk = r.json()
    # credit ladder + the 3 fixed product lines + a couple legacy aliases
    for k in ("credits_100", "credits_500", "credits_5000", "annual_pro",
              "dedicated_support", "lifetime_access", "plan_pro_annual", "support_3m"):
        assert k in pk, f"missing package {k}"
    assert pk["credits_500"]["category"] == "Credits"
    assert pk["credits_500"]["product_line"] == "Credit Top-Up"
    assert pk["annual_pro"]["amount"] == 1999.0


# ===========================================================================
# Payment amount / credit resolution
# ===========================================================================
def test_preset_fixed_amount_usd(admin_token):
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="stripe", package_id="annual_pro")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["amount"] == 1999.0
    assert d["currency"] == "usd"
    assert d["amount_usd"] == 1999.0
    assert d["product_line"] == "Annual Pro Subscription"


def test_custom_amount_overrides_preset_discount(admin_token):
    lead = _make_lead(admin_token)
    # agent discounts the annual plan from 1999 -> 999
    r = _link(admin_token, lead["id"], provider="stripe", package_id="annual_pro", amount=999.0)
    assert r.status_code == 200, r.text
    assert r.json()["amount"] == 999.0


def test_credit_preset_legacy_fixed(admin_token):
    """credits_500 with NO multiplier/credits keeps its fixed amount + fixed credits."""
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="stripe", package_id="credits_500")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["amount"] == 100.0
    assert d["credits"] == 750
    assert d["product_line"] == "Credit Top-Up"


def test_credit_multiplier_explicit(admin_token):
    """Explicit in-range multiplier: credits = round(amount * multiplier)."""
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="stripe", amount=100.0, multiplier=8)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["amount"] == 100.0
    assert d["multiplier"] == 8.0
    assert d["credits"] == 800


def test_credit_multiplier_clamped_min(admin_token):
    """A multiplier below the 6x floor is clamped up to 6."""
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="stripe", amount=100.0, multiplier=2)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["multiplier"] == 6.0
    assert d["credits"] == 600


def test_credit_multiplier_clamped_max(admin_token):
    """A multiplier above the 15x cap is clamped down to 15."""
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="stripe", amount=100.0, multiplier=50)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["multiplier"] == 15.0
    assert d["credits"] == 1500


def test_credit_inr_converts_before_multiplier(admin_token):
    """INR top-up: amount converts via inr_per_credit (17) BEFORE the multiplier applies."""
    requests.put(f"{BASE}/settings", json={"inr_per_usd": 85.0}, headers=H(admin_token), timeout=30)
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="razorpay", currency="inr", amount=1700.0, multiplier=8)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["currency"] == "inr"
    assert d["amount"] == 1700.0
    assert d["amount_usd"] == 20.0          # 1700 / 85
    assert d["credits"] == 800              # (1700 / 17) * 8 = 100 * 8


def test_unsupported_currency_rejected(admin_token):
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="manual", amount=100.0, currency="eur")
    assert r.status_code == 400
    assert "currency" in r.json()["detail"].lower()


def test_amount_over_max_rejected(admin_token):
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="manual", amount=2_000_000.0, currency="usd")
    assert r.status_code == 400


def test_zero_amount_no_package_rejected(admin_token):
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="manual")  # no amount, no package
    assert r.status_code == 400


def test_rail_guard_razorpay_usd_rejected(admin_token):
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="razorpay", amount=100.0, currency="usd")
    assert r.status_code == 400
    assert "razorpay" in r.json()["detail"].lower()


def test_rail_guard_stripe_inr_rejected(admin_token):
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="stripe", amount=8500.0, currency="inr")
    assert r.status_code == 400
    assert "razorpay" in r.json()["detail"].lower()


def test_manual_mark_paid_marks_won(admin_token):
    lead = _make_lead(admin_token)
    r = _link(admin_token, lead["id"], provider="manual", amount=500.0, currency="usd", mark_paid=True)
    assert r.status_code == 200, r.text
    assert r.json()["payment_status"] == "paid"
    final = requests.get(f"{BASE}/leads/{lead['id']}", headers=H(admin_token), timeout=30).json()["lead"]
    assert final["stage"] == "Won"
    assert final["total_revenue_usd"] == 500.0
    assert final["deals_won"] == 1


def test_simulate_credit_payment_persists_credits_and_won(admin_token):
    requests.put(f"{BASE}/settings", json={"inr_per_usd": 85.0}, headers=H(admin_token), timeout=30)
    lead = _make_lead(admin_token)
    link = _link(admin_token, lead["id"], provider="razorpay", currency="inr", amount=1700.0, multiplier=8).json()
    sid = link["session_id"]
    assert sid.startswith("rzp_")
    r = requests.post(f"{BASE}/payments/simulate/{sid}", headers=H(admin_token), timeout=30)
    assert r.status_code == 200
    paid = r.json()
    assert paid["payment_status"] == "paid"
    assert paid["credits"] == 800
    final = requests.get(f"{BASE}/leads/{lead['id']}", headers=H(admin_token), timeout=30).json()["lead"]
    assert final["stage"] == "Won"


# ===========================================================================
# Historical import - templates + RBAC
# ===========================================================================
def test_import_template_leads(admin_token):
    r = requests.get(f"{BASE}/import/template/leads", headers=H(admin_token), timeout=30)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    body = r.text
    assert body.splitlines()[0].startswith("name,email,company")


def test_import_template_unknown_404(admin_token):
    r = requests.get(f"{BASE}/import/template/nope", headers=H(admin_token), timeout=30)
    assert r.status_code == 404


def test_import_template_agent_forbidden(agent_token):
    r = requests.get(f"{BASE}/import/template/leads", headers=H(agent_token), timeout=30)
    assert r.status_code == 403


def test_import_historical_unknown_type(admin_token):
    r = requests.post(f"{BASE}/import/historical",
                      json={"type": "widgets", "csv_text": "a,b\n1,2\n", "commit": False},
                      headers=H(admin_token), timeout=30)
    assert r.status_code == 400


def test_import_historical_agent_forbidden(agent_token):
    r = requests.post(f"{BASE}/import/historical",
                      json={"type": "leads", "csv_text": "name,email\nX,x@y.com\n", "commit": False},
                      headers=H(agent_token), timeout=30)
    assert r.status_code == 403


# ===========================================================================
# Historical import - leads: preview -> commit -> dedupe -> update
# ===========================================================================
def test_import_historical_leads_preview_then_commit_dedupe_update(admin_token):
    email = _uniq("TEST_hist_lead")
    csv_text = (
        "name,email,company,monthly_spend,lifetime_value,region,status,owner\n"
        f"Hist Person,{email},Hist Co,149,2400,APAC,Interested,Diyea\n"
    )

    # 1) PREVIEW (commit=false): reports it WOULD create, but nothing is written.
    prev = requests.post(f"{BASE}/import/historical",
                         json={"type": "leads", "csv_text": csv_text, "commit": False},
                         headers=H(admin_token), timeout=30).json()
    assert prev["committed"] is False
    assert prev["total_rows"] == 1
    assert prev["created"] == 1
    assert len(prev["preview"]) == 1

    # 2) COMMIT: actually inserts.
    c1 = requests.post(f"{BASE}/import/historical",
                       json={"type": "leads", "csv_text": csv_text, "commit": True},
                       headers=H(admin_token), timeout=30).json()
    assert c1["committed"] is True
    assert c1["created"] == 1

    # 3) RE-IMPORT same email without update_existing -> skipped (dedupe by email).
    c2 = requests.post(f"{BASE}/import/historical",
                       json={"type": "leads", "csv_text": csv_text, "commit": True},
                       headers=H(admin_token), timeout=30).json()
    assert c2["created"] == 0
    assert c2["skipped"] == 1

    # 4) RE-IMPORT with update_existing -> updated.
    c3 = requests.post(f"{BASE}/import/historical",
                       json={"type": "leads", "csv_text": csv_text, "commit": True, "update_existing": True},
                       headers=H(admin_token), timeout=30).json()
    assert c3["updated"] == 1
    assert c3["created"] == 0


def test_import_historical_leads_bad_row_reports_error(admin_token):
    csv_text = (
        "name,email\n"
        f"Good One,{_uniq('TEST_hist_good')}\n"
        ",missing-name@example.com\n"          # missing name -> error
    )
    res = requests.post(f"{BASE}/import/historical",
                        json={"type": "leads", "csv_text": csv_text, "commit": False},
                        headers=H(admin_token), timeout=30).json()
    assert res["total_rows"] == 2
    assert res["created"] == 1
    assert res["skipped"] == 1
    assert len(res["errors"]) == 1
    assert res["errors"][0]["row"] == 3        # header is row 1, first data row is row 2


# ===========================================================================
# Historical import - payments + meetings link to leads by email
# ===========================================================================
def test_import_historical_payments_links_by_email(admin_token):
    email = _uniq("TEST_hist_pay")
    # seed the lead first
    requests.post(f"{BASE}/import/historical",
                  json={"type": "leads", "csv_text": f"name,email\nPay Lead,{email}\n", "commit": True},
                  headers=H(admin_token), timeout=30)
    pay_csv = (
        "customer_email,amount,currency,status,provider,product_line,description\n"
        f"{email},2500,usd,paid,stripe,Credit Top-Up,Backfill\n"
        "ghost@nobody.example,99,usd,paid,stripe,Credit Top-Up,Orphan\n"
    )
    res = requests.post(f"{BASE}/import/historical",
                        json={"type": "payments", "csv_text": pay_csv, "commit": True},
                        headers=H(admin_token), timeout=30).json()
    assert res["created"] == 1                  # matched lead
    assert res["skipped"] == 1                  # orphan email
    assert any("no lead matched" in e["message"] for e in res["errors"])


def test_import_historical_meetings_links_by_email(admin_token):
    email = _uniq("TEST_hist_meet")
    requests.post(f"{BASE}/import/historical",
                  json={"type": "leads", "csv_text": f"name,email\nMeet Lead,{email}\n", "commit": True},
                  headers=H(admin_token), timeout=30)
    sched = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    meet_csv = (
        "email,scheduled_at,status,duration,driver,notes\n"
        f"{email},{sched},completed,30,Renewal,Backfilled call\n"
        f"ghost2@nobody.example,{sched},scheduled,30,Support,Orphan\n"
    )
    res = requests.post(f"{BASE}/import/historical",
                        json={"type": "meetings", "csv_text": meet_csv, "commit": True},
                        headers=H(admin_token), timeout=30).json()
    assert res["created"] == 1
    assert res["skipped"] == 1


# ===========================================================================
# Legacy CSV import RBAC
# ===========================================================================
def test_legacy_csv_import_agent_forbidden(agent_token):
    csv_text = "name,email\nX,x@y.com\n"
    files = {"file": ("leads.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = requests.post(f"{BASE}/leads/import", files=files, headers=H(agent_token), timeout=30)
    assert r.status_code == 403


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))
