from dotenv import load_dotenv
from pathlib import Path
import os
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, EmailStr, ConfigDict
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

# ----------------------------------------------------------------------------
# Production mode flag + boot-time config contract.
# APP_MODE defaults to "demo" (the safe, self-seeding path). Production MUST be
# opted into explicitly via APP_MODE=production, which also turns OFF every
# destructive demo path (reseed/wipe, password-reset, demo accounts) and turns
# ON the strict config asserts below. See docs/GO_LIVE_PLAN.md (M0).
# ----------------------------------------------------------------------------
APP_MODE = os.environ.get("APP_MODE", "demo").strip().lower()   # {demo, production}
IS_PROD = APP_MODE == "production"
# Integration secrets are encrypted with this key (decoupled from JWT_SECRET so
# rotating JWT_SECRET never silently invalidates stored integration keys). Falls
# back to JWT_SECRET in demo so local dev needs no extra env.
INTEGRATION_ENC_KEY = os.environ.get("INTEGRATION_ENC_KEY", "")
# Server-side public base URL used to build webhook/success URLs (never trust a
# client-supplied origin_url for those — see GO_LIVE_PLAN P2-e).
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")

def _assert_prod_config():
    problems = []
    if len(JWT_SECRET or "") < 32:
        problems.append("JWT_SECRET must be >= 32 chars in production")
    if not INTEGRATION_ENC_KEY or INTEGRATION_ENC_KEY == JWT_SECRET:
        problems.append("INTEGRATION_ENC_KEY must be set and distinct from JWT_SECRET in production")
    _cors = os.environ.get("CORS_ORIGINS", "").strip()
    if not _cors or _cors == "*":
        problems.append("CORS_ORIGINS must be an explicit allowlist (not '*' or unset) in production")
    if not PUBLIC_BASE_URL:
        problems.append("PUBLIC_BASE_URL must be set in production")
    if problems:
        raise RuntimeError("Invalid production configuration: " + "; ".join(problems))

if IS_PROD:
    _assert_prod_config()
logger.info(f"APP_MODE={APP_MODE}")

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
# Payment currencies the app supports. USD -> Stripe, INR -> Razorpay (A3 / B4).
SUPPORTED_CURRENCIES = {"usd", "inr"}
MAX_PAYMENT_AMOUNT = 1_000_000.0

PRESET_PACKAGES = {
    # --- Credit Top-Up ladder (USD default, ~$0.20/credit, +50% boost free) ---
    # Credit ladder repriced to the 7.5x default (>=6x floor) — boost folded into the
    # headline credits so the "min 6x" invariant holds for the catalog itself (G14).
    "credits_100":  {"product_line": "Credit Top-Up", "name": "150 Credits",   "amount": 20.0,   "currency": "usd", "category": "Credits", "credits": 150,  "boost_credits": 0},
    "credits_250":  {"product_line": "Credit Top-Up", "name": "375 Credits",   "amount": 50.0,   "currency": "usd", "category": "Credits", "credits": 375,  "boost_credits": 0},
    "credits_500":  {"product_line": "Credit Top-Up", "name": "750 Credits",   "amount": 100.0,  "currency": "usd", "category": "Credits", "credits": 750,  "boost_credits": 0},
    "credits_1250": {"product_line": "Credit Top-Up", "name": "1,875 Credits", "amount": 250.0,  "currency": "usd", "category": "Credits", "credits": 1875, "boost_credits": 0},
    "credits_2500": {"product_line": "Credit Top-Up", "name": "3,750 Credits", "amount": 500.0,  "currency": "usd", "category": "Credits", "credits": 3750, "boost_credits": 0},
    "credits_5000": {"product_line": "Credit Top-Up", "name": "7,500 Credits", "amount": 1000.0, "currency": "usd", "category": "Credits", "credits": 7500, "boost_credits": 0},
    # --- Annual Pro Subscription (fixed placeholder) ---
    "annual_pro":   {"product_line": "Annual Pro Subscription", "name": "Annual Pro Subscription", "amount": 1999.0, "currency": "usd", "category": "Plan", "interval": "year"},
    # --- Dedicated Support (fixed placeholder) ---
    "dedicated_support": {"product_line": "Dedicated Support", "name": "Dedicated Support", "amount": 3499.0, "currency": "usd", "category": "Support"},
    # --- Lifetime Access (fixed placeholder) ---
    "lifetime_access":   {"product_line": "Lifetime Access", "name": "Lifetime Access", "amount": 15000.0, "currency": "usd", "category": "Lifetime"},
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

def create_token(user: dict, impersonator: dict = None) -> str:
    payload = {
        "sub": user["id"], "email": user["email"], "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    if impersonator:
        # Impersonation claims: effective identity stays the agent (sub/role) so all
        # existing RBAC works; these extra claims only record who is behind the session.
        payload["impersonating"] = True
        payload["imp_by"] = impersonator["id"]
        payload["imp_name"] = impersonator.get("name") or impersonator.get("email")
        payload["exp"] = datetime.now(timezone.utc) + timedelta(hours=8)
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
    api_key = await get_secret("circleback_api_key", "CIRCLEBACK_API_KEY")
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

def _raw_token(request: Request) -> str:
    """Extract the JWT from the httpOnly cookie or the Authorization header."""
    token = request.cookies.get("crm_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token or ""

def _token_claims(request: Request) -> dict:
    """Decode the current token and return its claims (or {} if missing/invalid).
    Used to read impersonation metadata without re-validating role."""
    token = _raw_token(request)
    if not token:
        return {}
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        return {}

async def get_current_user(request: Request) -> dict:
    # Prefer the httpOnly cookie; fall back to the Authorization header for API clients/tests.
    token = _raw_token(request)
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

# ----------------------------------------------------------------------------
# Per-record ownership guards (A1). Agents may only read/mutate records for leads
# they own; admins (incl. an admin impersonating an agent acts as that agent) see
# their scope. We return 404 (not 403) for unowned records so an agent can't probe
# which record ids exist. Each guard takes the ALREADY-FETCHED record (no extra DB
# round-trip) except the payment one, which may look up the lead owner as fallback.
# ----------------------------------------------------------------------------
def _is_admin(user: dict) -> bool:
    return user.get("role") == "admin"

def _owns_lead(user: dict, lead: dict) -> bool:
    return _is_admin(user) or (lead is not None and lead.get("owner_id") == user["id"])

def require_lead_access(user: dict, lead: dict) -> None:
    if not _owns_lead(user, lead):
        raise HTTPException(status_code=404, detail="Lead not found")

def require_meeting_access(user: dict, meeting: dict) -> None:
    if not (_is_admin(user) or meeting.get("agent_id") == user["id"]):
        raise HTTPException(status_code=404, detail="Meeting not found")

async def require_payment_access(user: dict, record: dict) -> None:
    if _is_admin(user) or record.get("agent_id") == user["id"]:
        return
    # Legacy payments may lack agent_id; fall back to the owning lead.
    lead = await db.leads.find_one({"id": record.get("lead_id")}, {"_id": 0, "owner_id": 1})
    if not (lead and lead.get("owner_id") == user["id"]):
        raise HTTPException(status_code=404, detail="Payment not found")

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
    api_url = await get_secret("emergent_users_api_url", "EMERGENT_USERS_API_URL")
    if api_url:
        try:
            import urllib.request, urllib.parse, json as _json
            qs = urllib.parse.urlencode({"email": email})
            req = urllib.request.Request(f"{api_url}?{qs}")
            api_key = await get_secret("emergent_users_api_key", "EMERGENT_USERS_API_KEY")
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
    next_followup_at: Optional[str] = None
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
    lead_id: Optional[str] = None           # optional -> standalone (lead-less) links
    customer_email: Optional[str] = None    # if it matches a CRM lead, auto-link to it
    customer_name: Optional[str] = None
    provider: str = "stripe"  # stripe | razorpay | manual
    package_id: Optional[str] = None
    amount: Optional[float] = None          # explicit amount overrides the preset (lets agents discount)
    currency: str = "usd"
    description: Optional[str] = ""
    credits: Optional[int] = None           # custom credits for a credit top-up
    boost_credits: Optional[int] = None     # custom bonus/boost credits (free extra)
    multiplier: Optional[float] = None      # Credit Top-Up: credits delivered = amount * multiplier
    origin_url: str = ""
    # Manual provider only: record an offline payment that's ALREADY received so the
    # deal becomes Won immediately (G5 — Won always rides a real paid payment record).
    mark_paid: bool = False

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
    next_followup_at: Optional[str] = None
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
    paid_at: Optional[str] = None
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

@api.post("/auth/demo-login")
async def demo_login(response: Response):
    """One-click 'Demo View' — signs the visitor in as the seeded demo admin account so the
    landing page never has to surface credentials. Demo-only; disabled in production."""
    if IS_PROD:
        raise HTTPException(status_code=403, detail="Demo login is disabled in production")
    demo_email = os.environ.get("DEMO_EMAIL", "demo@emergent.sh").lower()
    user = await db.users.find_one({"email": demo_email})
    if not user:
        raise HTTPException(status_code=503, detail="Demo account is not available")
    token = create_token(user)
    _set_auth_cookies(response, token)
    logger.info(f"demo-login: {demo_email}")
    return {"token": token, "user": clean(user)}

@api.get("/auth/me", response_model=UserOut)
async def me(request: Request, user: dict = Depends(get_current_user)):
    claims = _token_claims(request)
    user = dict(user)
    user["impersonating"] = bool(claims.get("impersonating"))
    user["impersonator"] = (
        {"id": claims.get("imp_by"), "name": claims.get("imp_name")}
        if claims.get("impersonating") else None
    )
    return user

@api.post("/auth/logout")
async def logout(response: Response):
    _clear_auth_cookies(response)
    return {"ok": True}

# ----------------------------------------------------------------------------
# Demo / admin "view-as" impersonation. An admin (sales head) can view the CRM
# exactly as one of their agents. The minted token's effective identity is the
# agent (so all RBAC works), with extra claims recording the original admin so
# we can switch back. Stop-impersonate does NOT use require_admin (the active
# token is agent-role) — it trusts the signed imp_by claim, re-verified vs DB.
# ----------------------------------------------------------------------------
class ImpersonateIn(BaseModel):
    agent_id: str

@api.post("/admin/impersonate")
async def impersonate(body: ImpersonateIn, response: Response, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": body.agent_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["id"] == admin["id"]:
        raise HTTPException(status_code=400, detail="You are already yourself")
    token = create_token(clean(target), impersonator=admin)
    _set_auth_cookies(response, token)
    await log_audit("impersonate", admin["name"], target.get("name") or target["id"])
    return {
        "token": token,
        "user": clean(target),
        "impersonating": True,
        "impersonator": {"id": admin["id"], "name": admin["name"]},
    }

@api.post("/admin/stop-impersonate")
async def stop_impersonate(request: Request, response: Response):
    claims = _token_claims(request)
    if not claims.get("impersonating") or not claims.get("imp_by"):
        raise HTTPException(status_code=400, detail="Not impersonating")
    admin = await db.users.find_one({"id": claims["imp_by"]})
    if not admin or admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Original manager no longer available")
    token = create_token(clean(admin))
    _set_auth_cookies(response, token)
    await log_audit("stop_impersonate", admin["name"], "Returned to manager view")
    return {"token": token, "user": clean(admin), "impersonating": False, "impersonator": None}

# ----------------------------------------------------------------------------
# Team / Users
# ----------------------------------------------------------------------------
def _team_member_stats(member, win_leads, win_payments, win_meetings, period_used):
    """Per-rep KPI rollup for one member within the already-windowed datasets."""
    uid = member.get("id")
    m_leads = [l for l in win_leads if l.get("owner_id") == uid]
    won = 0
    for l in m_leads:
        legacy = map_legacy_stage(l.get("stage", "New Booking"), l.get("payment_status", ""))
        st = derive_status(
            l.get("sales_stage") or legacy["stage"],
            l.get("outcome", "") or legacy["outcome"],
            l.get("payment_state") or legacy["payment_status"],
        )
        if st == "Payment Link Paid":
            won += 1
    revenue = sum(p.get("amount_usd", p.get("amount", 0)) or 0
                  for p in win_payments if p.get("agent_id") == uid)
    return {
        "period": period_used,
        "leads": len(m_leads),
        "won": won,
        "meetings": len([mt for mt in win_meetings if mt.get("agent_id") == uid]),
        "revenue": round(revenue, 2),
        "target": member.get("monthly_target", 0),
    }

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
            m["stats"] = _team_member_stats(m, win_leads, win_payments, win_meetings, period_used)
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

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

@api.post("/profile/password")
async def change_my_password(body: ChangePasswordIn, user: dict = Depends(get_current_user)):
    """Self-service password change: verify the current password, then set a new one."""
    record = await db.users.find_one({"id": user["id"]})
    if not record or not verify_password(body.current_password, record.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password or "") < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    if verify_password(body.new_password, record.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="New password must be different from the current one")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}

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
def _build_lead_query(request: Request, user: dict) -> dict:
    """Translate list-leads query params into a Mongo filter (RBAC-scoped)."""
    q = {}
    for param, field in (("stage", "stage"), ("priority", "priority"), ("owner", "owner_id"),
                         ("product_line", "product_line"), ("provider", "provider")):
        val = request.query_params.get(param)
        if val:
            q[field] = val
    if request.query_params.get("mine") == "true" or user["role"] == "agent":
        q["owner_id"] = user["id"]
    search = request.query_params.get("search")
    if search:
        rx = re.escape(search)
        q["$or"] = [
            {"name": {"$regex": rx, "$options": "i"}},
            {"email": {"$regex": rx, "$options": "i"}},
            {"company": {"$regex": rx, "$options": "i"}},
            {"phone": {"$regex": rx, "$options": "i"}},
        ]
    return q


def _apply_lead_status_filters(out: list, request: Request) -> list:
    """Post-filter serialized leads by DERIVED status / reporting group."""
    status = request.query_params.get("status")
    group = request.query_params.get("group")
    if status:
        out = [l for l in out if l.get("status") == status]
    if group:
        out = [l for l in out if group in (l.get("status_groups") or [])]
    return out

@api.get("/leads", response_model=List[LeadOut])
async def list_leads(request: Request, user: dict = Depends(get_current_user)):
    q = _build_lead_query(request, user)
    leads = await db.leads.find(q, {"_id": 0, "notes": 0, "ownership_history": 0}).sort("updated_at", -1).to_list(5000)
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
    return _apply_lead_status_filters(out, request)

async def _maybe_enrich_lead(doc: dict):
    """Backfill usage/LTV/region/plan from the Emergent Users DB when left blank."""
    if not doc.get("monthly_spend") and not doc.get("lifetime_value") and (not doc.get("region") or doc.get("region") == "Other"):
        enr = await enrich_from_emergent(doc["email"])
        doc["monthly_spend"] = enr["monthly_spend"]
        doc["lifetime_value"] = enr["lifetime_value"]
        doc["region"] = enr["region"]
        doc["usage_trend"] = enr["usage_trend"]
        if not doc.get("plan"):
            doc["plan"] = enr["plan"]


async def _resolve_referral(doc: dict):
    """Normalise referral fields on `doc` and return the referrer lead (or None)."""
    ref_id = doc.get("referred_by_lead_id")
    if not ref_id:
        doc["referred_by_lead_id"] = None
        doc["referred_by_name"] = doc.get("referred_by_name") or ""
        return None
    referrer = await db.leads.find_one({"id": ref_id})
    doc["source"] = "Referral"
    if referrer and not doc.get("referred_by_name"):
        doc["referred_by_name"] = referrer.get("name") or ""
    return referrer


def _backfill_package(doc: dict):
    """Fill product_line/amount/currency from the chosen preset package when missing."""
    pkg_id = doc.get("package_id")
    pkg = PRESET_PACKAGES.get(pkg_id) if pkg_id else None
    if not pkg:
        return
    if not doc.get("product_line"):
        doc["product_line"] = pkg.get("product_line", "")
    if not doc.get("amount"):
        doc["amount"] = float(pkg["amount"])
    if not doc.get("currency"):
        doc["currency"] = pkg.get("currency", "usd")


@api.post("/leads", response_model=LeadOut)
async def create_lead(body: LeadIn, user: dict = Depends(get_current_user)):
    existing = await db.leads.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="A lead with this email already exists")
    doc = body.model_dump()
    doc["email"] = body.email.lower()

    await _maybe_enrich_lead(doc)
    referrer = await _resolve_referral(doc)
    _backfill_package(doc)

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
    if doc.get("referred_by_lead_id"):
        ref_name = doc.get("referred_by_name") or "a customer"
        await log_activity(doc["id"], "referral", f"Referred by {ref_name}", user["name"])
        if referrer:
            try:
                await log_activity(referrer["id"], "referral", f"Referred {doc['name']}", user["name"])
            except Exception as e:
                logger.warning(f"referrer cross-log failed for {doc['referred_by_lead_id']}: {e}")
    return serialize_lead(doc)

@api.get("/leads/notes/recent", response_model=List[NoteOut], response_model_exclude_none=True)
async def recent_notes(request: Request, user: dict = Depends(get_current_user)):
    """Recent notes across leads for the Leads sidebar. Admins see all; agents see
    notes on the leads they own. Each note is enriched with its lead's name."""
    try:
        limit = int(request.query_params.get("limit", 10))
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, 50))
    q = {} if user["role"] == "admin" else {"owner_id": user["id"]}
    leads = await db.leads.find(q, {"_id": 0, "id": 1, "name": 1, "notes": 1}).to_list(5000)
    notes = []
    for l in leads:
        for n in (l.get("notes") or []):
            notes.append({**n, "lead_id": l.get("id"), "lead_name": l.get("name")})
    notes.sort(key=lambda n: n.get("created_at") or "", reverse=True)
    return notes[:limit]

