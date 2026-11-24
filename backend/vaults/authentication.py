import base64
import hashlib
import hmac
import re
import secrets
from datetime import timedelta
from urllib.parse import urlsplit
from uuid import uuid4

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from .models import AppSession, GithubSession, OAuthAttempt, OAuthHandoff

SESSION_COOKIE = "reszvault_session"
SESSION_DAYS = 30
CHALLENGE_PATTERN = r"[A-Za-z0-9_-]{43}"


def code_challenge(verifier):
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def safe_callback_path(value):
    if not value or "\\" in value or not value.startswith("/") or value.startswith("//"):
        return "/projects"
    return urlsplit(value).path or "/projects"


def create_attempt(provider, challenge, callback_path=""):
    now = timezone.now()
    OAuthAttempt.objects.filter(expires_at__lte=now).delete()
    OAuthHandoff.objects.filter(expires_at__lte=now).delete()
    return OAuthAttempt.objects.create(
        state=secrets.token_urlsafe(32), provider=provider, verifier=secrets.token_urlsafe(48),
        browser_challenge=challenge, callback_path=callback_path, expires_at=now + timedelta(minutes=10),
    )


@transaction.atomic
def consume_attempt(provider, state):
    attempt = OAuthAttempt.objects.select_for_update().filter(
        provider=provider, state=state, expires_at__gt=timezone.now()
    ).first()
    if attempt:
        attempt.delete()
    return attempt


def create_handoff(attempt, user, access_token=""):
    return OAuthHandoff.objects.create(
        code=secrets.token_urlsafe(32), provider=attempt.provider, user=user, access_token=access_token,
        browser_challenge=attempt.browser_challenge, callback_path=attempt.callback_path,
        expires_at=timezone.now() + timedelta(minutes=2),
    )


@transaction.atomic
def consume_handoff(provider, code, verifier):
    handoff = OAuthHandoff.objects.select_for_update().filter(
        provider=provider, code=code, browser_challenge=code_challenge(verifier),
        expires_at__gt=timezone.now(),
    ).first()
    if handoff:
        handoff.delete()
    return handoff


def request_token(request):
    return request.headers.get("x-session-token") or request.COOKIES.get(SESSION_COOKIE)


def current_session(request):
    return AppSession.objects.select_related("user").filter(
        token=request_token(request), expires_at__gt=timezone.now()
    ).first()


def request_owner(request):
    session = current_session(request)
    if session:
        return f"user:{session.user_id}"
    guest_id = request.headers.get("x-guest-id", "")
    if re.fullmatch(r"[a-zA-Z0-9_-]{8,100}", guest_id):
        return f"guest:{guest_id}"
    return None


def user_payload(user):
    return {
        "id": user.id, "name": user.name, "image": user.image,
        "email": None if user.id.startswith("github_") else user.email,
    }


@transaction.atomic
def create_session(response, user, github_token=""):
    expires = timezone.now() + timedelta(days=SESSION_DAYS)
    item = AppSession.objects.create(token=secrets.token_urlsafe(32), user=user, expires_at=expires)
    if github_token:
        GithubSession.objects.create(session=item, access_token=github_token)
    response.set_cookie(
        SESSION_COOKIE, item.token, httponly=True, secure=not settings.DEBUG,
        samesite="Lax", max_age=SESSION_DAYS * 86400,
    )
    return {"userId": user.id, "token": item.token, "expiresAt": expires.isoformat()}


def new_account_id():
    return f"user_{uuid4().hex}"


def verify_password(user, password):
    stored = user.password_hash or ""
    if not stored.startswith("pbkdf2_sha256$") or stored.count("$") != 2:
        return check_password(password, stored)

    # Retain compatibility with the original SQLite account format.
    _, salt, expected = stored.split("$", 2)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 180_000).hex()
    if not hmac.compare_digest(actual, expected):
        return False
    user.password_hash = make_password(password)
    user.save(update_fields=["password_hash"])
    return True
