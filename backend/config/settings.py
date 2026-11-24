import os
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")
DEBUG = os.getenv("DJANGO_DEBUG", "0" if os.getenv("RENDER") else "1") == "1"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY") or ("reszvault-local-development-only" if DEBUG else "")
if not SECRET_KEY:
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY before starting Django.")

ALLOWED_HOSTS = [host.strip() for host in os.getenv(
    "DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,reszvault-api.onrender.com,reszvault.onrender.com,reszvault.vercel.app"
).split(",") if host.strip()]
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5175").rstrip("/")
BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "").rstrip("/")
CORS_ALLOWED_ORIGINS = [FRONTEND_ORIGIN]
if DEBUG:
    CORS_ALLOWED_ORIGINS = list(dict.fromkeys([
        *CORS_ALLOWED_ORIGINS, "http://localhost:5175", "http://127.0.0.1:5175", "http://127.0.0.1:5185",
    ]))
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, "x-guest-id", "x-session-token")
CSRF_TRUSTED_ORIGINS = [origin for origin in (FRONTEND_ORIGIN, BACKEND_PUBLIC_URL) if origin]
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = not DEBUG

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "corsheaders", "rest_framework", "vaults.apps.VaultsConfig",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "vaults.middleware.PrivateResponses",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    DATABASES = {"default": dj_database_url.parse(DATABASE_URL, conn_max_age=60, conn_health_checks=True)}
else:
    if not DEBUG:
        raise ImproperlyConfigured("Set DATABASE_URL to the ReszVault PostgreSQL database.")
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("RESZVAULT_DB_NAME", "reszvault"),
        "USER": os.getenv("RESZVAULT_DB_USER", "reszvault"),
        "PASSWORD": os.getenv("RESZVAULT_DB_PASSWORD", "reszvault-demo"),
        "HOST": os.getenv("RESZVAULT_DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("RESZVAULT_DB_PORT", "55432"),
    }}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}
MAX_PDF_BYTES = 20 * 1024 * 1024
