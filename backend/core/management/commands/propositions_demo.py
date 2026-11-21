"""Propositions de l'IA fictives pour essayer l'écran de vérification sans moteur de vision par ordinateur.
Elles portent le modèle « démonstration (aucun moteur IA) » ; aucune n'entre dans les statistiques sans décision
d'un analyste.  Usage : python manage.py propositions_demo <match> [--nombre 8]"""
import random

from django.core.management.base import BaseCommand, CommandError

from matchs.models import EtatMatch, Match, PropositionIA, TypeAction

MODELE = 'démonstration (aucun moteur IA)'
TYPES = [TypeAction.PASSE, TypeAction.PASSE, TypeAction.PASSE, TypeAction.TIR, TypeAction.DUEL,
         TypeAction.INTERCEPTION, TypeAction.RECUPERATION, TypeAction.CENTRE, TypeAction.FAUTE]


class Command(BaseCommand):
    help = "Crée des propositions de l'IA fictives sur un match, pour essayer leur vérification."

    def add_arguments(self, parser):
        parser.add_argument('match', type=int)
        parser.add_argument('--nombre', type=int, default=8)

    def handle(self, *args, match, nombre, **options):
        m = Match.objects.filter(pk=match).first()
        if m is None:
            raise CommandError(f'Match {match} introuvable.')
        if m.etat in (EtatMatch.CODE, EtatMatch.STATS_PUBLIEES, EtatMatch.ANNULE):
            raise CommandError('Ce match est clos : il ne reçoit plus de propositions.')
        compositions = list(m.compositions.filter(est_titulaire=True))
        if not compositions:
            raise CommandError("Saisissez d'abord les compositions du match.")
        depart = max([e.temps_video for e in m.evenements.all()] + [0])
        for i in range(nombre):
            composition = random.choice(compositions)
            identifie = random.random() < 0.6  # sinon l'IA ne connaît que la piste et la couleur du maillot
            type_action = random.choice(TYPES)
            temps = depart + 20 * (i + 1)
            x, y = round(random.uniform(10, 95), 1), round(random.uniform(8, 92), 1)
            PropositionIA.objects.create(
                match=m, type_action=type_action, temps_video=temps, minute=min(m.duree, temps // 60),
                joueur=composition.joueur if identifie else None, club=composition.club,
                piste=f'T{random.randint(1, 40):02d}', numero_maillot=None if identifie else composition.numero_maillot,
                zone_x=x, zone_y=y, resultat=random.random() < 0.7, confiance=round(random.uniform(0.45, 0.97), 2),
                fin_x=min(100, x + 15) if type_action in (TypeAction.PASSE, TypeAction.CENTRE) else None,
                fin_y=y if type_action in (TypeAction.PASSE, TypeAction.CENTRE) else None, modele=MODELE)
        self.stdout.write(self.style.SUCCESS(f'{nombre} propositions de démonstration ajoutées au match {m.id}.'))
