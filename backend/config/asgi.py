"""Point d'entrée ASGI : l'API (HTTP) et le suivi des matchs en direct (WebSocket)."""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django_asgi = get_asgi_application()  # charge Django avant d'importer les consommateurs

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.urls import path  # noqa: E402

from matchs.consumers import DirectConsumer  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi,
    # pas de contrôle d'origine : l'application mobile n'en envoie pas, et l'accès repose sur le jeton
    # transmis dans le premier message (voir matchs/consumers.py)
    'websocket': URLRouter([
        path('ws/matches/<int:match_id>/live/', DirectConsumer.as_asgi()),
    ]),
})
