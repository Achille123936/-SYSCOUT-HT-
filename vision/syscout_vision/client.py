"""Client de l'API SYSCOUT-HT : connexion, calibrage de la caméra, envoi des pistes par lots."""
import requests

LOT = 500  # l'API accepte 2 000 points par lot ; un lot plus petit limite la perte en cas de coupure


class ClientAPI:
    def __init__(self, base, session=None):
        self.base = base.rstrip('/')
        self.session = session or requests.Session()

    def _url(self, chemin):
        return f'{self.base}/api/{chemin.lstrip("/")}'

    def _verifier(self, r):
        if not r.ok:
            raise RuntimeError(f'{r.request.method} {r.url} : {r.status_code} {r.text[:300]}')
        return r.json()

    def connexion(self, nom_utilisateur, mot_de_passe):
        """Utilisez un compte analyste réservé au moteur : une connexion invalide le jeton précédent du compte."""
        corps = self._verifier(self.session.post(self._url('auth/connexion/'), json={
            'nom_utilisateur': nom_utilisateur, 'mot_de_passe': mot_de_passe}, timeout=30))
        self.session.headers['Authorization'] = f"Token {corps['jeton']}"

    def calibrage(self, camera):
        return self._verifier(self.session.get(self._url(f'cameras/{camera}/'), timeout=30)).get('calibrage')

    def envoyer_pistes(self, points):
        """Envoie les points par lots ; un point déjà reçu est ignoré par l'API (renvoi sans risque)."""
        total = {'recus': 0, 'enregistres': 0, 'ignores': 0}
        for debut in range(0, len(points), LOT):
            r = self._verifier(self.session.post(self._url('pistes-ia/'), json=points[debut:debut + LOT], timeout=60))
            for cle in total:
                total[cle] += r[cle]
        return total
