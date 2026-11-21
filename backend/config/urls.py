from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path

# chaque module du SEL apporte ses propres routes
MODULES = ['core', 'comptes', 'referentiel', 'joueurs', 'matchs', 'cameras', 'statistiques', 'scouting', 'commercial', 'audit', 'apprentissage', 'equipe']



def sante(request):
    """Vérification de l'hébergeur : le serveur répond et la base est joignable."""
    try:
        connection.ensure_connection()
    except Exception:  # noqa: BLE001
        return JsonResponse({'etat': 'base injoignable'}, status=503)
    return JsonResponse({'etat': 'ok'})


urlpatterns = [
    path('sante/', sante),
    path('admin/', admin.site.urls),
    *[path('api/', include(f'{module}.urls')) for module in MODULES],
    # SRS §16 : préfixe /api/v1/, mêmes routes que /api/
    *[path('api/v1/', include(f'{module}.urls')) for module in MODULES],
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
