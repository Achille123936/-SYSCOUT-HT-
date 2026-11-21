"""Mesure les objectifs de performance du SRS §7 sur la base courante : NFR-001 (API courante, P95 < 500 ms) et NFR-002
(écriture d'un événement, P95 < 1 s). Les valeurs ne valent que pour l'environnement où la commande tourne : à lancer sur
le serveur de référence, avec le matériel et le réseau documentés.

    python manage.py mesurer_nfr [--requetes 50] [--strict]

L'écriture d'événements se fait dans une transaction annulée à la fin : aucune donnée n'est conservée, et la diffusion
WebSocket (après validation de la transaction) n'est pas incluse dans la mesure."""
import statistics
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from rest_framework.test import APIClient

from comptes.models import Role, Utilisateur
from matchs.models import EtatMatch, Match

OBJECTIF_API_MS, OBJECTIF_EVENEMENT_MS = 500, 1000


def p95(valeurs):
    ordonnees = sorted(valeurs)
    return ordonnees[min(len(ordonnees) - 1, int(round(0.95 * (len(ordonnees) - 1))))]


class Command(BaseCommand):
    help = "Mesure les objectifs de performance NFR-001 et NFR-002 (P95) sur la base courante."

    def add_arguments(self, parser):
        parser.add_argument('--requetes', type=int, default=50, help='nombre de requêtes par mesure (20 au moins)')
        parser.add_argument('--strict', action='store_true', help="code de sortie 1 si un objectif n'est pas atteint")

    def handle(self, *args, requetes, strict, **options):
        if requetes < 20:
            raise CommandError('Moins de 20 requêtes : un P95 ne veut rien dire.')
        admin = Utilisateur.objects.filter(role=Role.ADMIN, is_active=True).first()
        analyste = Utilisateur.objects.filter(role=Role.ANALYSTE, is_active=True).first()
        match = Match.objects.filter(compositions__isnull=False).distinct().first()
        if not (admin and analyste and match):
            raise CommandError("Il faut un administrateur, un analyste et un match avec composition (python manage.py seed).")

        client = APIClient()
        client.force_authenticate(admin)
        lignes, echecs = [], 0
        for chemin in ('/api/tableau-de-bord/', '/api/joueurs/', '/api/matchs/', '/api/statistiques/', f'/api/matchs/{match.id}/direct/',
                       f'/api/matchs/{match.id}/'):
            client.get(chemin)  # première requête hors mesure (chauffe des caches, connexion à la base)
            durees = []
            for _ in range(requetes):
                debut = time.perf_counter()
                r = client.get(chemin)
                durees.append((time.perf_counter() - debut) * 1000)
                if r.status_code != 200:
                    raise CommandError(f'{chemin} : réponse {r.status_code}')
            lignes.append(('NFR-001', f'GET {chemin}', durees, OBJECTIF_API_MS))

        joueur = match.compositions.first().joueur_id
        client.force_authenticate(analyste)
        durees = []
        with transaction.atomic():
            Match.objects.filter(pk=match.pk).update(etat=EtatMatch.EN_CODAGE, verrouille_par=analyste, verrouille_le=timezone.now())
            for i in range(requetes):
                debut = time.perf_counter()
                r = client.post('/api/evenements/', {'match': match.id, 'joueur': joueur, 'type_action': 'PASSE', 'minute': 1,
                                                     'temps_video': 60 + i, 'zone_x': 40, 'zone_y': 50, 'resultat': True}, format='json')
                durees.append((time.perf_counter() - debut) * 1000)
                if r.status_code != 201:
                    transaction.set_rollback(True)
                    raise CommandError(f"Écriture d'un événement refusée : {r.status_code} {r.data}")
            transaction.set_rollback(True)  # rien n'est conservé
        lignes.append(('NFR-002', 'POST /api/evenements/', durees, OBJECTIF_EVENEMENT_MS))

        self.stdout.write(f'{"Exigence":8} {"Mesure":42} {"médiane":>8} {"P95":>8} {"max":>8}  objectif')
        for nfr, nom, durees, objectif in lignes:
            valeur = p95(durees)
            atteint = valeur < objectif
            echecs += not atteint
            ligne = f'{nfr:8} {nom:42} {statistics.median(durees):7.1f}ms {valeur:7.1f}ms {max(durees):7.1f}ms  < {objectif} ms  {"OK" if atteint else "NON ATTEINT"}'
            self.stdout.write(self.style.SUCCESS(ligne) if atteint else self.style.ERROR(ligne))
        self.stdout.write(f'\n{requetes} requêtes par mesure, base « {match._state.db} ». Environnement local : ces chiffres ne remplacent '
                          "pas une mesure sur l'environnement de référence.")
        if strict and echecs:
            raise SystemExit(1)