@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    require_lead_access(user, lead)
    activities = await db.activities.find({"lead_id": lead_id}).sort("created_at", -1).to_list(500)
    meetings = await db.meetings.find({"lead_id": lead_id}).sort("scheduled_at", -1).to_list(100)
    payments = await db.payments.find({"lead_id": lead_id}).sort("created_at", -1).to_list(100)
    return {
        "lead": serialize_lead(lead),
        "activities": [clean(a) for a in activities],
        "meetings": [serialize_meeting(m) for m in meetings],
        "payments": [clean(p) for p in payments],
    }

def _apply_lead_update_mappings(updates: dict) -> dict:
    """Route new-vocabulary stage/payment fields onto the storage model + side-effects.
    `stage` from SALES_STAGES -> sales_stage; new `payment_status` -> payment_state with
    legacy mirroring; an outcome of Won locks the owner and sets the legacy Won stage."""
    if "stage" in updates and updates["stage"] in SALES_STAGES:
        updates["sales_stage"] = updates.pop("stage")
    # G5: a lead becomes Won ONLY via a real paid payment record — never by a direct
    # lead edit. Reject attempts to set Paid/Won here; the FE records a Manual payment.
    if updates.get("payment_status") == "Paid" or updates.get("payment_state") == "Paid" or updates.get("outcome") == "Won":
        raise HTTPException(status_code=400,
                            detail="Record a paid payment (incl. Manual) to mark Won — not a lead edit.")
    if "payment_status" in updates and updates["payment_status"] in PAYMENT_STATES:
        updates["payment_state"] = updates.pop("payment_status")
        if updates["payment_state"] == "Link Sent":
            updates["payment_status"] = "link_sent"
    return updates

@api.put("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    require_lead_access(user, lead)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        updates = _apply_lead_update_mappings(updates)
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

# Legacy PIPELINE_STAGES value -> canonical visible status (back-compat).
_LEGACY_STAGE_TO_STATUS = {
    "New Booking": "New / Needs Review", "Assigned": "Contacted",
    "Meeting Completed": "Interested", "Payment Link Sent": "Payment Link Sent",
    "Won": "Payment Link Paid", "Lost": "Not Interested", "Follow-up Later": "Contact in Future",
}

@api.put("/leads/{lead_id}/stage", response_model=LeadOut)
async def update_stage(lead_id: str, body: StageIn, user: dict = Depends(get_current_user)):
    # Accept a new visible status, or a legacy PIPELINE_STAGES value (mapped).
    status = body.stage if body.stage in VISIBLE_STATUSES else _LEGACY_STAGE_TO_STATUS.get(body.stage)
    if not status:
        raise HTTPException(status_code=400, detail="Invalid stage")
    # G5: a deal can only become Won via a real paid payment record (incl. Manual),
    # never by directly setting the status. The FE "Mark paid" records a payment.
    if status == "Payment Link Paid":
        raise HTTPException(status_code=400,
                            detail="Record a paid payment (incl. Manual) to mark Won — not a status change.")
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    require_lead_access(user, lead)
    # Single-writer projection: status_set fills all five storage fields consistently.
    await db.leads.update_one({"id": lead_id}, {"$set": status_set(status)})
    await log_activity(lead_id, "stage", f"Status -> {status}", user["name"])
    return serialize_lead(await db.leads.find_one({"id": lead_id}))

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
    require_lead_access(user, lead)
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
    require_lead_access(user, lead)
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
    require_lead_access(user, lead)
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
    channel: str  # "email" | "whatsapp" | "call"


# Follow-up channels are logged only (G9). WhatsApp is log-only for v1 (no provider wired).
_TOUCH_LABELS = {"email": "Emailed lead", "whatsapp": "WhatsApped lead", "call": "Called lead"}

@api.post("/leads/{lead_id}/touch")
async def touch_lead(lead_id: str, body: TouchIn, user: dict = Depends(get_current_user)):
    # Convenience touch + logged activity only. Intentionally does NOT change stage,
    # priority, or revenue — these are NOT used for agent accountability/metrics.
    if body.channel not in _TOUCH_LABELS:
        raise HTTPException(status_code=400, detail="Invalid touch channel")
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    require_lead_access(user, lead)
    label = _TOUCH_LABELS[body.channel]
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
# Historical data import (admin). Cleaned CSV backfill for leads / payments /
# meetings with auto column-mapping, validation, de-duplication and a preview
# (commit=False) before the real insert (commit=True).
# ----------------------------------------------------------------------------
def _norm_key(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (h or "").strip().lower()).strip("_")

def _pick(row: dict, *aliases):
    for a in aliases:
        if a in row and str(row[a]).strip() != "":
            return str(row[a]).strip()
    return ""

def _parse_amount(v: str) -> float:
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(v))) if v else 0.0
    except Exception:
        return 0.0

_IMPORT_STATUS_ALIASES = {
    "new": "New / Needs Review", "needs review": "New / Needs Review",
    "contacted": "Contacted", "interested": "Interested",
    "contact in future": "Contact in Future", "future": "Contact in Future",
    "payment link sent": "Payment Link Sent", "link sent": "Payment Link Sent",
    "payment link failed": "Payment Link Failed", "failed": "Payment Link Failed",
    "payment link paid": "Payment Link Paid", "paid": "Payment Link Paid", "won": "Payment Link Paid",
    "no-show": "No-Show", "no show": "No-Show",
    "not interested": "Not Interested", "lost": "Not Interested",
    "changed their mind": "Changed Their Mind",
}

def _resolve_import_status(raw: str) -> str:
    return _IMPORT_STATUS_ALIASES.get((raw or "").strip().lower(), "New / Needs Review")

async def _user_lookup():
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500)
    by = {}
    for u in users:
        by[(u.get("name") or "").strip().lower()] = u
        by[(u.get("email") or "").strip().lower()] = u
    return by

class ImportIn(BaseModel):
    type: str
    csv_text: str
    commit: bool = False
    update_existing: bool = False

@api.post("/import/historical")
async def import_historical(body: ImportIn, admin: dict = Depends(require_admin)):
    itype = (body.type or "").strip().lower()
    if itype not in ("leads", "payments", "meetings"):
        raise HTTPException(status_code=400, detail="type must be leads, payments or meetings")
    try:
        reader = csv.DictReader(io.StringIO(body.csv_text or ""))
        rows = [{_norm_key(k): v for k, v in r.items()} for r in reader]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {e}")

    errors, preview = [], []
    created = updated = skipped = 0
    users_by = await _user_lookup()
    now = now_iso()

    for idx, row in enumerate(rows):
        line = idx + 2  # account for header line
        if itype == "leads":
            email = _pick(row, "email", "e_mail").lower()
            name = _pick(row, "name", "full_name", "contact", "contact_name")
            if not email or not name:
                errors.append({"row": line, "message": "missing name or email"}); skipped += 1; continue
            status = _resolve_import_status(_pick(row, "status", "stage"))
            owner = users_by.get(_pick(row, "owner", "owner_name", "agent", "rep").lower())
            sf = _status_fields(status)
            pl = _pick(row, "product_line", "product") or PRODUCT_LINE_NAMES[0]
            doc = {
                "id": new_id(), "name": name, "email": email,
                "company": _pick(row, "company", "account", "organization"),
                "phone": _pick(row, "phone", "mobile", "phone_number"),
                "plan": _pick(row, "plan", "current_plan"),
                "monthly_spend": _parse_amount(_pick(row, "monthly_spend", "mrr", "spend")),
                "lifetime_value": _parse_amount(_pick(row, "lifetime_value", "ltv")),
                "usage_trend": _pick(row, "usage_trend", "trend") or "stable",
                "product_history": [], "source": _pick(row, "source") or "Historical Import",
                "region": _pick(row, "region", "geo") or "Other",
                "priority": "None",
                "product_line": pl if pl in PRODUCT_LINE_NAMES else PRODUCT_LINE_NAMES[0],
                "owner_id": owner["id"] if owner else None,
                "owner_name": owner["name"] if owner else None,
                "notes": [], "ownership_history": [],
                "last_meeting_at": None, "next_meeting_at": None,
                "created_at": _pick(row, "created_at", "created", "date") or now, "updated_at": now,
                **sf,
            }
            existing = await db.leads.find_one({"email": email})
            if existing:
                if body.update_existing:
                    if body.commit:
                        upd = {k: v for k, v in doc.items() if k not in ("id", "created_at", "notes", "ownership_history")}
                        await db.leads.update_one({"id": existing["id"]}, {"$set": upd})
                    updated += 1
                else:
                    skipped += 1
            else:
                if body.commit:
                    await db.leads.insert_one(doc)
                created += 1
            if len(preview) < 8:
                preview.append({"name": name, "email": email, "company": doc["company"],
                                "status": status, "owner": doc["owner_name"] or "—",
                                "action": ("update" if existing and body.update_existing else ("skip" if existing else "create"))})

        elif itype == "payments":
            email = _pick(row, "email", "lead_email", "customer_email").lower()
            lead = await db.leads.find_one({"email": email}) if email else None
            if not lead:
                errors.append({"row": line, "message": f"no lead matched email '{email}'"}); skipped += 1; continue
            amount = _parse_amount(_pick(row, "amount_usd", "amount", "value"))
            ps = (_pick(row, "status", "payment_status") or "paid").lower()
            ps = "paid" if ps in ("paid", "complete", "completed", "won") else ("failed" if "fail" in ps else "pending")
            owner = users_by.get((lead.get("owner_name") or "").lower())
            doc = {
                "id": new_id(), "lead_id": lead["id"], "lead_name": lead["name"],
                "agent_id": (owner or {}).get("id") or lead.get("owner_id"),
                "agent_name": lead.get("owner_name"),
                "provider": _pick(row, "provider") or "manual",
                "amount": amount, "currency": "usd", "amount_usd": amount, "fx_rate": 85.0,
                "product_line": _pick(row, "product_line", "product") or lead.get("product_line") or PRODUCT_LINE_NAMES[0],
                "package_id": lead.get("package_id"), "description": _pick(row, "description") or "Historical import",
                "status": "complete" if ps == "paid" else "initiated", "payment_status": ps,
                "session_id": f"import_{new_id()[:10]}", "payment_link": None,
                "created_at": _pick(row, "created_at", "date", "paid_at") or now, "updated_at": now,
            }
            if body.commit:
                await db.payments.insert_one(doc)
            created += 1
            if len(preview) < 8:
                preview.append({"lead": lead["name"], "amount": amount, "status": ps,
                                "product_line": doc["product_line"], "action": "create"})

        else:  # meetings
            email = _pick(row, "email", "lead_email").lower()
            lead = await db.leads.find_one({"email": email}) if email else None
            if not lead:
                errors.append({"row": line, "message": f"no lead matched email '{email}'"}); skipped += 1; continue
            owner = users_by.get((lead.get("owner_name") or "").lower())
            mstatus = (_pick(row, "status") or "completed").lower().replace(" ", "_")
            mstatus = mstatus if mstatus in ("completed", "scheduled", "no_show") else "completed"
            sched = _pick(row, "scheduled_at", "time", "date", "meeting_time") or now
            doc = {
                "id": new_id(), "lead_id": lead["id"], "lead_name": lead["name"],
                "agent_id": (owner or {}).get("id") or lead.get("owner_id"),
                "agent_name": lead.get("owner_name"),
                "scheduled_at": sched, "duration": int(_parse_amount(_pick(row, "duration")) or 30),
                "status": mstatus, "source": _pick(row, "source") or "Historical Import",
                "booking_driver": _pick(row, "driver", "booking_driver") or "Renewal",
                "no_show_reason": "" , "reschedule_status": "",
                "outcome_notes": _pick(row, "notes", "outcome_notes") or "",
                "completed_at": sched if mstatus in ("completed", "no_show") else None,
                "recording_url": None, "summary": None,
                "created_at": now,
            }
            if body.commit:
                await db.meetings.insert_one(doc)
            created += 1
            if len(preview) < 8:
                preview.append({"lead": lead["name"], "scheduled_at": sched, "status": mstatus, "action": "create"})

    if body.commit:
        await log_audit("import_historical", admin["name"], itype,
                        f"{created} created, {updated} updated, {skipped} skipped")
    return {
        "type": itype, "total_rows": len(rows), "created": created, "updated": updated,
        "skipped": skipped, "committed": body.commit, "errors": errors[:20], "preview": preview,
    }


_IMPORT_TEMPLATES = {
    "leads": (
        ["name", "email", "company", "phone", "plan", "monthly_spend", "lifetime_value",
         "region", "status", "owner", "product_line", "source", "created_at"],
        [["Jane Cooper", "jane@acme.io", "Acme Inc", "+1 555 0142", "Pro $149/mo", "149", "2400",
          "North America", "Interested", "Aryan", "Credit Top-Up", "Q1 Outreach", "2026-03-12"],
         ["Raj Patel", "raj@northstar.in", "Northstar", "+91 98xxxxxx", "Team $299/mo", "299", "5200",
          "APAC", "Payment Link Paid", "Diyea", "Annual Pro Subscription", "Webinar", "2026-04-02"]],
    ),
    "payments": (
        ["customer_email", "amount", "currency", "status", "provider", "product_line", "description", "created_at"],
        [["jane@acme.io", "2500", "usd", "paid", "stripe", "Credit Top-Up", "2,500 credits", "2026-04-05"],
         ["raj@northstar.in", "1999", "usd", "paid", "razorpay", "Annual Pro Subscription", "Annual plan", "2026-04-02"]],
    ),
    "meetings": (
        ["email", "scheduled_at", "status", "duration", "driver", "notes"],
        [["jane@acme.io", "2026-04-10T14:30:00Z", "completed", "30", "Top-Up Credits", "Great call — sending link"],
         ["raj@northstar.in", "2026-04-12T15:00:00Z", "scheduled", "30", "Renewal", "Renewal discussion"]],
    ),
}

