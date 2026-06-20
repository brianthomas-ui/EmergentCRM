"""
LOCAL DEV SHIM for emergentintegrations.payments.stripe.checkout

Emulates the surface that backend/server.py uses:
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    sess   = await StripeCheckout(api_key, webhook_url).create_checkout_session(req)  # -> .session_id, .url
    status = await StripeCheckout(...).get_checkout_status(session_id)                # -> .status, .payment_status
    event  = await StripeCheckout(...).handle_webhook(body, sig)                      # -> .session_id, .payment_status

This is a SIMULATION (no real charges). It is only used off the Emergent platform.
See ../../../README.md for rationale and how to swap in the real `stripe` SDK.
"""
from __future__ import annotations

import os
import json
import logging
import secrets
from dataclasses import dataclass, field
from typing import Optional, Dict, Any

logger = logging.getLogger("emergentintegrations.shim")

# In-process memory of simulated sessions: session_id -> payment_status
_SESSIONS: Dict[str, str] = {}


def _autopay() -> bool:
    """When true (default), a simulated Stripe payment completes on the first status poll."""
    return os.environ.get("EMERGENT_SIM_AUTOPAY", "true").strip().lower() in ("1", "true", "yes", "on")


@dataclass
class CheckoutSessionRequest:
    amount: float
    currency: str = "usd"
    success_url: str = ""
    cancel_url: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CheckoutSessionResponse:
    session_id: str
    url: str


@dataclass
class CheckoutStatusResponse:
    status: str           # "open" | "complete"
    payment_status: str   # "unpaid" | "paid"
    amount_total: Optional[float] = None
    currency: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WebhookEventResponse:
    session_id: str
    payment_status: str
    event_type: str = "checkout.session.completed"


class StripeCheckout:
    """Drop-in simulation of emergentintegrations' StripeCheckout."""

    def __init__(self, api_key: str, webhook_url: str = ""):
        self.api_key = api_key
        self.webhook_url = webhook_url
        logger.warning(
            "[emergentintegrations-shim] SIMULATED Stripe in use (no real charges). "
            "Set EMERGENT_SIM_AUTOPAY=false to keep payments pending."
        )

    async def create_checkout_session(self, req: CheckoutSessionRequest) -> CheckoutSessionResponse:
        session_id = "cs_sim_" + secrets.token_hex(16)
        _SESSIONS[session_id] = "unpaid"
        # Point the "hosted checkout" at the app's own success_url so the
        # /payment-return polling flow works exactly like the real thing.
        url = (req.success_url or "").replace("{CHECKOUT_SESSION_ID}", session_id) or f"/payment-return?session_id={session_id}"
        logger.info("[emergentintegrations-shim] created simulated session %s", session_id)
        return CheckoutSessionResponse(session_id=session_id, url=url)

    async def get_checkout_status(self, session_id: str) -> CheckoutStatusResponse:
        # autopay -> first poll marks it paid (satisfying local end-to-end demo)
        current = _SESSIONS.get(session_id, "unpaid")
        if current != "paid" and _autopay():
            _SESSIONS[session_id] = "paid"
            current = "paid"
        paid = current == "paid"
        return CheckoutStatusResponse(
            status="complete" if paid else "open",
            payment_status="paid" if paid else "unpaid",
        )

    async def handle_webhook(self, body: bytes, sig: Optional[str] = None) -> WebhookEventResponse:
        # NO signature verification in the shim (no secret); local use only.
        try:
            payload = json.loads(body.decode("utf-8") if isinstance(body, (bytes, bytearray)) else body)
        except Exception:
            payload = {}
        session_id = payload.get("session_id") or payload.get("data", {}).get("object", {}).get("id", "")
        payment_status = payload.get("payment_status", "paid")
        if session_id:
            _SESSIONS[session_id] = payment_status
        return WebhookEventResponse(session_id=session_id, payment_status=payment_status)
