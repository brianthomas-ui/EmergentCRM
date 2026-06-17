from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
import logging
import io
import csv
import random
from datetime import datetime, timezone, timedelta, date

import bcrypt
import jwt

# ----------------------------------------------------------------------------
# DB / App setup
# ----------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Emergent Upsell CRM")
api = APIRouter(prefix="/api")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("crm")

PIPELINE_STAGES = [
    "New Booking", "Assigned", "Meeting Scheduled", "Meeting Completed",
    "Payment Link Sent", "Won", "Lost", "Follow-up Later",
]
PRIORITIES = ["Hot", "Follow-up This Week", "Payment Pending", "None"]

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

PRESET_PACKAGES = {
    "upsell_pro": {"name": "Pro Upgrade", "amount": 1000.0, "currency": "usd"},
    "upsell_scale": {"name": "Scale Plan", "amount": 2500.0, "currency": "usd"},
    "upsell_enterprise": {"name": "Enterprise Plan", "amount": 5000.0, "currency": "usd"},
}

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"], "email": user["email"], "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
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
    amount: Optional[float] = None
    currency: str = "usd"
    description: Optional[str] = ""
    origin_url: str

class SettingsIn(BaseModel):
    inr_per_usd: float

# ----------------------------------------------------------------------------
# Auth routes
# ----------------------------------------------------------------------------
@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user)
    return {"token": token, "user": clean(user)}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ----------------------------------------------------------------------------
# Team / Users
# ----------------------------------------------------------------------------
@api.get("/team")
async def list_team(user: dict = Depends(get_current_user)):
    members = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [clean(m) for m in members]

@api.post("/team")
async def create_agent(body: AgentIn, admin: dict = Depends(require_admin)):
    exists = await db.users.find_one({"email": body.email.lower()})
    if exists:
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "id": new_id(), "name": body.name, "email": body.email.lower(),
        "password_hash": hash_password(body.password), "role": "agent",
        "avatar_url": f"https://api.dicebear.com/7.x/initials/svg?seed={body.name}",
        "monthly_target": body.monthly_target, "weekly_target": body.weekly_target,
        "active": True, "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await log_audit("create_agent", admin["name"], body.name)
    return clean(doc)

# ----------------------------------------------------------------------------
# Leads
# ----------------------------------------------------------------------------
@api.get("/leads")
async def list_leads(request: Request, user: dict = Depends(get_current_user)):
    q = {}
    stage = request.query_params.get("stage")
    priority = request.query_params.get("priority")
    owner = request.query_params.get("owner")
    search = request.query_params.get("search")
    mine = request.query_params.get("mine")
    if stage:
        q["stage"] = stage
    if priority:
        q["priority"] = priority
    if owner:
        q["owner_id"] = owner
    if mine == "true" or user["role"] == "agent":
        q["owner_id"] = user["id"]
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"company": {"$regex": search, "$options": "i"}},
        ]
    leads = await db.leads.find(q, {"_id": 0, "notes": 0, "ownership_history": 0}).sort("updated_at", -1).to_list(2000)
    return [clean(l) for l in leads]

