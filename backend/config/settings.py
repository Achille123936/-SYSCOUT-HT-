"""Configuration Django de SYSCOUT-HT (serveur API)."""
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Réglages locaux : backend/.env (NOM=valeur, une par ligne) ; les variables déjà définies gardent la priorité
if (BASE_DIR / '.env').exists():
    for ligne in (BASE_DIR / '.env').read_text(encoding='utf-8-sig').splitlines():
        cle, egal, valeur = ligne.partition('=')
        if egal and not cle.lstrip().startswith('#'):
            os.environ.setdefault(cle.strip(), valeur.strip())

SECRET_KEY = os.environ.get('SYSCOUT_SECRET_KEY', 'dev-seulement-changer-en-production')
DEBUG = os.environ.get('SYSCOUT_DEBUG', '1') == '1'
ALLOWED_HOSTS = os.environ.get('SYSCOUT_HOSTS', '*').split(',')
if not DEBUG and SECRET_KEY.startswith('dev-seulement'):
    raise RuntimeError('SYSCOUT_SECRET_KEY doit être défini quand SYSCOUT_DEBUG=0.')

INSTALLED_APPS = [
    'daphne',        # en premier : `runserver` sert alors l'API et les WebSocket (ASGI)
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'channels',
    'core',         # socle : services, droits, PDF, tableau de bord
    'comptes',
    'referentiel',
    'joueurs',
    'matchs',
    'cameras',
    'statistiques',
    'scouting',
    'commercial',
    'audit',
    'apprentissage',
    'equipe',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
]

if not DEBUG:  # fichiers statiques (administration) servis sans serveur web à part
    MIDDLEWARE.insert(2, 'whitenoise.middleware.WhiteNoiseMiddleware')

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Diffusion du direct entre les connexions WebSocket : en mémoire pour un seul processus serveur,
# Redis dès qu'il y en a plusieurs (pip install channels-redis, SYSCOUT_REDIS_URL=redis://hote:6379/0)
if os.environ.get('SYSCOUT_REDIS_URL'):
    CHANNEL_LAYERS = {'default': {'BACKEND': 'channels_redis.core.RedisChannelLayer',
                                  'CONFIG': {'hosts': [os.environ['SYSCOUT_REDIS_URL']]}}}
else:
    CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

# SQLite pour le développement ; PostgreSQL 16 en production (SEL 2.1)
if os.environ.get('SYSCOUT_DB') == 'postgres':
    DATABASES = {'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('PGDATABASE', 'syscout'),
        'USER': os.environ.get('PGUSER', 'syscout'),
        'PASSWORD': os.environ.get('PGPASSWORD', ''),
        'HOST': os.environ.get('PGHOST', 'localhost'),
        'PORT': os.environ.get('PGPORT', '5432'),
        'ATOMIC_REQUESTS': True,
    }}
else:
    DATABASES = {'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
        # ENF 6.0 : une transaction échouée est annulée entièrement
        'ATOMIC_REQUESTS': True,
    }}

AUTH_USER_MODEL = 'comptes.Utilisateur'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# SEL 3.6.7 : mot de passe d'au moins 8 caractères, lettres et chiffres
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'core.validators.LettresEtChiffresValidator'},
]
# Les mots de passe ne sont jamais stockés en clair, seulement leur empreinte (hachage)
PASSWORD_HASHERS = ['django.contrib.auth.hashers.PBKDF2PasswordHasher']
if 'test' in sys.argv:  # hachage rapide pendant les tests uniquement
    PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

LANGUAGE_CODE = 'fr'
TIME_ZONE = 'America/Port-au-Prince'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'  # sans stockage objet : disque local (servi par Django en développement seulement)

# Stockage objet compatible S3 pour les vidéos (SRS §5.1, §18) : actif dès que SYSCOUT_S3_BUCKET est défini.
# Les liens de lecture sont signés et temporaires (liens privés) ; l'envoi se fait directement du navigateur vers le stockage.
S3_BUCKET = os.environ.get('SYSCOUT_S3_BUCKET', '')
if S3_BUCKET:
    STORAGES = {
        'default': {'BACKEND': 'storages.backends.s3.S3Storage', 'OPTIONS': {
            'bucket_name': S3_BUCKET,
            'region_name': os.environ.get('SYSCOUT_S3_REGION') or None,
            'endpoint_url': os.environ.get('SYSCOUT_S3_ENDPOINT') or None,   # R2, B2, MinIO : adresse du service
            'access_key': os.environ.get('SYSCOUT_S3_ACCESS_KEY'),
            'secret_key': os.environ.get('SYSCOUT_S3_SECRET_KEY'),
            'signature_version': 's3v4',
            'querystring_auth': True,                                          # liens privés : signés
            'querystring_expire': int(os.environ.get('SYSCOUT_S3_LIEN_SECONDES', '3600')),
            'file_overwrite': False,
        }},
        'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
    }

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['core.auth.JetonAvecExpiration'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.Pagination',
    'EXCEPTION_HANDLER': 'core.api.gestion_erreurs',
}

if not DEBUG:  # derrière le proxy HTTPS de l'hébergeur
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True
CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get('SYSCOUT_CORS', '').split(',') if o]

CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [o for o in os.environ.get('SYSCOUT_CORS', '').split(',') if o]

EMAIL_BACKEND = os.environ.get('SYSCOUT_EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = 'SYSCOUT-HT <noreply@ayitidatafoot.ht>'

# --- Paramètres métier (SEL) ---
SYSCOUT = {
    'ESSAIS_MAX': 5,                 # blocage du compte après 5 essais échoués
    'INACTIVITE_MINUTES': 20,        # session fermée après 20 minutes d'inactivité
    'MINUTES_MIN_CLASSEMENT': 450,   # RG5
    'JOURS_AVANT_SUSPENSION': 15,    # RG10
    'TAUX_TCA': 0.10,                # taxe sur le chiffre d'affaires
    'VERROU_MINUTES': 30,            # un verrou de codage inactif peut être repris
    'DUREE_TICKET_EXPORT': 120,      # secondes de validité d'un lien d'export PDF
    'S3': bool(S3_BUCKET),
    'VIDEO_MAX_MO': int(os.environ.get('SYSCOUT_VIDEO_MAX_MO', '2048')),   # SRS §18 : taille maximale d'une vidéo importée
    'VIDEO_EXTENSIONS': ('.mp4', '.m4v', '.mov', '.webm', '.mkv'),         # SRS §18 : types de fichiers acceptés
    'SAUVEGARDES': [BASE_DIR / 'sauvegardes' / 'disque_externe', BASE_DIR / 'sauvegardes' / 'cloud'],
}