@api.get("/import/template/{itype}")
async def import_template(itype: str, admin: dict = Depends(require_admin)):
    """Downloadable CSV template (headers + 2 example rows) for the historical importer."""
    spec = _IMPORT_TEMPLATES.get((itype or "").lower())
    if not spec:
        raise HTTPException(status_code=404, detail="Unknown template type")
    headers, examples = spec
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    for row in examples:
        w.writerow(row)
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=emergentcrm_{itype}_template.csv"})


# ----------------------------------------------------------------------------
# Meetings (Calendly intake simulated)
# ----------------------------------------------------------------------------
def _meeting_date_range(request: Request):
    """Resolve ?today / ?date=YYYY-MM-DD / ?from&?to into ISO [gte, lt) bounds for the
    `scheduled_at` string (stored UTC ISO). Our IST slots (12:00-23:30) all land on the
    same UTC date, so a UTC-date range matches the calendar day. None -> unscoped."""
    def _day_bounds(d):
        return (f"{d.isoformat()}T00:00:00", f"{(d + timedelta(days=1)).isoformat()}T00:00:00")
    try:
        if request.query_params.get("today") == "true":
            return _day_bounds(datetime.now(timezone.utc).date())
        dp = request.query_params.get("date")
        if dp:
            return _day_bounds(date.fromisoformat(dp[:10]))
        frm, to = request.query_params.get("from"), request.query_params.get("to")
        if frm or to:
            gte = f"{date.fromisoformat(frm[:10]).isoformat()}T00:00:00" if frm else "0000"
            lt = f"{(date.fromisoformat(to[:10]) + timedelta(days=1)).isoformat()}T00:00:00" if to else "9999"
            return (gte, lt)
    except Exception:
        return None
    return None


