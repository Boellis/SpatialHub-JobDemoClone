from pathlib import Path
import os
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-local-dev-only-key')
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'sensor_data',
]

MIDDLEWARE = [
    'django.middleware.gzip.GZipMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'spatialhub_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'spatialhub_backend.wsgi.application'

if os.environ.get('USE_SQLITE', '0') == '1':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'HOST': os.environ.get('DB_HOST'),
            'NAME': os.environ.get('DB_NAME', 'spatialhub_db'),
            'USER': os.environ.get('DB_USER', 'spatialhub'),
            'PASSWORD': os.environ.get('DB_PASS'),
            'PORT': '5432',
        }
    }

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer']
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CSRF_TRUSTED_ORIGINS = [
    "https://*.run.app",
    "https://nasa-comp-demo.web.app",
    "https://biosim-host-bellis.web.app",
]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://nasa-comp-demo.web.app",
    # Phase 2 public Firebase frontend. Firebase Hosting serves the SAME site on
    # BOTH the .web.app and .firebaseapp.com domains, and the Playground now calls
    # this relay DIRECTLY (to dodge Firebase's 60s proxy timeout), so the relay must
    # allow every origin a teammate might open it from — otherwise the browser blocks
    # the request with the generic "could not reach the survival relay" error.
    "https://biosim-host-bellis.web.app",
    "https://biosim-host-bellis.firebaseapp.com",
]

# Also allow Firebase preview channels (biosim-host-bellis--<channel>-<hash>.web.app)
# and either canonical domain, via regex, so previews + both domains always work.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://biosim-host-bellis(--[a-z0-9-]+)?\.web\.app$",
    r"^https://biosim-host-bellis\.firebaseapp\.com$",
]

CORS_ALLOW_HEADERS = list(default_headers)
CORS_ALLOW_METHODS = ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"]
CORS_ALLOW_CREDENTIALS = True

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
SURVIVAL_BIOSIM_URL = os.environ.get("BIOSIM_URL", "http://34.66.244.62:8009")
SURVIVAL_MAX_SOLS = int(os.environ.get("BIOSIM_MAX_SOLS", "500"))
SURVIVAL_TOKEN_BUDGET = int(os.environ.get("BIOSIM_TOKEN_BUDGET", "750000"))
SURVIVAL_CREW_SIZE = int(os.environ.get("BIOSIM_CREW_SIZE", "15"))
# Shared secret that authenticates the external survival pilot (mcp_biosim) posting
# live run/sol/end events to /api/survival/ingest. No value => ingest is disabled
# (fails closed). This is NOT an Anthropic key; the relay path uses no API key.
SURVIVAL_RELAY_TOKEN = os.environ.get("SURVIVAL_RELAY_TOKEN", "")
# Separate password for the web control panel (/api/survival/control). Decoupled from
# the MCP relay token so you can rotate the human-facing control password with one
# command (deploy/set-control-password.sh) without touching the MCP pilot. Unset =>
# the view falls back to SURVIVAL_RELAY_TOKEN.
SURVIVAL_CONTROL_TOKEN = os.environ.get("SURVIVAL_CONTROL_TOKEN", "")
