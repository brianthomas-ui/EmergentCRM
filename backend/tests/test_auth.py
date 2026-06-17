"""Regression tests for auth hardening: login diagnostics, bcrypt, idempotent seed."""
import os
import sys
import asyncio
import requests
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import hash_password, verify_password, _safe_insert, db  # noqa: E402

BASE = "http://localhost:8001/api"
ADMIN = {"email": "diyea@emergent.sh", "password": "leader123"}
AGENT = {"email": "aryan.f@emergent.sh", "password": "agent123"}


# ---------- bcrypt unit tests ----------
def test_hash_verify_roundtrip():
    h = hash_password("leader123")
    assert h.startswith("$2")
    assert verify_password("leader123", h)
    assert not verify_password("wrong", h)


def test_verify_handles_bad_hash():
    assert not verify_password("anything", "")
    assert not verify_password("anything", "not-a-bcrypt-hash")


def test_long_password_does_not_raise():
    # >72 bytes must be truncated safely, not raise
    long_pw = "a" * 200
    h = hash_password(long_pw)
    assert verify_password(long_pw, h)


# ---------- idempotent seed helper ----------
def test_safe_insert_tolerates_duplicate():
    async def run():
        email = "dup_test_user@example.com"
        await db.users.delete_many({"email": email})
        try:
            await db.users.create_index("email", unique=True)
            doc = {"id": "x1", "email": email, "role": "agent"}
            first = await _safe_insert(db.users, doc)
            second = await _safe_insert(db.users, {"id": "x2", "email": email, "role": "agent"})
            return first, second
        finally:
            await db.users.delete_many({"email": email})

    first, second = asyncio.get_event_loop().run_until_complete(run())
    assert first            # first insert succeeds
    assert not second       # duplicate is swallowed, no exception


# ---------- HTTP login flow ----------
def test_login_admin_success():
    r = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["token"]
    assert body["user"]["role"] == "admin"
    assert "password_hash" not in body["user"]


def test_login_agent_success():
    r = requests.post(f"{BASE}/auth/login", json=AGENT, timeout=15)
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "agent"


def test_login_wrong_password_401():
    r = requests.post(f"{BASE}/auth/login", json={**ADMIN, "password": "nope"}, timeout=15)
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid email or password"


def test_login_unknown_user_401():
    r = requests.post(f"{BASE}/auth/login", json={"email": "ghost@example.com", "password": "x"}, timeout=15)
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid email or password"


def test_me_requires_token():
    token = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=15).json()["token"]
    ok = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert ok.status_code == 200
    bad = requests.get(f"{BASE}/auth/me", headers={"Authorization": "Bearer garbage"}, timeout=15)
    assert bad.status_code == 401


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
