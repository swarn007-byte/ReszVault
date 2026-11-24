import json
import os
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.http import HttpResponseRedirect
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import JSONParser
from rest_framework.response import Response

from .authentication import (
    CHALLENGE_PATTERN, SESSION_COOKIE, code_challenge, consume_attempt, consume_handoff,
    create_attempt, create_handoff, create_session, current_session, new_account_id,
    safe_callback_path, user_payload, verify_password,
)
from .http import RequestError
from .models import Account, AppSession


class EmailCredentials(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, max_length=1024)
    name = serializers.CharField(required=False, allow_blank=True, max_length=120)


class HandoffCredentials(serializers.Serializer):
    code = serializers.RegexField(r"^" + CHALLENGE_PATTERN + r"$")
    verifier = serializers.RegexField(r"^[A-Za-z0-9_-]{64}$")


def authenticated_response(user, github_token="", callback_path=""):
    data = {"user": user_payload(user)}
    response = Response({"data": data, "error": None})
    data["session"] = create_session(response, user, github_token)
    if callback_path:
        data["callbackPath"] = callback_path
    return response


@api_view(["GET"])
def providers(request):
    return Response({
        "google": bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET")),
        "github": bool(os.getenv("GITHUB_CLIENT_ID") and os.getenv("GITHUB_CLIENT_SECRET") and os.getenv("GITHUB_APP_SLUG")),
    })


@api_view(["GET"])
def session(request):
    active = current_session(request)
    return Response({
        "user": user_payload(active.user) if active else None,
        "session": {"userId": active.user_id} if active else None,
    })


@api_view(["POST"])
@parser_classes([JSONParser])
def sign_up(request):
    form = EmailCredentials(data=request.data)
    form.is_valid(raise_exception=True)
    email = form.validated_data["email"].lower()
    password = form.validated_data["password"]
    if len(password) < 8:
        return Response({"error": {"message": "Password must be at least 8 characters."}})
    user, created = Account.objects.get_or_create(email=email, defaults={
        "id": new_account_id(), "name": form.validated_data.get("name") or email.split("@")[0],
        "password_hash": make_password(password),
    })
    if not created:
        return Response({"error": {"message": "An account already exists for this email."}})
    return authenticated_response(user)


@api_view(["POST"])
@parser_classes([JSONParser])
def sign_in(request):
    form = EmailCredentials(data=request.data)
    form.is_valid(raise_exception=True)
    user = Account.objects.filter(email=form.validated_data["email"].lower()).first()
    if not user or not verify_password(user, form.validated_data["password"]):
        return Response({"error": {"message": "Invalid email or password."}})
    return authenticated_response(user)


@api_view(["POST"])
def sign_out(request):
    tokens = [request.COOKIES.get(SESSION_COOKIE), request.headers.get("x-session-token")]
    AppSession.objects.filter(token__in=[token for token in tokens if token]).delete()
    response = Response({"success": True})
    response.delete_cookie(SESSION_COOKIE, samesite="Lax")
    return response


def google_redirect_uri():
    return os.getenv("GOOGLE_REDIRECT_URI") or f"{settings.FRONTEND_ORIGIN}/api/auth/google/callback"


@api_view(["GET"])
def google_start(request):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    challenge = request.query_params.get("challenge", "")
    if not client_id or not os.getenv("GOOGLE_CLIENT_SECRET") or not re.fullmatch(CHALLENGE_PATTERN, challenge):
        return HttpResponseRedirect(f"{settings.FRONTEND_ORIGIN}/login?google_error=authorization")
    attempt = create_attempt("google", challenge, safe_callback_path(request.query_params.get("callbackURL")))
    params = urlencode({
        "client_id": client_id, "redirect_uri": google_redirect_uri(), "response_type": "code",
        "scope": "openid email profile", "state": attempt.state, "prompt": "select_account",
        "code_challenge": code_challenge(attempt.verifier), "code_challenge_method": "S256",
    })
    return HttpResponseRedirect(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


def google_profile(code, verifier):
    token_request = Request("https://oauth2.googleapis.com/token", data=urlencode({
        "code": code, "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"], "redirect_uri": google_redirect_uri(),
        "grant_type": "authorization_code", "code_verifier": verifier,
    }).encode())
    with urlopen(token_request, timeout=15) as response:
        token = json.load(response)["access_token"]
    user_request = Request("https://www.googleapis.com/oauth2/v3/userinfo", headers={"Authorization": f"Bearer {token}"})
    with urlopen(user_request, timeout=15) as response:
        return json.load(response)


@api_view(["GET"])
def google_callback(request):
    failure = HttpResponseRedirect(f"{settings.FRONTEND_ORIGIN}/login?google_error=authorization")
    code = request.query_params.get("code", "")
    attempt = consume_attempt("google", request.query_params.get("state", ""))
    if not code or not attempt:
        return failure
    try:
        profile = google_profile(code, attempt.verifier)
    except (OSError, ValueError, KeyError):
        return failure
    email = profile.get("email", "").lower()
    if not email or not profile.get("email_verified"):
        return failure
    user, _ = Account.objects.get_or_create(email=email, defaults={
        "id": new_account_id(), "name": profile.get("name") or email.split("@")[0],
        "image": profile.get("picture"), "created_at": timezone.now(),
    })
    handoff = create_handoff(attempt, user)
    return HttpResponseRedirect(f"{settings.FRONTEND_ORIGIN}/login#google_code={handoff.code}")


@api_view(["POST"])
@parser_classes([JSONParser])
def exchange(request, provider):
    if provider not in {"google", "github"}:
        raise RequestError(404, "Unknown sign-in provider.")
    form = HandoffCredentials(data=request.data)
    form.is_valid(raise_exception=True)
    handoff = consume_handoff(provider, **form.validated_data)
    if not handoff:
        raise RequestError(401, "Sign-in expired. Start again.")
    return authenticated_response(handoff.user, handoff.access_token, handoff.callback_path)
