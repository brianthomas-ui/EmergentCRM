from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
import logging
import io
import csv
import random
import asyncio
import secrets
import time
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta, date
from collections import Counter, defaultdict, deque

import bcrypt
import jwt

# ----------------------------------------------------------------------------
# DB / App setup
# ----------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=10000)
db = client[os.environ['DB_NAME']]

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("crm")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup + graceful shutdown (replaces the deprecated @app.on_event handlers).
    await _run_startup()
    yield
    client.close()


app = FastAPI(title="Emergent Upsell CRM", lifespan=lifespan)
api = APIRouter(prefix="/api")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"

PIPELINE_STAGES = [
    "New Booking", "Assigned", "Meeting Completed",
    "Payment Link Sent", "Won", "Lost", "Follow-up Later",
]
PRIORITIES = ["Hot", "Follow-up This Week", "Payment Pending", "None"]

# ----------------------------------------------------------------------------
# NEW SALES-STATUS MODEL (Emergent Dark Sales Console)
# Three orthogonal concerns kept separate so reporting stays accurate
# (handoff spec sections 3 & 4):
#   - stage          : where the lead is in the ACTIVE sales journey
#   - outcome        : terminal / semi-terminal result ("" == still open)
#   - payment_status : payment-infrastructure state
# A single human-friendly "status" badge is DERIVED from these three.
# ----------------------------------------------------------------------------
SALES_STAGES = [
    "New / Needs Review",
    "Contacted",
    "Interested",
    "Contact in Future",
    "Payment Link Sent",
]
OUTCOMES = ["", "Won", "No-Show", "Not Interested", "Changed Their Mind"]
PAYMENT_STATES = ["Not Sent", "Link Sent", "Paid", "Failed"]

# The 10 visible statuses used in filters, badges and stage rows (spec §4).
VISIBLE_STATUSES = [
    "New / Needs Review",
    "Contacted",
    "Interested",
    "Contact in Future",
    "Payment Link Sent",
    "Payment Link Failed",
    "Payment Link Paid",
    "No-Show",
    "Not Interested",
    "Changed Their Mind",
]

# Badge tone per status (spec §4 "Badge styling"). Tone is a semantic name the
# frontend maps to dark-theme colors; `filled` flags the solid (won) badge.
STATUS_META = {
    "Interested":          {"tone": "emerald", "filled": False, "label": "Interested"},
    "Payment Link Sent":   {"tone": "cyan",    "filled": False, "label": "Payment Link Sent"},
    "Payment Link Paid":   {"tone": "green",   "filled": True,  "label": "Payment Link Paid"},
    "Payment Link Failed": {"tone": "orange",  "filled": False, "label": "Payment Link Failed"},
    "Contact in Future":   {"tone": "amber",   "filled": False, "label": "Contact in Future"},
    "No-Show":             {"tone": "purple",  "filled": False, "label": "No-Show"},
    "Not Interested":      {"tone": "rose-muted", "filled": False, "label": "Not Interested"},
    "Changed Their Mind":  {"tone": "rose",    "filled": False, "label": "Changed Their Mind"},
    "New / Needs Review":  {"tone": "slate",   "filled": False, "label": "New / Needs Review"},
    "Contacted":           {"tone": "blue-gray", "filled": False, "label": "Contacted"},
}

# Reporting groups (spec §4 "Grouping for reporting"). Each visible status rolls
# up into exactly the groups it belongs to. Used by dashboard/coverage/drilldown.
STATUS_GROUPS = {
    "Active Pipeline": [
        "New / Needs Review", "Contacted", "Interested",
        "Contact in Future", "Payment Link Sent", "Payment Link Failed",
    ],
    "Won": ["Payment Link Paid"],
    "Recoverable": ["No-Show", "Payment Link Failed", "Changed Their Mind"],
    "Lost": ["Not Interested", "Changed Their Mind"],
}


def derive_status(stage: str = "", outcome: str = "", payment_status: str = "") -> str:
    """Collapse (stage, outcome, payment_status) into the single visible status
    badge. Payment infra wins, then terminal outcomes, then active stage."""
    ps = payment_status or "Not Sent"
    oc = outcome or ""
    st = stage or "New / Needs Review"

    if ps == "Paid" or oc == "Won":
        return "Payment Link Paid"
    if ps == "Failed":
        return "Payment Link Failed"
    if oc == "No-Show":
        return "No-Show"
    if oc == "Not Interested":
        return "Not Interested"
    if oc == "Changed Their Mind":
        return "Changed Their Mind"
    if ps == "Link Sent" or st == "Payment Link Sent":
        return "Payment Link Sent"
    if st in VISIBLE_STATUSES:
        return st
    return "New / Needs Review"


def status_group(status: str) -> List[str]:
    """All reporting groups a visible status belongs to."""
    return [g for g, members in STATUS_GROUPS.items() if status in members]


# Map a legacy PIPELINE_STAGES value (+ optional payment_status) onto the new
# (stage, outcome, payment_status) triple. Used at startup migration AND on the
# fly when serializing legacy leads that predate the new fields.
def map_legacy_stage(legacy_stage: str, legacy_payment_status: str = "") -> dict:
    lp = (legacy_payment_status or "").lower()
    table = {
        "New Booking":       {"stage": "New / Needs Review", "outcome": "", "payment_status": "Not Sent"},
        "Assigned":          {"stage": "Contacted",          "outcome": "", "payment_status": "Not Sent"},
        "Meeting Completed": {"stage": "Interested",         "outcome": "", "payment_status": "Not Sent"},
        "Payment Link Sent": {"stage": "Payment Link Sent",  "outcome": "", "payment_status": "Link Sent"},
        "Won":               {"stage": "Payment Link Sent",  "outcome": "Won", "payment_status": "Paid"},
        "Lost":              {"stage": "Contacted",          "outcome": "Not Interested", "payment_status": "Not Sent"},
        "Follow-up Later":   {"stage": "Contact in Future",  "outcome": "", "payment_status": "Not Sent"},
    }
    mapped = dict(table.get(legacy_stage, table["New Booking"]))
    if lp == "paid":
        mapped["payment_status"] = "Paid"
        mapped["outcome"] = "Won"
    elif lp == "link_sent" and mapped["payment_status"] == "Not Sent":
        mapped["payment_status"] = "Link Sent"
    return mapped

# What got the lead to book the meeting (the "hook"/incentive)
BOOKING_DRIVERS = [
    "Support", "Lifetime Access", "Top-Up Credits", "Discount",
    "Pricing / Upgrade", "Feature Request", "Renewal", "Onboarding Help", "Other",
]

# Usage tiers (by spend or LTV) and regions for coverage analytics
USAGE_TIERS = [
    ("Free–$20", 0, 20),
    ("$21–100", 21, 100),
    ("$101–500", 101, 500),
    ("$501–1k", 501, 1000),
    ("$1k–2k", 1001, 2000),
    ("$2k–5k", 2001, 5000),
    ("$5k–15k", 5001, 15000),
    ("$15k+", 15001, 10**12),
]
REGIONS = ["North America", "Europe", "APAC", "LATAM", "MEA", "Other"]

def tier_label(value) -> str:
    v = float(value or 0)
    for label, lo, hi in USAGE_TIERS:
        if lo <= v <= hi:
            return label
    return USAGE_TIERS[-1][0]

# ----------------------------------------------------------------------------
# PRODUCTS — 4 product lines, USD default (Emergent Dark Sales Console).
# INR is an edge-case override an agent can apply to a single link; the catalog
# is USD-first. The credit ladder is priced at ~$0.20/credit with a +50% boost
# (free bonus credits). Pro/Support/Lifetime are fixed placeholder packages.
# ----------------------------------------------------------------------------
PRODUCT_LINE_NAMES = [
    "Credit Top-Up",
    "Annual Pro Subscription",
    "Dedicated Support",
    "Lifetime Access",
]

# Credit Top-Up multiplier pricing: credits delivered = (USD amount) * multiplier.
# Rep-selectable 6..10 (default 7.5); 10 is the absolute hard cap.
CREDIT_MULTIPLIER_DEFAULT = 7.5
CREDIT_MULTIPLIER_MIN = 6
CREDIT_MULTIPLIER_MAX = 10

PRESET_PACKAGES = {
    # --- Credit Top-Up ladder (USD default, ~$0.20/credit, +50% boost free) ---
    "credits_100":  {"product_line": "Credit Top-Up", "name": "100 Credits",   "amount": 20.0,   "currency": "usd", "category": "Credits", "credits": 100,  "boost_credits": 50},
    "credits_250":  {"product_line": "Credit Top-Up", "name": "250 Credits",   "amount": 50.0,   "currency": "usd", "category": "Credits", "credits": 250,  "boost_credits": 125},
    "credits_500":  {"product_line": "Credit Top-Up", "name": "500 Credits",   "amount": 100.0,  "currency": "usd", "category": "Credits", "credits": 500,  "boost_credits": 250},
    "credits_1250": {"product_line": "Credit Top-Up", "name": "1,250 Credits", "amount": 250.0,  "currency": "usd", "category": "Credits", "credits": 1250, "boost_credits": 625},
    "credits_2500": {"product_line": "Credit Top-Up", "name": "2,500 Credits", "amount": 500.0,  "currency": "usd", "category": "Credits", "credits": 2500, "boost_credits": 1250},
    "credits_5000": {"product_line": "Credit Top-Up", "name": "5,000 Credits", "amount": 1000.0, "currency": "usd", "category": "Credits", "credits": 5000, "boost_credits": 2500},
    # --- Annual Pro Subscription (fixed placeholder) ---
    "annual_pro":   {"product_line": "Annual Pro Subscription", "name": "Annual Pro Subscription", "amount": 1999.0, "currency": "usd", "category": "Plan", "interval": "year"},
    # --- Dedicated Support (fixed placeholder) ---
    "dedicated_support": {"product_line": "Dedicated Support", "name": "Dedicated Support", "amount": 3499.0, "currency": "usd", "category": "Support"},
    # --- Lifetime Access (fixed placeholder) ---
    "lifetime_access":   {"product_line": "Lifetime Access", "name": "Lifetime Access", "amount": 5999.0, "currency": "usd", "category": "Lifetime"},
    # --- Legacy aliases kept so existing links/tests/serializers never break ---
    "plan_pro_annual":  {"product_line": "Annual Pro Subscription", "name": "Pro Plan (Annual, 750 cr/mo)", "amount": 2004.0, "currency": "usd", "category": "Plan", "interval": "year"},
    "plan_team_annual": {"product_line": "Annual Pro Subscription", "name": "Team Plan (Annual, 1,250 cr/mo)", "amount": 2490.0, "currency": "usd", "category": "Plan", "interval": "year"},
    "support_1m":  {"product_line": "Dedicated Support", "name": "Dedicated Support — 1 Month",  "amount": 500.0,  "currency": "usd", "category": "Support", "duration_months": 1},
    "support_3m":  {"product_line": "Dedicated Support", "name": "Dedicated Support — 3 Months", "amount": 1350.0, "currency": "usd", "category": "Support", "duration_months": 3},
    "support_6m":  {"product_line": "Dedicated Support", "name": "Dedicated Support — 6 Months", "amount": 2400.0, "currency": "usd", "category": "Support", "duration_months": 6},
    "support_12m": {"product_line": "Dedicated Support", "name": "Dedicated Support — 12 Months","amount": 4200.0, "currency": "usd", "category": "Support", "duration_months": 12},
}

# Catalog grouped by the 4 product lines for the product-cards UI. Legacy aliases
# (plan_*, support_Nm) are intentionally excluded from the grouped view.
PRODUCT_LINES = {
    "Credit Top-Up": {
        "default_currency": "usd",
        "inr_per_credit": 17.0,   # override rate an agent can switch a link to
        "items": ["credits_100", "credits_250", "credits_500", "credits_1250", "credits_2500", "credits_5000"],
    },
    "Annual Pro Subscription": {"default_currency": "usd", "items": ["annual_pro"]},
    "Dedicated Support":        {"default_currency": "usd", "items": ["dedicated_support"]},
    "Lifetime Access":          {"default_currency": "usd", "items": ["lifetime_access"]},
}


def package_product_line(package_id: str) -> str:
    pkg = PRESET_PACKAGES.get(package_id or "")
    if pkg and pkg.get("product_line"):
        return pkg["product_line"]
    return ""

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

# ----------------------------------------------------------------------------
# Time-period filtering (Salesforce / Zoho style). period_window() resolves a
# period name (+ optional custom from/to) into a half-open [start, end) ISO range.
# "all" (and an unrecognized period) returns (None, None) == no bound, so callers
# stay backward compatible. Default chosen by callers is "this_month".
# ----------------------------------------------------------------------------
PERIODS = ["today", "this_week", "this_month", "this_quarter", "custom", "all"]


def _start_of_day(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


def period_window(period: Optional[str], frm: Optional[str] = None,
                  to: Optional[str] = None):
    """Resolve (period, frm, to) into (start_iso, end_iso) UTC bounds (half-open).
    Returns (None, None) for 'all' / unknown so no filtering is applied.
    `period` defaults to 'this_month' only at the call site (None here -> no bound)."""
    p = (period or "").strip().lower()
    now = datetime.now(timezone.utc)
    today = now.date()

    if p in ("", "all"):
        return None, None

    if p == "today":
        start = _start_of_day(today)
        end = start + timedelta(days=1)
        return start.isoformat(), end.isoformat()

    if p == "this_week":
        monday = today - timedelta(days=today.weekday())
        start = _start_of_day(monday)
        end = start + timedelta(days=7)
        return start.isoformat(), end.isoformat()

    if p == "this_month":
        start = _start_of_day(today.replace(day=1))
        if today.month == 12:
            nxt = date(today.year + 1, 1, 1)
        else:
            nxt = date(today.year, today.month + 1, 1)
        end = _start_of_day(nxt)
        return start.isoformat(), end.isoformat()

    if p == "this_quarter":
        q_first_month = ((today.month - 1) // 3) * 3 + 1
        start = _start_of_day(date(today.year, q_first_month, 1))
        nxt_month = q_first_month + 3
        if nxt_month > 12:
            nxt = date(today.year + 1, nxt_month - 12, 1)
        else:
            nxt = date(today.year, nxt_month, 1)
        end = _start_of_day(nxt)
        return start.isoformat(), end.isoformat()

    if p == "custom":
        start_iso = end_iso = None
        try:
            if frm:
                start_iso = _start_of_day(date.fromisoformat(frm[:10])).isoformat()
        except Exception:
            start_iso = None
        try:
            if to:
                # inclusive `to` date -> half-open end at next midnight
                end_iso = (_start_of_day(date.fromisoformat(to[:10])) + timedelta(days=1)).isoformat()
        except Exception:
            end_iso = None
        return start_iso, end_iso

    # Unknown period -> no bound (backward compatible).
    return None, None


def resolve_period(request: Request, default: str = "this_month"):
    """Read period/from/to off a request and resolve to (start_iso, end_iso, period_used).
    When no `period` query param is present at all, `default` is applied (Salesforce-style
    'this month' default). Pass default=None/'all' to opt a caller out of windowing."""
    raw = request.query_params.get("period")
    period = raw if raw is not None else default
    frm = request.query_params.get("from")
    to = request.query_params.get("to")
    start, end = period_window(period, frm, to)
    return start, end, (period or "all")


def _in_window(ts: Optional[str], start: Optional[str], end: Optional[str]) -> bool:
    """True if ISO timestamp `ts` falls in [start, end). Missing bounds are open.
    A missing/empty ts is treated as OUT of a bounded window, IN an unbounded one."""
    if start is None and end is None:
        return True
    if not ts:
        return False
    t = str(ts)
    if start is not None and t < start:
        return False
    if end is not None and t >= end:
        return False
    return True

async def _safe_insert(coll, doc) -> bool:
    """Insert that tolerates concurrent seeding across replicas (unique-index races)."""
    try:
        await coll.insert_one(doc)
        return True
    except DuplicateKeyError:
        return False

def _pw_bytes(password: str) -> bytes:
    # bcrypt only considers the first 72 bytes; truncate so long inputs never raise.
    return (password or "").encode("utf-8")[:72]

def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_pw_bytes(plain), (hashed or "").encode("utf-8"))
    except Exception as e:
        logger.warning(f"verify_password error: {e}")
        return False

def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"], "email": user["email"], "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

COOKIE_MAX_AGE = 7 * 24 * 3600

def _set_auth_cookies(response: Response, token: str):
    # httpOnly session cookie (not readable by JS -> XSS-safe) + readable CSRF token (double-submit).
    response.set_cookie("crm_token", token, max_age=COOKIE_MAX_AGE, httponly=True,
                        secure=True, samesite="lax", path="/")
    response.set_cookie("csrf_token", secrets.token_urlsafe(32), max_age=COOKIE_MAX_AGE,
                        httponly=False, secure=True, samesite="lax", path="/")

def _clear_auth_cookies(response: Response):
    response.delete_cookie("crm_token", path="/")
    response.delete_cookie("csrf_token", path="/")

def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


# Map legacy lead payment_status strings -> new PAYMENT_STATES vocabulary.
_LEGACY_PAYMENT_STATUS = {
    "none": "Not Sent", "": "Not Sent", "not_sent": "Not Sent",
    "link_sent": "Link Sent", "pending": "Link Sent",
    "paid": "Paid", "failed": "Failed",
}


def serialize_lead(lead: dict) -> dict:
    """clean() + attach the new sales-status model. Tolerant of legacy leads that
    only have the old `stage`/`payment_status`: derives stage/outcome/payment_status
    from the legacy values so reporting + badges always work."""
    if not lead:
        return lead
    lead = clean(dict(lead))

    legacy_stage = lead.get("stage", "New Booking")
    legacy_ps = lead.get("payment_status", "")

    # New-model fields if present, else fall back to a legacy mapping.
    if lead.get("sales_stage"):
        stage = lead["sales_stage"]
        outcome = lead.get("outcome", "") or ""
        payment_status = lead.get("payment_status") if lead.get("payment_status") in PAYMENT_STATES \
            else _LEGACY_PAYMENT_STATUS.get((legacy_ps or "").lower(), "Not Sent")
    else:
        m = map_legacy_stage(legacy_stage, legacy_ps)
        stage = lead.get("sales_stage") or m["stage"]
        outcome = lead.get("outcome") or m["outcome"]
        payment_status = m["payment_status"]

    status = derive_status(stage, outcome, payment_status)
    meta = STATUS_META.get(status, STATUS_META["New / Needs Review"])

    # Expose the new model under NEW field names so the legacy `stage`
    # (PIPELINE_STAGES value) and legacy `payment_status` ("none"/"paid"/...) stay
    # byte-for-byte intact for existing clients/tests:
    #   sales_stage   -> new active-journey stage
    #   outcome       -> terminal/semi-terminal result
    #   payment_state -> new payment vocabulary ("Not Sent"/"Link Sent"/"Paid"/"Failed")
    #   status        -> single derived human badge
    lead["sales_stage"] = stage
    lead["outcome"] = outcome
    lead["payment_state"] = payment_status
    lead["status"] = status
    lead["status_tone"] = meta["tone"]
    lead["status_filled"] = meta["filled"]
    lead["status_groups"] = status_group(status)
    lead.setdefault("product_line", "")
    lead.setdefault("package_id", None)
    lead.setdefault("amount", None)
    lead.setdefault("currency", "usd")
    lead.setdefault("next_action", "")
    lead.setdefault("next_action_at", None)
    lead.setdefault("loss_reason", "")
    lead.setdefault("last_activity", lead.get("updated_at"))
    return lead


async def fetch_circleback_summary(meeting: dict) -> dict:
    """Behind-keys Circleback hook. When CIRCLEBACK_API_KEY is set, fetch the
    recording link + AI summary for a meeting; the blocking HTTP call runs in a
    thread so it never blocks the event loop. Without a key (demo mode) it returns
    whatever is stored on the meeting and NEVER crashes. Only called for single
    meeting reads, so it is never an N+1 cost on list endpoints."""
    stored = {
        "recording_url": meeting.get("recording_url") or None,
        "summary": meeting.get("summary") or None,
    }
    api_key = os.environ.get("CIRCLEBACK_API_KEY")
    if not api_key:
        return stored

    def _call():
        import urllib.request, json as _json
        cb_id = meeting.get("circleback_id") or meeting.get("id")
        base = os.environ.get("CIRCLEBACK_API_URL", "https://api.circleback.ai/v1/meetings")
        req = urllib.request.Request(f"{base}/{cb_id}")
        req.add_header("Authorization", f"Bearer {api_key}")
        raw = urllib.request.urlopen(req, timeout=10).read()
        return _json.loads(raw.decode("utf-8"))

    try:
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, _call)
        return {
            "recording_url": data.get("recording_url") or stored["recording_url"],
            "summary": data.get("summary") or stored["summary"],
        }
    except Exception as e:
        logger.warning(f"fetch_circleback_summary failed for meeting {meeting.get('id')}: {e}")
        return stored