@api.post("/leads")
async def create_lead(body: LeadIn, user: dict = Depends(get_current_user)):
    existing = await db.leads.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="A lead with this email already exists")
    doc = body.model_dump()
    doc["email"] = body.email.lower()
    doc.update({
        "id": new_id(), "stage": "New Booking", "owner_id": None, "owner_name": None,
        "owner_locked": False, "total_revenue_usd": 0.0, "deals_won": 0, "upsell_cycles": 0,
        "notes": [], "ownership_history": [], "payment_status": "none",
        "last_meeting_at": None, "next_meeting_at": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.leads.insert_one(doc)
    await log_activity(doc["id"], "created", f"Lead created by {user['name']}", user["name"])
    return clean(doc)

@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    activities = await db.activities.find({"lead_id": lead_id}).sort("created_at", -1).to_list(500)
    meetings = await db.meetings.find({"lead_id": lead_id}).sort("scheduled_at", -1).to_list(100)
    payments = await db.payments.find({"lead_id": lead_id}).sort("created_at", -1).to_list(100)
    return {
        "lead": clean(lead),
        "activities": [clean(a) for a in activities],
        "meetings": [clean(m) for m in meetings],
        "payments": [clean(p) for p in payments],
    }

@api.put("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        updates["updated_at"] = now_iso()
        await db.leads.update_one({"id": lead_id}, {"$set": updates})
        if "stage" in updates:
            await log_activity(lead_id, "stage", f"Stage -> {updates['stage']}", user["name"])
    lead = await db.leads.find_one({"id": lead_id})
    return clean(lead)

@api.put("/leads/{lead_id}/stage")
async def update_stage(lead_id: str, body: StageIn, user: dict = Depends(get_current_user)):
    if body.stage not in PIPELINE_STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    await db.leads.update_one({"id": lead_id}, {"$set": {"stage": body.stage, "updated_at": now_iso()}})
    await log_activity(lead_id, "stage", f"Moved to {body.stage}", user["name"])
    if body.stage == "Won":
        await db.leads.update_one({"id": lead_id}, {"$set": {"won_at": now_iso(), "owner_locked": True}})
    lead = await db.leads.find_one({"id": lead_id})
    return clean(lead)

async def _assign_lead(lead: dict, agent: dict, by: str):
    history = lead.get("ownership_history", [])
    history.append({
        "from": lead.get("owner_name"), "to": agent["name"],
        "by": by, "at": now_iso(),
    })
    new_stage = lead["stage"] if lead["stage"] not in ("New Booking",) else "Assigned"
    await db.leads.update_one({"id": lead["id"]}, {"$set": {
        "owner_id": agent["id"], "owner_name": agent["name"],
        "ownership_history": history, "stage": new_stage, "updated_at": now_iso(),
    }})
    await log_activity(lead["id"], "assignment", f"Assigned to {agent['name']} (by {by})", by)

@api.put("/leads/{lead_id}/assign")
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
    return clean(lead)

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

@api.post("/leads/{lead_id}/round-robin")
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
    return clean(lead)

@api.post("/leads/{lead_id}/reopen")
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
                 "payment_status": "none", "updated_at": now_iso()},
        "$inc": {"upsell_cycles": 1},
    })
    await log_activity(lead_id, "reopen",
                       f"{body.type} cycle opened — routed to owner {lead['owner_name']}. {body.reason}".strip(),
                       user["name"])
    await log_audit("reopen_lead", user["name"], lead["name"], f"{body.type} -> {lead['owner_name']}")
    lead = await db.leads.find_one({"id": lead_id})
    return clean(lead)

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

