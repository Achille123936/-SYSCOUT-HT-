from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

# chaque module du SEL apporte ses propres routes
MODULES = ['core', 'comptes', 'referentiel', 'joueurs', 'matchs', 'cameras', 'statistiques', 'scouting', 'commercial', 'audit', 'apprentissage', 'equipe']

urlpatterns = [
    path('admin/', admin.site.urls),
    *[path('api/', include(f'{module}.urls')) for module in MODULES],
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