@api.get("/meetings")
async def list_meetings(request: Request, user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "agent":
        q["agent_id"] = user["id"]
    driver = request.query_params.get("driver")
    if driver:
        q["booking_driver"] = driver
    rng = _meeting_date_range(request)  # scope by date in Mongo so we never drag ~10k docs
    if rng:
        q["scheduled_at"] = {"$gte": rng[0], "$lt": rng[1]}
    meetings = await db.meetings.find(q).sort("scheduled_at", 1).to_list(5000)
    return [serialize_meeting(m) for m in meetings]

async def create_google_meet(agent: dict, lead: dict, scheduled_at: str, duration: int):
    """Create a Google Calendar event with a Meet link on the ASSIGNED AGENT's calendar
    (impersonated via domain-wide delegation, so the agent is the organiser/host).
    Returns the hangoutLink, or None if creds/libs are missing or anything fails — in
    which case the caller keeps the existing mock/Calendly-provided link."""
    sa_json = await get_secret("google_service_account_json", "GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        return None
    # G11: if the agent has no Workspace identity, fall back to a designated organiser
    # so a Meet link is still produced (never silently no-link -> breaks Circleback).
    fallback_org = await get_secret("google_organiser_fallback_email", "GOOGLE_ORGANISER_FALLBACK_EMAIL")
    try:
        # Lazy imports: never break startup if google libs aren't installed.
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        info = json.loads(sa_json)
        scopes = ["https://www.googleapis.com/auth/calendar"]
        base_creds = service_account.Credentials.from_service_account_info(info, scopes=scopes)
        start = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
        end = start + timedelta(minutes=int(duration or 30))
        event_body = {
            "summary": f"Emergent · {lead.get('name')}",
            # IST timezone is explicit so a naive ISO time isn't interpreted as UTC.
            "start": {"dateTime": start.isoformat(), "timeZone": "Asia/Kolkata"},
            "end": {"dateTime": end.isoformat(), "timeZone": "Asia/Kolkata"},
            "attendees": [{"email": lead.get("email")}] if lead.get("email") else [],
            "conferenceData": {"createRequest": {
                "requestId": new_id(),
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }},
        }
        loop = asyncio.get_event_loop()

        def _insert(organiser):
            creds = base_creds.with_subject(organiser) if organiser else base_creds
            svc = build("calendar", "v3", credentials=creds, cache_discovery=False)
            return svc.events().insert(
                calendarId="primary", body=event_body, conferenceDataVersion=1,
                sendUpdates="all",
            ).execute()

        # Prefer the agent as organiser; on failure, fall back to the designated organiser.
        for organiser in [agent.get("email"), fallback_org]:
            if not organiser:
                continue
            try:
                ev = await loop.run_in_executor(None, _insert, organiser)
                return ev.get("hangoutLink")
            except Exception as e:
                logger.warning(f"Google Meet as {organiser} failed: {e}")
        return None
    except Exception as e:
        logger.warning(f"create_google_meet failed, keeping existing link: {e}")
        return None


@api.post("/meetings")
async def create_meeting(body: MeetingIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": body.lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    require_lead_access(user, lead)
    # Non-admins may only book for themselves (cannot forge another agent's id).
    if body.agent_id and not _is_admin(user) and body.agent_id != user["id"]:
        raise HTTPException(status_code=403, detail="Agents can only book meetings for themselves")
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
    require_meeting_access(user, meeting)
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


class RescheduleIn(BaseModel):
    scheduled_at: str
    duration: Optional[int] = None

@api.put("/meetings/{meeting_id}/reschedule", response_model=MeetingOut)
async def reschedule_meeting(meeting_id: str, body: RescheduleIn, user: dict = Depends(get_current_user)):
    """Move a meeting to a new time: resets it to scheduled, flags it as rescheduled,
    and advances the lead's next_meeting_at."""
    meeting = await db.meetings.find_one({"id": meeting_id})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    require_meeting_access(user, meeting)
    # G4: cap reschedules. Past the cap, flag the lead for manual follow-up rather
    # than allowing endless reschedules (no auto-no-show).
    resched_count = int(meeting.get("reschedule_count", 0))
    if resched_count >= 3:
        await db.leads.update_one({"id": meeting["lead_id"]}, {"$set": {
            "priority": "Follow-up This Week", "updated_at": now_iso(), "last_activity": now_iso()}})
        raise HTTPException(status_code=400, detail="Reschedule limit reached (3) — flagged for follow-up")
    m_set = {
        "scheduled_at": body.scheduled_at,
        "status": "scheduled",
        "reschedule_status": "rescheduled",
        "reschedule_count": resched_count + 1,
        "completed_at": None,
        "updated_at": now_iso(),
    }
    if body.duration:
        m_set["duration"] = int(body.duration)
    await db.meetings.update_one({"id": meeting_id}, {"$set": m_set})
    lead = await db.leads.find_one({"id": meeting["lead_id"]})
    if lead:
        await db.leads.update_one({"id": lead["id"]}, {"$set": {
            "next_meeting_at": body.scheduled_at, "updated_at": now_iso(), "last_activity": now_iso()}})
        await log_activity(lead["id"], "meeting", f"Meeting rescheduled to {body.scheduled_at[:16].replace('T', ' ')}", user["name"])
    return serialize_meeting(await db.meetings.find_one({"id": meeting_id}))


@api.get("/meetings/{meeting_id}", response_model=MeetingOut)
async def get_meeting(meeting_id: str, user: dict = Depends(get_current_user)):
    meeting = await db.meetings.find_one({"id": meeting_id})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    require_meeting_access(user, meeting)
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
    # Idempotency key (per booking) + campaign attribution (G1) from Calendly tracking/UTM.
    event_uri = p.get("uri") or (p.get("invitee") or {}).get("uri") or event.get("uri") or ""
    tracking = p.get("tracking") or {}
    campaign = tracking.get("utm_campaign") or tracking.get("utm_content") or tracking.get("utm_source") or ""
    return {"name": name, "email": email, "start": start, "join_url": join_url,
            "event_uri": event_uri, "campaign": campaign}


def _verify_calendly_signature(raw: bytes, request: Request, signing_key: str):
    """Verify the Calendly-Webhook-Signature HMAC when a signing key is configured.
    Demo mode (no key) accepts unsigned payloads. Raises 401 on mismatch."""
    if not signing_key:
        return
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


async def _calendly_get_or_create_lead(info: dict) -> dict:
    """Upsert a lead by email for a Calendly booking; enrich + log when newly created.
    A RETURNING customer who already converted is routed into a new upsell cycle (G2) —
    same owner, fresh LTV, +1 upsell_cycle — instead of being left stuck in Won while a
    new meeting is booked (which would corrupt the won record)."""
    lead = await db.leads.find_one({"email": info["email"]})
    if lead:
        already_won = lead.get("deals_won", 0) > 0 or lead.get("owner_locked") or lead.get("outcome") == "Won"
        if already_won:
            enr = await enrich_from_emergent(info["email"])  # refresh LTV at the upsell moment
            await db.leads.update_one({"id": lead["id"]}, {
                "$set": {**status_set("Contact in Future", owner_locked=False,
                                      priority="Follow-up This Week"),
                         "monthly_spend": enr["monthly_spend"], "lifetime_value": enr["lifetime_value"]},
                "$inc": {"upsell_cycles": 1},
            })  # deals_won / total_revenue_usd preserved (historical)
            await log_activity(lead["id"], "reopen", "Returning customer re-booked — new upsell cycle", "Calendly")
            lead = await db.leads.find_one({"id": lead["id"]})
        return lead
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
    return ldoc


async def _calendly_book_meeting(lead: dict, agent: dict, info: dict):
    """Create the meeting (Google Meet fallback), assign sticky/RR owner, advance the lead."""
    scheduled_at = info["start"] or now_iso()
    meeting = {
        "id": new_id(), "lead_id": lead["id"], "lead_name": lead["name"],
        "agent_id": agent["id"], "agent_name": agent["name"],
        "scheduled_at": scheduled_at, "duration": 30,
        "status": "scheduled", "source": "Calendly", "booking_driver": "",
        "no_show_reason": "", "reschedule_status": "", "outcome_notes": "",
        "join_url": info["join_url"] or "", "created_at": now_iso(),
        "calendly_event_uri": info.get("event_uri") or None,
    }
    if not meeting["join_url"]:
        meeting["join_url"] = await create_google_meet(agent, lead, scheduled_at, 30) or ""
    await db.meetings.insert_one(meeting)

    if not lead.get("owner_id"):
        await _assign_lead(lead, agent, "Auto (Calendly)")
    await db.leads.update_one({"id": lead["id"]}, {"$set": {
        "stage": "Assigned", "sales_stage": "Contacted",
        "next_meeting_at": scheduled_at, "updated_at": now_iso(), "last_activity": now_iso()}})
    await log_activity(lead["id"], "meeting", f"Calendly meeting booked with {agent['name']}", "Calendly")


@api.post("/webhook/calendly")
async def calendly_webhook(request: Request):
    raw = await request.body()
    signing_key = await get_secret("calendly_webhook_signing_key", "CALENDLY_WEBHOOK_SIGNING_KEY")
    _verify_calendly_signature(raw, request, signing_key)

    try:
        body = json.loads(raw.decode("utf-8") or "{}")
    except Exception:
        return {"received": True}

    event = body.get("event")
    info = _calendly_extract(body)

    # Cancellation: cancel the matched meeting, move the lead to Follow-up Later.
    if event == "invitee.canceled":
        if info.get("event_uri"):
            m = await db.meetings.find_one({"calendly_event_uri": info["event_uri"]})
            if m and m.get("status") != "cancelled":
                await db.meetings.update_one({"id": m["id"]}, {"$set": {"status": "cancelled", "updated_at": now_iso()}})
                await db.leads.update_one({"id": m["lead_id"]}, {"$set": {
                    "sales_stage": "Contact in Future", "stage": "Follow-up Later",
                    "updated_at": now_iso(), "last_activity": now_iso()}})
                await log_activity(m["lead_id"], "meeting", "Calendly meeting cancelled", "Calendly")
        return {"received": True}

    if event not in (None, "invitee.created"):
        return {"received": True}
    if not info["email"]:
        return {"received": True}

    # Idempotency: a re-delivered invitee.created for the same event books one meeting.
    if info.get("event_uri") and not await _dedupe_webhook("calendly", info["event_uri"]):
        return {"received": True}

    # Upsert lead by email — keep existing owner sticky, else round-robin among agents
    # (round-robin queries role="agent", so the admin/sales-head is excluded).
    lead = await _calendly_get_or_create_lead(info)
    if lead.get("owner_id"):
        agent = await db.users.find_one({"id": lead["owner_id"]})  # sticky owner
    else:
        agent = await _round_robin_agent()
    if not agent:
        # Never lose a paid-intent booking — park it for manual assignment.
        await db.pending_bookings.insert_one({"id": new_id(), "lead_id": lead["id"],
            "info": info, "created_at": now_iso()})
        logger.warning("calendly: no active agent -> pending_bookings")
        return {"received": True}

    await _calendly_book_meeting(lead, agent, info)

    # G1: real campaign -> booking attribution. Increment the driving campaign's booked
    # count and tag the lead, when the Calendly link carried a campaign/UTM token.
    if info.get("campaign"):
        camp = await db.campaigns.find_one({"$or": [{"id": info["campaign"]}, {"name": info["campaign"]}]})
        if camp:
            await db.campaigns.update_one({"id": camp["id"]}, {"$inc": {"booked_count": 1}})
            await db.leads.update_one({"id": lead["id"]}, {"$set": {"campaign_id": camp["id"]}})
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

def _is_credit_topup(body: "PaymentIn", pkg: Optional[dict]) -> bool:
    """A payment is multiplier-priced Credit Top-Up when its package is a Credit Top-Up,
    a multiplier is supplied, or the package id is a credits_* preset."""
    return bool(
        (pkg and pkg.get("product_line") == "Credit Top-Up")
        or body.multiplier is not None
        or (body.package_id and body.package_id.startswith("credits"))
    )


def _resolve_credit_topup_amount(body: "PaymentIn", pkg: Optional[dict]):
    """Multiplier pricing path. credits = round(amount * multiplier); multiplier clamped to
    (1, CREDIT_MULTIPLIER_MAX), default CREDIT_MULTIPLIER_DEFAULT. INR amounts convert first."""
    if body.amount and body.amount > 0:
        amount = float(body.amount)
    elif pkg and pkg.get("amount"):
        amount = float(pkg["amount"])
    else:
        raise HTTPException(status_code=400, detail="A USD amount is required for a Credit Top-Up")
    currency = (body.currency or (pkg["currency"] if pkg else "usd")).lower()

    mult = body.multiplier if body.multiplier is not None else CREDIT_MULTIPLIER_DEFAULT
    # Floor at the advertised minimum (was 1.0 — A3 bug); cap at the max.
    mult = max(float(CREDIT_MULTIPLIER_MIN), min(float(mult), float(CREDIT_MULTIPLIER_MAX)))

    amount_for_credits = amount
    if currency == "inr":
        try:
            amount_for_credits = amount / float(PRODUCT_LINES["Credit Top-Up"].get("inr_per_credit", 1) or 1)
        except Exception:
            amount_for_credits = amount
    credits = body.credits if body.credits is not None else int(round(amount_for_credits * mult))

    if body.description:
        desc = body.description
    else:
        dollar = f"${amount:,.0f}" if currency == "usd" else f"{currency.upper()} {amount:,.0f}"
        desc = f"Credit Top-Up - {dollar} -> {credits:,} credits ({mult:g}x)"

    return amount, currency, desc, credits, None, mult


def _resolve_fixed_amount(body: "PaymentIn", pkg: Optional[dict]):
    """Non-credit / legacy fixed-credit path. An explicit body.amount discounts the preset."""
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


def _resolve_payment_amount(body: "PaymentIn"):
    """Resolve (amount, currency, description, credits, boost_credits, multiplier) from a
    preset package and/or custom input. An explicit body.amount ALWAYS wins over the preset
    price so an agent can discount a deal; credits/boost can likewise be customised.
    Dispatches to the Credit Top-Up (multiplier) or fixed-amount helper. A legacy credits_*
    package with NO multiplier and NO explicit credits keeps its fixed-credit behaviour."""
    pkg = PRESET_PACKAGES.get(body.package_id) if body.package_id else None
    legacy_fixed_credit = (
        pkg is not None and body.multiplier is None and body.credits is None
        and _is_credit_topup(body, pkg)
    )
    if _is_credit_topup(body, pkg) and not legacy_fixed_credit:
        result = _resolve_credit_topup_amount(body, pkg)
    else:
        result = _resolve_fixed_amount(body, pkg)
    # Central currency + amount validation (A3): whitelist currency, reject bad amounts.
    amount = float(result[0] or 0)
    currency = (result[1] or "usd").lower()
    if currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"Unsupported currency '{currency}' (USD or INR only)")
    if amount <= 0 or amount > MAX_PAYMENT_AMOUNT:
        raise HTTPException(status_code=400, detail="Invalid payment amount")
    return (amount, currency) + tuple(result[2:])


async def _create_stripe_link(body, amount, currency, payment_id, user, desc=""):
    simulated = (
        f"cs_test_{payment_id[:12]}",
        f"{body.origin_url}/payment-return?session_id=cs_test_{payment_id[:12]}&pid={payment_id}",
    )
    api_key = await get_secret("stripe_secret_key", "STRIPE_API_KEY")
    if not api_key:
        return simulated
    # success/cancel are browser redirects -> the frontend origin. The webhook URL is
    # server-to-server and is PINNED to the server's public base (P2-e: never client).
    success_url = f"{body.origin_url}/payment-return?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{body.origin_url}/payments"
    webhook_url = f"{_public_base(body.origin_url)}/api/webhook/stripe"
    metadata = {"lead_id": body.lead_id, "payment_id": payment_id, "agent_id": user["id"]}
    # Primary path: emergentintegrations (the Emergent platform package).
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
        req = CheckoutSessionRequest(amount=amount, currency=currency,
            success_url=success_url, cancel_url=cancel_url, metadata=metadata)
        session = await stripe_checkout.create_checkout_session(req)
        return session.session_id, session.url
    except ImportError:
        pass  # off-platform -> official SDK below
    except Exception as e:
        logger.warning(f"Stripe (emergentintegrations) failed, simulating: {e}")
        return simulated
    # Fallback: official `stripe` SDK with the CORRECT minor-unit amount (x100). Stripe
    # expects the smallest currency unit (usd cents / inr paise).
    try:
        import stripe
        stripe.api_key = api_key
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{"price_data": {"currency": currency,
                "unit_amount": int(round(float(amount) * 100)),
                "product_data": {"name": desc or "Emergent upsell"}}, "quantity": 1}],
            success_url=success_url, cancel_url=cancel_url,
            metadata=metadata, idempotency_key=payment_id)
        return session.id, session.url
    except Exception as e:
        logger.warning(f"Stripe (official SDK) failed, simulating: {e}")
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
    # Resolve the lead: explicit lead_id, else auto-link by customer email, else STANDALONE.
    lead = None
    cust_email = (body.customer_email or "").strip().lower() or None
    if body.lead_id:
        lead = await db.leads.find_one({"id": body.lead_id})
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        require_lead_access(user, lead)
    elif cust_email:
        lead = await db.leads.find_one({"email": cust_email})  # auto-link on match
        if lead:
            require_lead_access(user, lead)

    amount, currency, desc, credits, boost_credits, multiplier = _resolve_payment_amount(body)
    # Rail guard (B4): Razorpay handles INR only; USD goes to Stripe. (Manual = any.)
    if body.provider == "razorpay" and currency != "inr":
        raise HTTPException(status_code=400, detail="Razorpay handles INR only — use Stripe for USD")
    if body.provider == "stripe" and currency == "inr":
        raise HTTPException(status_code=400, detail="Use Razorpay for INR payments")
    fx_rate = await get_inr_rate()
    if fx_rate <= 0:
        fx_rate = 85.0
    amount_usd = round(amount / fx_rate, 2) if currency == "inr" else round(amount, 2)

    product_line = package_product_line(body.package_id) or (lead.get("product_line") if lead else "") or ""
    email_final = cust_email or (lead.get("email") if lead else None)

    payment_id = new_id()
    record = {
        "id": payment_id,
        "lead_id": (lead["id"] if lead else None),
        "lead_name": (lead["name"] if lead else (body.customer_name or email_final or "Standalone link")),
        "customer_email": email_final,
        "customer_name": body.customer_name or (lead.get("name") if lead else None),
        "link_type": ("lead" if lead else "standalone"),
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
        record["session_id"], record["payment_link"] = await _create_stripe_link(body, amount, currency, payment_id, user, desc)
    elif body.provider == "manual":
        record["session_id"], record["payment_link"] = f"manual_{payment_id[:12]}", ""
    else:
        simulated = (
            f"rzp_{payment_id[:12]}",
            f"{body.origin_url}/payment-return?session_id=rzp_{payment_id[:12]}&pid={payment_id}",
        )
        record["session_id"], record["payment_link"] = await _create_razorpay_link(
            body, amount, currency, payment_id, lead or {}, simulated)

    await db.payments.insert_one(record)
    # Lead side-effects ONLY when this payment is attached to a lead.
    if lead:
        lead_set = {
            "stage": "Payment Link Sent", "sales_stage": "Payment Link Sent",
            "payment_status": "link_sent", "payment_state": "Link Sent", "outcome": "",
            "priority": "Payment Pending", "provider": body.provider,
            "amount": amount, "currency": currency,
            "updated_at": now_iso(), "last_activity": now_iso(),
        }
        if product_line:
            lead_set["product_line"] = product_line
        if body.package_id:
            lead_set["package_id"] = body.package_id
        await db.leads.update_one({"id": lead["id"]}, {"$set": lead_set})
        await log_activity(lead["id"], "payment", f"{body.provider.title()} payment link sent: {currency.upper()} {amount:.0f} (~${amount_usd:.0f})", user["name"])
    # Manual payment already received -> mark paid (G5). Standalone too (counts toward
    # the agent's revenue; touches no lead).
    if body.provider == "manual" and body.mark_paid:
        await _apply_payment_status(record, "complete", "paid")
        record = await db.payments.find_one({"id": payment_id})
    return clean(record)

@api.get("/payments/status/{session_id}", response_model=PaymentOut)
async def payment_status(session_id: str, user: dict = Depends(get_current_user)):
    record = await db.payments.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")
    await require_payment_access(user, record)

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
    """Simulate completion of a (mock) payment link. DEMO ONLY — in production a deal
    can only become Won via a real provider webhook against a real paid payment record."""
    if IS_PROD:
        raise HTTPException(status_code=403, detail="Disabled in production")
    record = await db.payments.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")
    await require_payment_access(user, record)
    await _apply_payment_status(record, "complete", "paid")
    return clean(await db.payments.find_one({"session_id": session_id}))

@api.post("/payments/fail/{session_id}", response_model=PaymentOut)
async def fail_payment(session_id: str, user: dict = Depends(get_current_user)):
    """Simulate a failed payment link (demo) — moves the lead to the recoverable
    'Payment Link Failed' status. DEMO ONLY; never crashes."""
    if IS_PROD:
        raise HTTPException(status_code=403, detail="Disabled in production")
    record = await db.payments.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")
    await require_payment_access(user, record)
    await _apply_payment_status(record, "failed", "failed")
    return clean(await db.payments.find_one({"session_id": session_id}))

async def _apply_payment_status(record: dict, status: str, payment_status: str):
    if record["payment_status"] == "paid":
        return
    update = {"status": status, "payment_status": payment_status, "updated_at": now_iso()}
    if payment_status == "paid":
        update["paid_at"] = now_iso()  # explicit paid timestamp for the payment detail view
    await db.payments.update_one({"id": record["id"]}, {"$set": update})
    lead_id = record.get("lead_id")  # standalone payments have none -> skip lead writes
    if payment_status == "paid":
        if lead_id:
            amt_usd = record.get("amount_usd", record["amount"])
            # The ONE place a deal becomes Won (G5): always against a real paid payment
            # record. Routed through status_set so all five status fields stay consistent.
            lead_set = status_set("Payment Link Paid", priority="None",
                                  next_action="View customer / ask for referral")
            if record.get("product_line"):
                lead_set["product_line"] = record["product_line"]
            await db.leads.update_one({"id": lead_id}, {
                "$set": lead_set,
                "$inc": {"total_revenue_usd": amt_usd, "deals_won": 1},
            })
            await log_activity(lead_id, "payment",
                               f"Payment completed: {record['currency'].upper()} {record['amount']:.0f} (~${record.get('amount_usd', record['amount']):.0f}) 🎉",
                               record["agent_name"])
    elif payment_status in ("failed", "expired", "canceled", "cancelled"):
        # Payment Link Failed -> recoverable (spec §4). Keep the lead in the active
        # journey; don't lock or count revenue.
        if lead_id:
            await db.leads.update_one({"id": lead_id}, {"$set": status_set(
                "Payment Link Failed", priority="Follow-up This Week",
                next_action="Retry payment link")})
            await log_activity(lead_id, "payment",
                               f"Payment link {payment_status} — recoverable", record.get("agent_name") or "System")

class LinkLeadIn(BaseModel):
    lead_id: str
    roll_revenue: bool = True

@api.post("/payments/{payment_id}/link-lead", response_model=PaymentOut)
async def link_payment_to_lead(payment_id: str, body: LinkLeadIn, user: dict = Depends(get_current_user)):
    """Associate a standalone (lead-less) payment with a lead. If it's already paid and
    roll_revenue is set, roll the revenue onto the lead and mark it Won."""
    record = await db.payments.find_one({"id": payment_id})
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")
    await require_payment_access(user, record)
    lead = await db.leads.find_one({"id": body.lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    require_lead_access(user, lead)
    await db.payments.update_one({"id": payment_id}, {"$set": {
        "lead_id": lead["id"], "lead_name": lead["name"], "link_type": "lead",
        "reconciled": True, "updated_at": now_iso()}})
    await log_activity(lead["id"], "payment",
                       f"Linked a {record['currency'].upper()} {record.get('amount', 0):.0f} payment to this lead",
                       user["name"])
    if record.get("payment_status") == "paid" and body.roll_revenue:
        amt_usd = record.get("amount_usd", record.get("amount", 0))
        await db.leads.update_one({"id": lead["id"]}, {
            "$set": status_set("Payment Link Paid", priority="None"),
            "$inc": {"total_revenue_usd": amt_usd, "deals_won": 1}})
    return clean(await db.payments.find_one({"id": payment_id}))

async def _dedupe_webhook(provider: str, event_id: str) -> bool:
    """First time we see this provider event -> True (process). Replay -> False (skip).
    Atomic via the unique webhook_events index (A4)."""
    if not event_id:
        return True  # can't dedupe -> process (idempotent appliers are the backstop)
    try:
        await db.webhook_events.insert_one({"event_key": f"{provider}:{event_id}", "at": now_iso()})
        return True
    except DuplicateKeyError:
        return False

@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    api_key = await get_secret("stripe_secret_key", "STRIPE_API_KEY")
    if not api_key:
        return {"received": True}  # demo / no Stripe configured
    webhook_secret = await get_secret("stripe_webhook_secret", "STRIPE_WEBHOOK_SECRET")
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    session_id = payment_status = event_id = None
    try:
        try:
            import stripe
            stripe.api_key = api_key
            event = (stripe.Webhook.construct_event(body, sig, webhook_secret)
                     if webhook_secret else json.loads(body.decode("utf-8") or "{}"))
            event_id = event.get("id")
            obj = (event.get("data") or {}).get("object") or {}
            session_id = obj.get("id")
            payment_status = "paid" if (event.get("type") == "checkout.session.completed"
                                        or obj.get("payment_status") == "paid") else obj.get("payment_status")
        except ImportError:
            from emergentintegrations.payments.stripe.checkout import StripeCheckout
            ev = await StripeCheckout(api_key=api_key, webhook_url="").handle_webhook(body, sig)
            session_id, payment_status, event_id = ev.session_id, ev.payment_status, ev.session_id
    except Exception as e:
        # Signature/verification failure -> 400 (never swallow to 200 = looks valid).
        logger.error(f"stripe webhook rejected: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook")
    if not await _dedupe_webhook("stripe", event_id):
        return {"received": True}  # replay
    if session_id and payment_status:
        record = await db.payments.find_one({"session_id": session_id})
        if record:
            await _apply_payment_status(record, "complete", payment_status)
        else:
            await db.payment_reconcile.insert_one({"provider": "stripe", "session_id": session_id, "at": now_iso()})
            logger.warning(f"stripe webhook: unknown session {session_id} -> queued for reconcile")
    return {"received": True}

def _verify_razorpay_signature(raw: bytes, request: Request, secret: str):
    """Verify X-Razorpay-Signature when a secret is configured (demo mode accepts
    unsigned). Raises 401 on mismatch."""
    if not secret:
        return
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


@api.post("/webhook/razorpay")
async def razorpay_webhook(request: Request):
    """Razorpay Payment Link webhook. Verifies the signature when
    RAZORPAY_WEBHOOK_SECRET is set (demo mode accepts unsigned), then marks the
    matching payment paid/failed. Never crashes."""
    raw = await request.body()
    secret = await get_secret("razorpay_webhook_secret", "RAZORPAY_WEBHOOK_SECRET")
    _verify_razorpay_signature(raw, request, secret)
    try:
        body = json.loads(raw.decode("utf-8") or "{}")
    except Exception:
        return {"received": True}
    event = body.get("event") or ""
    payload = body.get("payload") or {}
    plink = ((payload.get("payment_link") or {}).get("entity")) or {}
    payment_ent = ((payload.get("payment") or {}).get("entity")) or {}
    link_id = plink.get("id") or payment_ent.get("payment_link_id")
    event_id = request.headers.get("x-razorpay-event-id") or payment_ent.get("id") or f"{link_id}:{event}"
    record = await db.payments.find_one({"session_id": link_id}) if link_id else None
    if record and await _dedupe_webhook("razorpay", event_id):
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


def _deal_value(l, inr_rate):
    """USD deal value of a lead: explicit amount (INR converted at inr_rate), else monthly_spend."""
    val = float(l.get("amount") or 0)
    if (l.get("currency") or "usd") == "inr" and val:
        val = round(val / inr_rate, 2)
    if not val:
        val = float(l.get("monthly_spend") or 0)
    return val


def _attach_derived_status(leads):
    """Attach `_status` (derived visible badge) + `_groups` (reporting groups) to each lead
    in place, tolerating legacy leads via map_legacy_stage. Single source of truth for rollups."""
    for l in leads:
        legacy = map_legacy_stage(l.get("stage", "New Booking"), l.get("payment_status", ""))
        st = derive_status(
            l.get("sales_stage") or legacy["stage"],
            l.get("outcome", "") or legacy["outcome"],
            l.get("payment_state") or legacy["payment_status"],
        )
        l["_status"] = st
        l["_groups"] = status_group(st)


def _compute_group_counts(win_leads, leads, inr_rate):
    """Funnel stage counts + visible-status counts + windowed/open reporting-group rollups.
    Requires _attach_derived_status() to have run. Returns
    (stage_counts, status_counts, win_group_counts, open_group_counts)."""
    stage_counts = {s: 0 for s in PIPELINE_STAGES}
    for l in win_leads:
        key = l.get("stage", "New Booking")
        stage_counts[key] = stage_counts.get(key, 0) + 1

    status_counts = {s: 0 for s in VISIBLE_STATUSES}
    win_group_counts = {g: {"count": 0, "value_usd": 0.0} for g in STATUS_GROUPS}
    for l in win_leads:
        st = l["_status"]
        status_counts[st] = status_counts.get(st, 0) + 1
        for g in l["_groups"]:
            win_group_counts[g]["count"] += 1
            win_group_counts[g]["value_usd"] += _deal_value(l, inr_rate)

    # Open-pipeline / recoverable / lost describe CURRENT state across all in-scope leads.
    open_group_counts = {g: {"count": 0, "value_usd": 0.0} for g in STATUS_GROUPS}
    for l in leads:
        for g in l["_groups"]:
            open_group_counts[g]["count"] += 1
            open_group_counts[g]["value_usd"] += _deal_value(l, inr_rate)
    return stage_counts, status_counts, win_group_counts, open_group_counts


def _compute_product_revenue(win_payments, leads, inr_rate):
    """Per product-line cards: won (paid in-window) revenue/count + open pipeline value/count.
    Robust to payments that never stored product_line: derive it from the lead, then the
    package, and bucket anything unrecognised into "Other" so the cards reconcile with the
    total Revenue Closed (this also protects real CRM data, not just the demo seed)."""
    lead_pl = {l.get("id"): (l.get("product_line") or "") for l in leads}
    keys = PRODUCT_LINE_NAMES + ["Other"]
    product_revenue = {pl: {"won_revenue": 0.0, "won_count": 0, "pipeline_value": 0.0, "pipeline_count": 0}
                       for pl in keys}

    def _bucket(raw_pl, lead_id, package_id=None):
        pl = raw_pl or lead_pl.get(lead_id) or package_product_line(package_id) or ""
        return pl if pl in product_revenue else "Other"

    for p in win_payments:
        if p.get("payment_status") != "paid":
            continue
        pl = _bucket(p.get("product_line"), p.get("lead_id"), p.get("package_id"))
        product_revenue[pl]["won_revenue"] += p.get("amount_usd", p.get("amount", 0)) or 0
        product_revenue[pl]["won_count"] += 1
    for l in leads:
        if "Active Pipeline" not in l["_groups"]:
            continue
        pl = _bucket(l.get("product_line"), l.get("id"), l.get("package_id"))
        product_revenue[pl]["pipeline_value"] += _deal_value(l, inr_rate)
        product_revenue[pl]["pipeline_count"] += 1
    # Drop the "Other" card when it carries nothing, so the UI stays clean.
    if (product_revenue["Other"]["won_revenue"] == 0 and product_revenue["Other"]["pipeline_value"] == 0
            and product_revenue["Other"]["won_count"] == 0 and product_revenue["Other"]["pipeline_count"] == 0):
        product_revenue.pop("Other")
    return product_revenue


def _today_meeting_buckets(meetings):
    """Split meetings into (today, completed_today, no_show_today) by date string prefix."""
    today = datetime.now(timezone.utc).date().isoformat()
    meetings_today = [m for m in meetings if (m.get("scheduled_at") or "").startswith(today)]
    completed_today = [m for m in meetings if (m.get("completed_at") or "").startswith(today) and m["status"] == "completed"]
    noshow_today = [m for m in meetings if (m.get("completed_at") or "").startswith(today) and m["status"] == "no_show"]
    return meetings_today, completed_today, noshow_today


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
    # Meetings are scoped by date in Mongo (the collection is ~10k on a packed demo): one
    # query for TODAY's buckets, one for the selected window (booking-driver + leaderboard
    # stats). 'All time' is floored to the last 90 days so neither query drags everything.
    _m_proj = {"_id": 0, "id": 1, "lead_id": 1, "lead_name": 1, "agent_id": 1, "agent_name": 1,
               "scheduled_at": 1, "completed_at": 1, "status": 1, "source": 1, "booking_driver": 1, "duration": 1}
    _today = datetime.now(timezone.utc).date()
    today_meetings = await db.meetings.find({**agent_scope, "scheduled_at": {
        "$gte": f"{_today.isoformat()}T00:00:00",
        "$lt": f"{(_today + timedelta(days=1)).isoformat()}T00:00:00"}}, _m_proj).to_list(5000)
    _m_start = win_start or (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    _m_cond = {"$gte": _m_start}
    if win_end:
        _m_cond["$lt"] = win_end
    win_meetings = await db.meetings.find({**agent_scope, "scheduled_at": _m_cond}, _m_proj).to_list(8000)
    payments = await db.payments.find(agent_scope, {"_id": 0, "amount": 1, "amount_usd": 1, "payment_status": 1, "agent_id": 1, "product_line": 1, "lead_id": 1, "created_at": 1}).to_list(5000)

    # Window-scoped slices share lead/payment object refs with the full set.
    win_leads = [l for l in leads if _in_window(l.get("created_at"), win_start, win_end)]
    win_payments = [p for p in payments if _in_window(p.get("created_at"), win_start, win_end)]
    inr_rate = await get_inr_rate()

    _attach_derived_status(leads)
    stage_counts, status_counts, win_group_counts, open_group_counts = _compute_group_counts(win_leads, leads, inr_rate)
    product_revenue = _compute_product_revenue(win_payments, leads, inr_rate)
    meetings_today, completed_today, noshow_today = _today_meeting_buckets(today_meetings)
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
        # Pipeline / recoverable / lost now reflect the SELECTED PERIOD (created-in-window),
        # so the KPI card matches its drill-down. (Was current-state, ignoring the filter.)
        "pipeline_value": round(win_group_counts["Active Pipeline"]["value_usd"], 2),
        "recoverable_count": win_group_counts["Recoverable"]["count"],
        "recoverable_value": round(win_group_counts["Recoverable"]["value_usd"], 2),
        "lost_count": win_group_counts["Lost"]["count"],
        # Payment pending = Payment Link Sent status (awaiting payment), not failed/paid.
        "payment_pending": status_counts.get("Payment Link Sent", 0),
        "payment_failed": status_counts.get("Payment Link Failed", 0),
        "follow_up": len([l for l in leads if l.get("priority") == "Follow-up This Week"]),
        "hot": len([l for l in leads if l.get("priority") == "Hot"]),
        "target": 0 if is_admin else user.get("monthly_target", 0),
        "weekly_target": 0 if is_admin else user.get("weekly_target", 0),
        "won_count": status_counts.get("Payment Link Paid", 0),
        "booking_drivers": _booking_driver_stats(win_meetings, won_lead_ids),
    }

    if is_admin:
        # Include the selling manager (Diyea) on the leaderboard, but never the demo
        # showcase account. Round-robin still excludes admins (handled elsewhere).
        demo_email = os.environ.get("DEMO_EMAIL", "demo@emergent.sh").lower()
        sellers = await db.users.find({
            "role": {"$in": ["agent", "admin"]}, "active": True,
            "email": {"$ne": demo_email},
        }).to_list(100)
        result["team_target"] = sum(a.get("monthly_target", 0) for a in sellers)
        # Leaderboard reflects the window: leads created in-window + payments paid in-window.
        result["per_agent"] = _agent_leaderboard(sellers, win_leads, win_meetings, win_payments)
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

async def _drill_revenue_closed(lead_scope, agent_scope, today, win_start, win_end):
    q = {**agent_scope, "payment_status": "paid"}
    rows = await db.payments.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return "Closed Revenue", [_payment_row(p) for p in rows if _in_window(p.get("created_at"), win_start, win_end)]


async def _drill_open_pipeline(lead_scope, agent_scope, today, win_start, win_end):
    q = {**lead_scope, "stage": {"$in": OPEN_STAGES}}
    rows = await db.leads.find(q, {"_id": 0}).sort("updated_at", -1).to_list(5000)
    return "Open Pipeline", [_lead_row(l) for l in rows if _in_window(l.get("created_at"), win_start, win_end)]


async def _drill_meetings_today(lead_scope, agent_scope, today, win_start, win_end):
    day = {"$gte": f"{today}T00:00:00", "$lt": f"{today}T99"}  # all of the UTC day (string range)
    rows = await db.meetings.find({**agent_scope, "scheduled_at": day}, {"_id": 0}).sort("scheduled_at", 1).to_list(5000)
    return "Meetings Today", [_meeting_row(m) for m in rows]


async def _drill_no_shows_today(lead_scope, agent_scope, today, win_start, win_end):
    day = {"$gte": f"{today}T00:00:00", "$lt": f"{today}T99"}
    rows = await db.meetings.find({**agent_scope, "status": "no_show", "completed_at": day}, {"_id": 0}).to_list(5000)
    return "No-Shows Today", [_meeting_row(m) for m in rows]


async def _drill_payment_pending(lead_scope, agent_scope, today, win_start, win_end):
    q = {**lead_scope, "$or": [{"priority": "Payment Pending"}, {"stage": "Payment Link Sent"}]}
    rows = await db.leads.find(q, {"_id": 0}).sort("updated_at", -1).to_list(5000)
    return "Payment Pending", [_lead_row(l) for l in rows if _in_window(l.get("created_at"), win_start, win_end)]


async def _drill_recoverable(lead_scope, agent_scope, today, win_start, win_end):
    rows = await db.leads.find(lead_scope, {"_id": 0}).sort("updated_at", -1).to_list(5000)
    return "Recoverable", [r for r in (_lead_row(l) for l in rows)
                           if "Recoverable" in (r.get("status_groups") or [])
                           and _in_window(r.get("created_at"), win_start, win_end)]


async def _drill_payment_failed(lead_scope, agent_scope, today, win_start, win_end):
    rows = await db.leads.find(lead_scope, {"_id": 0}).sort("updated_at", -1).to_list(5000)
    return "Payment Link Failed", [r for r in (_lead_row(l) for l in rows)
                                   if r.get("status") == "Payment Link Failed"
                                   and _in_window(r.get("created_at"), win_start, win_end)]


_DRILL_HANDLERS = {
    "revenue_closed": _drill_revenue_closed,
    "open_pipeline": _drill_open_pipeline,
    "meetings_today": _drill_meetings_today,
    "no_shows_today": _drill_no_shows_today,
    "payment_pending": _drill_payment_pending,
    "recoverable": _drill_recoverable,
    "payment_failed": _drill_payment_failed,
}


async def _drill_prefixed(metric, lead_scope, win_start, win_end):
    """status:/group:/stage: drilldowns — leads windowed by created_at."""
    kind, value = metric.split(":", 1)
    rows = await db.leads.find(lead_scope, {"_id": 0}).sort("updated_at", -1).to_list(5000)
    rows = [l for l in rows if _in_window(l.get("created_at"), win_start, win_end)]
    if kind == "status":
        return f"Status - {value}", [r for r in (_lead_row(l) for l in rows) if r.get("status") == value]
    if kind == "group":
        return f"Group - {value}", [r for r in (_lead_row(l) for l in rows) if value in (r.get("status_groups") or [])]
    # stage: accept either a legacy PIPELINE_STAGES value OR a new visible status.
    if value in PIPELINE_STAGES:
        return f"Stage - {value}", [_lead_row(l) for l in rows if l.get("stage") == value]
    return f"Stage - {value}", [r for r in (_lead_row(l) for l in rows) if r.get("status") == value]


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

    handler = _DRILL_HANDLERS.get(metric)
    if handler:
        title, items = await handler(lead_scope, agent_scope, today, win_start, win_end)
    elif ":" in metric and metric.split(":", 1)[0] in ("status", "group", "stage"):
        title, items = await _drill_prefixed(metric, lead_scope, win_start, win_end)
    else:
        title, items = metric, []

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
    # Scope by day in Mongo (the grid asks for one date at a time) so a packed calendar
    # never pulls ~10k docs per request.
    drange = _meeting_date_range(request)
    if drange:
        q["scheduled_at"] = {"$gte": drange[0], "$lt": drange[1]}

    meetings = await db.meetings.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(5000)
    rows = [_meeting_row(m) for m in meetings]

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
    admin_password = os.environ.get("ADMIN_PASSWORD", "emergent@12345")
    admin = await db.users.find_one({"email": admin_email})
    if not admin:
        created = await _safe_insert(db.users, {
            "id": new_id(), "name": "Diyea", "email": admin_email,
            "password_hash": hash_password(admin_password), "role": "admin",
            # Empty by default -> UI falls back to initials until an avatar is uploaded.
            "avatar_url": "",
            # Diyea sells too (manager + agent), so she carries a real target + appears
            # on the leaderboard.
            "monthly_target": 120000.0, "weekly_target": 30000.0, "active": True, "created_at": now_iso(),
        })
        logger.info(f"seed: admin {'created' if created else 'already present (race)'} -> {admin_email}")
    # NOTE: no per-boot password self-heal — so a user's self-service password change persists.


async def _seed_demo_account():
    """Single advertised demo login. Admin role so it showcases ALL demo data. Its password
    is self-healed to demo12345 on every boot (it's a demo account, not a real user)."""
    demo_email = os.environ.get("DEMO_EMAIL", "demo@emergent.sh").lower()
    demo_password = os.environ.get("DEMO_PASSWORD", "demo12345")
    demo = await db.users.find_one({"email": demo_email})
    if not demo:
        await _safe_insert(db.users, {
            "id": new_id(), "name": "Demo Manager", "email": demo_email,
            "password_hash": hash_password(demo_password), "role": "admin",
            "avatar_url": "", "monthly_target": 0, "weekly_target": 0,
            "active": True, "created_at": now_iso(),
        })
        logger.info(f"seed: demo account created -> {demo_email}")
    elif not verify_password(demo_password, demo.get("password_hash", "")):
        await db.users.update_one({"email": demo_email}, {"$set": {"password_hash": hash_password(demo_password)}})


async def _migrate_reset_passwords():
    """One-time: reset every real team account (admin + agents, excluding the demo account)
    to emergent@12345. Guarded by the migrations collection so it runs exactly once and never
    fights a user who later changes their own password."""
    key = "reset_team_passwords_emergent12345_v1"
    if await db.migrations.find_one({"key": key}):
        return
    res = await db.users.update_many(
        {"role": {"$in": ["admin", "agent"]}, "email": {"$ne": "demo@emergent.sh"}},
        {"$set": {"password_hash": hash_password("emergent@12345")}},
    )
    await db.migrations.update_one({"key": key}, {"$set": {"key": key, "done_at": now_iso()}}, upsert=True)
    logger.info(f"migrate: reset {res.modified_count} team passwords -> emergent@12345")


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
            "password_hash": hash_password("emergent@12345"), "role": "agent",
            "avatar_url": "", "monthly_target": 100000.0,
            "weekly_target": 25000.0, "active": True, "created_at": now_iso(),
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


def status_set(status: str, **extra) -> dict:
    """Single source of truth for a lead status write: projects a visible status onto
    ALL five storage fields (stage/sales_stage/outcome/payment_status/payment_state) so
    no writer can drift them. Merge extra fields (priority, next_action, …). 400 on a
    bad status. 'Payment Link Paid' also locks the owner + stamps won_at."""
    if status not in VISIBLE_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status '{status}'")
    fields = _status_fields(status)
    fields["updated_at"] = now_iso()
    fields["last_activity"] = now_iso()
    if status == "Payment Link Paid":
        fields["owner_locked"] = True
        fields["won_at"] = now_iso()
    fields.update(extra)
    return fields


# product_line -> (package_id, amount, currency) for seeded deals (USD default).
_SEED_PRODUCT = {
    "Credit Top-Up":            ("credits_500", 100.0, "usd"),
    "Annual Pro Subscription":  ("annual_pro", 1999.0, "usd"),
    "Dedicated Support":        ("dedicated_support", 3499.0, "usd"),
    "Lifetime Access":          ("lifetime_access", 15000.0, "usd"),
}


async def _seed_demo_leads():
    if await db.leads.count_documents({}) != 0:
        return
    agents = await db.users.find({"role": "agent"}).sort("created_at", 1).to_list(100)
    if not agents:
        return
    # Diyea (admin / sales head) also carries a book of business, so she's in the rotation.
    admin = await db.users.find_one(
        {"role": "admin", "email": os.environ.get("ADMIN_EMAIL", "diyea@emergent.sh").lower()})
    owners_pool = list(agents)
    if admin:
        owners_pool.append(admin)
    by_name = {o["name"]: o for o in owners_pool}

    def pick(name):
        return by_name.get(name) or owners_pool[0]

    now = datetime.now(timezone.utc)
    products = PRODUCT_LINE_NAMES

    import random as _random
    rng = _random.Random(42)  # deterministic so the demo is stable across reseeds

    # Weighted rep attribution for the OPEN pipeline (incl. Diyea); Brian is the
    # lowest contributor but still solid.
    _owner_weights = [("Diyea", 24), ("Aryan", 22), ("Dipan", 18), ("Vinay", 16),
                      ("Abhishek", 12), ("Brian", 8)]
    _weighted_owner_names = [nm for nm, w in _owner_weights for _ in range(w)]

    def pick_owner():
        return pick(rng.choice(_weighted_owner_names))

    # Per-agent MONTHLY won-revenue targets — the inside-sales floor is ~$100k/agent/month.
    # The won generator books deals until each (agent, month) reaches its number, so the
    # leaderboard reads ~$100k/agent for any month, Diyea/Aryan top, Brian unambiguously last.
    monthly_target = {"Diyea": 110000, "Aryan": 105000, "Abhishek": 95000,
                      "Dipan": 90000, "Vinay": 88000, "Brian": 45000}
    MONTHS = [(2026, 4), (2026, 5), (2026, 6)]

    def month_bounds(y, m):
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        nxt = datetime(y + 1, 1, 1, tzinfo=timezone.utc) if m == 12 else datetime(y, m + 1, 1, tzinfo=timezone.utc)
        return start, min(nxt, now)

    def rand_dt(start, end):
        span = max(1.0, (end - start).total_seconds())
        return start + timedelta(seconds=rng.random() * span)

    def deal_for(owner_name=None, paid=False):
        """Mid-market deal sizing: deals mostly $1k-5k, top-ups $2-5k, occasional $15k
        Lifetime. Brian's WON deals are capped small so he stays the lowest earner."""
        if paid and owner_name == "Brian":
            return "Credit Top-Up", "credits_500", float(rng.choice([1200, 1500, 1800]))
        r = rng.randint(1, 100)
        if r <= 50:
            return "Credit Top-Up", "credits_500", float(rng.choice([2000, 2500, 3000, 3500, 4000, 5000]))
        if r <= 72:
            return "Annual Pro Subscription", "annual_pro", 1999.0
        if r <= 92:
            return "Dedicated Support", "dedicated_support", float(rng.choice([1350, 2400, 3499, 4200]))
        return "Lifetime Access", "lifetime_access", 15000.0

    # ---- Build ~150 believable leads: hand-written anchors + generated pool ----
    companies = [
        ("Northwind Analytics", "Priya Raman",      "priya@northwind.io",        "North America", "Pro $149/mo",   149, 2400, "rising"),
        ("Cobalt Robotics",     "Daniel Whitfield", "daniel@cobaltrobotics.io",  "North America", "Team $299/mo",  299, 5200, "rising"),
        ("Larkspur Media",      "Sofia Mendez",     "sofia@larkspur.media",      "LATAM",         "Pro $99/mo",    99,  1500, "stable"),
        ("Aperture Labs",       "Marcus Feld",      "marcus@aperturelabs.dev",   "Europe",        "Pro $199/mo",   199, 3300, "rising"),
        ("Tidal Commerce",      "Hana Suzuki",      "hana@tidalcommerce.jp",     "APAC",          "Team $249/mo",  249, 4100, "rising"),
        ("Meridian Health",     "Olu Adeyemi",      "olu@meridianhealth.io",     "MEA",           "Pro $129/mo",   129, 1900, "stable"),
        ("Helios Energy",       "Aisha Rahman",     "aisha@helios.energy",       "MEA",           "Team $299/mo",  299, 6100, "rising"),
        ("Kestrel Finance",     "Ananya Iyer",      "ananya@kestrel.finance",    "APAC",          "Pro $189/mo",   189, 3000, "rising"),
        ("Granite Security",    "Liam O'Connor",    "liam@granitesec.io",        "North America", "Team $299/mo",  299, 5500, "rising"),
        ("Lighthouse AI",       "Wei Chen",         "wei@lighthouseai.sg",       "APAC",          "Team $299/mo",  299, 5900, "rising"),
        ("Onyx Trading",        "Dmitri Volkov",    "dmitri@onyxtrading.io",     "Europe",        "Pro $199/mo",   199, 3400, "rising"),
        ("Vantage Insurance",   "Sebastian Cruz",   "sebastian@vantageins.com",  "LATAM",         "Team $299/mo",  299, 5000, "rising"),
        ("Ironclad Devices",    "Arjun Mehta",      "arjun@ironclad.dev",        "APAC",          "Pro $199/mo",   199, 3600, "rising"),
        ("Nimbus Robotics",     "Erik Larsson",     "erik@nimbusrobotics.se",    "Europe",        "Team $249/mo",  249, 4800, "rising"),
        ("Atlas Freight",       "Fatima Noor",      "fatima@atlasfreight.ae",    "MEA",           "Team $249/mo",  249, 4200, "rising"),
    ]
    _firsts = ["Priya", "Daniel", "Sofia", "Marcus", "Hana", "Olu", "Eleanor", "Tomas", "Aisha",
               "Jordan", "Ananya", "Rivka", "Kenji", "Liam", "Neha", "Mateo", "Grace", "Yara",
               "Erik", "Isabella", "Carlos", "Wei", "Hannah", "Dmitri", "Brianna", "Noah", "Lucas",
               "Fatima", "Oliver", "Mina", "Ryan", "Amara", "Sebastian", "Chloe", "Arjun", "Emma",
               "Ravi", "Mei", "Diego", "Leila", "Sven", "Nadia", "Felix", "Zara", "Omar", "Lena",
               "Hugo", "Sara", "Kai", "Ingrid", "Pablo", "Yuki", "Tariq", "Anika", "Bjorn", "Camila"]
    _lasts = ["Raman", "Whitfield", "Mendez", "Feld", "Suzuki", "Adeyemi", "Hayes", "Ribeiro",
              "Rahman", "Blake", "Iyer", "Adler", "Watanabe", "Connor", "Kapadia", "Alvarez",
              "Thornton", "Haddad", "Larsson", "Rossi", "Nunez", "Chen", "Brooks", "Volkov",
              "Scott", "Bergmann", "Pereira", "Noor", "Bennett", "Park", "Mitchell", "Okafor",
              "Cruz", "Dubois", "Mehta", "Larsen", "Kumar", "Tan", "Silva", "Haan", "Novak"]
    _stems = ["Northwind", "Cobalt", "Larkspur", "Aperture", "Tidal", "Meridian", "Bramble",
              "Vela", "Helios", "Pinecrest", "Kestrel", "Solstice", "Orbit", "Granite", "Saffron",
              "Cypress", "Birchwood", "Dunes", "Nimbus", "Coral", "Summit", "Lighthouse", "Ferndale",
              "Onyx", "Palmetto", "Zephyr", "Verdant", "Atlas", "Quill", "Beacon", "Cedar", "Halcyon",
              "Vantage", "Maplewood", "Ironclad", "Willowbrook", "Sable", "Marigold", "Thorne", "Vireo"]
    _types = ["Analytics", "Robotics", "Media", "Labs", "Commerce", "Health", "Logistics", "Energy",
              "Studios", "Finance", "Cloud", "Legal", "Retail", "Trading", "Care", "Audio", "Farms",
              "Freight", "Systems", "Mobility", "Security", "AI", "Edtech", "Devices", "Group"]
    _regions = ["North America", "Europe", "APAC", "LATAM", "MEA"]
    _plans = [("Starter $59/mo", 59, 700), ("Pro $99/mo", 99, 1200), ("Pro $149/mo", 149, 2200),
              ("Pro $199/mo", 199, 3300), ("Team $249/mo", 249, 4400), ("Team $299/mo", 299, 5800)]
    _tlds = ["io", "com", "dev", "co", "ai", "app"]
    _seen_emails = set()
    _anchor_iter = iter(companies)

    def next_identity():
        """A fresh (company, name, email, region, plan, spend, ltv, trend) — hand-written
        anchors first, then unique generated leads. Real names only, never a placeholder."""
        a = next(_anchor_iter, None)
        if a is not None:
            comp, nm, em, region, plan, spend, ltv, trend = a
            _seen_emails.add(em.lower())
            return (comp, nm, em.lower(), region, plan, float(spend), float(ltv), trend)
        for _ in range(300):
            fn, ln = rng.choice(_firsts), rng.choice(_lasts)
            stem, typ = rng.choice(_stems), rng.choice(_types)
            comp = f"{stem} {typ}"
            dom = f"{stem.lower()}{rng.choice(['', 'hq', 'app'])}.{rng.choice(_tlds)}"
            email = f"{fn.lower()}.{ln.lower()}{rng.randint(1, 99)}@{dom}"
            if email in _seen_emails:
                continue
            _seen_emails.add(email)
            plan, spend, ltv = rng.choice(_plans)
            return (comp, f"{fn} {ln}", email, rng.choice(_regions), plan, float(spend),
                    float(ltv + rng.randint(-300, 900)), rng.choice(["rising", "stable", "declining"]))
        em = f"lead{len(_seen_emails)}@example.io"
        _seen_emails.add(em)
        return ("Acme Co", "Pat Lee", em, "North America", "Pro $149/mo", 149.0, 2200.0, "stable")

    # Open-pipeline mix (won deals are generated separately, by month + agent, below).
    open_plan = (
        ["New / Needs Review"] * 70 +
        ["Contacted"] * 70 +
        ["Interested"] * 60 +
        ["Contact in Future"] * 36 +
        ["Payment Link Sent"] * 34 +
        ["Payment Link Failed"] * 16 +
        ["No-Show"] * 30 +
        ["Not Interested"] * 18 +
        ["Changed Their Mind"] * 10
    )
    rng.shuffle(open_plan)

    note_templates = {
        "New / Needs Review": [
            "Inbound from the pricing page — needs qualification.",
            "Signed up recently and already hitting credit limits.",
        ],
        "Contacted": [
            "Left a voicemail and sent an intro email. Awaiting reply.",
            "Connected briefly — booking a discovery call this week.",
        ],
        "Interested": [
            "Great call. Wants annual plan pricing in writing.",
            "Loves the product; comparing Pro vs Team tier.",
        ],
        "Contact in Future": [
            "Budget opens next quarter — follow up in a few weeks.",
            "Champion is on leave; reconnect later this month.",
        ],
        "Payment Link Sent": [
            "Sent the payment link for the annual plan, awaiting payment.",
            "Following up tomorrow if the link isn't paid.",
        ],
        "Payment Link Failed": [
            "Card was declined — sent a fresh link via another provider.",
            "Customer retrying payment with a corporate card.",
        ],
        "Payment Link Paid": [
            "Closed! Upgraded to the annual plan. Ask for a referral.",
            "Paid in full — onboarding call scheduled.",
        ],
        "No-Show": [
            "No-show on the demo — sent a reschedule link.",
            "Missed the call; trying to re-book for later this week.",
        ],
        "Not Interested": [
            "Going with a competitor for now. Logged the loss reason.",
            "Too early stage — not a fit this cycle.",
        ],
        "Changed Their Mind": [
            "Was ready to buy but paused after internal review.",
            "Cooled off on the upgrade; set a recovery task.",
        ],
    }

    next_action_map = {
        "New / Needs Review": "Review and qualify",
        "Contacted": "Book a discovery call",
        "Interested": "Send payment link",
        "Contact in Future": "Follow up next cycle",
        "Payment Link Sent": "Check payment status",
        "Payment Link Failed": "Resend payment link",
        "Payment Link Paid": "Ask for a referral",
        "No-Show": "Reschedule the meeting",
        "Not Interested": "Add loss reason",
        "Changed Their Mind": "Run recovery task",
    }

    sources = ["Q1 Power User Outreach", "Inbound - Pricing Page", "Product Qualified Lead",
               "Webinar Follow-up", "March Campaign — Power Users", "April Reactivation",
               "May Upgrade Push", "June Renewal Drive"]

    leads_buf, pay_buf, act_buf = [], [], []
    leads_by_owner = {o["id"]: [] for o in owners_pool}
    phone_seq = [0]

    def _payment_doc(doc, owner, prod, pkg, amt, provider, pay_status, created_iso):
        ps_map = {"paid": ("complete", "paid"), "pending": ("initiated", "pending"),
                  "failed": ("initiated", "failed")}
        st, pst = ps_map[pay_status]
        return {
            "id": new_id(), "lead_id": doc["id"], "lead_name": doc["name"],
            "agent_id": owner["id"], "agent_name": owner["name"],
            "provider": provider, "amount": amt, "currency": "usd",
            "product_line": prod, "package_id": pkg,
            "amount_usd": amt, "fx_rate": 85.0, "description": prod,
            "status": st, "payment_status": pst,
            "session_id": f"seed_{new_id()[:10]}",
            # always keep a link so the payment-detail view has a URL to show
            "payment_link": f"https://pay.demo/{new_id()[:8]}",
            "paid_at": created_iso if pay_status == "paid" else None,
            "created_at": created_iso, "updated_at": created_iso,
        }

    def build_lead(identity, status, owner, created_dt, *, amount, product_line, pkg_id,
                   won_at=None, total_revenue=None, deals_won=None, upsell_cycles=0,
                   next_followup=None, stale=False):
        company, nm, email, region, plan, spend, ltv, trend = identity
        sf = _status_fields(status)
        phone_seq[0] += 1
        seq = phone_seq[0]
        provider = rng.choice(["stripe", "razorpay", "manual"])
        is_paid = status == "Payment Link Paid"
        tmpl = note_templates.get(status, ["Touched base with the customer."])
        note_count = 1 if status == "New / Needs Review" else 2
        notes = []
        for j in range(min(note_count, len(tmpl))):
            note_dt = created_dt + timedelta(days=j + 1, hours=rng.randint(1, 8))
            if note_dt > now:
                note_dt = now - timedelta(hours=rng.randint(1, 20))
            notes.append({"id": new_id(), "text": tmpl[j],
                          "type": "Call Outcome" if j == 0 else "Note",
                          "author": owner["name"] if owner else "System",
                          "created_at": note_dt.isoformat()})
        last_contacted = max([created_dt.isoformat()] + [nn["created_at"] for nn in notes])
        last_activity = last_contacted
        if stale:
            notes = notes[:1]
            last_activity = (now - timedelta(days=rng.randint(9, 20))).isoformat()
            last_contacted = last_activity
        priority = ("Payment Pending" if status in ("Payment Link Sent", "Payment Link Failed")
                    else ("Hot" if status == "Interested" else "None"))
        doc = {
            "id": new_id(), "name": nm, "email": email, "company": company,
            "phone": f"+1 555 0{100 + seq:04d}", "plan": plan, "monthly_spend": float(spend),
            "lifetime_value": float(ltv), "usage_trend": trend, "product_history": ["API", "Dashboard"],
            "source": rng.choice(sources), "region": region, "priority": priority,
            "owner_id": owner["id"] if owner else None,
            "owner_name": owner["name"] if owner else None,
            "owner_locked": bool(is_paid and owner),
            "total_revenue_usd": float(total_revenue if total_revenue is not None else (amount if is_paid else 0.0)),
            "deals_won": int(deals_won if deals_won is not None else (1 if is_paid else 0)),
            "upsell_cycles": int(upsell_cycles),
            "notes": notes, "ownership_history": [],
            "product_line": product_line, "package_id": pkg_id, "amount": amount, "currency": "usd",
            "provider": provider,
            "next_action": next_action_map.get(status, "Review and qualify"),
            "next_action_at": next_followup, "next_followup_at": next_followup,
            "last_contacted_at": last_contacted,
            "loss_reason": ("Chose a competitor" if status == "Not Interested" else ""),
            "referred_by_lead_id": None, "referred_by_name": "",
            "last_meeting_at": None, "next_meeting_at": None,
            "won_at": won_at, "last_activity": last_activity,
            "created_at": created_dt.isoformat(), "updated_at": last_activity, **sf,
        }
        if owner:
            act_buf.append({"id": new_id(), "lead_id": doc["id"], "type": "assignment",
                            "description": f"Assigned to {owner['name']}", "actor": "System",
                            "created_at": doc["created_at"]})
        for nn in notes:
            act_buf.append({"id": new_id(), "lead_id": doc["id"], "type": "note",
                            "description": f"{nn['type']}: {nn['text'][:80]}",
                            "actor": nn["author"], "created_at": nn["created_at"]})
        leads_buf.append(doc)
        if owner:
            leads_by_owner[owner["id"]].append(doc)
        return doc

    # ---- Phase 1: WON deals, generated per (agent, month) until the target is hit ----
    for (y, m) in MONTHS:
        mstart, mend = month_bounds(y, m)
        if mend <= mstart:
            continue
        factor = 0.72 if (y, m) == (2026, 6) else 1.0   # June is mid-month -> on-pace, not full
        for owner in owners_pool:
            target = monthly_target.get(owner["name"], 90000) * factor
            booked, guard = 0.0, 0
            while booked < target and guard < 400:
                guard += 1
                prod, pkg, amt = deal_for(owner["name"], paid=True)
                if amt >= 15000 and booked + amt > target + 6000:
                    prod, pkg, amt = "Credit Top-Up", "credits_500", float(rng.choice([2000, 3000, 4000, 5000]))
                won_dt = rand_dt(mstart, mend)
                created_dt = won_dt - timedelta(days=rng.randint(1, 12))
                doc = build_lead(next_identity(), "Payment Link Paid", owner, created_dt,
                                 amount=amt, product_line=prod, pkg_id=pkg, won_at=won_dt.isoformat())
                # ~25% are returning customers with a prior deal in an earlier month
                if owner["name"] != "Brian" and rng.random() < 0.25:
                    p_pl, p_pk, p_amt = deal_for(owner["name"], True)
                    p_dt = created_dt - timedelta(days=rng.randint(30, 80))
                    doc["deals_won"], doc["upsell_cycles"] = 2, 1
                    doc["total_revenue_usd"] = amt + p_amt
                    pay_buf.append(_payment_doc(doc, owner, p_pl, p_pk, p_amt,
                                                rng.choice(["stripe", "razorpay"]), "paid", p_dt.isoformat()))
                pay_buf.append(_payment_doc(doc, owner, prod, pkg, amt, doc["provider"], "paid", won_dt.isoformat()))
                booked += amt

    # ---- Phase 2: open pipeline (the funnel + My Work material), spread Apr -> today ----
    apr1 = datetime(2026, 4, 1, tzinfo=timezone.utc)
    for idx, status in enumerate(open_plan):
        owner = None if (status == "New / Needs Review" and idx % 5 == 0) else pick_owner()
        if status in ("New / Needs Review", "Contacted", "Payment Link Sent", "Payment Link Failed"):
            cdt = now - timedelta(days=rng.randint(0, 30), hours=rng.randint(0, 12))
        elif status == "Interested":
            cdt = now - timedelta(days=rng.randint(1, 45), hours=rng.randint(0, 12))
        else:
            cdt = now - timedelta(days=rng.randint(5, 80), hours=rng.randint(0, 12))
        if cdt < apr1:
            cdt = apr1 + timedelta(days=rng.randint(0, 10))
        prod, pkg, amt = deal_for(owner["name"] if owner else None, False)
        next_followup = None
        if status in ("Contact in Future", "Interested", "Payment Link Sent", "No-Show", "Contacted"):
            d = timedelta(days=rng.randint(1, 5))
            next_followup = ((now - d) if idx % 3 == 0 else (now + d)).isoformat()
        stale = status in ("Contacted", "Interested") and idx % 7 == 0
        doc = build_lead(next_identity(), status, owner, cdt, amount=amt, product_line=prod,
                         pkg_id=pkg, next_followup=next_followup, stale=stale)
        if status in ("Payment Link Sent", "Payment Link Failed") and owner:
            pay_buf.append(_payment_doc(doc, owner, prod, pkg, amt, doc["provider"],
                                        "failed" if status == "Payment Link Failed" else "pending", cdt.isoformat()))

    # ---- Bulk insert (batched so boot stays fast at this volume) ----
    for k in range(0, len(leads_buf), 500):
        await db.leads.insert_many(leads_buf[k:k + 500])
    for k in range(0, len(pay_buf), 500):
        await db.payments.insert_many(pay_buf[k:k + 500])
    for k in range(0, len(act_buf), 1000):
        await db.activities.insert_many(act_buf[k:k + 1000])
    logger.info(f"seed: {len(leads_buf)} leads, {len(pay_buf)} payments")

    await _seed_demo_meetings(now, owners_pool, leads_by_owner)


async def _seed_demo_meetings(now, owners_pool, leads_by_owner):
    """Full-density calendars: every rep's day is booked across the 24 half-hour IST slots
    (12:00pm-12:00am), ~21-24/day. PAST days settle 40% completed / 60% no-show; today and
    the coming week are 'scheduled'. ~10k meetings total, inserted in batches to keep boot
    fast. Each meeting references one of the rep's own leads (a lead may host several)."""
    import random as _r
    rng = _r.Random(1234)
    drivers = ["Discount", "Lifetime Access", "Top-Up Credits", "Support", "Renewal", "Pricing / Upgrade"]
    summary = ("Customer is a power user hitting credit limits; interested in the annual plan and "
               "dedicated support. Wants pricing in writing. Next step: send payment link.")
    SLOTS = [(h, mn) for h in range(12, 24) for mn in (0, 30)]  # 24 IST half-hour slots

    def ist_to_utc(day, hour, minute):
        return (datetime(day.year, day.month, day.day, hour, minute, tzinfo=timezone.utc)
                - timedelta(hours=5, minutes=30))

    today = now.date()
    start_day = date(2026, 4, 1)
    end_day = today + timedelta(days=7)   # a booked-out upcoming week too
    mt_buf = []
    next_meeting = {}   # lead_id -> earliest upcoming scheduled_at

    for owner in owners_pool:
        own = leads_by_owner.get(owner["id"], [])
        if not own:
            continue
        d = start_day
        while d <= end_day:
            for (h, mn) in rng.sample(SLOTS, rng.randint(21, 24)):
                sched = ist_to_utc(d, h, mn)
                mstatus = "scheduled" if d >= today else ("completed" if rng.random() < 0.40 else "no_show")
                completed = mstatus == "completed"
                has_rec = completed and rng.random() < 0.4
                lead = rng.choice(own)
                mt_buf.append({
                    "id": new_id(), "lead_id": lead["id"], "lead_name": lead["name"],
                    "agent_id": owner["id"], "agent_name": owner["name"],
                    "scheduled_at": sched.isoformat(), "duration": 30,
                    "status": mstatus, "source": "Calendly", "booking_driver": rng.choice(drivers),
                    "no_show_reason": "Did not join" if mstatus == "no_show" else "",
                    "reschedule_status": "", "outcome_notes": "Discussed upgrade options" if completed else "",
                    "completed_at": sched.isoformat() if mstatus in ("completed", "no_show") else None,
                    "recording_url": f"https://app.circleback.ai/recordings/{new_id()[:10]}" if has_rec else None,
                    "summary": summary if has_rec else None,
                    "join_url": f"https://meet.google.com/{new_id()[:3]}-{new_id()[:4]}-{new_id()[:3]}",
                    "calendly_event_uri": None,
                    "created_at": (sched - timedelta(days=rng.randint(1, 4))).isoformat(),
                })
                if mstatus == "scheduled" and sched >= now:
                    prev = next_meeting.get(lead["id"])
                    if prev is None or sched.isoformat() < prev:
                        next_meeting[lead["id"]] = sched.isoformat()
            d = d + timedelta(days=1)

    for k in range(0, len(mt_buf), 1000):
        await db.meetings.insert_many(mt_buf[k:k + 1000])
    # stamp the earliest upcoming meeting on each lead (bounded to future-booked leads)
    for lid, sa in next_meeting.items():
        await db.leads.update_one({"id": lid}, {"$set": {"next_meeting_at": sa}})
    logger.info(f"seed: {len(mt_buf)} meetings across {len(owners_pool)} reps")


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


# ----------------------------------------------------------------------------
# Secure integration key storage (encrypted at rest, masked on read) + per-user
# keys. Org keys are admin-managed; agents can store their own (e.g. Calendly).
# ----------------------------------------------------------------------------
from cryptography.fernet import Fernet as _Fernet
import base64 as _b64, hashlib as _hashlib

def _fernet():
    # Decoupled from JWT_SECRET (D3.2): rotating the JWT secret must not invalidate
    # stored integration keys. Falls back to JWT_SECRET in demo (no extra env needed).
    base = INTEGRATION_ENC_KEY or JWT_SECRET
    key = _b64.urlsafe_b64encode(_hashlib.sha256(base.encode()).digest())
    return _Fernet(key)

def _enc(v: str) -> str:
    return _fernet().encrypt(v.encode()).decode() if v else ""

def _dec(v: str) -> str:
    try:
        return _fernet().decrypt(v.encode()).decode() if v else ""
    except Exception:
        return ""

def _mask_secret(v: str) -> str:
    if not v:
        return ""
    return ("•" * 6) + v[-4:] if len(v) > 4 else "••••"

ORG_INTEGRATION_FIELDS = [
    "stripe_secret_key", "stripe_publishable_key", "stripe_webhook_secret",
    "razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret",
    "calendly_token", "calendly_webhook_signing_key",
    "circleback_api_key", "circleback_api_url",
    "sendgrid_api_key", "from_email",
    "google_service_account_json", "google_organiser_fallback_email",
    "emergent_users_api_url", "emergent_users_api_key",
]
MY_INTEGRATION_FIELDS = ["calendly_link", "calendly_token"]
# Non-secret fields are echoed back in full; everything else is masked.
_NON_SECRET = {"stripe_publishable_key", "razorpay_key_id", "calendly_link",
               "circleback_api_url", "from_email", "google_organiser_fallback_email",
               "emergent_users_api_url"}

# B1: resolve a secret from the encrypted org-integrations doc FIRST, then env fallback.
# Cached 30s per replica so Settings changes take effect quickly without a redeploy.
_SECRET_CACHE = {"ts": 0.0, "doc": {}}
async def _org_secrets() -> dict:
    now = time.time()
    if now - _SECRET_CACHE["ts"] > 30:
        doc = await _read_integration_doc("org")
        _SECRET_CACHE["doc"] = {f: _dec(doc.get(f, "")) for f in ORG_INTEGRATION_FIELDS}
        _SECRET_CACHE["ts"] = now
    return _SECRET_CACHE["doc"]

async def get_secret(field: str, *env_names: str) -> str:
    """Stored encrypted key (Settings) beats env beats ''. Used by every adapter."""
    v = (await _org_secrets()).get(field, "")
    if v:
        return v
    for e in env_names:
        if os.environ.get(e):
            return os.environ[e]
    return ""

def _public_base(origin_url: str = "") -> str:
    """Server-pinned base URL for webhook/success URLs (P2-e: never trust client origin)."""
    return PUBLIC_BASE_URL or origin_url or ""

async def _read_integration_doc(doc_id: str) -> dict:
    return await db.integrations.find_one({"id": doc_id}) or {}

def _present_integrations(doc: dict, fields: list) -> dict:
    out = {}
    for f in fields:
        raw = _dec(doc.get(f, ""))
        out[f] = {"configured": bool(raw), "masked": (raw if f in _NON_SECRET else _mask_secret(raw))}
    return out

async def _save_integrations(doc_id: str, fields: list, body: dict):
    update = {}
    for f in fields:
        if f in body and body[f] is not None:
            val = str(body[f]).strip()
            update[f] = _enc(val) if val else ""
    if update:
        update["updated_at"] = now_iso()
        await db.integrations.update_one({"id": doc_id}, {"$set": {"id": doc_id, **update}}, upsert=True)

@api.get("/settings/integrations")
async def get_org_integrations(admin: dict = Depends(require_admin)):
    doc = await _read_integration_doc("org")
    return {"fields": _present_integrations(doc, ORG_INTEGRATION_FIELDS)}

@api.put("/settings/integrations")
async def put_org_integrations(body: dict, admin: dict = Depends(require_admin)):
    await _save_integrations("org", ORG_INTEGRATION_FIELDS, body)
    _SECRET_CACHE["ts"] = 0  # invalidate so new keys take effect immediately
    await log_audit("update_integrations", admin["name"], "Org API keys")
    doc = await _read_integration_doc("org")
    return {"fields": _present_integrations(doc, ORG_INTEGRATION_FIELDS)}

@api.get("/settings/my-integrations")
async def get_my_integrations(user: dict = Depends(get_current_user)):
    doc = await _read_integration_doc(f"user:{user['id']}")
    return {"fields": _present_integrations(doc, MY_INTEGRATION_FIELDS)}

@api.put("/settings/my-integrations")
async def put_my_integrations(body: dict, user: dict = Depends(get_current_user)):
    await _save_integrations(f"user:{user['id']}", MY_INTEGRATION_FIELDS, body)
    doc = await _read_integration_doc(f"user:{user['id']}")
    return {"fields": _present_integrations(doc, MY_INTEGRATION_FIELDS)}

@api.post("/settings/integrations/test/{name}")
async def test_integration(name: str, admin: dict = Depends(require_admin)):
    """B9: verify an integration before go-live. Returns {ok, detail} with the real
    provider error on failure — turns silent mock-fallback into visible failure."""
    name = (name or "").lower()
    try:
        if name == "stripe":
            key = await get_secret("stripe_secret_key", "STRIPE_API_KEY")
            if not key:
                return {"ok": False, "detail": "No Stripe key configured"}
            try:
                import stripe
                stripe.api_key = key
                bal = stripe.Balance.retrieve()
                return {"ok": True, "detail": f"Stripe reachable (livemode={getattr(bal, 'livemode', '?')})"}
            except Exception as e:
                return {"ok": False, "detail": f"Stripe error: {e}"}
        if name == "razorpay":
            kid = await get_secret("razorpay_key_id", "RAZORPAY_KEY_ID")
            ksec = await get_secret("razorpay_key_secret", "RAZORPAY_KEY_SECRET")
            if not (kid and ksec):
                return {"ok": False, "detail": "Razorpay keys not configured"}
            import urllib.request, base64
            req = urllib.request.Request("https://api.razorpay.com/v1/payments?count=1")
            req.add_header("Authorization", "Basic " + base64.b64encode(f"{kid}:{ksec}".encode()).decode())
            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: urllib.request.urlopen(req, timeout=10).read())
                return {"ok": True, "detail": "Razorpay auth OK"}
            except Exception as e:
                return {"ok": False, "detail": f"Razorpay error: {e}"}
        if name in ("google_meet", "google"):
            sa = await get_secret("google_service_account_json", "GOOGLE_SERVICE_ACCOUNT_JSON")
            if not sa:
                return {"ok": False, "detail": "Not configured"}
            try:
                json.loads(sa)
                return {"ok": True, "detail": "Service-account JSON present and valid"}
            except Exception:
                return {"ok": False, "detail": "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON"}
        # Config-presence checks for the rest (a live call needs side-effecting calls).
        presence = {
            "calendly": ("calendly_token", "CALENDLY_TOKEN"),
            "circleback": ("circleback_api_key", "CIRCLEBACK_API_KEY"),
            "sendgrid": ("sendgrid_api_key", "SENDGRID_API_KEY"),
            "emergent_users": ("emergent_users_api_url", "EMERGENT_USERS_API_URL"),
            "emergent": ("emergent_users_api_url", "EMERGENT_USERS_API_URL"),
        }
        if name in presence:
            field, env = presence[name]
            v = await get_secret(field, env)
            return {"ok": bool(v), "detail": "Configured" if v else "Not configured"}
        return {"ok": False, "detail": f"Unknown integration '{name}'"}
    except Exception as e:
        return {"ok": False, "detail": str(e)}

# ----------------------------------------------------------------------------
# Agent workspace ("My Work"): everything an agent needs to track active leads
# and conversations. Scoped to the signed-in user (the manager sees her own book
# since she also sells; the team rollup lives on the Dashboard).
# ----------------------------------------------------------------------------
@api.get("/workspace")
async def workspace(user: dict = Depends(get_current_user)):
    uid = user["id"]
    now = datetime.now(timezone.utc)
    now_s = now.isoformat()
    today = now.date().isoformat()

    leads_raw = await db.leads.find({"owner_id": uid}, {"_id": 0}).sort("updated_at", -1).to_list(5000)
    sl = [serialize_lead(l) for l in leads_raw]
    meetings_raw = await db.meetings.find({"agent_id": uid}, {"_id": 0}).sort("scheduled_at", 1).to_list(5000)
    payments = await db.payments.find({"agent_id": uid, "payment_status": "paid"}, {"_id": 0}).to_list(5000)

    def _active(l):
        return "Active Pipeline" in (l.get("status_groups") or [])

    today_meetings = [serialize_meeting(m) for m in meetings_raw
                      if (m.get("scheduled_at") or "").startswith(today) and m.get("status") == "scheduled"]
    upcoming = [serialize_meeting(m) for m in meetings_raw
                if m.get("status") == "scheduled" and (m.get("scheduled_at") or "") > now_s][:8]

    payment_pending = [l for l in sl if l.get("status") in ("Payment Link Sent", "Payment Link Failed")]

    def _due(l):
        for k in ("next_followup_at", "next_action_at"):
            v = l.get(k)
            if v and v <= now_s:
                return True
        return False
    followups_due = [l for l in sl if _due(l) and _active(l)]

    cutoff = (now - timedelta(days=7)).isoformat()
    stale = [l for l in sl if _active(l) and (l.get("last_activity") or l.get("updated_at") or "") < cutoff]

    notes = []
    for l in leads_raw:
        for n in (l.get("notes") or []):
            notes.append({**n, "lead_id": l.get("id"), "lead_name": l.get("name")})
    notes.sort(key=lambda n: n.get("created_at") or "", reverse=True)

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    revenue_month = sum(p.get("amount_usd", p.get("amount", 0)) or 0
                        for p in payments if (p.get("created_at") or "") >= month_start)
    won_month = sum(1 for l in sl if l.get("status") == "Payment Link Paid" and (l.get("won_at") or "") >= month_start)
    meetings_week = sum(1 for m in meetings_raw if (m.get("scheduled_at") or "") >= week_start)

    return {
        "user": {"id": uid, "name": user["name"]},
        "stats": {
            "open_leads": sum(1 for l in sl if _active(l)),
            "won_this_month": won_month,
            "revenue_this_month": round(revenue_month, 2),
            "meetings_this_week": meetings_week,
            "followups_due": len(followups_due),
            "payment_pending": len(payment_pending),
        },
        "today_meetings": today_meetings,
        "upcoming_meetings": upcoming,
        "followups_due": followups_due[:20],
        "payment_pending": payment_pending[:20],
        "needs_attention": stale[:20],
        "recent_conversations": notes[:15],
    }

# ----------------------------------------------------------------------------
# Demo data reset (admin) — wipe + reseed the believable demo dataset on demand.
# ----------------------------------------------------------------------------
async def _wipe_demo_data():
    for coll in ("leads", "payments", "meetings", "activities", "coverage_snapshots"):
        await db[coll].delete_many({})

async def reset_demo_data():
    await _wipe_demo_data()
    await _seed_demo_leads()
    await _seed_coverage_history()

@api.post("/demo/reset")
async def demo_reset(admin: dict = Depends(require_admin)):
    if IS_PROD:
        raise HTTPException(status_code=403, detail="Demo reset is disabled in production")
    await reset_demo_data()
    await log_audit("reset_demo_data", admin["name"], "Demo dataset")
    return {
        "ok": True,
        "leads": await db.leads.count_documents({}),
        "payments": await db.payments.count_documents({}),
        "meetings": await db.meetings.count_documents({}),
    }

async def _migrate_clean_reseed_v3():
    """One-time: wipe the test-polluted demo data and reseed the believable dataset.
    DEMO ONLY — short-circuits in production BEFORE any wipe decision (it calls
    delete_many({}) on real collections; the migration key is absent on a fresh
    prod DB, so without this guard the first prod boot would wipe real data)."""
    if IS_PROD:
        return
    key = "clean_reseed_believable_v7"
    if await db.migrations.find_one({"key": key}):
        return
    await reset_demo_data()
    await db.migrations.update_one({"key": key}, {"$set": {"key": key, "done_at": now_iso()}}, upsert=True)
    logger.info("migrate: wiped test data + reseeded believable demo dataset")


async def _migrate_purge_test_leads():
    """Delete leads created by the live test suites (name 'T', emails like t_<hex>@x.com)
    plus their dependent meetings/payments/activities, so test runs never pollute the demo.
    DEMO ONLY; idempotent + cheap, so it runs every boot."""
    if IS_PROD:
        return
    try:
        # The live suites create leads on throwaway domains (@x.com / @nobody.test) — real
        # demo leads never use these — plus the classic name "T". Purge all of them.
        patt = {"$or": [
            {"email": {"$regex": r"@(x\.com|nobody\.test)$", "$options": "i"}},
            {"name": "T"},
        ]}
        ids = [l["id"] for l in await db.leads.find(patt, {"id": 1}).to_list(5000)]
        if not ids:
            return
        await db.leads.delete_many({"id": {"$in": ids}})
        for coll in ("meetings", "payments", "activities"):
            await db[coll].delete_many({"lead_id": {"$in": ids}})
        logger.info(f"migrate: purged {len(ids)} test-pollution leads")
    except Exception as e:
        logger.warning(f"purge-test-leads failed (continuing): {e}")

async def _migrate_remove_legacy_com_users():
    """Remove any legacy @emergent.com user accounts (the team is canonical @emergent.sh)
    and reassign their leads/meetings/payments to the matching @emergent.sh rep by name.
    Fixes the duplicate-rep problem. Idempotent + safe in every mode."""
    try:
        legacy = await db.users.find({"email": {"$regex": "@emergent\\.com$", "$options": "i"}}).to_list(100)
        for u in legacy:
            match = await db.users.find_one({
                "name": u.get("name"), "email": {"$regex": "@emergent\\.sh$", "$options": "i"}})
            if match:
                for coll, fields in (("leads", ("owner_id",)), ("meetings", ("agent_id",)),
                                     ("payments", ("agent_id",))):
                    for f in fields:
                        await db[coll].update_many({f: u["id"]}, {"$set": {f: match["id"]}})
                # keep denormalised owner/agent names consistent after reassignment
                await db.leads.update_many({"owner_id": match["id"]},
                                           {"$set": {"owner_name": match["name"]}})
                await db.meetings.update_many({"agent_id": match["id"]},
                                              {"$set": {"agent_name": match["name"]}})
                await db.payments.update_many({"agent_id": match["id"]},
                                              {"$set": {"agent_name": match["name"]}})
            await db.users.delete_one({"id": u["id"]})
        if legacy:
            logger.info(f"migrate: removed {len(legacy)} legacy @emergent.com user(s)")
    except Exception as e:
        logger.warning(f"legacy-com user cleanup failed (continuing): {e}")


async def _migrate_ensure_diyea_target():
    """Keep the team's sales targets current (the inside-sales floor is ~$100k/agent/month).
    Reseeds wipe leads/payments/meetings but NOT users, so existing accounts need their
    targets refreshed here. Diyea (manager + seller) carries a higher number. Idempotent."""
    try:
        admin_email = os.environ.get("ADMIN_EMAIL", "diyea@emergent.sh").lower()
        demo_email = os.environ.get("DEMO_EMAIL", "demo@emergent.sh").lower()
        # Selling agents -> $100k/month.
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"monthly_target": 120000.0, "weekly_target": 30000.0}})
        await db.users.update_many(
            {"role": "agent", "email": {"$ne": demo_email}},
            {"$set": {"monthly_target": 100000.0, "weekly_target": 25000.0}})
    except Exception as e:
        logger.warning(f"ensure-targets failed (continuing): {e}")


