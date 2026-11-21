"""Diffusion du suivi en direct : chaque changement du codage d'un match est poussé aux écrans abonnés à
/ws/matches/{id}/live/, avec le tableau « Direct » recalculé.

Enveloppe d'un message (version 1) : id unique (pour ignorer un doublon après une reconnexion), type, version du
schéma, horodatage, match, données propres au type, clé d'idempotence de la saisie s'il y en a une, tableau."""
import logging
import uuid

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone

from matchs import direct
from matchs.models import Match

VERSION = 1
journal = logging.getLogger(__name__)


def groupe(match_id):
    return f'direct.match.{match_id}'


def message(match, type_message, donnees=None, cle_idempotence=None):
    return {'id': uuid.uuid4().hex, 'type': type_message, 'version': VERSION,
            'horodatage': timezone.now().isoformat(), 'match': match.id, 'donnees': donnees or {},
            'cle_idempotence': str(cle_idempotence) if cle_idempotence else None, 'tableau': direct.tableau(match)}


def diffuser(match_id, type_message, donnees=None, cle_idempotence=None):
    """Envoi après la validation de la transaction : le tableau est calculé sur ce qui est vraiment enregistré,
    et une saisie annulée n'est jamais annoncée. Un échec de diffusion ne fait pas échouer la saisie."""
    def envoyer():
        couche = get_channel_layer()
        match = Match.objects.select_related('club_domicile', 'club_exterieur').filter(pk=match_id).first()
        if couche is None or match is None:
            return
        try:
            async_to_sync(couche.group_send)(groupe(match_id), {
                'type': 'direct.message', 'message': message(match, type_message, donnees, cle_idempotence)})
        except Exception:  # noqa: BLE001 — le direct est un confort, la donnée est déjà enregistrée
            journal.exception('Diffusion du direct impossible (match %s, %s)', match_id, type_message)

    transaction.on_commit(envoyer)
