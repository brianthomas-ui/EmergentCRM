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

    first, second = asyncio.run(run())
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


# ---------- httpOnly cookie + CSRF ----------
def test_login_sets_httponly_cookie():
    r = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200
    set_cookie = r.headers.get("set-cookie", "")
    assert "crm_token=" in set_cookie
    assert "HttpOnly" in set_cookie       # session cookie not readable by JS
    assert "Secure" in set_cookie         # HTTPS-only
    assert "SameSite=lax" in set_cookie   # CSRF mitigation
    assert "csrf_token=" in set_cookie    # double-submit token (JS-readable)
    assert "crm_token" in r.cookies


def test_cookie_session_authenticates_me():
    r = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=15)
    # Pass cookies explicitly (requests won't send Secure cookies over http://localhost)
    cookies = {"crm_token": r.cookies["crm_token"], "csrf_token": r.cookies["csrf_token"]}
    me = requests.get(f"{BASE}/auth/me", cookies=cookies, timeout=15)  # cookie auth, no Bearer
    assert me.status_code == 200
    assert me.json()["role"] == "admin"


def test_cookie_mutation_requires_csrf():
    r = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=15)
    cookies = {"crm_token": r.cookies["crm_token"], "csrf_token": r.cookies["csrf_token"]}
    # cookie session but no X-CSRF-Token header -> must be rejected
    blocked = requests.post(f"{BASE}/auth/logout", cookies=cookies, timeout=15)
    assert blocked.status_code == 403
    # with the matching csrf header it succeeds
    ok = requests.post(f"{BASE}/auth/logout", cookies=cookies, headers={"X-CSRF-Token": cookies["csrf_token"]}, timeout=15)
    assert ok.status_code == 200


def test_bearer_mutation_skips_csrf():
    token = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=15).json()["token"]
    # Bearer (API) clients are not cookie-CSRF-vulnerable; logout works without a CSRF header.
    r = requests.post(f"{BASE}/auth/logout", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 200


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
