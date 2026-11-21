"""Stockage objet des vidéos (SRS §5.1 et §18) : envoi direct du navigateur vers un stockage compatible S3 par une adresse
signée et temporaire, puis contrôle du fichier arrivé. Sans SYSCOUT_S3_BUCKET, les vidéos restent sur le disque du serveur."""
import uuid

from django.conf import settings
from django.core.files.storage import default_storage
from rest_framework.exceptions import ValidationError

DUREE_ENVOI_S = 3600


def actif():
    return bool(settings.SYSCOUT.get('S3'))


def _client():
    return default_storage.connection.meta.client


def prefixe(match):
    return f'videos/match-{match.id}/'


def adresse_d_envoi(match, nom, type_mime):
    """Adresse signée (PUT, une heure) pour déposer la vidéo ; la clé choisie par le serveur ne dépend pas du nom reçu."""
    extension = '.' + nom.rsplit('.', 1)[-1].lower() if '.' in nom else ''
    cle = f'{prefixe(match)}{uuid.uuid4().hex}{extension}'
    url = _client().generate_presigned_url(
        'put_object', Params={'Bucket': default_storage.bucket_name, 'Key': cle, 'ContentType': type_mime},
        ExpiresIn=DUREE_ENVOI_S)
    return {'mode': 's3', 'methode': 'PUT', 'url': url, 'cle': cle, 'entetes': {'Content-Type': type_mime},
            'expire_dans_secondes': DUREE_ENVOI_S}


def verifier_arrivee(match, cle):
    """Le fichier annoncé est bien arrivé, dans le dossier de ce match, avec un type et une taille acceptés."""
    p = settings.SYSCOUT
    if not isinstance(cle, str) or not cle.startswith(prefixe(match)) or '..' in cle:
        raise ValidationError({'cle': "Cette clé n'appartient pas à ce match."})
    if not cle.lower().endswith(p['VIDEO_EXTENSIONS']):
        raise ValidationError({'cle': f"Format non accepté. Formats acceptés : {', '.join(p['VIDEO_EXTENSIONS'])}."})
    try:
        entete = _client().head_object(Bucket=default_storage.bucket_name, Key=cle)
    except Exception:  # noqa: BLE001 — absent, droits insuffisants ou stockage injoignable
        raise ValidationError({'cle': "Le fichier n'est pas arrivé sur le stockage : renvoyez la vidéo."})
    taille = entete['ContentLength']
    if taille == 0:
        raise ValidationError({'cle': 'Le fichier est vide.'})
    if taille > p['VIDEO_MAX_MO'] * 1024 * 1024:
        default_storage.delete(cle)  # un fichier hors limite ne reste pas sur le stockage
        raise ValidationError({'cle': f"Fichier trop volumineux ({round(taille / 1048576)} Mo) : {p['VIDEO_MAX_MO']} Mo au plus."})
    return taille