async def _migrate_dedupe_lead_emails():
    """Merge duplicate-email leads into the OLDEST one so a unique index can be created
    (D3.4). Idempotent + safe to run every boot. Reassigns meetings/payments/activities
    to the keeper, unions notes, sums revenue/deals, lowercases the keeper email."""
    try:
        groups = await db.leads.aggregate([
            {"$group": {"_id": {"$toLower": "$email"}, "ids": {"$addToSet": "$id"}, "n": {"$sum": 1}}},
            {"$match": {"n": {"$gt": 1}}},
        ]).to_list(10000)
        merged = 0
        for grp in groups:
            leads = await db.leads.find({"id": {"$in": grp["ids"]}}).to_list(1000)
            leads.sort(key=lambda l: l.get("created_at") or "")
            keeper, losers = leads[0], leads[1:]
            notes = list(keeper.get("notes") or [])
            rev = float(keeper.get("total_revenue_usd") or 0)
            deals = int(keeper.get("deals_won") or 0)
            for lo in losers:
                notes.extend(lo.get("notes") or [])
                rev += float(lo.get("total_revenue_usd") or 0)
                deals += int(lo.get("deals_won") or 0)
                for coll in ("meetings", "payments", "activities"):
                    await db[coll].update_many({"lead_id": lo["id"]}, {"$set": {"lead_id": keeper["id"]}})
                await db.leads.delete_one({"id": lo["id"]})
            await db.leads.update_one({"id": keeper["id"]}, {"$set": {
                "notes": notes, "total_revenue_usd": rev, "deals_won": deals,
                "email": (keeper.get("email") or "").lower(), "updated_at": now_iso()}})
            merged += len(losers)
        if merged:
            logger.info(f"migrate: merged {merged} duplicate-email leads")
    except Exception as e:
        logger.warning(f"lead-email dedupe failed (continuing): {e}")


