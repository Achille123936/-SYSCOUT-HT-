"""python -m syscout_vision --api http://localhost:8000 --match 29 --camera 1 --source match.mp4
Le mot de passe se donne par la variable SYSCOUT_MOT_DE_PASSE (jamais en argument : il finirait dans l'historique)."""
import argparse
import os
import sys

from .client import ClientAPI
from .geometrie import Terrain
from .moteur import suivre


def main(argv=None):
    p = argparse.ArgumentParser(prog='syscout_vision', description=__doc__)
    p.add_argument('--api', required=True, help='adresse du serveur, ex. http://localhost:8000')
    p.add_argument('--utilisateur', default=os.environ.get('SYSCOUT_UTILISATEUR'), help='compte analyste du moteur')
    p.add_argument('--match', type=int, required=True)
    p.add_argument('--camera', type=int, required=True, help='caméra calibrée qui filme le match')
    p.add_argument('--source', required=True, help='fichier vidéo ou adresse du flux (HLS, RTSP)')
    p.add_argument('--modele', default='yolo11n.pt')
    p.add_argument('--pas', type=float, default=0.5, help='secondes entre deux positions enregistrées')
    a = p.parse_args(argv)
    mot_de_passe = os.environ.get('SYSCOUT_MOT_DE_PASSE')
    if not a.utilisateur or not mot_de_passe:
        p.error('Indiquez --utilisateur (ou SYSCOUT_UTILISATEUR) et la variable SYSCOUT_MOT_DE_PASSE.')
    client = ClientAPI(a.api)
    client.connexion(a.utilisateur, mot_de_passe)
    calibrage = client.calibrage(a.camera)
    try:
        suivre(a.source, lambda w, h: Terrain(calibrage, w, h), client, a.match, a.modele, a.pas)
    except ValueError as erreur:
        print(erreur, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
