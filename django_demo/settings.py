import os

SECRET_KEY = os.getenv("RESZVAULT_DEMO_SECRET_KEY", "reszvault-local-demo-only")
DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
ROOT_URLCONF = "urls"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "/static/"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "vaults",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("RESZVAULT_DEMO_DB_NAME", "reszvault"),
        "USER": os.getenv("RESZVAULT_DEMO_DB_USER", "reszvault"),
        "PASSWORD": os.getenv("RESZVAULT_DEMO_DB_PASSWORD", "reszvault-demo"),
        "HOST": os.getenv("RESZVAULT_DEMO_DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("RESZVAULT_DEMO_DB_PORT", "55432"),
    },
}

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}
