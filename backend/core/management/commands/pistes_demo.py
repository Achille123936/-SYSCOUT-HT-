"""Pistes de suivi fictives pour essayer l'écran « Pistes de l'IA » sans moteur de vision par ordinateur.
Elles portent le modèle « démonstration (aucun moteur IA) » et restent sans identité de joueur ; aucune n'entre
dans les statistiques.  Usage : python manage.py pistes_demo <match> [--pistes 6] [--points 120]"""
import random

from django.core.management.base import BaseCommand, CommandError

from matchs.models import EtatMatch, Match, PisteJoueur

MODELE = 'démonstration (aucun moteur IA)'


class Command(BaseCommand):
    help = "Crée des pistes de suivi fictives sur un match, pour essayer la heatmap et l'identification."

    def add_arguments(self, parser):
        parser.add_argument('match', type=int)
        parser.add_argument('--pistes', type=int, default=6)
        parser.add_argument('--points', type=int, default=120, help='points par piste (un toutes les 2 secondes)')

    def handle(self, *args, match, pistes, points, **options):
        m = Match.objects.filter(pk=match).first()
        if m is None:
            raise CommandError(f'Match {match} introuvable.')
        if m.etat in (EtatMatch.CODE, EtatMatch.STATS_PUBLIEES, EtatMatch.ANNULE):
            raise CommandError('Ce match est clos : il ne reçoit plus de pistes.')
        clubs = [m.club_domicile_id, m.club_exterieur_id]
        lignes = []
        for n in range(1, pistes + 1):
            piste = f'DEMO{n:02d}'
            if PisteJoueur.objects.filter(match=m, piste=piste).exists():
                continue
            x, y = random.uniform(15, 85), random.uniform(10, 90)
            for i in range(points):  # marche aléatoire bornée au terrain
                x = min(100, max(0, x + random.gauss(0, 2.5)))
                y = min(100, max(0, y + random.gauss(0, 2.5)))
                lignes.append(PisteJoueur(match=m, piste=piste, club_id=clubs[n % 2], temps_video=2.0 * i,
                                          x=round(x, 1), y=round(y, 1), modele=MODELE,
                                          confiance=round(random.uniform(0.55, 0.95), 2)))
        PisteJoueur.objects.bulk_create(lignes)
        self.stdout.write(self.style.SUCCESS(f'{len(lignes)} points de suivi ajoutés au match {m.id}.'))