def serialize_meeting(meeting: dict) -> dict:
    """clean() + surface stored Circleback recording_url/summary. No network here so
    list/detail/dashboard stay fast; live backfill happens on GET /meetings/{id}."""
    if not meeting:
        return meeting
    m = clean(dict(meeting))
    m.setdefault("recording_url", None)
    m.setdefault("summary", None)
    return m

async def get_current_user(request: Request) -> dict:
    # Prefer the httpOnly cookie; fall back to the Authorization header for API clients/tests.
    token = request.cookies.get("crm_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return clean(user)

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def log_activity(lead_id: str, type_: str, description: str, actor: str):
    await db.activities.insert_one({
        "id": new_id(), "lead_id": lead_id, "type": type_,
        "description": description, "actor": actor, "created_at": now_iso(),
    })

async def log_audit(action: str, actor: str, target: str, details: str = ""):
    await db.audit_logs.insert_one({
        "id": new_id(), "action": action, "actor": actor,
        "target": target, "details": details, "created_at": now_iso(),
    })

async def get_inr_rate() -> float:
    s = await db.settings.find_one({"id": "settings"})
    if s and s.get("inr_per_usd"):
        return float(s["inr_per_usd"])
    return 85.0


def _emergent_mock_enrichment(email: str) -> dict:
    """Deterministic, stable-per-email mock so demo data looks real with no API key."""
    import hashlib
    h = int(hashlib.sha256((email or "").lower().encode("utf-8")).hexdigest(), 16)
    lifetime_value = round(200 + (h % 8801), 2)          # ~$200–$9000
    monthly_spend = round(20 + ((h >> 8) % 381), 2)       # ~$20–$400
    region = REGIONS[(h >> 16) % len(REGIONS)]
    plans = ["Free", "Standard", "Pro", "Team"]
    plan = plans[(h >> 24) % len(plans)]
    trends = ["rising", "steady", "declining"]
    usage_trend = trends[(h >> 32) % len(trends)]
    return {
        "monthly_spend": monthly_spend, "lifetime_value": lifetime_value,
        "region": region, "usage_trend": usage_trend, "plan": plan,
    }


async def enrich_from_emergent(email: str) -> dict:
    """Pull usage/LTV/region/plan for a lead's email from the Emergent Users DB.
    Real path activates only when EMERGENT_USERS_API_URL is set; otherwise returns a
    deterministic mock derived from the email so the demo always has plausible data."""
    api_url = os.environ.get("EMERGENT_USERS_API_URL")
    if api_url:
        try:
            import urllib.request, urllib.parse, json as _json
            qs = urllib.parse.urlencode({"email": email})
            req = urllib.request.Request(f"{api_url}?{qs}")
            api_key = os.environ.get("EMERGENT_USERS_API_KEY")
            if api_key:
                req.add_header("Authorization", f"Bearer {api_key}")
            loop = asyncio.get_event_loop()
            raw = await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=10).read())
            data = _json.loads(raw.decode("utf-8"))
            return {
                "monthly_spend": float(data.get("monthly_spend") or 0),
                "lifetime_value": float(data.get("lifetime_value") or 0),
                "region": data.get("region") or "Other",
                "usage_trend": data.get("usage_trend") or "stable",
                "plan": data.get("plan") or "",
            }
        except Exception as e:
            logger.warning(f"enrich_from_emergent live lookup failed for {email}, using mock: {e}")
    return _emergent_mock_enrichment(email)


# ----------------------------------------------------------------------------
# Avatars: validate a small base64 data URL before storing it on a user record.
# Stored inline on `avatar_url` (visible to everyone the user appears to). Cap the
# size so a giant image can never bloat the user doc / response payloads.
# ----------------------------------------------------------------------------
AVATAR_MAX_BYTES = 420_000  # ~400KB of raw data-URL string


def validate_avatar_data_url(data_url: str) -> str:
    s = (data_url or "").strip()
    if not s:
        raise HTTPException(status_code=400, detail="Empty avatar data")
    if not s.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Avatar must be an image data URL (data:image/...)")
    if ";base64," not in s:
        raise HTTPException(status_code=400, detail="Avatar must be a base64 data URL")
    if len(s) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"Avatar too large (max ~{AVATAR_MAX_BYTES // 1000}KB)")
    return s


# ----------------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------------
class LoginIn(BaseModel):
    email: EmailStr
    password: str

class AgentIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    monthly_target: float = 20000.0
    weekly_target: float = 5000.0

class LeadIn(BaseModel):
    name: str
    email: EmailStr
    company: Optional[str] = ""
    phone: Optional[str] = ""
    plan: Optional[str] = ""
    monthly_spend: float = 0.0
    lifetime_value: float = 0.0
    usage_trend: Optional[str] = "stable"
    product_history: List[str] = []
    source: Optional[str] = "Manual Entry"
    region: Optional[str] = "Other"
    priority: str = "None"
    referred_by_lead_id: Optional[str] = None
    referred_by_name: Optional[str] = ""
    # Deal / product (USD default). product_line is one of PRODUCT_LINE_NAMES.
    product_line: Optional[str] = ""
    package_id: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = "usd"

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    plan: Optional[str] = None
    monthly_spend: Optional[float] = None
    lifetime_value: Optional[float] = None
    usage_trend: Optional[str] = None
    region: Optional[str] = None
    priority: Optional[str] = None
    stage: Optional[str] = None
    # New sales-status model (separate concerns)
    outcome: Optional[str] = None
    payment_status: Optional[str] = None
    # Deal / product
    product_line: Optional[str] = None
    package_id: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    next_action: Optional[str] = None
    next_action_at: Optional[str] = None
    loss_reason: Optional[str] = None

class ReopenIn(BaseModel):
    type: str = "Upsell"  # Upsell, Cross-sell, Renewal
    reason: Optional[str] = ""

class StageIn(BaseModel):
    stage: str

class AssignIn(BaseModel):
    agent_id: str

class NoteIn(BaseModel):
    text: str
    type: str = "Note"  # Note, Call Outcome, Follow-up

class MeetingIn(BaseModel):
    lead_id: str
    scheduled_at: str
    duration: int = 30
    source: str = "Manual"
    booking_driver: Optional[str] = ""  # what got them to book (Support, Discount, etc.)
    agent_id: Optional[str] = None  # if None -> round robin

class MeetingOutcome(BaseModel):
    status: str  # completed, no_show, cancelled
    no_show_reason: Optional[str] = ""
    outcome_notes: Optional[str] = ""
    reschedule_status: Optional[str] = ""
    recording_url: Optional[str] = None  # Circleback recording link
    summary: Optional[str] = None         # Circleback AI summary

class CampaignIn(BaseModel):
    name: str
    segment_label: str
    min_spend: float = 0.0
    template_subject: str
    template_body: str

class PaymentIn(BaseModel):
    lead_id: str
    provider: str = "stripe"  # stripe, razorpay
    package_id: Optional[str] = None
    amount: Optional[float] = None          # explicit amount overrides the preset (lets agents discount)
    currency: str = "usd"
    description: Optional[str] = ""
    credits: Optional[int] = None           # custom credits for a credit top-up
    boost_credits: Optional[int] = None     # custom bonus/boost credits (free extra)
    multiplier: Optional[float] = None      # Credit Top-Up: credits delivered = amount * multiplier
    origin_url: str

class SettingsIn(BaseModel):
    inr_per_usd: float

class AvatarIn(BaseModel):
    data_url: str  # base64 data URL (data:image/...;base64,....), small (<= ~400KB)

# ----------------------------------------------------------------------------
# Response models (documented API shapes; extra="allow" keeps any extra fields
# so adding a response_model can never silently drop or break a payload)
# ----------------------------------------------------------------------------
class _OutBase(BaseModel):
    model_config = ConfigDict(extra="allow")

class UserOut(_OutBase):
    id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    avatar_url: Optional[str] = None
    monthly_target: Optional[float] = None
    weekly_target: Optional[float] = None
    active: Optional[bool] = None
    created_at: Optional[str] = None

class LoginOut(_OutBase):
    token: Optional[str] = None
    user: Optional[UserOut] = None

class NoteOut(_OutBase):
    id: Optional[str] = None
    text: Optional[str] = None
    type: Optional[str] = None
    author: Optional[str] = None
    created_at: Optional[str] = None

