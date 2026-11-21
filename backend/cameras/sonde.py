"""Vérification d'un flux de caméra (FR-041) : la caméra répond-elle, et en combien de temps.

RTSP : requête OPTIONS sur la caméra (sans lire la vidéo). HLS ou MP4 : lecture du premier kilo-octet.
Renvoie (état, latence en ms ou None, message lisible)."""
import base64
import socket
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit, urlunsplit

from cameras.models import EtatCamera

DELAI = 3.0  # secondes


def masquer(url):
    """Adresse affichable : le mot de passe éventuel est remplacé par ***."""
    p = urlsplit(url)
    if not p.password:
        return url
    hote = f'{p.username}:***@{p.hostname}' + (f':{p.port}' if p.port else '')
    return urlunsplit((p.scheme, hote, p.path, p.query, p.fragment))


def _sans_identifiants(p, port=None):
    hote = p.hostname + (f':{port or p.port}' if (port or p.port) else '')
    return urlunsplit((p.scheme, hote, p.path or '/', p.query, ''))


def _rtsp(p):
    port = p.port or 554
    with socket.create_connection((p.hostname, port), timeout=DELAI) as s:
        s.settimeout(DELAI)
        s.sendall(f'OPTIONS {_sans_identifiants(p, port)} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: SYSCOUT-HT\r\n\r\n'
                  .encode())
        ligne = s.recv(512).split(b'\r\n', 1)[0].decode('latin-1')
    morceaux = ligne.split()
    if len(morceaux) < 2 or not morceaux[0].startswith('RTSP/') or not morceaux[1].isdigit():
        return EtatCamera.ERREUR, "L'appareil répond, mais pas en RTSP : vérifiez le port et l'adresse du flux."
    code = int(morceaux[1])
    if code == 200:
        return EtatCamera.EN_LIGNE, 'Flux RTSP disponible.'
    if code == 401:
        return EtatCamera.ERREUR, "La caméra refuse l'identifiant ou le mot de passe."
    return EtatCamera.ERREUR, f'La caméra répond « {ligne[:80]} ».'


def _http(p):
    entetes = {'User-Agent': 'SYSCOUT-HT', 'Range': 'bytes=0-1023'}
    if p.username:
        jeton = base64.b64encode(f'{p.username}:{p.password or ""}'.encode()).decode()
        entetes['Authorization'] = f'Basic {jeton}'
    requete = urllib.request.Request(_sans_identifiants(p), headers=entetes)
    try:
        with urllib.request.urlopen(requete, timeout=DELAI) as r:
            r.read(1024)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return EtatCamera.ERREUR, f'Accès refusé par le serveur vidéo ({e.code}).'
        return EtatCamera.ERREUR, f'Le serveur vidéo répond {e.code}.'
    return EtatCamera.EN_LIGNE, 'Flux vidéo disponible.'


def sonder(url):
    p = urlsplit(url)
    debut = time.perf_counter()
    try:
        if not p.hostname:
            return EtatCamera.ERREUR, None, 'Adresse du flux incomplète.'
        etat, message = _rtsp(p) if p.scheme == 'rtsp' else _http(p)
    except (socket.timeout, TimeoutError):
        return EtatCamera.HORS_LIGNE, None, f'Pas de réponse en {DELAI:.0f} secondes : caméra éteinte ou réseau coupé.'
    except urllib.error.URLError as e:
        raison = getattr(e.reason, 'strerror', None) or str(e.reason)
        return EtatCamera.HORS_LIGNE, None, f'Connexion impossible : {raison}'[:200]
    except OSError as e:
        return EtatCamera.HORS_LIGNE, None, f'Connexion impossible : {e.strerror or e}'[:200]
    except ValueError:  # port hors limites dans l'adresse
        return EtatCamera.ERREUR, None, "Adresse du flux invalide (port)."
    return etat, round((time.perf_counter() - debut) * 1000), message
