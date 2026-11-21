"""WebSocket du suivi en direct d'un match : /ws/matches/{id}/live/.

Protocole (JSON) :
  client → {"type": "auth", "jeton": "<jeton de connexion>"}   premier message obligatoire
  serveur → {"type": "match.snapshot", ...}                     tableau complet, puis un message à chaque changement
  client → {"type": "ping"}  serveur → {"type": "pong"}          garde la session ouverte (20 minutes d'inactivité)
Le jeton n'est pas mis dans l'adresse, pour ne pas apparaître dans les journaux du serveur.
Codes de fermeture : 4401 non identifié ou session fermée, 4403 accès refusé, 4404 match introuvable."""
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework.exceptions import AuthenticationFailed

from core.auth import JetonAvecExpiration, acces_sportif
from matchs.live import groupe, message
from matchs.models import Match


@database_sync_to_async
def identifier(cle):
    """Même contrôle que l'API : jeton valide, compte non bloqué, session ouverte (et prolongée)."""
    try:
        return JetonAvecExpiration().authenticate_credentials(str(cle or ''))[0]
    except AuthenticationFailed:
        return None


@database_sync_to_async
def acces(utilisateur, match_id):
    """Les droits de lecture des matchs dans l'API : rôles sportifs, et abonnement actif pour un compte de club (RG9)."""
    if not acces_sportif(utilisateur):
        return 4403, None
    match = Match.objects.select_related('club_domicile', 'club_exterieur').filter(pk=match_id).first()
    if match is None:
        return 4404, None
    return None, message(match, 'match.snapshot')


class DirectConsumer(AsyncJsonWebsocketConsumer):
    utilisateur = None

    async def connect(self):
        self.match_id = self.scope['url_route']['kwargs']['match_id']
        await self.accept()

    async def receive_json(self, contenu, **kwargs):
        genre = contenu.get('type') if isinstance(contenu, dict) else None
        if genre == 'auth' and self.utilisateur is None:
            self.jeton = contenu.get('jeton')
            self.utilisateur = await identifier(self.jeton)
            if self.utilisateur is None:
                return await self.close(code=4401)
            refus, instantane = await acces(self.utilisateur, self.match_id)
            if refus:
                return await self.close(code=refus)
            await self.channel_layer.group_add(groupe(self.match_id), self.channel_name)
            return await self.send_json(instantane)
        if self.utilisateur is None:
            return await self.close(code=4401)
        if genre == 'ping':
            # comme une requête de l'API : la session reste ouverte tant que l'écran suit le match ;
            # une déconnexion ou une session expirée ferme le direct
            if await identifier(self.jeton) is None:
                return await self.close(code=4401)
            return await self.send_json({'type': 'pong'})

    async def disconnect(self, code):
        if self.utilisateur is not None:
            await self.channel_layer.group_discard(groupe(self.match_id), self.channel_name)

    async def direct_message(self, evenement):
        await self.send_json(evenement['message'])