@api.post("/leads/import")
async def import_leads(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    created, skipped = 0, 0
    for row in reader:
        email = (row.get("email") or "").strip().lower()
        name = (row.get("name") or "").strip()
        if not email or not name:
            skipped += 1
            continue
        if await db.leads.find_one({"email": email}):
            skipped += 1
            continue
        def fnum(key):
            try:
                return float(row.get(key) or 0)
            except Exception:
                return 0.0
        doc = {
            "id": new_id(), "name": name, "email": email,
            "company": (row.get("company") or "").strip(),
            "phone": (row.get("phone") or "").strip(),
            "plan": (row.get("plan") or "").strip(),
            "monthly_spend": fnum("monthly_spend"),
            "lifetime_value": fnum("lifetime_value"),
            "usage_trend": (row.get("usage_trend") or "stable").strip(),
            "product_history": [], "source": (row.get("source") or "CSV Import").strip(),
            "priority": "None", "stage": "New Booking",
            "owner_id": None, "owner_name": None, "notes": [], "ownership_history": [],
            "payment_status": "none", "last_meeting_at": None, "next_meeting_at": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
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
    result = [clean(m) for m in meetings]
    if today_only == "true":
        today = datetime.now(timezone.utc).date().isoformat()
        result = [m for m in result if (m.get("scheduled_at") or "").startswith(today)]
    return result

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
        "created_at": now_iso(),
    }
    await db.meetings.insert_one(meeting)
    # auto-assign lead + advance stage
    if not lead.get("owner_id"):
        await _assign_lead(lead, agent, f"Auto ({body.source})")
    await db.leads.update_one({"id": body.lead_id}, {"$set": {
        "stage": "Meeting Scheduled", "next_meeting_at": body.scheduled_at, "updated_at": now_iso(),
    }})
    driver_txt = f" · hook: {body.booking_driver}" if body.booking_driver else ""
    await log_activity(body.lead_id, "meeting",
                       f"Meeting booked ({body.source}) with {agent['name']}{driver_txt}", user["name"])
    return clean(meeting)

@api.put("/meetings/{meeting_id}/outcome")
async def meeting_outcome(meeting_id: str, body: MeetingOutcome, user: dict = Depends(get_current_user)):
    meeting = await db.meetings.find_one({"id": meeting_id})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    await db.meetings.update_one({"id": meeting_id}, {"$set": {
        "status": body.status, "no_show_reason": body.no_show_reason,
        "outcome_notes": body.outcome_notes, "reschedule_status": body.reschedule_status,
        "completed_at": now_iso(),
    }})
    lead = await db.leads.find_one({"id": meeting["lead_id"]})
    if lead:
        if body.status == "completed":
            await db.leads.update_one({"id": lead["id"]}, {"$set": {
                "stage": "Meeting Completed", "last_meeting_at": meeting["scheduled_at"], "updated_at": now_iso()}})
        elif body.status == "no_show":
            await db.leads.update_one({"id": lead["id"]}, {"$set": {
                "stage": "Follow-up Later", "priority": "Follow-up This Week", "updated_at": now_iso()}})
        await log_activity(lead["id"], "meeting", f"Meeting {body.status}. {body.outcome_notes or body.no_show_reason}", user["name"])
    return clean(await db.meetings.find_one({"id": meeting_id}))

# ----------------------------------------------------------------------------
# Campaigns (Gmail outreach simulated)
# ----------------------------------------------------------------------------
@api.get("/campaigns")
async def list_campaigns(admin: dict = Depends(require_admin)):
    campaigns = await db.campaigns.find({}).sort("created_at", -1).to_list(500)
    return [clean(c) for c in campaigns]

@api.post("/campaigns")
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

@api.post("/campaigns/{campaign_id}/send")
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

@api.get("/payments")
async def list_payments(request: Request, user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "agent":
        q["agent_id"] = user["id"]
    payments = await db.payments.find(q).sort("created_at", -1).to_list(1000)
    return [clean(p) for p in payments]

@api.post("/payments/link")
async def create_payment_link(body: PaymentIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": body.lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # resolve amount/currency server-side
    if body.package_id and body.package_id in PRESET_PACKAGES:
        pkg = PRESET_PACKAGES[body.package_id]
        amount, currency, desc = pkg["amount"], pkg["currency"], pkg["name"]
    else:
        if not body.amount or body.amount <= 0:
            raise HTTPException(status_code=400, detail="A valid amount is required")
        amount, currency, desc = float(body.amount), (body.currency or "usd").lower(), body.description or "Custom upsell"

    # convert everything to USD for reporting using the admin-managed FX rate
    fx_rate = await get_inr_rate()
    amount_usd = round(amount / fx_rate, 2) if currency == "inr" else round(amount, 2)

    payment_id = new_id()
    record = {
        "id": payment_id, "lead_id": body.lead_id, "lead_name": lead["name"],
        "agent_id": user["id"], "agent_name": user["name"],
        "provider": body.provider, "amount": amount, "currency": currency,
        "amount_usd": amount_usd, "fx_rate": fx_rate,
        "description": desc, "status": "initiated", "payment_status": "pending",
        "session_id": None, "payment_link": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }

    if body.provider == "stripe":
        from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
        webhook_url = f"{body.origin_url}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=os.environ["STRIPE_API_KEY"], webhook_url=webhook_url)
        success_url = f"{body.origin_url}/payment-return?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{body.origin_url}/payments"
        req = CheckoutSessionRequest(
            amount=amount, currency=currency, success_url=success_url, cancel_url=cancel_url,
            metadata={"lead_id": body.lead_id, "payment_id": payment_id, "agent_id": user["id"]},
        )
        session = await stripe_checkout.create_checkout_session(req)
        record["session_id"] = session.session_id
        record["payment_link"] = session.url
    else:
        # Razorpay simulated payment link
        record["session_id"] = f"rzp_{payment_id[:12]}"
        record["payment_link"] = f"{body.origin_url}/payment-return?session_id=rzp_{payment_id[:12]}&pid={payment_id}"

    await db.payments.insert_one(record)
    await db.leads.update_one({"id": body.lead_id}, {"$set": {
        "stage": "Payment Link Sent", "payment_status": "link_sent", "priority": "Payment Pending",
        "updated_at": now_iso()}})
    await log_activity(body.lead_id, "payment", f"{body.provider.title()} payment link sent: {currency.upper()} {amount:.0f} (~${amount_usd:.0f})", user["name"])
    return clean(record)

@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str, user: dict = Depends(get_current_user)):
    record = await db.payments.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")

    if record["payment_status"] == "paid":
        return clean(record)

    if record["provider"] == "stripe":
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        stripe_checkout = StripeCheckout(api_key=os.environ["STRIPE_API_KEY"], webhook_url="")
        status = await stripe_checkout.get_checkout_status(session_id)
        await _apply_payment_status(record, status.status, status.payment_status)
    record = await db.payments.find_one({"session_id": session_id})
    return clean(record)

@api.post("/payments/simulate/{session_id}")
async def simulate_payment(session_id: str, user: dict = Depends(get_current_user)):
    """Simulate completion of a Razorpay (mock) payment link."""
    record = await db.payments.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")
    await _apply_payment_status(record, "complete", "paid")
    return clean(await db.payments.find_one({"session_id": session_id}))

async def _apply_payment_status(record: dict, status: str, payment_status: str):
    if record["payment_status"] == "paid":
        return
    update = {"status": status, "payment_status": payment_status, "updated_at": now_iso()}
    await db.payments.update_one({"id": record["id"]}, {"$set": update})
    if payment_status == "paid":
        amt_usd = record.get("amount_usd", record["amount"])
        await db.leads.update_one({"id": record["lead_id"]}, {
            "$set": {"stage": "Won", "payment_status": "paid", "priority": "None",
                     "owner_locked": True, "won_at": now_iso(), "updated_at": now_iso()},
            "$inc": {"total_revenue_usd": amt_usd, "deals_won": 1},
        })
        await log_activity(record["lead_id"], "payment",
                           f"Payment completed: {record['currency'].upper()} {record['amount']:.0f} (~${record.get('amount_usd', record['amount']):.0f}) 🎉",
                           record["agent_name"])

@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    body = await request.body()
    sig = request.headers.get("Stripe-Signature")
    stripe_checkout = StripeCheckout(api_key=os.environ["STRIPE_API_KEY"], webhook_url="")
    try:
        event = await stripe_checkout.handle_webhook(body, sig)
        record = await db.payments.find_one({"session_id": event.session_id})
        if record:
            await _apply_payment_status(record, "complete", event.payment_status)
    except Exception as e:
        logger.error(f"webhook error: {e}")
    return {"received": True}

# ----------------------------------------------------------------------------
# Dashboard / Reporting
# ----------------------------------------------------------------------------
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    is_admin = user["role"] == "admin"
    lead_filter = {} if is_admin else {"owner_id": user["id"]}
    meeting_filter = {} if is_admin else {"agent_id": user["id"]}
    pay_filter = {} if is_admin else {"agent_id": user["id"]}

    leads = await db.leads.find(lead_filter, {"_id": 0, "id": 1, "stage": 1, "priority": 1, "owner_id": 1}).to_list(5000)
    meetings = await db.meetings.find(meeting_filter, {"_id": 0, "id": 1, "lead_id": 1, "lead_name": 1, "agent_id": 1, "agent_name": 1, "scheduled_at": 1, "completed_at": 1, "status": 1, "source": 1, "booking_driver": 1, "duration": 1}).to_list(5000)
    payments = await db.payments.find(pay_filter, {"_id": 0, "amount": 1, "amount_usd": 1, "payment_status": 1, "agent_id": 1}).to_list(5000)

    stage_counts = {s: 0 for s in PIPELINE_STAGES}
    for l in leads:
        stage_counts[l.get("stage", "New Booking")] = stage_counts.get(l.get("stage", "New Booking"), 0) + 1

    today = datetime.now(timezone.utc).date().isoformat()
    meetings_today = [m for m in meetings if (m.get("scheduled_at") or "").startswith(today)]
    completed_today = [m for m in meetings if (m.get("completed_at") or "").startswith(today) and m["status"] == "completed"]
    noshow_today = [m for m in meetings if (m.get("completed_at") or "").startswith(today) and m["status"] == "no_show"]

    revenue_won = sum(p.get("amount_usd", p["amount"]) for p in payments if p["payment_status"] == "paid")
    pipeline_value = sum(p.get("amount_usd", p["amount"]) for p in payments if p["payment_status"] == "pending")
    payment_pending = len([l for l in leads if l.get("priority") == "Payment Pending"])
    follow_up = len([l for l in leads if l.get("priority") == "Follow-up This Week"])
    hot = len([l for l in leads if l.get("priority") == "Hot"])

    # Booking driver attribution: which hooks drive meetings (and which convert)
    driver_stats = {}
    won_lead_ids = {l["id"] for l in leads if l.get("stage") == "Won"}
    for m in meetings:
        d = m.get("booking_driver") or "Unspecified"
        if d not in driver_stats:
            driver_stats[d] = {"driver": d, "meetings": 0, "completed": 0, "won": 0}
        driver_stats[d]["meetings"] += 1
        if m.get("status") == "completed":
            driver_stats[d]["completed"] += 1
        if m.get("lead_id") in won_lead_ids:
            driver_stats[d]["won"] += 1
    booking_drivers = sorted(driver_stats.values(), key=lambda x: x["meetings"], reverse=True)

    # target
    target = user.get("monthly_target", 0) if not is_admin else 0
    weekly_target = user.get("weekly_target", 0) if not is_admin else 0

    result = {
        "is_admin": is_admin,
        "total_leads": len(leads),
        "stage_counts": stage_counts,
        "meetings_today": len(meetings_today),
        "meetings_today_list": [clean(m) for m in meetings_today],
        "completed_today": len(completed_today),
        "noshow_today": len(noshow_today),
        "revenue_won": revenue_won,
        "pipeline_value": pipeline_value,
        "payment_pending": payment_pending,
        "follow_up": follow_up,
        "hot": hot,
        "target": target,
        "weekly_target": weekly_target,
        "won_count": stage_counts.get("Won", 0),
        "booking_drivers": booking_drivers,
    }

    if is_admin:
        agents = await db.users.find({"role": "agent"}).to_list(100)
        team_target = sum(a.get("monthly_target", 0) for a in agents)
        per_agent = []
        for a in agents:
            a_leads = [l for l in leads if l.get("owner_id") == a["id"]]
            a_pays = [p for p in payments if p["agent_id"] == a["id"] and p["payment_status"] == "paid"]
            a_meetings = [m for m in meetings if m["agent_id"] == a["id"]]
            rev = sum(p.get("amount_usd", p["amount"]) for p in a_pays)
            per_agent.append({
                "id": a["id"], "name": a["name"], "avatar_url": a.get("avatar_url"),
                "leads": len(a_leads), "won": len([l for l in a_leads if l.get("stage") == "Won"]),
                "meetings": len(a_meetings), "revenue": rev,
                "target": a.get("monthly_target", 0),
            })
        result["team_target"] = team_target
        result["per_agent"] = sorted(per_agent, key=lambda x: x["revenue"], reverse=True)
    return result

@api.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    return {"inr_per_usd": await get_inr_rate()}

@api.put("/settings")
async def update_settings(body: SettingsIn, admin: dict = Depends(require_admin)):
    if body.inr_per_usd <= 0:
        raise HTTPException(status_code=400, detail="Rate must be positive")
    await db.settings.update_one({"id": "settings"}, {"$set": {
        "id": "settings", "inr_per_usd": float(body.inr_per_usd),
        "updated_by": admin["name"], "updated_at": now_iso()}}, upsert=True)
    await log_audit("update_fx_rate", admin["name"], "INR/USD", f"{body.inr_per_usd} INR per USD")
    return {"inr_per_usd": float(body.inr_per_usd)}

@api.get("/coverage")
async def coverage(admin: dict = Depends(require_admin)):
    leads = await db.leads.find({}, {"_id": 0, "id": 1, "owner_id": 1, "stage": 1, "monthly_spend": 1, "lifetime_value": 1, "region": 1, "created_at": 1, "won_at": 1, "ownership_history": 1}).to_list(5000)
    meetings = await db.meetings.find({}, {"_id": 0, "lead_id": 1}).to_list(5000)
    paid = await db.payments.find({"payment_status": "paid"}, {"_id": 0, "lead_id": 1, "amount": 1, "amount_usd": 1}).to_list(5000)

    met_ids = {m["lead_id"] for m in meetings}
    rev_by_lead = {}
    for p in paid:
        rev_by_lead[p["lead_id"]] = rev_by_lead.get(p["lead_id"], 0.0) + p.get("amount_usd", p["amount"])

    def blank(label):
        return {"label": label, "total": 0, "assigned": 0, "met": 0, "advanced": 0, "won": 0, "revenue_usd": 0.0}

    def group_stats(group_fn, order):
        groups = {o: blank(o) for o in order}
        for l in leads:
            label = group_fn(l)
            g = groups.get(label)
            if g is None:
                g = blank(label)
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

    tier_order = [t[0] for t in USAGE_TIERS]
    by_tier_spend = group_stats(lambda l: tier_label(l.get("monthly_spend", 0)), tier_order)
    by_tier_ltv = group_stats(lambda l: tier_label(l.get("lifetime_value", 0)), tier_order)
    by_region = group_stats(lambda l: l.get("region") or "Other", REGIONS)

    # burn-up: weekly cumulative scope(total) vs covered(assigned) vs won
    def week_start(iso):
        d = datetime.fromisoformat(iso).astimezone(timezone.utc)
        return (d - timedelta(days=d.weekday())).date()

    from collections import Counter
    created = [week_start(l["created_at"]) for l in leads if l.get("created_at")]
    assigned_weeks = []
    for l in leads:
        if l.get("ownership_history"):
            assigned_weeks.append(week_start(l["ownership_history"][0]["at"]))
        elif l.get("owner_id") and l.get("created_at"):
            assigned_weeks.append(week_start(l["created_at"]))
    won_weeks = [week_start(l["won_at"]) for l in leads if l.get("won_at")]

    burnup = []
    if created:
        c_created, c_assigned, c_won = Counter(created), Counter(assigned_weeks), Counter(won_weeks)
        wk = min(created)
        end = datetime.now(timezone.utc).date()
        cum_t = cum_a = cum_w = 0
        guard = 0
        while wk <= end and guard < 104:
            cum_t += c_created.get(wk, 0)
            cum_a += c_assigned.get(wk, 0)
            cum_w += c_won.get(wk, 0)
            burnup.append({"week": wk.isoformat(), "total": cum_t, "covered": cum_a, "won": cum_w})
            wk = wk + timedelta(days=7)
            guard += 1

    totals = blank("All")
    for g in by_region:
        for k in ("total", "assigned", "met", "advanced", "won", "revenue_usd"):
            totals[k] += g[k]

    # Persist today's coverage snapshot (lazy daily capture) so the burn-up
    # reflects real historical progress over time, not a single point.
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

    # Build the burn-up from stored daily snapshots (real history).
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
    return {"stages": PIPELINE_STAGES, "priorities": PRIORITIES, "booking_drivers": BOOKING_DRIVERS}

# ----------------------------------------------------------------------------
# Seeding
# ----------------------------------------------------------------------------
async def seed():
    await db.settings.update_one({"id": "settings"}, {"$setOnInsert": {"id": "settings", "inr_per_usd": 85.0}}, upsert=True)
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin = await db.users.find_one({"email": admin_email})
    if not admin:
        admin = {
            "id": new_id(), "name": "Diyea", "email": admin_email,
            "password_hash": hash_password(os.environ["ADMIN_PASSWORD"]), "role": "admin",
            "avatar_url": "https://images.unsplash.com/photo-1560250097-0b93528c311a?crop=entropy&cs=srgb&fm=jpg&w=200&q=80",
            "monthly_target": 0, "weekly_target": 0, "active": True, "created_at": now_iso(),
        }
        await db.users.insert_one(admin)
    elif not verify_password(os.environ["ADMIN_PASSWORD"], admin["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(os.environ["ADMIN_PASSWORD"])}})

    if await db.users.count_documents({"role": "agent"}) == 0:
        photo = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?crop=entropy&cs=srgb&fm=jpg&w=200&q=80"
        agents_data = [
            ("Aryan", "aryan.f@emergent.sh"),
            ("Dipan", "dipan@emergent.sh"),
            ("Vinay", "vinay.p@emergent.sh"),
            ("Brian", "brian@emergent.sh"),
        ]
        for i, (name, email) in enumerate(agents_data):
            avatar = photo if i == 0 else f"https://api.dicebear.com/7.x/initials/svg?seed={name}"
            await db.users.insert_one({
                "id": new_id(), "name": name, "email": email,
                "password_hash": hash_password("agent123"), "role": "agent",
                "avatar_url": avatar, "monthly_target": 25000.0,
                "weekly_target": 6250.0, "active": True, "created_at": now_iso(),
            })

    if await db.leads.count_documents({}) == 0:
        agents = await db.users.find({"role": "agent"}).to_list(100)
        sample = [
            ("Acme Analytics", "Dana Whitfield", "dana@acmeanalytics.io", "Pro $99/mo", 99, 1200, "rising", "Hot", "Q3 Power User Outreach", "North America"),
            ("Nimbus Labs", "Owen Carter", "owen@nimbuslabs.dev", "Pro $149/mo", 149, 2100, "rising", "Payment Pending", "Q3 Power User Outreach", "Europe"),
            ("BrightForge", "Lena Ortiz", "lena@brightforge.com", "Starter $49/mo", 49, 600, "stable", "Follow-up This Week", "Manual Entry", "LATAM"),
            ("DataPeak", "Ravi Menon", "ravi@datapeak.ai", "Pro $199/mo", 199, 3400, "rising", "Hot", "Q3 Power User Outreach", "APAC"),
            ("Loopline", "Greta Hofmann", "greta@loopline.co", "Pro $129/mo", 129, 1500, "declining", "None", "CSV Import", "Europe"),
            ("Vertex IO", "Sam Patel", "sam@vertex.io", "Pro $99/mo", 99, 950, "stable", "Follow-up This Week", "CSV Import", "APAC"),
            ("Quantli", "Mia Tanaka", "mia@quantli.com", "Starter $59/mo", 59, 720, "rising", "Hot", "Manual Entry", "APAC"),
            ("Northstar", "Leo Becker", "leo@northstar.app", "Pro $179/mo", 179, 2800, "rising", "Payment Pending", "Q3 Power User Outreach", "MEA"),
        ]
        stages = ["New Booking", "Assigned", "Meeting Scheduled", "Meeting Completed", "Payment Link Sent", "Won", "Follow-up Later", "Assigned"]
        for i, (company, name, email, plan, spend, ltv, trend, priority, source, region) in enumerate(sample):
            owner = agents[i % len(agents)] if i % 3 != 0 else None
            stage = stages[i]
            is_won = stage == "Won"
            doc = {
                "id": new_id(), "name": name, "email": email, "company": company,
                "phone": f"+1 555 01{i:02d}", "plan": plan, "monthly_spend": float(spend),
                "lifetime_value": float(ltv), "usage_trend": trend, "product_history": ["API", "Dashboard"],
                "source": source, "region": region, "priority": "None" if is_won else priority, "stage": stage,
                "owner_id": owner["id"] if owner else None,
                "owner_name": owner["name"] if owner else None,
                "owner_locked": bool(is_won and owner),
                "total_revenue_usd": 2500.0 if (is_won and owner) else 0.0,
                "deals_won": 1 if (is_won and owner) else 0, "upsell_cycles": 0,
                "notes": [], "ownership_history": [], "payment_status": "paid" if (is_won and owner) else "none",
                "last_meeting_at": None, "next_meeting_at": None,
                "won_at": now_iso() if (is_won and owner) else None,
                "created_at": now_iso(), "updated_at": now_iso(),
            }
            await db.leads.insert_one(doc)
            if owner:
                await log_activity(doc["id"], "assignment", f"Assigned to {owner['name']} (seed)", "System")
            if is_won and owner:
                await db.payments.insert_one({
                    "id": new_id(), "lead_id": doc["id"], "lead_name": name,
                    "agent_id": owner["id"], "agent_name": owner["name"],
                    "provider": "stripe", "amount": 2500.0, "currency": "usd",
                    "amount_usd": 2500.0, "fx_rate": 85.0, "description": "Scale Plan",
                    "status": "complete", "payment_status": "paid",
                    "session_id": f"seed_{new_id()[:10]}", "payment_link": None,
                    "created_at": now_iso(), "updated_at": now_iso(),
                })

        # a few meetings today with booking drivers
        leads = await db.leads.find({"owner_id": {"$ne": None}}).to_list(100)
        base = datetime.now(timezone.utc).replace(hour=14, minute=0, second=0, microsecond=0)
        seed_drivers = ["Discount", "Lifetime Access", "Top-Up Credits", "Support"]
        for i, lead in enumerate(leads[:4]):
            await db.meetings.insert_one({
                "id": new_id(), "lead_id": lead["id"], "lead_name": lead["name"],
                "agent_id": lead["owner_id"], "agent_name": lead["owner_name"],
                "scheduled_at": (base + timedelta(hours=i)).isoformat(), "duration": 30,
                "status": "scheduled", "source": "Calendly",
                "booking_driver": seed_drivers[i % len(seed_drivers)],
                "no_show_reason": "", "reschedule_status": "", "outcome_notes": "", "created_at": now_iso(),
            })

    # Seed ~1 week of coverage history so the burn-up chart shows a real trend
    if await db.coverage_snapshots.count_documents({}) == 0:
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

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.leads.create_index("email")
    await db.leads.create_index("stage")
    await db.meetings.create_index("agent_id")
    await db.payments.create_index("session_id")
    await db.coverage_snapshots.create_index("date")
    await seed()
    logger.info("CRM startup complete")

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