class LeadOut(_OutBase):
    id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    plan: Optional[str] = None
    monthly_spend: Optional[float] = None
    lifetime_value: Optional[float] = None
    usage_trend: Optional[str] = None
    product_history: Optional[List[str]] = None
    source: Optional[str] = None
    region: Optional[str] = None
    priority: Optional[str] = None
    stage: Optional[str] = None                 # legacy PIPELINE_STAGES value (back-compat)
    sales_stage: Optional[str] = None           # new active-journey stage
    outcome: Optional[str] = None
    payment_status: Optional[str] = None        # legacy ("none"/"paid"/...)
    payment_state: Optional[str] = None         # new ("Not Sent"/"Link Sent"/"Paid"/"Failed")
    status: Optional[str] = None                # derived human badge
    status_tone: Optional[str] = None           # badge tone (STATUS_META)
    status_filled: Optional[bool] = None
    status_groups: Optional[List[str]] = None   # reporting groups
    product_line: Optional[str] = None
    package_id: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    next_action: Optional[str] = None
    next_action_at: Optional[str] = None
    loss_reason: Optional[str] = None
    last_activity: Optional[str] = None
    referred_by_lead_id: Optional[str] = None
    referred_by_name: Optional[str] = None
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    owner_locked: Optional[bool] = None
    total_revenue_usd: Optional[float] = None
    deals_won: Optional[int] = None
    upsell_cycles: Optional[int] = None
    last_meeting_at: Optional[str] = None
    next_meeting_at: Optional[str] = None
    won_at: Optional[str] = None
    notes: Optional[List[NoteOut]] = None
    ownership_history: Optional[List[Dict[str, Any]]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class MeetingOut(_OutBase):
    id: Optional[str] = None
    lead_id: Optional[str] = None
    lead_name: Optional[str] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    scheduled_at: Optional[str] = None
    duration: Optional[int] = None
    status: Optional[str] = None
    source: Optional[str] = None
    booking_driver: Optional[str] = None
    join_url: Optional[str] = None
    no_show_reason: Optional[str] = None
    reschedule_status: Optional[str] = None
    outcome_notes: Optional[str] = None
    recording_url: Optional[str] = None  # Circleback recording
    summary: Optional[str] = None         # Circleback summary
    completed_at: Optional[str] = None
    created_at: Optional[str] = None

class PaymentOut(_OutBase):
    id: Optional[str] = None
    lead_id: Optional[str] = None
    lead_name: Optional[str] = None
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    provider: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    amount_usd: Optional[float] = None
    fx_rate: Optional[float] = None
    description: Optional[str] = None
    status: Optional[str] = None
    payment_status: Optional[str] = None
    session_id: Optional[str] = None
    payment_link: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class ActivityOut(_OutBase):
    id: Optional[str] = None
    lead_id: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    actor: Optional[str] = None
    created_at: Optional[str] = None

class LeadDetailOut(_OutBase):
    lead: Optional[LeadOut] = None
    activities: Optional[List[ActivityOut]] = None
    meetings: Optional[List[MeetingOut]] = None
    payments: Optional[List[PaymentOut]] = None

class CampaignOut(_OutBase):
    id: Optional[str] = None
    name: Optional[str] = None
    segment_label: Optional[str] = None
    min_spend: Optional[float] = None
    template_subject: Optional[str] = None
    template_body: Optional[str] = None
    recipient_count: Optional[int] = None
    sent_count: Optional[int] = None
    opened_count: Optional[int] = None
    replied_count: Optional[int] = None
    booked_count: Optional[int] = None
    status: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    sent_at: Optional[str] = None

class SettingsOut(_OutBase):
    inr_per_usd: Optional[float] = None

class AuditLogOut(_OutBase):
    id: Optional[str] = None
    action: Optional[str] = None
    actor: Optional[str] = None
    target: Optional[str] = None
    details: Optional[str] = None
    created_at: Optional[str] = None

class MetaOut(_OutBase):
    stages: Optional[List[str]] = None
    priorities: Optional[List[str]] = None
    booking_drivers: Optional[List[str]] = None

class CoverageGroupOut(_OutBase):
    label: Optional[str] = None
    total: Optional[int] = None
    assigned: Optional[int] = None
    met: Optional[int] = None
    advanced: Optional[int] = None
    won: Optional[int] = None
    revenue_usd: Optional[float] = None

class BurnupPointOut(_OutBase):
    week: Optional[str] = None
    date: Optional[str] = None
    total: Optional[int] = None
    covered: Optional[int] = None
    won: Optional[int] = None

class CoverageOut(_OutBase):
    tiers: Optional[List[str]] = None
    regions: Optional[List[str]] = None
    by_tier_spend: Optional[List[CoverageGroupOut]] = None
    by_tier_ltv: Optional[List[CoverageGroupOut]] = None
    by_region: Optional[List[CoverageGroupOut]] = None
    burnup: Optional[List[BurnupPointOut]] = None
    totals: Optional[CoverageGroupOut] = None

class BookingDriverStatOut(_OutBase):
    driver: Optional[str] = None
    meetings: Optional[int] = None
    completed: Optional[int] = None
    won: Optional[int] = None

class AgentStatOut(_OutBase):
    id: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    leads: Optional[int] = None
    won: Optional[int] = None
    meetings: Optional[int] = None
    revenue: Optional[float] = None
    target: Optional[float] = None

class DashboardOut(_OutBase):
    is_admin: Optional[bool] = None
    total_leads: Optional[int] = None
    stage_counts: Optional[Dict[str, int]] = None
    status_counts: Optional[Dict[str, int]] = None        # new visible-status rollup
    group_counts: Optional[Dict[str, Any]] = None          # reporting-group rollup
    product_revenue: Optional[Dict[str, Any]] = None       # per product-line cards
    meetings_today: Optional[int] = None
    meetings_today_list: Optional[List[MeetingOut]] = None
    completed_today: Optional[int] = None
    noshow_today: Optional[int] = None
    noshow_total: Optional[int] = None
    revenue_won: Optional[float] = None
    pipeline_value: Optional[float] = None
    recoverable_count: Optional[int] = None
    recoverable_value: Optional[float] = None
    lost_count: Optional[int] = None
    payment_pending: Optional[int] = None
    payment_failed: Optional[int] = None
    follow_up: Optional[int] = None
    hot: Optional[int] = None
    target: Optional[float] = None
    weekly_target: Optional[float] = None
    won_count: Optional[int] = None
    booking_drivers: Optional[List[BookingDriverStatOut]] = None
    team_target: Optional[float] = None
    per_agent: Optional[List[AgentStatOut]] = None


# ----------------------------------------------------------------------------
# Brute-force protection: in-memory sliding-window lockout per (ip + email).
# Single-process demo store; resets on restart. A successful login clears it.
# ----------------------------------------------------------------------------
_LOGIN_FAILS = defaultdict(deque)
LOGIN_MAX_FAILS = 10
LOGIN_WINDOW = 300  # seconds


def _login_key(request: Request, email: str) -> str:
    ip = request.client.host if request.client else "?"
    return f"{ip}:{email}"


def _login_blocked(key: str) -> bool:
    now = time.time()
    dq = _LOGIN_FAILS[key]
    while dq and now - dq[0] > LOGIN_WINDOW:
        dq.popleft()
    return len(dq) >= LOGIN_MAX_FAILS


def _record_login_fail(key: str):
    _LOGIN_FAILS[key].append(time.time())


def _clear_login_fails(key: str):
    _LOGIN_FAILS.pop(key, None)


# ----------------------------------------------------------------------------
# Auth routes
# ----------------------------------------------------------------------------
@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    key = _login_key(request, email)
    if _login_blocked(key):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Please wait a few minutes and try again.")
    try:
        user = await db.users.find_one({"email": email})
    except Exception as e:
        logger.error(f"login: DB lookup error for {email}: {e}")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable, please retry")
    if not user:
        _record_login_fail(key)
        logger.warning(f"login failed (user not found): {email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user.get("password_hash", "")):
        _record_login_fail(key)
        logger.warning(f"login failed (password mismatch): {email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _clear_login_fails(key)
    logger.info(f"login success: {email} (role={user.get('role')})")
    token = create_token(user)
    _set_auth_cookies(response, token)
    # token is also returned for API clients/tests; the browser app relies on the cookie.
    return {"token": token, "user": clean(user)}

@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def logout(response: Response):
    _clear_auth_cookies(response)
    return {"ok": True}

# ----------------------------------------------------------------------------
# Team / Users
# ----------------------------------------------------------------------------
@api.get("/team", response_model=List[UserOut])
async def list_team(request: Request, user: dict = Depends(get_current_user)):
    members = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    members = [clean(m) for m in members]
    # Optional per-rep stats within a time window (Salesforce/Zoho style). Backward
    # compatible: only attached when a period/from/to query param is present.
    if request.query_params.get("period") is not None \
            or request.query_params.get("from") is not None \
            or request.query_params.get("to") is not None:
        win_start, win_end, period_used = resolve_period(request, default="this_month")
        leads = await db.leads.find({}, {"_id": 0, "id": 1, "owner_id": 1, "stage": 1,
            "sales_stage": 1, "outcome": 1, "payment_status": 1, "payment_state": 1,
            "created_at": 1}).to_list(5000)
        payments = await db.payments.find({"payment_status": "paid"},
            {"_id": 0, "agent_id": 1, "amount": 1, "amount_usd": 1, "created_at": 1}).to_list(5000)
        meetings = await db.meetings.find({}, {"_id": 0, "agent_id": 1, "scheduled_at": 1,
            "created_at": 1}).to_list(5000)

        win_leads = [l for l in leads if _in_window(l.get("created_at"), win_start, win_end)]
        win_payments = [p for p in payments if _in_window(p.get("created_at"), win_start, win_end)]
        win_meetings = [m for m in meetings
                        if _in_window(m.get("scheduled_at") or m.get("created_at"), win_start, win_end)]

        for m in members:
            uid = m.get("id")
            m_leads = [l for l in win_leads if l.get("owner_id") == uid]
            won = 0
            for l in m_leads:
                st = derive_status(
                    l.get("sales_stage") or map_legacy_stage(l.get("stage", "New Booking"), l.get("payment_status", ""))["stage"],
                    l.get("outcome", "") or map_legacy_stage(l.get("stage", "New Booking"), l.get("payment_status", ""))["outcome"],
                    l.get("payment_state") or map_legacy_stage(l.get("stage", "New Booking"), l.get("payment_status", ""))["payment_status"],
                )
                if st == "Payment Link Paid":
                    won += 1
            revenue = sum(p.get("amount_usd", p.get("amount", 0)) or 0
                          for p in win_payments if p.get("agent_id") == uid)
            m["stats"] = {
                "period": period_used,
                "leads": len(m_leads),
                "won": won,
                "meetings": len([mt for mt in win_meetings if mt.get("agent_id") == uid]),
                "revenue": round(revenue, 2),
                "target": m.get("monthly_target", 0),
            }
    return members

@api.post("/team", response_model=UserOut)
async def create_agent(body: AgentIn, admin: dict = Depends(require_admin)):
    exists = await db.users.find_one({"email": body.email.lower()})
    if exists:
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "id": new_id(), "name": body.name, "email": body.email.lower(),
        "password_hash": hash_password(body.password), "role": "agent",
        # Empty by default -> UI falls back to initials until an avatar is uploaded.
        "avatar_url": "",
        "monthly_target": body.monthly_target, "weekly_target": body.weekly_target,
        "active": True, "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await log_audit("create_agent", admin["name"], body.name)
    return clean(doc)

# ----------------------------------------------------------------------------
# Profile / avatars. avatar_url stores a small base64 image data URL inline on the
# user record (returned everywhere a user appears, so it's visible to all). Empty
# string == no avatar (UI falls back to initials).
# ----------------------------------------------------------------------------
@api.post("/profile/avatar", response_model=UserOut)
async def set_my_avatar(body: AvatarIn, user: dict = Depends(get_current_user)):
    data_url = validate_avatar_data_url(body.data_url)
    await db.users.update_one({"id": user["id"]}, {"$set": {"avatar_url": data_url}})
    updated = await db.users.find_one({"id": user["id"]})
    return clean(updated)

@api.delete("/profile/avatar", response_model=UserOut)
async def clear_my_avatar(user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"avatar_url": ""}})
    updated = await db.users.find_one({"id": user["id"]})
    return clean(updated)

@api.post("/team/{user_id}/avatar", response_model=UserOut)
async def set_user_avatar(user_id: str, body: AvatarIn, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    data_url = validate_avatar_data_url(body.data_url)
    await db.users.update_one({"id": user_id}, {"$set": {"avatar_url": data_url}})
    await log_audit("set_avatar", admin["name"], target.get("name") or user_id)
    updated = await db.users.find_one({"id": user_id})
    return clean(updated)

@api.delete("/team/{user_id}/avatar", response_model=UserOut)
async def clear_user_avatar(user_id: str, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"avatar_url": ""}})
    await log_audit("clear_avatar", admin["name"], target.get("name") or user_id)
    updated = await db.users.find_one({"id": user_id})
    return clean(updated)

# ----------------------------------------------------------------------------
# Leads
# ----------------------------------------------------------------------------
@api.get("/leads", response_model=List[LeadOut])
async def list_leads(request: Request, user: dict = Depends(get_current_user)):
    q = {}
    stage = request.query_params.get("stage")
    priority = request.query_params.get("priority")
    owner = request.query_params.get("owner")
    search = request.query_params.get("search")
    mine = request.query_params.get("mine")
    status = request.query_params.get("status")            # visible status (new model)
    group = request.query_params.get("group")              # reporting group
    product_line = request.query_params.get("product_line")
    provider = request.query_params.get("provider")
    if stage:
        q["stage"] = stage
    if priority:
        q["priority"] = priority
    if owner:
        q["owner_id"] = owner
    if product_line:
        q["product_line"] = product_line
    if provider:
        q["provider"] = provider
    if mine == "true" or user["role"] == "agent":
        q["owner_id"] = user["id"]
    if search:
        rx = re.escape(search)
        q["$or"] = [
            {"name": {"$regex": rx, "$options": "i"}},
            {"email": {"$regex": rx, "$options": "i"}},
            {"company": {"$regex": rx, "$options": "i"}},
            {"phone": {"$regex": rx, "$options": "i"}},
        ]
    leads = await db.leads.find(q, {"_id": 0, "notes": 0, "ownership_history": 0}).sort("updated_at", -1).to_list(2000)
    # Optional created-in-window filter. Backward compatible: applied ONLY when a
    # period/from/to query param is explicitly present (no param -> all leads, as before).
    if request.query_params.get("period") is not None \
            or request.query_params.get("from") is not None \
            or request.query_params.get("to") is not None:
        win_start, win_end, _ = resolve_period(request, default="all")
        leads = [l for l in leads if _in_window(l.get("created_at"), win_start, win_end)]
    out = [serialize_lead(l) for l in leads]
    # Status / reporting-group filters apply to the DERIVED status so they work for
    # both new-model and legacy leads.
    if status:
        out = [l for l in out if l.get("status") == status]
    if group:
        out = [l for l in out if group in (l.get("status_groups") or [])]
    return out