async def bootstrap_production():
    """Always-safe, idempotent bootstrap that runs in EVERY mode: settings, the
    structural (non-destructive) migrations, and the single admin account. Contains
    nothing that deletes data or resets passwords."""
    await db.settings.update_one({"id": "settings"}, {"$setOnInsert": {"id": "settings", "inr_per_usd": 85.0}}, upsert=True)
    await _migrate_meeting_scheduled_to_assigned()
    await _migrate_to_sales_status_model()
    await _migrate_remove_legacy_com_users()
    await _seed_admin()
    await _migrate_ensure_diyea_target()

async def seed_demo():
    """DEMO ONLY: the 5 demo agents, the demo account, the one-time team-password
    reset, the believable demo dataset, and the clean-reseed wipe. None of this runs
    when APP_MODE=production."""
    await _seed_agents()
    await _seed_demo_account()
    await _migrate_reset_passwords()
    await _seed_demo_leads()
    await _seed_coverage_history()
    await _migrate_clean_reseed_v3()
    await _migrate_purge_test_leads()

async def seed():
    await bootstrap_production()
    if not IS_PROD:
        await seed_demo()

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

    # De-duplicate lead emails BEFORE creating the unique index (D3.4).
    await _migrate_dedupe_lead_emails()

    # Non-unique / perf indexes — never block startup (D4.6 compounds included).
    index_specs = [
        ("users", "email", {"unique": True}),
        ("leads", "stage", {}),
        ("leads", [("owner_id", 1), ("stage", 1)], {}),
        ("meetings", "agent_id", {}),
        ("meetings", [("agent_id", 1), ("scheduled_at", 1)], {}),
        ("meetings", "calendly_event_uri", {"sparse": True}),
        ("payments", "lead_id", {}),
        ("coverage_snapshots", "date", {}),
        ("webhook_events", "event_key", {"unique": True}),  # A4 idempotency
    ]
    for coll, field, kwargs in index_specs:
        try:
            await db[coll].create_index(field, **kwargs)
        except Exception as e:
            logger.warning(f"create_index {coll}.{field} failed (continuing): {e}")
    # UNIQUE indexes that the data model depends on. Surface failure in production
    # (do NOT silently leave them non-unique). We drop a stale NON-unique index of the
    # same key first (transitioning an existing DB), then create the unique one.
    async def _ensure_unique(coll, field, **kwargs):
        info = await db[coll].index_information()
        name = f"{field}_1"
        if name in info and not info[name].get("unique"):
            await db[coll].drop_index(name)
        await db[coll].create_index(field, unique=True, **kwargs)

    for coll, field, kw in (
        ("leads", "email", {}),
        # session_id partial so many not-yet-created links (null) don't collide.
        ("payments", "session_id", {"partialFilterExpression": {"session_id": {"$type": "string"}}}),
    ):
        try:
            await _ensure_unique(coll, field, **kw)
        except Exception as e:
            logger.error(f"UNIQUE {coll}.{field} failed: {e}")
            if IS_PROD:
                raise

    # Seed: must never crash startup; the app should still serve if seeding fails.
    try:
        await seed()
        logger.info("CRM startup complete")
    except Exception as e:
        logger.error(f"seed() failed (app will still serve): {e}", exc_info=True)

CSRF_EXEMPT_PATHS = {"/api/auth/login", "/api/auth/demo-login", "/api/webhook/stripe", "/api/webhook/razorpay", "/api/webhook/calendly"}

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

# CORS fail-closed: cookie auth requires an explicit origin allowlist. In production
# we refuse to boot with '*'/unset; in demo we fall back to '*' but then DISABLE
# credentials (the '*' + credentials combo is invalid and browsers reject it — G18).
_cors_raw = os.environ.get("CORS_ORIGINS", "").strip()
if IS_PROD and (not _cors_raw or _cors_raw == "*"):
    raise RuntimeError("CORS_ORIGINS must be an explicit allowlist in production")
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
if _cors_origins:
    _cors_allow_credentials = True
else:
    _cors_origins, _cors_allow_credentials = ["*"], False
app.add_middleware(
    CORSMiddleware,
    allow_credentials=_cors_allow_credentials,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