@api.post("/leads", response_model=LeadOut)
async def create_lead(body: LeadIn, user: dict = Depends(get_current_user)):
    existing = await db.leads.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="A lead with this email already exists")
    doc = body.model_dump()
    doc["email"] = body.email.lower()
    # Enrich usage/LTV/region from the Emergent Users DB when the creator left them blank.
    if not doc.get("monthly_spend") and not doc.get("lifetime_value") and (not doc.get("region") or doc.get("region") == "Other"):
        enr = await enrich_from_emergent(doc["email"])
        doc["monthly_spend"] = enr["monthly_spend"]
        doc["lifetime_value"] = enr["lifetime_value"]
        doc["region"] = enr["region"]
        doc["usage_trend"] = enr["usage_trend"]
        if not doc.get("plan"):
            doc["plan"] = enr["plan"]
    # Referral handling: if this lead was referred by an existing customer/lead,
    # mark the source, store the referrer, and cross-log on both leads (best-effort).
    referrer = None
    ref_id = doc.get("referred_by_lead_id")
    if ref_id:
        referrer = await db.leads.find_one({"id": ref_id})
        doc["source"] = "Referral"
        if referrer and not doc.get("referred_by_name"):
            doc["referred_by_name"] = referrer.get("name") or ""
    else:
        doc["referred_by_lead_id"] = None
        doc["referred_by_name"] = doc.get("referred_by_name") or ""
    # If a package was chosen but no product_line/amount, backfill from the catalog.
    pkg_id = doc.get("package_id")
    if pkg_id and PRESET_PACKAGES.get(pkg_id):
        pkg = PRESET_PACKAGES[pkg_id]
        if not doc.get("product_line"):
            doc["product_line"] = pkg.get("product_line", "")
        if not doc.get("amount"):
            doc["amount"] = float(pkg["amount"])
        if not doc.get("currency"):
            doc["currency"] = pkg.get("currency", "usd")
    doc.update({
        "id": new_id(), "stage": "New Booking", "owner_id": None, "owner_name": None,
        "owner_locked": False, "total_revenue_usd": 0.0, "deals_won": 0, "upsell_cycles": 0,
        "notes": [], "ownership_history": [], "payment_status": "none",
        # New sales-status model (separate concerns)
        "sales_stage": "New / Needs Review", "outcome": "",
        "next_action": "Review and qualify", "next_action_at": None, "loss_reason": "",
        "last_meeting_at": None, "next_meeting_at": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    doc.setdefault("product_line", "")
    doc.setdefault("package_id", None)
    doc.setdefault("amount", None)
    doc.setdefault("currency", "usd")
    await db.leads.insert_one(doc)
    await log_activity(doc["id"], "created", f"Lead created by {user['name']}", user["name"])
    if ref_id:
        ref_name = doc.get("referred_by_name") or "a customer"
        await log_activity(doc["id"], "referral", f"Referred by {ref_name}", user["name"])
        if referrer:
            try:
                await log_activity(referrer["id"], "referral", f"Referred {doc['name']}", user["name"])
            except Exception as e:
                logger.warning(f"referrer cross-log failed for {ref_id}: {e}")
    return serialize_lead(doc)

@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    activities = await db.activities.find({"lead_id": lead_id}).sort("created_at", -1).to_list(500)
    meetings = await db.meetings.find({"lead_id": lead_id}).sort("scheduled_at", -1).to_list(100)
    payments = await db.payments.find({"lead_id": lead_id}).sort("created_at", -1).to_list(100)
    return {
        "lead": serialize_lead(lead),
        "activities": [clean(a) for a in activities],
        "meetings": [serialize_meeting(m) for m in meetings],
        "payments": [clean(p) for p in payments],
    }

@api.put("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        # Route the new sales-status fields onto the new model. `stage` from the new
        # vocabulary (SALES_STAGES) maps to sales_stage; legacy PIPELINE_STAGES values
        # still write the legacy `stage` for back-compat.
        if "stage" in updates and updates["stage"] in SALES_STAGES:
            updates["sales_stage"] = updates.pop("stage")
        # `payment_status` here is the NEW vocabulary -> store as payment_state and
        # mirror "Paid" onto the legacy field + revenue side-effects via outcome.
        if "payment_status" in updates and updates["payment_status"] in PAYMENT_STATES:
            updates["payment_state"] = updates.pop("payment_status")
            if updates["payment_state"] == "Paid":
                updates["payment_status"] = "paid"
                updates["outcome"] = "Won"
            elif updates["payment_state"] == "Link Sent":
                updates["payment_status"] = "link_sent"
        if updates.get("outcome") == "Won":
            updates["won_at"] = now_iso()
            updates["owner_locked"] = True
            updates["stage"] = "Won"
        updates["updated_at"] = now_iso()
        updates["last_activity"] = now_iso()
        await db.leads.update_one({"id": lead_id}, {"$set": updates})
        if "stage" in updates or "sales_stage" in updates:
            label = updates.get("sales_stage") or updates.get("stage")
            await log_activity(lead_id, "stage", f"Status -> {label}", user["name"])
        if updates.get("outcome"):
            await log_activity(lead_id, "outcome", f"Outcome -> {updates['outcome']}", user["name"])
    lead = await db.leads.find_one({"id": lead_id})
    return serialize_lead(lead)

@api.put("/leads/{lead_id}/stage", response_model=LeadOut)
async def update_stage(lead_id: str, body: StageIn, user: dict = Depends(get_current_user)):
    # Accept legacy PIPELINE_STAGES (back-compat) OR a new visible status / sales stage.
    if body.stage not in PIPELINE_STAGES and body.stage not in VISIBLE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    set_doc = {"updated_at": now_iso(), "last_activity": now_iso()}
    if body.stage in PIPELINE_STAGES:
        set_doc["stage"] = body.stage
        if body.stage == "Won":
            set_doc.update({"won_at": now_iso(), "owner_locked": True,
                            "outcome": "Won", "payment_state": "Paid", "payment_status": "paid"})
    else:
        # New visible status -> map onto the (sales_stage, outcome, payment_state) model.
        s = body.stage
        if s in SALES_STAGES:
            set_doc["sales_stage"] = s
            set_doc["outcome"] = ""
        elif s == "Payment Link Paid":
            set_doc.update({"outcome": "Won", "payment_state": "Paid", "payment_status": "paid",
                            "stage": "Won", "won_at": now_iso(), "owner_locked": True})
        elif s == "Payment Link Failed":
            set_doc.update({"payment_state": "Failed", "sales_stage": "Payment Link Sent"})
        elif s == "No-Show":
            set_doc.update({"outcome": "No-Show", "stage": "Follow-up Later"})
        elif s == "Not Interested":
            set_doc.update({"outcome": "Not Interested", "stage": "Lost"})
        elif s == "Changed Their Mind":
            set_doc.update({"outcome": "Changed Their Mind"})
    await db.leads.update_one({"id": lead_id}, {"$set": set_doc})
    await log_activity(lead_id, "stage", f"Moved to {body.stage}", user["name"])
    lead = await db.leads.find_one({"id": lead_id})
    return serialize_lead(lead)

async def _assign_lead(lead: dict, agent: dict, by: str):
    history = lead.get("ownership_history", [])
    history.append({
        "from": lead.get("owner_name"), "to": agent["name"],
        "by": by, "at": now_iso(),
    })
    new_stage = lead["stage"] if lead["stage"] not in ("New Booking",) else "Assigned"
    set_doc = {
        "owner_id": agent["id"], "owner_name": agent["name"],
        "ownership_history": history, "stage": new_stage,
        "updated_at": now_iso(), "last_activity": now_iso(),
    }
    # New model: a freshly-assigned New lead becomes "Contacted".
    if lead.get("sales_stage", "New / Needs Review") == "New / Needs Review":
        set_doc["sales_stage"] = "Contacted"
    await db.leads.update_one({"id": lead["id"]}, {"$set": set_doc})
    await log_activity(lead["id"], "assignment", f"Assigned to {agent['name']} (by {by})", by)

@api.put("/leads/{lead_id}/assign", response_model=LeadOut)
async def assign_lead(lead_id: str, body: AssignIn, admin: dict = Depends(require_admin)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    agent = await db.users.find_one({"id": body.agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await _assign_lead(lead, agent, admin["name"])
    await log_audit("assign_lead", admin["name"], lead["name"], f"-> {agent['name']}")
    lead = await db.leads.find_one({"id": lead_id})
    return serialize_lead(lead)

async def _round_robin_agent() -> Optional[dict]:
    agents = await db.users.find({"role": "agent", "active": True}).sort("created_at", 1).to_list(100)
    if not agents:
        return None
    counter = await db.counters.find_one_and_update(
        {"id": "round_robin"}, {"$inc": {"value": 1}},
        upsert=True, return_document=True,
    )
    idx = (counter.get("value", 0)) % len(agents)
    return agents[idx]

@api.post("/leads/{lead_id}/round-robin", response_model=LeadOut)
async def round_robin_assign(lead_id: str, admin: dict = Depends(require_admin)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.get("owner_locked"):
        raise HTTPException(status_code=400, detail=f"Lead is locked to {lead.get('owner_name')}. Reassign manually if needed.")
    agent = await _round_robin_agent()
    if not agent:
        raise HTTPException(status_code=400, detail="No active agents available")
    await _assign_lead(lead, agent, f"{admin['name']} (round-robin)")
    await log_audit("round_robin", admin["name"], lead["name"], f"-> {agent['name']}")
    lead = await db.leads.find_one({"id": lead_id})
    return serialize_lead(lead)

@api.post("/leads/{lead_id}/reopen", response_model=LeadOut)
async def reopen_lead(lead_id: str, body: ReopenIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not lead.get("owner_id"):
        raise HTTPException(status_code=400, detail="Lead has no owner to route the new opportunity to")
    if user["role"] == "agent" and lead["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the owning agent or admin can reopen this lead")
    await db.leads.update_one({"id": lead_id}, {
        "$set": {"stage": "Follow-up Later", "priority": "Follow-up This Week",
                 "payment_status": "none", "updated_at": now_iso(), "last_activity": now_iso(),
                 # New model: reopened deal is back in the active journey.
                 "sales_stage": "Contact in Future", "outcome": "", "payment_state": "Not Sent",
                 "owner_locked": False},
        "$inc": {"upsell_cycles": 1},
    })
    await log_activity(lead_id, "reopen",
                       f"{body.type} cycle opened, routed to owner {lead['owner_name']}. {body.reason}".strip(),
                       user["name"])
    await log_audit("reopen_lead", user["name"], lead["name"], f"{body.type} -> {lead['owner_name']}")
    lead = await db.leads.find_one({"id": lead_id})
    return serialize_lead(lead)

@api.post("/leads/{lead_id}/notes")
async def add_note(lead_id: str, body: NoteIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    note = {
        "id": new_id(), "text": body.text, "type": body.type,
        "author": user["name"], "created_at": now_iso(),
    }
    notes = lead.get("notes", [])
    notes.insert(0, note)
    await db.leads.update_one({"id": lead_id}, {"$set": {"notes": notes, "updated_at": now_iso()}})
    await log_activity(lead_id, "note", f"{body.type}: {body.text[:80]}", user["name"])
    return note


@api.post("/leads/{lead_id}/enrich")
async def enrich_lead(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    enr = await enrich_from_emergent(lead["email"])
    updates = {
        "monthly_spend": enr["monthly_spend"], "lifetime_value": enr["lifetime_value"],
        "region": enr["region"], "usage_trend": enr["usage_trend"], "updated_at": now_iso(),
    }
    if enr.get("plan"):
        updates["plan"] = enr["plan"]
    await db.leads.update_one({"id": lead_id}, {"$set": updates})
    await log_activity(lead_id, "enrichment", "Refreshed usage/LTV from Emergent Users DB", user["name"])
    return serialize_lead(await db.leads.find_one({"id": lead_id}))


class TouchIn(BaseModel):
    channel: str  # "email" | "whatsapp"


@api.post("/leads/{lead_id}/touch")
async def touch_lead(lead_id: str, body: TouchIn, user: dict = Depends(get_current_user)):
    # Convenience touch + logged activity only. Intentionally does NOT change stage,
    # priority, or revenue — these are NOT used for agent accountability/metrics.
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    label = "Emailed lead" if body.channel == "email" else "WhatsApped lead"
    await log_activity(lead_id, "touch", label, user["name"])
    return {"ok": True, "channel": body.channel}

def _csv_float(row, key):
    try:
        return float(row.get(key) or 0)
    except Exception:
        return 0.0


def _csv_row_to_lead_doc(row):
    """Build a lead doc from a CSV row, or None if required fields are missing."""
    email = (row.get("email") or "").strip().lower()
    name = (row.get("name") or "").strip()
    if not email or not name:
        return None
    return {
        "id": new_id(), "name": name, "email": email,
        "company": (row.get("company") or "").strip(),
        "phone": (row.get("phone") or "").strip(),
        "plan": (row.get("plan") or "").strip(),
        "monthly_spend": _csv_float(row, "monthly_spend"),
        "lifetime_value": _csv_float(row, "lifetime_value"),
        "usage_trend": (row.get("usage_trend") or "stable").strip(),
        "product_history": [], "source": (row.get("source") or "CSV Import").strip(),
        "priority": "None", "stage": "New Booking",
        "owner_id": None, "owner_name": None, "notes": [], "ownership_history": [],
        "payment_status": "none", "last_meeting_at": None, "next_meeting_at": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }


@api.post("/leads/import")
async def import_leads(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    text = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    created, skipped = 0, 0
    for row in reader:
        doc = _csv_row_to_lead_doc(row)
        if not doc or await db.leads.find_one({"email": doc["email"]}):
            skipped += 1
            continue
        await db.leads.insert_one(doc)
        created += 1
    await log_audit("import_leads", admin["name"], file.filename, f"{created} created, {skipped} skipped")
    return {"created": created, "skipped": skipped}

# ----------------------------------------------------------------------------
# Meetings (Calendly intake simulated)
# ----------------------------------------------------------------------------
@api.get("/meetings")
async def list_meetings(request: Request, user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "agent":
        q["agent_id"] = user["id"]
    driver = request.query_params.get("driver")
    if driver:
        q["booking_driver"] = driver
    today_only = request.query_params.get("today")
    meetings = await db.meetings.find(q).sort("scheduled_at", 1).to_list(1000)
    result = [serialize_meeting(m) for m in meetings]
    if today_only == "true":
        today = datetime.now(timezone.utc).date().isoformat()
        result = [m for m in result if (m.get("scheduled_at") or "").startswith(today)]
    return result

async def create_google_meet(agent: dict, lead: dict, scheduled_at: str, duration: int):
    """Create a Google Calendar event with a Meet link on the ASSIGNED AGENT's calendar
    (impersonated via domain-wide delegation, so the agent is the organiser/host).
    Returns the hangoutLink, or None if creds/libs are missing or anything fails — in
    which case the caller keeps the existing mock/Calendly-provided link."""
    sa_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        return None
    try:
        # Lazy imports: never break startup if google libs aren't installed.
        import json as _json
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        info = _json.loads(sa_json)
        scopes = ["https://www.googleapis.com/auth/calendar"]
        creds = service_account.Credentials.from_service_account_info(info, scopes=scopes)
        # Impersonate the agent so the AGENT hosts the meeting (their real process).
        impersonate = agent.get("email")
        if impersonate:
            creds = creds.with_subject(impersonate)

        start = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
        end = start + timedelta(minutes=int(duration or 30))
        event_body = {
            "summary": f"Emergent · {lead.get('name')}",
            "start": {"dateTime": start.isoformat()},
            "end": {"dateTime": end.isoformat()},
            "attendees": [{"email": lead.get("email")}] if lead.get("email") else [],
            "conferenceData": {"createRequest": {
                "requestId": new_id(),
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }},
        }
        loop = asyncio.get_event_loop()

        def _insert():
            svc = build("calendar", "v3", credentials=creds, cache_discovery=False)
            return svc.events().insert(
                calendarId="primary", body=event_body, conferenceDataVersion=1,
                sendUpdates="all",
            ).execute()

        ev = await loop.run_in_executor(None, _insert)
        return ev.get("hangoutLink")
    except Exception as e:
        logger.warning(f"create_google_meet failed, keeping existing link: {e}")
        return None


@api.post("/meetings")
async def create_meeting(body: MeetingIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": body.lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    # sticky ownership: route to the existing owner; round-robin only if unowned
    if body.agent_id:
        agent = await db.users.find_one({"id": body.agent_id})
    elif lead.get("owner_id"):
        agent = await db.users.find_one({"id": lead["owner_id"]})
    else:
        agent = await _round_robin_agent()
    if not agent:
        raise HTTPException(status_code=400, detail="No agent available")
    meeting = {
        "id": new_id(), "lead_id": body.lead_id, "lead_name": lead["name"],
        "agent_id": agent["id"], "agent_name": agent["name"],
        "scheduled_at": body.scheduled_at, "duration": body.duration,
        "status": "scheduled", "source": body.source,
        "booking_driver": body.booking_driver or "",
        "no_show_reason": "", "reschedule_status": "", "outcome_notes": "",
        "recording_url": None, "summary": None,  # Circleback (populated post-call)
        "join_url": "", "created_at": now_iso(),
    }
    # Real Google Meet link when configured (agent is host); falls back to no link otherwise.
    join_url = await create_google_meet(agent, lead, body.scheduled_at, body.duration)
    if join_url:
        meeting["join_url"] = join_url
    await db.meetings.insert_one(meeting)
    # auto-assign lead + advance stage
    if not lead.get("owner_id"):
        await _assign_lead(lead, agent, f"Auto ({body.source})")
    await db.leads.update_one({"id": body.lead_id}, {"$set": {
        "stage": "Assigned", "sales_stage": "Contacted",
        "next_meeting_at": body.scheduled_at,
        "updated_at": now_iso(), "last_activity": now_iso(),
    }})
    driver_txt = f" · hook: {body.booking_driver}" if body.booking_driver else ""
    await log_activity(body.lead_id, "meeting",
                       f"Meeting booked ({body.source}) with {agent['name']}{driver_txt}", user["name"])
    return serialize_meeting(meeting)

@api.put("/meetings/{meeting_id}/outcome", response_model=MeetingOut)
async def meeting_outcome(meeting_id: str, body: MeetingOutcome, user: dict = Depends(get_current_user)):
    meeting = await db.meetings.find_one({"id": meeting_id})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    m_set = {
        "status": body.status, "no_show_reason": body.no_show_reason,
        "outcome_notes": body.outcome_notes, "reschedule_status": body.reschedule_status,
        "completed_at": now_iso(),
    }
    # Circleback recording + summary attach to the meeting when provided. When a
    # CIRCLEBACK_API_KEY is set, get_circleback_summary can backfill on read.
    if body.recording_url is not None:
        m_set["recording_url"] = body.recording_url
    if body.summary is not None:
        m_set["summary"] = body.summary
    await db.meetings.update_one({"id": meeting_id}, {"$set": m_set})
    lead = await db.leads.find_one({"id": meeting["lead_id"]})
    if lead:
        if body.status == "completed":
            await db.leads.update_one({"id": lead["id"]}, {"$set": {
                "stage": "Meeting Completed", "sales_stage": "Interested",
                "last_meeting_at": meeting["scheduled_at"],
                "updated_at": now_iso(), "last_activity": now_iso()}})
        elif body.status == "no_show":
            await db.leads.update_one({"id": lead["id"]}, {"$set": {
                "stage": "Follow-up Later", "outcome": "No-Show",
                "priority": "Follow-up This Week",
                "updated_at": now_iso(), "last_activity": now_iso()}})
        rec_txt = " · Circleback recording attached" if (body.recording_url or m_set.get("recording_url")) else ""
        await log_activity(lead["id"], "meeting",
                           f"Meeting {body.status}. {body.outcome_notes or body.no_show_reason}{rec_txt}", user["name"])
    return serialize_meeting(await db.meetings.find_one({"id": meeting_id}))


@api.get("/meetings/{meeting_id}", response_model=MeetingOut)
async def get_meeting(meeting_id: str, user: dict = Depends(get_current_user)):
    meeting = await db.meetings.find_one({"id": meeting_id})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if user["role"] == "agent" and meeting.get("agent_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your meeting")
    # Live Circleback backfill (non-blocking) when a key is configured; persisted for reuse.
    cb = await fetch_circleback_summary(meeting)
    if cb.get("recording_url") != meeting.get("recording_url") or cb.get("summary") != meeting.get("summary"):
        await db.meetings.update_one({"id": meeting_id}, {"$set": {
            "recording_url": cb.get("recording_url"), "summary": cb.get("summary")}})
        meeting["recording_url"] = cb.get("recording_url")
        meeting["summary"] = cb.get("summary")
    return serialize_meeting(meeting)


def _calendly_extract(payload: dict) -> dict:
    """Pull name/email/start/join_url out of a Calendly invitee.created webhook body
    (tolerant of the v1/v2 shapes and demo/test payloads)."""
    p = payload.get("payload") or payload
    name = p.get("name") or (p.get("invitee") or {}).get("name") or ""
    email = (p.get("email") or (p.get("invitee") or {}).get("email") or "").lower()
    event = p.get("scheduled_event") or p.get("event") or {}
    start = event.get("start_time") or p.get("start_time") or ""
    # Join URL can live in location, conferencing, or join_url depending on event type.
    loc = event.get("location") or p.get("location") or {}
    join_url = ""
    if isinstance(loc, dict):
        join_url = loc.get("join_url") or loc.get("location") or ""
    elif isinstance(loc, str):
        join_url = loc
    join_url = join_url or p.get("join_url") or ""
    return {"name": name, "email": email, "start": start, "join_url": join_url}


@api.post("/webhook/calendly")
async def calendly_webhook(request: Request):
    raw = await request.body()
    signing_key = os.environ.get("CALENDLY_WEBHOOK_SIGNING_KEY")
    if signing_key:
        # Verify Calendly-Webhook-Signature: "t=<ts>,v1=<hmac sha256 of t.body>".
        try:
            import hmac, hashlib
            header = request.headers.get("Calendly-Webhook-Signature", "")
            parts = dict(kv.split("=", 1) for kv in header.split(",") if "=" in kv)
            t, v1 = parts.get("t", ""), parts.get("v1", "")
            signed = f"{t}.{raw.decode('utf-8')}".encode("utf-8")
            expected = hmac.new(signing_key.encode("utf-8"), signed, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, v1):
                raise HTTPException(status_code=401, detail="Invalid Calendly signature")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Calendly signature verify error: {e}")
            raise HTTPException(status_code=401, detail="Invalid Calendly signature")
    # else: demo mode — accept unsigned payloads.

    try:
        import json as _json
        body = _json.loads(raw.decode("utf-8") or "{}")
    except Exception:
        return {"received": True}

    if body.get("event") not in (None, "invitee.created"):
        return {"received": True}

    info = _calendly_extract(body)
    if not info["email"]:
        return {"received": True}

    # Upsert lead by email — keep existing owner sticky, else round-robin among agents
    # (which already excludes the admin/sales-head: round-robin queries role="agent").
    lead = await db.leads.find_one({"email": info["email"]})
    if not lead:
        ldoc = {
            "id": new_id(), "name": info["name"] or info["email"], "email": info["email"],
            "company": "", "phone": "", "plan": "", "monthly_spend": 0.0, "lifetime_value": 0.0,
            "usage_trend": "stable", "product_history": [], "source": "Calendly", "region": "Other",
            "priority": "None", "stage": "New Booking", "owner_id": None, "owner_name": None,
            "owner_locked": False, "total_revenue_usd": 0.0, "deals_won": 0, "upsell_cycles": 0,
            "notes": [], "ownership_history": [], "payment_status": "none",
            "last_meeting_at": None, "next_meeting_at": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        enr = await enrich_from_emergent(info["email"])
        ldoc.update({"monthly_spend": enr["monthly_spend"], "lifetime_value": enr["lifetime_value"],
                     "region": enr["region"], "usage_trend": enr["usage_trend"], "plan": enr["plan"]})
        await db.leads.insert_one(ldoc)
        await log_activity(ldoc["id"], "created", "Lead created via Calendly booking", "Calendly")
        lead = ldoc

    if lead.get("owner_id"):
        agent = await db.users.find_one({"id": lead["owner_id"]})  # sticky owner
    else:
        agent = await _round_robin_agent()
    if not agent:
        return {"received": True}

    scheduled_at = info["start"] or now_iso()
    meeting = {
        "id": new_id(), "lead_id": lead["id"], "lead_name": lead["name"],
        "agent_id": agent["id"], "agent_name": agent["name"],
        "scheduled_at": scheduled_at, "duration": 30,
        "status": "scheduled", "source": "Calendly", "booking_driver": "",
        "no_show_reason": "", "reschedule_status": "", "outcome_notes": "",
        "join_url": info["join_url"] or "", "created_at": now_iso(),
    }
    if not meeting["join_url"]:
        # No Calendly-provided link -> try a real Google Meet on the agent's calendar.
        meeting["join_url"] = await create_google_meet(agent, lead, scheduled_at, 30) or ""
    await db.meetings.insert_one(meeting)

    if not lead.get("owner_id"):
        await _assign_lead(lead, agent, "Auto (Calendly)")
    await db.leads.update_one({"id": lead["id"]}, {"$set": {
        "stage": "Assigned", "next_meeting_at": scheduled_at, "updated_at": now_iso()}})
    await log_activity(lead["id"], "meeting", f"Calendly meeting booked with {agent['name']}", "Calendly")
    return {"received": True}

# ----------------------------------------------------------------------------
# Campaigns (Gmail outreach simulated)
# ----------------------------------------------------------------------------
@api.get("/campaigns")
async def list_campaigns(request: Request, admin: dict = Depends(require_admin)):
    campaigns = await db.campaigns.find({}).sort("created_at", -1).to_list(500)
    out = [clean(c) for c in campaigns]
    # Optional time-period filter (created-in-window). Backward compatible: only
    # applied when a period/from/to query param is present.
    if request.query_params.get("period") is not None \
            or request.query_params.get("from") is not None \
            or request.query_params.get("to") is not None:
        win_start, win_end, _ = resolve_period(request, default="all")
        out = [c for c in out if _in_window(c.get("created_at"), win_start, win_end)]
    return out

@api.post("/campaigns", response_model=CampaignOut)
async def create_campaign(body: CampaignIn, admin: dict = Depends(require_admin)):
    recipients = await db.leads.find({"monthly_spend": {"$gte": body.min_spend}}).to_list(2000)
    doc = {
        "id": new_id(), "name": body.name, "segment_label": body.segment_label,
        "min_spend": body.min_spend, "template_subject": body.template_subject,
        "template_body": body.template_body, "recipient_count": len(recipients),
        "sent_count": 0, "opened_count": 0, "replied_count": 0, "booked_count": 0,
        "status": "draft", "created_by": admin["name"], "created_at": now_iso(),
    }
    await db.campaigns.insert_one(doc)
    return clean(doc)

@api.post("/campaigns/{campaign_id}/send", response_model=CampaignOut)
async def send_campaign(campaign_id: str, admin: dict = Depends(require_admin)):
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    recipients = await db.leads.find({"monthly_spend": {"$gte": campaign["min_spend"]}}).to_list(2000)
    sent = len(recipients)
    # simulated Gmail engagement metrics
    opened = int(sent * random.uniform(0.45, 0.7))
    replied = int(opened * random.uniform(0.15, 0.35))
    booked = int(replied * random.uniform(0.3, 0.6))
    for lead in recipients:
        await db.leads.update_one({"id": lead["id"]}, {"$set": {"source": campaign["name"]}})
    await db.campaigns.update_one({"id": campaign_id}, {"$set": {
        "status": "sent", "sent_count": sent, "opened_count": opened,
        "replied_count": replied, "booked_count": booked, "sent_at": now_iso(),
    }})
    await log_audit("send_campaign", admin["name"], campaign["name"], f"{sent} recipients")
    return clean(await db.campaigns.find_one({"id": campaign_id}))

# ----------------------------------------------------------------------------
# Payments (Stripe live, Razorpay simulated)
# ----------------------------------------------------------------------------
@api.get("/payments/packages")
async def get_packages(user: dict = Depends(get_current_user)):
    return PRESET_PACKAGES

@api.get("/payments", response_model=List[PaymentOut])
async def list_payments(request: Request, user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "agent":
        q["agent_id"] = user["id"]
    payments = await db.payments.find(q).sort("created_at", -1).to_list(1000)
    return [clean(p) for p in payments]

def _resolve_payment_amount(body: "PaymentIn"):
    """Resolve (amount, currency, description, credits, boost_credits, multiplier) from a
    preset package and/or custom input. An explicit body.amount ALWAYS wins over the preset
    price so an agent can discount a deal; credits/boost can likewise be customised.

    Credit Top-Up uses multiplier pricing: credits delivered = round(amount * multiplier),
    where multiplier is clamped to (1, CREDIT_MULTIPLIER_MAX) and defaults to
    CREDIT_MULTIPLIER_DEFAULT. Legacy credits_* packages keep their fixed credits/boost."""
    pkg = PRESET_PACKAGES.get(body.package_id) if body.package_id else None

    # Detect a multiplier-priced Credit Top-Up. A legacy credits_* package with NO
    # multiplier and NO explicit credits override keeps its fixed-credit behaviour.
    is_credit_topup = (
        (pkg and pkg.get("product_line") == "Credit Top-Up")
        or body.multiplier is not None
        or bool(body.package_id and body.package_id.startswith("credits"))
    )
    legacy_fixed_credit = (
        is_credit_topup and pkg is not None
        and body.multiplier is None and body.credits is None
    )

    if is_credit_topup and not legacy_fixed_credit:
        # Multiplier pricing path — requires a USD amount (currency defaults to usd).
        if body.amount and body.amount > 0:
            amount = float(body.amount)
        elif pkg and pkg.get("amount"):
            amount = float(pkg["amount"])
        else:
            raise HTTPException(status_code=400, detail="A USD amount is required for a Credit Top-Up")
        currency = (body.currency or (pkg["currency"] if pkg else "usd")).lower()

        mult = body.multiplier if body.multiplier is not None else CREDIT_MULTIPLIER_DEFAULT
        # Clamp between 1 and the absolute hard cap (10).
        mult = max(1.0, min(float(mult), float(CREDIT_MULTIPLIER_MAX)))

        # Multiplier applies to the USD value; INR links convert first.
        amount_for_credits = amount
        if currency == "inr":
            try:
                amount_for_credits = amount / float(PRODUCT_LINES["Credit Top-Up"].get("inr_per_credit", 1) or 1)
            except Exception:
                amount_for_credits = amount
        credits = body.credits if body.credits is not None else int(round(amount_for_credits * mult))
        boost = None

        if body.description:
            desc = body.description
        else:
            dollar = f"${amount:,.0f}" if currency == "usd" else f"{currency.upper()} {amount:,.0f}"
            desc = f"Credit Top-Up - {dollar} -> {credits:,} credits ({mult:g}x)"

        return amount, currency, desc, credits, boost, mult

    # --- Non-credit / legacy fixed-credit path (unchanged behaviour) ---
    if body.amount and body.amount > 0:
        amount = float(body.amount)
        currency = (body.currency or (pkg["currency"] if pkg else "usd")).lower()
    elif pkg:
        amount, currency = float(pkg["amount"]), pkg["currency"]
    else:
        raise HTTPException(status_code=400, detail="A valid amount is required")

    credits = body.credits if body.credits is not None else (pkg.get("credits") if pkg else None)
    boost = body.boost_credits if body.boost_credits is not None else (pkg.get("boost_credits") if pkg else None)

    if body.description:
        desc = body.description
    elif credits:
        desc = f"{credits:,} Credits" + (f" (+{boost:,} boost)" if boost else "")
    elif pkg:
        desc = pkg["name"]
    else:
        desc = "Custom upsell"

    return amount, currency, desc, credits, boost, None


async def _create_stripe_link(body, amount, currency, payment_id, user):
    simulated = (
        f"cs_test_{payment_id[:12]}",
        f"{body.origin_url}/payment-return?session_id=cs_test_{payment_id[:12]}&pid={payment_id}",
    )
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return simulated
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=f"{body.origin_url}/api/webhook/stripe")
        req = CheckoutSessionRequest(
            amount=amount, currency=currency,
            success_url=f"{body.origin_url}/payment-return?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{body.origin_url}/payments",
            metadata={"lead_id": body.lead_id, "payment_id": payment_id, "agent_id": user["id"]},
        )
        session = await stripe_checkout.create_checkout_session(req)
        return session.session_id, session.url
    except Exception as e:
        logger.warning(f"Stripe live link failed, falling back to simulated: {e}")
        return simulated


async def _create_razorpay_link(body, amount, currency, payment_id, lead, fallback):
    """Real Razorpay Payment Link when RAZORPAY_KEY_ID/SECRET are set; else the simulated link.
    Returns (session_id, payment_link). Never raises — any error falls back to the mock."""
    key_id = os.environ.get("RAZORPAY_KEY_ID")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        return fallback
    try:
        import urllib.request, json as _json, base64
        payload = {
            "amount": int(round(amount * 100)),  # paise
            "currency": "INR",
            "description": body.description or "Emergent upsell",
            "customer": {"name": lead.get("name") or "", "email": lead.get("email") or ""},
            "notes": {"lead_id": body.lead_id, "payment_id": payment_id},
            "callback_url": f"{body.origin_url}/payment-return?provider=razorpay",
            "callback_method": "get",
        }
        data = _json.dumps(payload).encode("utf-8")
        req = urllib.request.Request("https://api.razorpay.com/v1/payment_links", data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        token = base64.b64encode(f"{key_id}:{key_secret}".encode("utf-8")).decode("ascii")
        req.add_header("Authorization", f"Basic {token}")
        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=15).read())
        resp = _json.loads(raw.decode("utf-8"))
        return resp.get("id") or fallback[0], resp.get("short_url") or fallback[1]
    except Exception as e:
        logger.warning(f"Razorpay live link failed, falling back to simulated: {e}")
        return fallback


@api.post("/payments/link")
async def create_payment_link(body: PaymentIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": body.lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    amount, currency, desc, credits, boost_credits, multiplier = _resolve_payment_amount(body)
    # convert everything to USD for reporting using the admin-managed FX rate
    fx_rate = await get_inr_rate()
    amount_usd = round(amount / fx_rate, 2) if currency == "inr" else round(amount, 2)

    product_line = package_product_line(body.package_id) or lead.get("product_line") or ""

    payment_id = new_id()
    record = {
        "id": payment_id, "lead_id": body.lead_id, "lead_name": lead["name"],
        "agent_id": user["id"], "agent_name": user["name"],
        "provider": body.provider, "amount": amount, "currency": currency,
        "credits": credits, "boost_credits": boost_credits, "multiplier": multiplier,
        "product_line": product_line, "package_id": body.package_id,
        "amount_usd": amount_usd, "fx_rate": fx_rate,
        "description": desc, "status": "initiated", "payment_status": "pending",
        "session_id": None, "payment_link": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }

    if body.provider == "stripe":
        record["session_id"], record["payment_link"] = await _create_stripe_link(body, amount, currency, payment_id, user)
    else:
        # Razorpay: real Payment Link when keys are present, else the simulated fallback link.
        simulated = (
            f"rzp_{payment_id[:12]}",
            f"{body.origin_url}/payment-return?session_id=rzp_{payment_id[:12]}&pid={payment_id}",
        )
        record["session_id"], record["payment_link"] = await _create_razorpay_link(
            body, amount, currency, payment_id, lead, simulated)

    await db.payments.insert_one(record)
    lead_set = {
        "stage": "Payment Link Sent", "sales_stage": "Payment Link Sent",
        "payment_status": "link_sent", "payment_state": "Link Sent", "outcome": "",
        "priority": "Payment Pending", "provider": body.provider,
        "updated_at": now_iso(), "last_activity": now_iso(),
    }
    if product_line:
        lead_set["product_line"] = product_line
    if body.package_id:
        lead_set["package_id"] = body.package_id
    lead_set["amount"] = amount
    lead_set["currency"] = currency
    await db.leads.update_one({"id": body.lead_id}, {"$set": lead_set})
    await log_activity(body.lead_id, "payment", f"{body.provider.title()} payment link sent: {currency.upper()} {amount:.0f} (~${amount_usd:.0f})", user["name"])
    return clean(record)

@api.get("/payments/status/{session_id}", response_model=PaymentOut)
async def payment_status(session_id: str, user: dict = Depends(get_current_user)):
    record = await db.payments.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")

    if record["payment_status"] == "paid":
        return clean(record)

    if record["provider"] == "stripe":
        api_key = os.environ.get("STRIPE_API_KEY")
        if api_key:
            try:
                from emergentintegrations.payments.stripe.checkout import StripeCheckout
                stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
                status = await stripe_checkout.get_checkout_status(session_id)
                await _apply_payment_status(record, status.status, status.payment_status)
            except Exception as e:
                logger.warning(f"Stripe status lookup failed, keeping existing status: {e}")
    record = await db.payments.find_one({"session_id": session_id})
    return clean(record)

@api.post("/payments/simulate/{session_id}", response_model=PaymentOut)
async def simulate_payment(session_id: str, user: dict = Depends(get_current_user)):
    """Simulate completion of a Razorpay (mock) payment link."""
    record = await db.payments.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")
    await _apply_payment_status(record, "complete", "paid")
    return clean(await db.payments.find_one({"session_id": session_id}))

@api.post("/payments/fail/{session_id}", response_model=PaymentOut)
async def fail_payment(session_id: str, user: dict = Depends(get_current_user)):
    """Simulate a failed payment link (demo) — moves the lead to the recoverable
    'Payment Link Failed' status. Never crashes."""
    record = await db.payments.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")
    await _apply_payment_status(record, "failed", "failed")
    return clean(await db.payments.find_one({"session_id": session_id}))

async def _apply_payment_status(record: dict, status: str, payment_status: str):
    if record["payment_status"] == "paid":
        return
    update = {"status": status, "payment_status": payment_status, "updated_at": now_iso()}
    await db.payments.update_one({"id": record["id"]}, {"$set": update})
    if payment_status == "paid":
        amt_usd = record.get("amount_usd", record["amount"])
        lead_set = {
            "stage": "Won", "sales_stage": "Payment Link Sent",
            "outcome": "Won", "payment_status": "paid", "payment_state": "Paid",
            "priority": "None", "owner_locked": True,
            "won_at": now_iso(), "updated_at": now_iso(), "last_activity": now_iso(),
            "next_action": "View customer / ask for referral",
        }
        if record.get("product_line"):
            lead_set["product_line"] = record["product_line"]
        await db.leads.update_one({"id": record["lead_id"]}, {
            "$set": lead_set,
            "$inc": {"total_revenue_usd": amt_usd, "deals_won": 1},
        })
        await log_activity(record["lead_id"], "payment",
                           f"Payment completed: {record['currency'].upper()} {record['amount']:.0f} (~${record.get('amount_usd', record['amount']):.0f}) 🎉",
                           record["agent_name"])
    elif payment_status in ("failed", "expired", "canceled", "cancelled"):
        # Payment Link Failed -> recoverable (spec §4). Keep the lead in the active
        # journey; don't lock or count revenue.
        await db.leads.update_one({"id": record["lead_id"]}, {"$set": {
            "payment_state": "Failed", "sales_stage": "Payment Link Sent",
            "priority": "Follow-up This Week",
            "updated_at": now_iso(), "last_activity": now_iso(),
            "next_action": "Retry payment link",
        }})
        await log_activity(record["lead_id"], "payment",
                           f"Payment link {payment_status} — recoverable", record.get("agent_name") or "System")

@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return {"received": True}
    body = await request.body()
    sig = request.headers.get("Stripe-Signature")
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
        event = await stripe_checkout.handle_webhook(body, sig)
        record = await db.payments.find_one({"session_id": event.session_id})
        if record:
            await _apply_payment_status(record, "complete", event.payment_status)
    except Exception as e:
        logger.error(f"webhook error: {e}")
    return {"received": True}

@api.post("/webhook/razorpay")
async def razorpay_webhook(request: Request):
    """Razorpay Payment Link webhook. Verifies the signature when
    RAZORPAY_WEBHOOK_SECRET is set (demo mode accepts unsigned), then marks the
    matching payment paid/failed. Never crashes."""
    raw = await request.body()
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET")
    if secret:
        try:
            import hmac, hashlib
            sig = request.headers.get("X-Razorpay-Signature", "")
            expected = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, sig):
                raise HTTPException(status_code=401, detail="Invalid Razorpay signature")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Razorpay signature verify error: {e}")
            raise HTTPException(status_code=401, detail="Invalid Razorpay signature")
    try:
        import json as _json
        body = _json.loads(raw.decode("utf-8") or "{}")
    except Exception:
        return {"received": True}
    event = body.get("event") or ""
    payload = body.get("payload") or {}
    plink = ((payload.get("payment_link") or {}).get("entity")) or {}
    payment_ent = ((payload.get("payment") or {}).get("entity")) or {}
    link_id = plink.get("id") or payment_ent.get("payment_link_id")
    record = await db.payments.find_one({"session_id": link_id}) if link_id else None
    if record:
        if event in ("payment_link.paid", "payment.captured", "order.paid"):
            await _apply_payment_status(record, "complete", "paid")
        elif event in ("payment.failed", "payment_link.cancelled", "payment_link.expired"):
            await _apply_payment_status(record, "failed", "failed")
    return {"received": True}

# ----------------------------------------------------------------------------
# Dashboard / Reporting
# ----------------------------------------------------------------------------
def _revenue(payments, status):
    return sum(p.get("amount_usd", p["amount"]) for p in payments if p["payment_status"] == status)


def _booking_driver_stats(meetings, won_lead_ids):
    """Attribute meetings to the hook that drove them (and which convert)."""
    stats = {}
    for m in meetings:
        d = m.get("booking_driver") or "Unspecified"
        s = stats.setdefault(d, {"driver": d, "meetings": 0, "completed": 0, "won": 0})
        s["meetings"] += 1
        if m.get("status") == "completed":
            s["completed"] += 1
        if m.get("lead_id") in won_lead_ids:
            s["won"] += 1
    return sorted(stats.values(), key=lambda x: x["meetings"], reverse=True)


def _agent_leaderboard(agents, leads, meetings, payments):
    rows = []
    for a in agents:
        a_leads = [l for l in leads if l.get("owner_id") == a["id"]]
        a_meetings = [m for m in meetings if m["agent_id"] == a["id"]]
        a_revenue = sum(
            p.get("amount_usd", p["amount"]) for p in payments
            if p["agent_id"] == a["id"] and p["payment_status"] == "paid"
        )
        rows.append({
            "id": a["id"], "name": a["name"], "avatar_url": a.get("avatar_url"),
            "leads": len(a_leads), "won": len([l for l in a_leads if l.get("_status") == "Payment Link Paid" or l.get("stage") == "Won"]),
            "meetings": len(a_meetings), "revenue": a_revenue,
            "target": a.get("monthly_target", 0),
        })
    return sorted(rows, key=lambda x: x["revenue"], reverse=True)


@api.get("/activities/recent", response_model=List[ActivityOut], response_model_exclude_none=True)
async def recent_activities(request: Request, user: dict = Depends(get_current_user)):
    """Global recent-activity feed for the dashboard. Admins see all activity;
    agents see only activity on the leads they own. Each item is enriched with the
    lead's display name so the UI can show context."""
    try:
        limit = int(request.query_params.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 100))

    lead_filter = {}
    if user["role"] != "admin":
        owned = await db.leads.find({"owner_id": user["id"]}, {"_id": 0, "id": 1}).to_list(5000)
        lead_filter = {"lead_id": {"$in": [l["id"] for l in owned]}}

    activities = await db.activities.find(lead_filter).sort("created_at", -1).to_list(limit)

    lead_ids = list({a.get("lead_id") for a in activities if a.get("lead_id")})
    name_map = {}
    if lead_ids:
        named = await db.leads.find({"id": {"$in": lead_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(lead_ids))
        name_map = {l["id"]: l.get("name") for l in named}

    out = []
    for a in activities:
        a = clean(a)
        a["lead_name"] = name_map.get(a.get("lead_id"), "")
        out.append(a)
    return out


@api.get("/dashboard", response_model=DashboardOut, response_model_exclude_none=True)
async def dashboard(request: Request, user: dict = Depends(get_current_user)):
    is_admin = user["role"] == "admin"
    scope = {} if is_admin else {"owner_id": user["id"]}
    agent_scope = {} if is_admin else {"agent_id": user["id"]}

    # Time-period window (Salesforce/Zoho style). Default = this_month.
    # Revenue = payments PAID in-window; funnel/status/group counts = leads CREATED
    # in-window. Open pipeline + meetings-today intentionally ignore the window
    # (they describe current state, not a historical slice).
    win_start, win_end, period_used = resolve_period(request, default="this_month")

    leads = await db.leads.find(scope, {"_id": 0, "id": 1, "stage": 1, "sales_stage": 1,
        "outcome": 1, "payment_status": 1, "payment_state": 1, "priority": 1, "owner_id": 1,
        "product_line": 1, "amount": 1, "currency": 1, "monthly_spend": 1, "total_revenue_usd": 1,
        "created_at": 1, "won_at": 1}).to_list(5000)
    meetings = await db.meetings.find(agent_scope, {"_id": 0, "id": 1, "lead_id": 1, "lead_name": 1, "agent_id": 1, "agent_name": 1, "scheduled_at": 1, "completed_at": 1, "status": 1, "source": 1, "booking_driver": 1, "duration": 1}).to_list(5000)
    payments = await db.payments.find(agent_scope, {"_id": 0, "amount": 1, "amount_usd": 1, "payment_status": 1, "agent_id": 1, "product_line": 1, "lead_id": 1, "created_at": 1}).to_list(5000)

    # Window-scoped slices. `leads` keeps the full set for open-pipeline (current
    # state); `win_leads` is the created-in-window slice for funnel counts.
    win_leads = [l for l in leads if _in_window(l.get("created_at"), win_start, win_end)]
    win_payments = [p for p in payments if _in_window(p.get("created_at"), win_start, win_end)]

    # Admin-managed FX rate (INR per USD) so per-deal INR amounts roll up correctly.
    inr_rate = await get_inr_rate()

    # Attach the derived status to each lead so all rollups use one source of truth.
    # (Applied to the full set so both windowed and current-state rollups can read it.)
    for l in leads:
        st = derive_status(
            l.get("sales_stage") or map_legacy_stage(l.get("stage", "New Booking"), l.get("payment_status", ""))["stage"],
            l.get("outcome", "") or map_legacy_stage(l.get("stage", "New Booking"), l.get("payment_status", ""))["outcome"],
            l.get("payment_state") or map_legacy_stage(l.get("stage", "New Booking"), l.get("payment_status", ""))["payment_status"],
        )
        l["_status"] = st
        l["_groups"] = status_group(st)

    def _deal_val(l):
        val = float(l.get("amount") or 0)
        if (l.get("currency") or "usd") == "inr" and val:
            val = round(val / inr_rate, 2)
        if not val:
            val = float(l.get("monthly_spend") or 0)
        return val

    # Funnel counts = leads CREATED in the window (this_month default).
    stage_counts = {s: 0 for s in PIPELINE_STAGES}
    for l in win_leads:
        stage_counts[l.get("stage", "New Booking")] = stage_counts.get(l.get("stage", "New Booking"), 0) + 1

    status_counts = {s: 0 for s in VISIBLE_STATUSES}
    win_group_counts = {g: {"count": 0, "value_usd": 0.0} for g in STATUS_GROUPS}
    for l in win_leads:
        st = l["_status"]
        status_counts[st] = status_counts.get(st, 0) + 1
        for g in l["_groups"]:
            win_group_counts[g]["count"] += 1
            win_group_counts[g]["value_usd"] += _deal_val(l)

    # Open-pipeline / recoverable / lost describe CURRENT state across all in-scope
    # leads (not a historical window slice) per the "open pipeline = open leads" rule.
    open_group_counts = {g: {"count": 0, "value_usd": 0.0} for g in STATUS_GROUPS}
    for l in leads:
        for g in l["_groups"]:
            open_group_counts[g]["count"] += 1
            open_group_counts[g]["value_usd"] += _deal_val(l)

    # Product-line revenue cards: won (paid in-window) revenue + count, and open
    # pipeline value (current state).
    product_revenue = {pl: {"won_revenue": 0.0, "won_count": 0, "pipeline_value": 0.0, "pipeline_count": 0}
                       for pl in PRODUCT_LINE_NAMES}
    for p in win_payments:
        pl = p.get("product_line") or ""
        if pl in product_revenue and p.get("payment_status") == "paid":
            product_revenue[pl]["won_revenue"] += p.get("amount_usd", p.get("amount", 0)) or 0
            product_revenue[pl]["won_count"] += 1
    for l in leads:
        pl = l.get("product_line") or ""
        if pl in product_revenue and "Active Pipeline" in l["_groups"]:
            product_revenue[pl]["pipeline_value"] += _deal_val(l)
            product_revenue[pl]["pipeline_count"] += 1

    today = datetime.now(timezone.utc).date().isoformat()
    meetings_today = [m for m in meetings if (m.get("scheduled_at") or "").startswith(today)]
    completed_today = [m for m in meetings if (m.get("completed_at") or "").startswith(today) and m["status"] == "completed"]
    noshow_today = [m for m in meetings if (m.get("completed_at") or "").startswith(today) and m["status"] == "no_show"]
    won_lead_ids = {l["id"] for l in leads if l["_status"] == "Payment Link Paid"}

    result = {
        "is_admin": is_admin,
        "period": period_used,
        "period_start": win_start,
        "period_end": win_end,
        "total_leads": len(win_leads),
        "stage_counts": stage_counts,
        "status_counts": status_counts,
        # Funnel/window group rollup (created-in-window).
        "group_counts": win_group_counts,
        "product_revenue": product_revenue,
        "meetings_today": len(meetings_today),
        "meetings_today_list": [serialize_meeting(m) for m in meetings_today],
        "completed_today": len(completed_today),
        # No-show reporting now driven by the outcome model (spec §3): meetings flagged
        # no_show today PLUS leads whose outcome is No-Show.
        "noshow_today": len(noshow_today),
        "noshow_total": status_counts.get("No-Show", 0),
        "revenue_won": _revenue(win_payments, "paid"),
        # Open pipeline value = Active Pipeline group deal value (current state).
        "pipeline_value": round(open_group_counts["Active Pipeline"]["value_usd"], 2),
        "recoverable_count": open_group_counts["Recoverable"]["count"],
        "recoverable_value": round(open_group_counts["Recoverable"]["value_usd"], 2),
        "lost_count": open_group_counts["Lost"]["count"],
        # Payment pending = Payment Link Sent status (awaiting payment), not failed/paid.
        "payment_pending": status_counts.get("Payment Link Sent", 0),
        "payment_failed": status_counts.get("Payment Link Failed", 0),
        "follow_up": len([l for l in leads if l.get("priority") == "Follow-up This Week"]),
        "hot": len([l for l in leads if l.get("priority") == "Hot"]),
        "target": 0 if is_admin else user.get("monthly_target", 0),
        "weekly_target": 0 if is_admin else user.get("weekly_target", 0),
        "won_count": status_counts.get("Payment Link Paid", 0),
        "booking_drivers": _booking_driver_stats(meetings, won_lead_ids),
    }

    if is_admin:
        agents = await db.users.find({"role": "agent"}).to_list(100)
        result["team_target"] = sum(a.get("monthly_target", 0) for a in agents)
        # Leaderboard reflects the window: leads created in-window + payments paid in-window.
        result["per_agent"] = _agent_leaderboard(agents, win_leads, meetings, win_payments)
    return result

@api.get("/settings", response_model=SettingsOut)
async def get_settings(user: dict = Depends(get_current_user)):
    return {"inr_per_usd": await get_inr_rate()}

@api.put("/settings", response_model=SettingsOut)
async def update_settings(body: SettingsIn, admin: dict = Depends(require_admin)):
    if body.inr_per_usd <= 0:
        raise HTTPException(status_code=400, detail="Rate must be positive")
    await db.settings.update_one({"id": "settings"}, {"$set": {
        "id": "settings", "inr_per_usd": float(body.inr_per_usd),
        "updated_by": admin["name"], "updated_at": now_iso()}}, upsert=True)
    await log_audit("update_fx_rate", admin["name"], "INR/USD", f"{body.inr_per_usd} INR per USD")
    return {"inr_per_usd": float(body.inr_per_usd)}

def _cov_blank(label):
    return {"label": label, "total": 0, "assigned": 0, "met": 0, "advanced": 0, "won": 0, "revenue_usd": 0.0}


def _cov_group_stats(leads, met_ids, rev_by_lead, group_fn, order):
    groups = {o: _cov_blank(o) for o in order}
    for l in leads:
        label = group_fn(l)
        g = groups.get(label) or _cov_blank(label)
        groups[label] = g
        g["total"] += 1
        if l.get("owner_id"):
            g["assigned"] += 1
        if l["id"] in met_ids:
            g["met"] += 1
        if l.get("stage") in ("Payment Link Sent", "Won"):
            g["advanced"] += 1
        if l.get("stage") == "Won":
            g["won"] += 1
        g["revenue_usd"] += rev_by_lead.get(l["id"], 0.0)
    return [groups[o] for o in order]


def _cov_week_start(iso):
    d = datetime.fromisoformat(iso).astimezone(timezone.utc)
    return (d - timedelta(days=d.weekday())).date()


def _cov_weekly_burnup(leads):
    """Cumulative weekly scope(total) vs covered(assigned) vs won, used as a fallback
    when no daily snapshots exist yet."""
    created = [_cov_week_start(l["created_at"]) for l in leads if l.get("created_at")]
    if not created:
        return []
    assigned_weeks = []
    for l in leads:
        if l.get("ownership_history"):
            assigned_weeks.append(_cov_week_start(l["ownership_history"][0]["at"]))
        elif l.get("owner_id") and l.get("created_at"):
            assigned_weeks.append(_cov_week_start(l["created_at"]))
    won_weeks = [_cov_week_start(l["won_at"]) for l in leads if l.get("won_at")]

    c_created, c_assigned, c_won = Counter(created), Counter(assigned_weeks), Counter(won_weeks)
    wk, end = min(created), datetime.now(timezone.utc).date()
    cum_t = cum_a = cum_w = 0
    out, guard = [], 0
    while wk <= end and guard < 104:
        cum_t += c_created.get(wk, 0)
        cum_a += c_assigned.get(wk, 0)
        cum_w += c_won.get(wk, 0)
        out.append({"week": wk.isoformat(), "total": cum_t, "covered": cum_a, "won": cum_w})
        wk = wk + timedelta(days=7)
        guard += 1
    return out


async def _cov_persist_snapshot(totals):
    snap_today = datetime.now(timezone.utc).date().isoformat()
    await db.coverage_snapshots.update_one(
        {"id": snap_today},
        {"$set": {
            "id": snap_today, "date": snap_today,
            "total": totals["total"], "assigned": totals["assigned"], "met": totals["met"],
            "advanced": totals["advanced"], "won": totals["won"], "revenue_usd": totals["revenue_usd"],
            "updated_at": now_iso(),
        }},
        upsert=True,
    )


@api.get("/coverage")
async def coverage(admin: dict = Depends(require_admin)):
    leads = await db.leads.find({}, {"_id": 0, "id": 1, "owner_id": 1, "stage": 1, "monthly_spend": 1, "lifetime_value": 1, "region": 1, "created_at": 1, "won_at": 1, "ownership_history": 1}).to_list(5000)
    meetings = await db.meetings.find({}, {"_id": 0, "lead_id": 1}).to_list(5000)
    paid = await db.payments.find({"payment_status": "paid"}, {"_id": 0, "lead_id": 1, "amount": 1, "amount_usd": 1}).to_list(5000)

    met_ids = {m["lead_id"] for m in meetings}
    rev_by_lead = {}
    for p in paid:
        rev_by_lead[p["lead_id"]] = rev_by_lead.get(p["lead_id"], 0.0) + p.get("amount_usd", p["amount"])

    tier_order = [t[0] for t in USAGE_TIERS]
    by_tier_spend = _cov_group_stats(leads, met_ids, rev_by_lead, lambda l: tier_label(l.get("monthly_spend", 0)), tier_order)
    by_tier_ltv = _cov_group_stats(leads, met_ids, rev_by_lead, lambda l: tier_label(l.get("lifetime_value", 0)), tier_order)
    by_region = _cov_group_stats(leads, met_ids, rev_by_lead, lambda l: l.get("region") or "Other", REGIONS)

    burnup = _cov_weekly_burnup(leads)

    totals = _cov_blank("All")
    for g in by_region:
        for k in ("total", "assigned", "met", "advanced", "won", "revenue_usd"):
            totals[k] += g[k]

    # Persist today's coverage snapshot (lazy daily capture) so the burn-up
    # reflects real historical progress over time, not a single point.
    await _cov_persist_snapshot(totals)

    # Prefer the stored daily snapshots (real history) over the weekly estimate.
    snaps = await db.coverage_snapshots.find({}, {"_id": 0}).sort("date", 1).to_list(400)
    if snaps:
        burnup = [
            {"week": s["date"], "date": s["date"], "total": s.get("total", 0),
             "covered": s.get("assigned", 0), "won": s.get("won", 0)}
            for s in snaps
        ]

    return {
        "tiers": tier_order, "regions": REGIONS,
        "by_tier_spend": by_tier_spend, "by_tier_ltv": by_tier_ltv,
        "by_region": by_region, "burnup": burnup, "totals": totals,
    }

@api.get("/audit-logs")
async def audit_logs(admin: dict = Depends(require_admin)):
    logs = await db.audit_logs.find({}).sort("created_at", -1).to_list(500)
    return [clean(l) for l in logs]

@api.get("/meta")
async def meta(user: dict = Depends(get_current_user)):
    # Legacy keys (stages/priorities/booking_drivers) preserved for existing clients/tests;
    # the new sales-status model + product lines are added alongside.
    return {
        "stages": PIPELINE_STAGES,
        "priorities": PRIORITIES,
        "booking_drivers": BOOKING_DRIVERS,
        # --- New sales-status model (Emergent Dark Sales Console) ---
        "sales_stages": SALES_STAGES,
        "outcomes": OUTCOMES,
        "payment_states": PAYMENT_STATES,
        "statuses": VISIBLE_STATUSES,           # the 10 visible statuses for filters/badges
        "status_meta": STATUS_META,             # tone + filled per status
        "status_groups": STATUS_GROUPS,         # reporting groups -> members
        # --- Products / providers ---
        "product_lines": PRODUCT_LINE_NAMES,
        "product_catalog": PRODUCT_LINES,
        "packages": PRESET_PACKAGES,
        "credit_multiplier": {
            "min": CREDIT_MULTIPLIER_MIN,
            "default": CREDIT_MULTIPLIER_DEFAULT,
            "max": CREDIT_MULTIPLIER_MAX,
        },
        "providers": ["razorpay", "stripe", "manual"],
        "regions": REGIONS,
        "usage_tiers": [t[0] for t in USAGE_TIERS],
    }

# ----------------------------------------------------------------------------
# Customers (for the "referred by" picker)
# ----------------------------------------------------------------------------
@api.get("/customers")
async def list_customers(user: dict = Depends(get_current_user)):
    """Existing customers usable as referrers. A customer = stage 'Won' OR deals_won>0.
    RBAC mirrors the lead lists: admin sees all, agents see their own."""
    scope = {} if user["role"] == "admin" else {"owner_id": user["id"]}
    q = {"$and": [scope, {"$or": [{"stage": "Won"}, {"deals_won": {"$gt": 0}}]}]} if scope else \
        {"$or": [{"stage": "Won"}, {"deals_won": {"$gt": 0}}]}
    proj = {"_id": 0, "id": 1, "name": 1, "company": 1, "email": 1}
    rows = await db.leads.find(q, proj).sort("name", 1).to_list(2000)
    # Fallback: if no won/customer leads exist yet, return all in-scope leads minimally
    # so the picker is never empty when there is data to reference.
    if not rows:
        rows = await db.leads.find(scope, proj).sort("name", 1).to_list(2000)
    return [{"id": r.get("id"), "name": r.get("name"), "company": r.get("company") or "",
             "email": r.get("email") or ""} for r in rows]

# ----------------------------------------------------------------------------
# Dashboard / coverage drill-downs (records behind each headline number)
# ----------------------------------------------------------------------------
OPEN_STAGES = ["New Booking", "Assigned", "Meeting Completed", "Payment Link Sent", "Follow-up Later"]

def _lead_row(l: dict) -> dict:
    sl = serialize_lead(dict(l))
    return {
        "id": l.get("id"), "lead_id": l.get("id"), "name": l.get("name"),
        "company": l.get("company") or "", "email": l.get("email") or "",
        "stage": l.get("stage"), "priority": l.get("priority"),
        "sales_stage": sl.get("sales_stage"), "outcome": sl.get("outcome"),
        "payment_state": sl.get("payment_state"), "status": sl.get("status"),
        "status_tone": sl.get("status_tone"), "status_groups": sl.get("status_groups"),
        "product_line": l.get("product_line") or "", "next_action": sl.get("next_action"),
        "provider": l.get("provider") or "",
        "agent_name": l.get("owner_name"), "agent_id": l.get("owner_id"),
        "amount_usd": l.get("monthly_spend") or 0.0, "amount": l.get("monthly_spend") or 0.0,
        "monthly_spend": l.get("monthly_spend") or 0.0,
        "lifetime_value": l.get("lifetime_value") or 0.0,
        "region": l.get("region") or "Other", "updated_at": l.get("updated_at"),
    }

def _meeting_row(m: dict) -> dict:
    return {
        "id": m.get("id"), "lead_id": m.get("lead_id"), "name": m.get("lead_name"),
        "lead_name": m.get("lead_name"), "agent_id": m.get("agent_id"),
        "agent_name": m.get("agent_name"), "scheduled_at": m.get("scheduled_at"),
        "duration": m.get("duration"), "status": m.get("status"),
        "source": m.get("source"), "booking_driver": m.get("booking_driver"),
        "no_show_reason": m.get("no_show_reason"), "join_url": m.get("join_url") or "",
        "recording_url": m.get("recording_url"), "summary": m.get("summary"),
    }

def _payment_row(p: dict) -> dict:
    return {
        "id": p.get("id"), "lead_id": p.get("lead_id"), "name": p.get("lead_name"),
        "lead_name": p.get("lead_name"), "agent_id": p.get("agent_id"),
        "agent_name": p.get("agent_name"),
        "amount": p.get("amount"), "amount_usd": p.get("amount_usd", p.get("amount")),
        "currency": p.get("currency"), "description": p.get("description"),
        "payment_status": p.get("payment_status"), "created_at": p.get("created_at"),
    }

@api.get("/dashboard/drilldown")
async def dashboard_drilldown(request: Request, user: dict = Depends(get_current_user)):
    """Return the actual records behind a dashboard metric. RBAC scoped like /dashboard."""
    metric = request.query_params.get("metric") or ""
    is_admin = user["role"] == "admin"
    lead_scope = {} if is_admin else {"owner_id": user["id"]}
    agent_scope = {} if is_admin else {"agent_id": user["id"]}
    today = datetime.now(timezone.utc).date().isoformat()

    # Time-period window (mirrors /dashboard; default this_month). Closed-revenue +
    # the funnel status/group/stage drilldowns honour the window via created_at;
    # open-pipeline / today metrics describe current state and ignore it.
    win_start, win_end, period_used = resolve_period(request, default="this_month")

    title, items = metric, []

    if metric == "revenue_closed":
        title = "Closed Revenue"
        q = {**agent_scope, "payment_status": "paid"}
        rows = await db.payments.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
        items = [_payment_row(p) for p in rows if _in_window(p.get("created_at"), win_start, win_end)]

    elif metric == "open_pipeline":
        title = "Open Pipeline"
        q = {**lead_scope, "stage": {"$in": OPEN_STAGES}}
        rows = await db.leads.find(q, {"_id": 0}).sort("updated_at", -1).to_list(5000)
        items = [_lead_row(l) for l in rows]

    elif metric == "meetings_today":
        title = "Meetings Today"
        rows = await db.meetings.find(agent_scope, {"_id": 0}).sort("scheduled_at", 1).to_list(5000)
        items = [_meeting_row(m) for m in rows if (m.get("scheduled_at") or "").startswith(today)]

    elif metric == "no_shows_today":
        title = "No-Shows Today"
        rows = await db.meetings.find({**agent_scope, "status": "no_show"}, {"_id": 0}).to_list(5000)
        items = [_meeting_row(m) for m in rows if (m.get("completed_at") or "").startswith(today)]

    elif metric == "payment_pending":
        title = "Payment Pending"
        q = {**lead_scope, "$or": [{"priority": "Payment Pending"}, {"stage": "Payment Link Sent"}]}
        rows = await db.leads.find(q, {"_id": 0}).sort("updated_at", -1).to_list(5000)
        items = [_lead_row(l) for l in rows]

    elif metric == "recoverable":
        title = "Recoverable"
        rows = await db.leads.find(lead_scope, {"_id": 0}).sort("updated_at", -1).to_list(5000)
        items = [r for r in (_lead_row(l) for l in rows) if "Recoverable" in (r.get("status_groups") or [])]

    elif metric == "payment_failed":
        title = "Payment Link Failed"
        rows = await db.leads.find(lead_scope, {"_id": 0}).sort("updated_at", -1).to_list(5000)
        items = [r for r in (_lead_row(l) for l in rows) if r.get("status") == "Payment Link Failed"]

    elif metric.startswith("status:"):
        status = metric.split(":", 1)[1]
        title = f"Status - {status}"
        rows = await db.leads.find(lead_scope, {"_id": 0}).sort("updated_at", -1).to_list(5000)
        rows = [l for l in rows if _in_window(l.get("created_at"), win_start, win_end)]
        items = [r for r in (_lead_row(l) for l in rows) if r.get("status") == status]

    elif metric.startswith("group:"):
        group = metric.split(":", 1)[1]
        title = f"Group - {group}"
        rows = await db.leads.find(lead_scope, {"_id": 0}).sort("updated_at", -1).to_list(5000)
        rows = [l for l in rows if _in_window(l.get("created_at"), win_start, win_end)]
        items = [r for r in (_lead_row(l) for l in rows) if group in (r.get("status_groups") or [])]

    elif metric.startswith("stage:"):
        stage = metric.split(":", 1)[1]
        title = f"Stage - {stage}"
        # Accept either a legacy PIPELINE_STAGES value OR a new visible status.
        rows = await db.leads.find(lead_scope, {"_id": 0}).sort("updated_at", -1).to_list(5000)
        rows = [l for l in rows if _in_window(l.get("created_at"), win_start, win_end)]
        if stage in PIPELINE_STAGES:
            items = [_lead_row(l) for l in rows if l.get("stage") == stage]
        else:
            items = [r for r in (_lead_row(l) for l in rows) if r.get("status") == stage]

    return {"title": title, "period": period_used, "items": items}

@api.get("/coverage/drilldown")
async def coverage_drilldown(request: Request, admin: dict = Depends(require_admin)):
    """Return the leads in a coverage cell. basis=spend|ltv selects the value used for
    tier matching; tier and region are optional filters (either or both)."""
    basis = (request.query_params.get("basis") or "spend").lower()
    tier = request.query_params.get("tier")
    region = request.query_params.get("region")
    field = "lifetime_value" if basis == "ltv" else "monthly_spend"

    rows = await db.leads.find({}, {"_id": 0}).sort("updated_at", -1).to_list(5000)
    out = []
    for l in rows:
        if tier and tier_label(l.get(field, 0)) != tier:
            continue
        if region and (l.get("region") or "Other") != region:
            continue
        out.append(_lead_row(l))

    parts = [p for p in [region, tier] if p]
    title = "Coverage - " + (" / ".join(parts) if parts else "All")
    return {"title": title, "basis": basis, "tier": tier, "region": region, "items": out}

# ----------------------------------------------------------------------------
# Calendar (booked meeting schedule, per-agent)
# ----------------------------------------------------------------------------
@api.get("/calendar")
async def calendar(request: Request, user: dict = Depends(get_current_user)):
    """Booked meeting schedule for the calendar view.
    RBAC: agents are forced to their own meetings; admin (sales head) may pass a
    specific agent_id, or omit / 'all' to see every agent's meetings."""
    is_admin = user["role"] == "admin"
    req_agent = request.query_params.get("agent_id")
    date_filter = request.query_params.get("date")

    q = {}
    if is_admin:
        if req_agent and req_agent != "all":
            q["agent_id"] = req_agent
    else:
        q["agent_id"] = user["id"]  # agents see only their own

    meetings = await db.meetings.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(5000)
    rows = [_meeting_row(m) for m in meetings]
    if date_filter:
        rows = [m for m in rows if (m.get("scheduled_at") or "").startswith(date_filter)]

    # Agent list for per-agent columns/rows: all agents for admin, just self otherwise.
    if is_admin:
        agent_docs = await db.users.find({"role": "agent"}, {"_id": 0, "id": 1, "name": 1}).sort("created_at", 1).to_list(200)
        agents = [{"id": a.get("id"), "name": a.get("name")} for a in agent_docs]
    else:
        agents = [{"id": user["id"], "name": user["name"]}]

    return {"agents": agents, "meetings": rows}

# ----------------------------------------------------------------------------
# Seeding
# ----------------------------------------------------------------------------
async def _seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "diyea@emergent.sh").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "leader123")
    admin = await db.users.find_one({"email": admin_email})
    if not admin:
        created = await _safe_insert(db.users, {
            "id": new_id(), "name": "Diyea", "email": admin_email,
            "password_hash": hash_password(admin_password), "role": "admin",
            # Empty by default -> UI falls back to initials until an avatar is uploaded.
            "avatar_url": "",
            "monthly_target": 0, "weekly_target": 0, "active": True, "created_at": now_iso(),
        })
        logger.info(f"seed: admin {'created' if created else 'already present (race)'} -> {admin_email}")
    elif not verify_password(admin_password, admin.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info(f"seed: admin password self-healed -> {admin_email}")


async def _seed_agents():
    agents_data = [
        ("Aryan", "aryan.f@emergent.sh"),
        ("Dipan", "dipan@emergent.sh"),
        ("Vinay", "vinay.p@emergent.sh"),
        ("Brian", "brian@emergent.sh"),
        ("Abhishek", "abhishek@emergent.sh"),
    ]
    # Idempotent per-agent: ensures Abhishek (added later) lands even on an already-seeded DB.
    for i, (name, email) in enumerate(agents_data):
        if await db.users.find_one({"email": email.lower()}):
            continue
        # Empty avatar by default -> UI falls back to initials until one is uploaded.
        await _safe_insert(db.users, {
            "id": new_id(), "name": name, "email": email.lower(),
            "password_hash": hash_password("agent123"), "role": "agent",
            "avatar_url": "", "monthly_target": 25000.0,
            "weekly_target": 6250.0, "active": True, "created_at": now_iso(),
        })


# Map a target visible status -> the full (stage, sales_stage, outcome, payment_status,
# payment_state) field set so seeded leads exercise every part of the new model.
def _status_fields(status: str) -> dict:
    base = {"stage": "New Booking", "sales_stage": "New / Needs Review",
            "outcome": "", "payment_status": "none", "payment_state": "Not Sent"}
    table = {
        "New / Needs Review":  {**base},
        "Contacted":           {"stage": "Assigned", "sales_stage": "Contacted", "outcome": "", "payment_status": "none", "payment_state": "Not Sent"},
        "Interested":          {"stage": "Meeting Completed", "sales_stage": "Interested", "outcome": "", "payment_status": "none", "payment_state": "Not Sent"},
        "Contact in Future":   {"stage": "Follow-up Later", "sales_stage": "Contact in Future", "outcome": "", "payment_status": "none", "payment_state": "Not Sent"},
        "Payment Link Sent":   {"stage": "Payment Link Sent", "sales_stage": "Payment Link Sent", "outcome": "", "payment_status": "link_sent", "payment_state": "Link Sent"},
        "Payment Link Failed": {"stage": "Payment Link Sent", "sales_stage": "Payment Link Sent", "outcome": "", "payment_status": "failed", "payment_state": "Failed"},
        "Payment Link Paid":   {"stage": "Won", "sales_stage": "Payment Link Sent", "outcome": "Won", "payment_status": "paid", "payment_state": "Paid"},
        "No-Show":             {"stage": "Follow-up Later", "sales_stage": "Contacted", "outcome": "No-Show", "payment_status": "none", "payment_state": "Not Sent"},
        "Not Interested":      {"stage": "Lost", "sales_stage": "Contacted", "outcome": "Not Interested", "payment_status": "none", "payment_state": "Not Sent"},
        "Changed Their Mind":  {"stage": "Follow-up Later", "sales_stage": "Interested", "outcome": "Changed Their Mind", "payment_status": "none", "payment_state": "Not Sent"},
    }
    return dict(table.get(status, base))


# product_line -> (package_id, amount, currency) for seeded deals (USD default).
_SEED_PRODUCT = {
    "Credit Top-Up":            ("credits_500", 100.0, "usd"),
    "Annual Pro Subscription":  ("annual_pro", 1999.0, "usd"),
    "Dedicated Support":        ("dedicated_support", 3499.0, "usd"),
    "Lifetime Access":          ("lifetime_access", 5999.0, "usd"),
}


async def _seed_demo_leads():
    if await db.leads.count_documents({}) != 0:
        return
    agents = await db.users.find({"role": "agent"}).sort("created_at", 1).to_list(100)
    if not agents:
        return
    by_name = {a["name"]: a for a in agents}

    def pick(name):
        return by_name.get(name) or agents[0]

    now = datetime.now(timezone.utc)

    # (company, name, email, plan, spend, ltv, trend, region, product_line, provider, status, owner, next_action, days_ago, referred_by)
    rows = [
        ("Acme Analytics",  "Aditya Bansal",  "aditya@acmeanalytics.io", "Pro $99/mo",    99,  1200, "rising",    "North America", "Annual Pro Subscription", "razorpay", "Payment Link Paid",   "Brian",    "View customer / ask for referral", 9,  None),
        ("Nimbus Labs",     "Nikhil Sharma",  "nikhil@nimbuslabs.dev",   "Team $249/mo",  249, 9000, "rising",    "Europe",        "Lifetime Access",         "razorpay", "Payment Link Paid",   "Vinay",    "Ask for referral",                 12, None),
        ("BrightForge",     "Ritika Agarwal", "ritika@brightforge.com",  "Pro $149/mo",   149, 2100, "rising",    "APAC",          "Dedicated Support",       "stripe",   "Interested",          "Aryan",    "Send payment link",                3,  None),
        ("Vertex IO",       "Rohan Kapoor",   "rohan@vertex.io",         "Starter $49/mo",49,  600,  "stable",    "APAC",          "Credit Top-Up",           "razorpay", "Payment Link Sent",   "Dipan",    "Check payment",                    1,  None),
        ("Loopline",        "Meera Pillai",   "meera@loopline.co",       "Pro $129/mo",   129, 1500, "declining", "MEA",           "Annual Pro Subscription", "razorpay", "Contact in Future",   "Vinay",    "Call tomorrow",                    5,  None),
        ("DataPeak",        "Deepika Menon",  "deepika@datapeak.ai",     "Pro $199/mo",   199, 3400, "rising",    "North America", "Lifetime Access",         "stripe",   "Payment Link Failed", "Aryan",    "Retry link",                       2,  None),
        ("Quantli",         "Varun Shah",     "varun@quantli.com",       "Pro $99/mo",    99,  950,  "stable",    "Europe",        "Credit Top-Up",           "manual",   "Payment Link Paid",   "Abhishek", "View customer",                    7,  None),
        ("Northstar",       "Sandeep Rao",    "sandeep@northstar.app",   "Pro $179/mo",   179, 2800, "rising",    "LATAM",         "Dedicated Support",       "razorpay", "Not Interested",      "Vinay",    "Add loss reason",                  6,  None),
        ("Skylark",         "Anjali Nair",    "anjali@skylark.io",       "Starter $59/mo",59,  720,  "rising",    "APAC",          "Annual Pro Subscription", "razorpay", "No-Show",             "Dipan",    "Reschedule",                       4,  None),
        ("Helix Data",      "Pranav Menon",   "pranav@helixdata.com",    "Pro $149/mo",   149, 2000, "steady",    "Europe",        "Dedicated Support",       "stripe",   "Changed Their Mind",  "Brian",    "Recovery task",                    8,  None),
        ("Cobalt AI",       "Sara Iyer",      "sara@cobaltai.com",       "Pro $129/mo",   129, 1600, "rising",    "North America", "Credit Top-Up",           "stripe",   "New / Needs Review",  None,       "Review and qualify",               0,  None),
        ("Pinecone Soft",   "Karan Malhotra", "karan@pineconesoft.io",   "Team $299/mo",  299, 5200, "rising",    "APAC",          "Lifetime Access",         "razorpay", "Interested",          "Abhishek", "Send payment link",                3,  "Aditya Bansal"),
        ("Driftwood",       "Neha Verma",     "neha@driftwood.app",      "Pro $99/mo",    99,  880,  "declining", "MEA",           "Annual Pro Subscription", "razorpay", "Contacted",           "Aryan",    "Book discovery call",              2,  None),
        ("Lumen Works",     "Arjun Reddy",    "arjun@lumenworks.io",     "Pro $189/mo",   189, 3100, "rising",    "North America", "Dedicated Support",       "stripe",   "Payment Link Sent",   "Brian",    "Check payment",                    1,  None),
        ("Tide Labs",       "Priya Suresh",   "priya@tidelabs.dev",      "Starter $49/mo",49,  540,  "stable",    "LATAM",         "Credit Top-Up",           "manual",   "Payment Link Paid",   "Dipan",    "View customer",                    10, None),
        ("Onyx Cloud",      "Vivek Joshi",    "vivek@onyxcloud.com",     "Pro $159/mo",   159, 2600, "rising",    "Europe",        "Annual Pro Subscription", "stripe",   "Contact in Future",   "Vinay",    "Follow up next week",              5,  None),
        ("Maple Systems",   "Ishaan Gupta",   "ishaan@maplesystems.io",  "Pro $99/mo",    99,  1100, "steady",    "APAC",          "Credit Top-Up",           "razorpay", "No-Show",             "Aryan",    "Reschedule",                       3,  None),
        ("Crestline",       "Aisha Khan",     "aisha@crestline.app",     "Team $249/mo",  249, 4800, "rising",    "MEA",           "Lifetime Access",         "razorpay", "Interested",          "Abhishek", "Send payment link",                2,  "Nikhil Sharma"),
        ("Beacon Soft",     "Rahul Nair",     "rahul@beaconsoft.io",     "Pro $129/mo",   129, 1700, "declining", "North America", "Dedicated Support",       "stripe",   "Not Interested",      "Brian",    "Add loss reason",                  9,  None),
        ("Glide Tech",      "Tanya Bose",     "tanya@glidetech.com",     "Pro $99/mo",    99,  920,  "rising",    "Europe",        "Annual Pro Subscription", "razorpay", "Payment Link Failed", "Vinay",    "Retry link",                       1,  None),
        ("Vanta Edge",      "Manish Kohli",   "manish@vantaedge.io",     "Starter $59/mo",59,  680,  "stable",    "APAC",          "Credit Top-Up",           "manual",   "Contacted",           "Dipan",    "Book discovery call",              4,  None),
        ("Halo Analytics",  "Divya Rao",      "divya@haloanalytics.com", "Pro $179/mo",   179, 2900, "rising",    "LATAM",         "Dedicated Support",       "stripe",   "Payment Link Paid",   "Aryan",    "View customer",                    11, None),
        ("Quartz Labs",     "Sahil Mehta",    "sahil@quartzlabs.dev",    "Pro $149/mo",   149, 2200, "steady",    "North America", "Annual Pro Subscription", "razorpay", "Changed Their Mind",  "Abhishek", "Recovery task",                    6,  None),
        ("Ember Cloud",     "Ananya Das",     "ananya@embercloud.io",    "Team $299/mo",  299, 5600, "rising",    "Europe",        "Lifetime Access",         "razorpay", "New / Needs Review",  None,       "Review and qualify",               0,  None),
    ]

    name_to_id = {}
    won_meeting_targets = []
    for i, r in enumerate(rows):
        (company, name, email, plan, spend, ltv, trend, region, product_line,
         provider, status, owner_name, next_action, days_ago, referred_by) = r
        owner = pick(owner_name) if owner_name else None
        sf = _status_fields(status)
        pkg_id, amount, currency = _SEED_PRODUCT[product_line]
        is_paid = status == "Payment Link Paid"
        created = (now - timedelta(days=days_ago, hours=(i % 6))).isoformat()
        ref_id = name_to_id.get(referred_by) if referred_by else None
        doc = {
            "id": new_id(), "name": name, "email": email.lower(), "company": company,
            "phone": f"+1 555 0{100 + i}", "plan": plan, "monthly_spend": float(spend),
            "lifetime_value": float(ltv), "usage_trend": trend, "product_history": ["API", "Dashboard"],
            "source": "Referral" if ref_id else "Q3 Power User Outreach",
            "region": region, "priority": "None",
            "owner_id": owner["id"] if owner else None,
            "owner_name": owner["name"] if owner else None,
            "owner_locked": bool(is_paid and owner),
            "total_revenue_usd": amount if is_paid else 0.0,
            "deals_won": 1 if is_paid else 0, "upsell_cycles": 0,
            "notes": [], "ownership_history": [],
            "product_line": product_line, "package_id": pkg_id, "amount": amount, "currency": currency,
            "provider": provider,
            "next_action": next_action, "next_action_at": None, "loss_reason": "",
            "referred_by_lead_id": ref_id,
            "referred_by_name": referred_by or "",
            "last_meeting_at": None, "next_meeting_at": None,
            "won_at": created if is_paid else None,
            "last_activity": created,
            "created_at": created, "updated_at": created,
            **sf,
        }
        await db.leads.insert_one(doc)
        name_to_id[name] = doc["id"]
        if owner:
            await log_activity(doc["id"], "assignment", f"Assigned to {owner['name']} (seed)", "System")
        if ref_id:
            await log_activity(doc["id"], "referral", f"Referred by {referred_by}", "System")
        # Paid leads get a paid payment record (feeds Won revenue + product cards).
        if is_paid and owner:
            await db.payments.insert_one({
                "id": new_id(), "lead_id": doc["id"], "lead_name": doc["name"],
                "agent_id": owner["id"], "agent_name": owner["name"],
                "provider": provider, "amount": amount, "currency": currency,
                "product_line": product_line, "package_id": pkg_id,
                "amount_usd": amount, "fx_rate": 85.0, "description": product_line,
                "status": "complete", "payment_status": "paid",
                "session_id": f"seed_{new_id()[:10]}", "payment_link": None,
                "created_at": created, "updated_at": created,
            })
        # Link-sent / failed leads get a pending/failed payment record so /payments is alive.
        elif status in ("Payment Link Sent", "Payment Link Failed") and owner:
            ps = "failed" if status == "Payment Link Failed" else "pending"
            await db.payments.insert_one({
                "id": new_id(), "lead_id": doc["id"], "lead_name": doc["name"],
                "agent_id": owner["id"], "agent_name": owner["name"],
                "provider": provider, "amount": amount, "currency": currency,
                "product_line": product_line, "package_id": pkg_id,
                "amount_usd": amount, "fx_rate": 85.0, "description": product_line,
                "status": "initiated", "payment_status": ps,
                "session_id": f"seed_{new_id()[:10]}", "payment_link": f"https://pay.demo/{new_id()[:8]}",
                "created_at": created, "updated_at": created,
            })
        # Meetings: Interested/No-Show/Changed-Their-Mind/Paid leads have a meeting; a few
        # carry a Circleback recording + summary so the Meetings view looks alive.
        if owner and status in ("Interested", "No-Show", "Changed Their Mind", "Payment Link Paid", "Contact in Future"):
            won_meeting_targets.append((doc, owner, status, created))

    await _seed_demo_meetings(won_meeting_targets, now)


async def _seed_demo_meetings(targets, now):
    """Seed meetings for selected leads, some with Circleback recordings + summaries."""
    drivers = ["Discount", "Lifetime Access", "Top-Up Credits", "Support", "Renewal"]
    for i, (lead, owner, status, created) in enumerate(targets):
        completed = status in ("Interested", "Changed Their Mind", "Payment Link Paid")
        no_show = status == "No-Show"
        # Past for completed/no-show; upcoming for future-contact leads.
        if status == "Contact in Future":
            sched = (now + timedelta(days=1 + (i % 3), hours=(i % 5))).isoformat()
            m_status = "scheduled"
        else:
            sched = (now - timedelta(days=1 + (i % 4), hours=(i % 6))).isoformat()
            m_status = "completed" if completed else ("no_show" if no_show else "scheduled")
        has_recording = completed and (i % 2 == 0)
        meeting = {
            "id": new_id(), "lead_id": lead["id"], "lead_name": lead["name"],
            "agent_id": owner["id"], "agent_name": owner["name"],
            "scheduled_at": sched, "duration": 30,
            "status": m_status, "source": "Calendly",
            "booking_driver": drivers[i % len(drivers)],
            "no_show_reason": "Did not join" if no_show else "",
            "reschedule_status": "", "outcome_notes": "Discussed upgrade options" if completed else "",
            "completed_at": sched if m_status in ("completed", "no_show") else None,
            "recording_url": f"https://app.circleback.ai/recordings/{new_id()[:10]}" if has_recording else None,
            "summary": ("Customer is a power user hitting credit limits; interested in the annual "
                        "plan and dedicated support. Wants pricing in writing. Next step: send payment link.")
                        if has_recording else None,
            "join_url": f"https://meet.google.com/{new_id()[:3]}-{new_id()[:4]}-{new_id()[:3]}",
            "created_at": created,
        }
        await db.meetings.insert_one(meeting)


async def _seed_coverage_history():
    # Seed ~1 week of coverage history so the burn-up chart shows a real trend
    if await db.coverage_snapshots.count_documents({}) != 0:
        return
    base_day = datetime.now(timezone.utc).date()
    ramp = [
        (7, 3, 1, 0, 0.0),
        (6, 4, 2, 0, 0.0),
        (5, 5, 2, 0, 0.0),
        (4, 6, 3, 0, 0.0),
        (3, 7, 4, 1, 2500.0),
        (2, 8, 4, 1, 2500.0),
        (1, 8, 5, 1, 2500.0),
    ]
    for days_ago, total, assigned, won, rev in ramp:
        d = (base_day - timedelta(days=days_ago)).isoformat()
        await db.coverage_snapshots.insert_one({
            "id": d, "date": d, "total": total, "assigned": assigned,
            "met": max(0, assigned - 1), "advanced": won, "won": won,
            "revenue_usd": rev, "updated_at": now_iso(),
        })


async def _migrate_meeting_scheduled_to_assigned():
    """One-time, idempotent stage merge: 'Meeting Scheduled' folded into 'Assigned'.
    (Assigned now means assigned AND meeting booked.) Safe to run on every startup."""
    try:
        res = await db.leads.update_many(
            {"stage": "Meeting Scheduled"}, {"$set": {"stage": "Assigned"}})
        if getattr(res, "modified_count", 0):
            logger.info(f"migrate: {res.modified_count} leads 'Meeting Scheduled' -> 'Assigned'")
    except Exception as e:
        logger.warning(f"stage migration failed (continuing): {e}")


async def _migrate_to_sales_status_model():
    """Idempotent backfill of the new (sales_stage, outcome, payment_state) model onto
    any legacy lead that predates it. Derives from the legacy `stage` + `payment_status`
    using map_legacy_stage. Never crashes startup; safe to run every boot."""
    try:
        cursor = db.leads.find(
            {"sales_stage": {"$exists": False}},
            {"_id": 0, "id": 1, "stage": 1, "payment_status": 1},
        )
        migrated = 0
        async for l in cursor:
            m = map_legacy_stage(l.get("stage", "New Booking"), l.get("payment_status", ""))
            await db.leads.update_one({"id": l["id"]}, {"$set": {
                "sales_stage": m["stage"], "outcome": m["outcome"],
                "payment_state": m["payment_status"],
            }})
            migrated += 1
        if migrated:
            logger.info(f"migrate: backfilled sales-status model on {migrated} legacy leads")
    except Exception as e:
        logger.warning(f"sales-status migration failed (continuing): {e}")


async def seed():
    await db.settings.update_one({"id": "settings"}, {"$setOnInsert": {"id": "settings", "inr_per_usd": 85.0}}, upsert=True)
    await _migrate_meeting_scheduled_to_assigned()
    await _migrate_to_sales_status_model()
    await _seed_admin()
    await _seed_agents()
    await _seed_demo_leads()
    await _seed_coverage_history()

async def _run_startup():
    # Wait for the database (Atlas can be slow to accept the first connection on cold start).
    for attempt in range(1, 6):
        try:
            await client.admin.command("ping")
            logger.info("MongoDB reachable")
            break
        except Exception as e:
            logger.warning(f"MongoDB not ready (attempt {attempt}/5): {e}")
            await asyncio.sleep(2)
    else:
        logger.error("MongoDB unreachable after retries; skipping startup seed")
        return

    # Indexes: never let an index error block seeding/serving.
    index_specs = [
        ("users", "email", {"unique": True}),
        ("leads", "email", {}),
        ("leads", "stage", {}),
        ("meetings", "agent_id", {}),
        ("payments", "session_id", {}),
        ("coverage_snapshots", "date", {}),
    ]
    for coll, field, kwargs in index_specs:
        try:
            await db[coll].create_index(field, **kwargs)
        except Exception as e:
            logger.warning(f"create_index {coll}.{field} failed (continuing): {e}")

    # Seed: must never crash startup; the app should still serve if seeding fails.
    try:
        await seed()
        logger.info("CRM startup complete")
    except Exception as e:
        logger.error(f"seed() failed (app will still serve): {e}", exc_info=True)

CSRF_EXEMPT_PATHS = {"/api/auth/login", "/api/webhook/stripe", "/api/webhook/razorpay", "/api/webhook/calendly"}

@app.middleware("http")
async def csrf_protect(request: Request, call_next):
    # Double-submit CSRF: only enforced for cookie-authenticated, state-changing requests.
    if (request.method not in ("GET", "HEAD", "OPTIONS")
            and request.url.path.startswith("/api")
            and request.url.path not in CSRF_EXEMPT_PATHS):
        # Bearer-token (API/curl) clients are immune to cookie CSRF; skip them.
        if not request.headers.get("Authorization", "").startswith("Bearer "):
            cookie_csrf = request.cookies.get("csrf_token")
            header_csrf = request.headers.get("X-CSRF-Token")
            if not cookie_csrf or cookie_csrf != header_csrf:
                return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid"})
    return await call_next(request)

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
