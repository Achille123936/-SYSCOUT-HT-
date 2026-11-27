"""Exporte un corpus d'instructions (JSONL) pour ajuster un petit modèle de langage, à partir des statistiques validées.

Confidentialité : seuls les joueurs majeurs et éligibles (RG5, au moins 450 minutes) sont exportés, sans nom ni club :
chaque joueur devient « Joueur 1 », « Joueur 2 »… Les textes de réponse sont produits par des règles fixes à partir des
chiffres (aucun chiffre inventé) ; le modèle apprend donc à formuler des chiffres vérifiés, pas à en deviner."""
import json
import random

from django.core.management.base import BaseCommand

from joueurs.models import GROUPE_POSTE
from matchs.models import EtatMatch, Evenement, Match, TypeAction
from matchs.tactique import DEFINITIONS
from statistiques.models import StatistiqueJoueur

LIBELLES = {'buts_p90': 'buts', 'xg_p90': 'buts attendus (xG)', 'tirs_p90': 'tirs', 'passes_p90': 'passes',
            'dribbles_p90': 'dribbles', 'recuperations_p90': 'récupérations', 'interceptions_p90': 'interceptions'}
POSTES = {'GARDIEN': 'gardien', 'DEFENSEUR': 'défenseur', 'MILIEU': 'milieu', 'ATTAQUANT': 'attaquant'}


def _niveau(centile):
    return 'très élevé' if centile >= 90 else 'élevé' if centile >= 70 else 'moyen' if centile >= 30 else 'faible'


def _fiche(s, nom):
    """Renvoie (contexte, réponse, points forts) : le contexte est la liste des chiffres, la réponse les reformule."""
    groupe = POSTES[GROUPE_POSTE[s.joueur.poste]]
    entete = f'{nom} : {groupe}, {s.minutes_jouees} minutes sur {s.matchs_joues} matchs.'
    chiffres, forts = [], []
    for cle, libelle in LIBELLES.items():
        centile = (s.centiles or {}).get(cle)
        if centile is None:
            continue
        chiffres.append(f'- {libelle} par 90 min : {getattr(s, cle):.2f} (centile {centile:.0f}, niveau {_niveau(centile)})')
        if centile >= 70:
            forts.append(libelle)
    if s.passes_reussies_pct:
        chiffres.append(f'- passes réussies : {s.passes_reussies_pct:.0f} %')
    points_forts = 'Points forts : ' + (', '.join(forts) if forts else 'aucun centile supérieur à 70') + '.'
    prudence = "Ces chiffres viennent d'événements codés et validés ; ils ne remplacent pas le jugement de l'analyste."
    contexte = '\n'.join([entete] + chiffres)
    return contexte, '\n'.join([contexte, points_forts, prudence]), points_forts


class Command(BaseCommand):
    help = "Écrit un corpus JSONL d'instructions (statistiques de joueurs majeurs, pseudonymisées)."

    def add_arguments(self, parser):
        parser.add_argument('--sortie', default='../llm/corpus.jsonl')
        parser.add_argument('--graine', type=int, default=42)

    def handle(self, *args, **options):
        random.seed(options['graine'])
        exemples = []
        eligibles = [s for s in StatistiqueJoueur.objects.select_related('joueur')
                     if s.eligible and not s.joueur.est_mineur]
        for i, s in enumerate(eligibles, 1):
            nom = f'Joueur {i}'
            contexte, reponse, points_forts = _fiche(s, nom)
            exemples.append({'instruction': f'Résume le profil statistique de {nom} pour un entraîneur.',
                             'entree': contexte, 'sortie': reponse})
            exemples.append({'instruction': f'Quels sont les points forts de {nom} ?',
                             'entree': contexte, 'sortie': points_forts})
        exemples += self.exemples_matchs() + self.exemples_definitions()
        random.shuffle(exemples)
        with open(options['sortie'], 'w', encoding='utf-8') as f:
            for e in exemples:
                f.write(json.dumps(e, ensure_ascii=False) + '\n')
        self.stdout.write(self.style.SUCCESS(
            f"{len(exemples)} exemples ({len(eligibles)} joueurs majeurs éligibles) écrits dans {options['sortie']}."))

    @staticmethod
    def exemples_definitions():
        """Définitions des indicateurs tactiques, telles que SYSCOUT-HT les calcule."""
        return [{'instruction': f"Comment SYSCOUT-HT définit-il l'indicateur « {cle.replace('_', ' ')} » ?",
                 'entree': '', 'sortie': texte} for cle, texte in DEFINITIONS.items()]

    @staticmethod
    def exemples_matchs():
        """Résumés de matchs publiés (clubs, score, tirs, buts codés) : le chiffre vient de la base, jamais du modèle."""
        exemples = []
        for m in Match.objects.filter(etat=EtatMatch.STATS_PUBLIEES).select_related('club_domicile', 'club_exterieur'):
            tirs = {m.club_domicile_id: 0, m.club_exterieur_id: 0}
            clubs = dict(m.compositions.values_list('joueur_id', 'club_id'))
            for joueur_id in m.evenements.filter(type_action__in=[TypeAction.TIR, TypeAction.BUT]).values_list(
                    'joueur_id', flat=True):
                if clubs.get(joueur_id) in tirs:
                    tirs[clubs[joueur_id]] += 1
            d, e = m.club_domicile, m.club_exterieur
            contexte = (f'{d.nom} {m.score_domicile} - {m.score_exterieur} {e.nom} (journée {m.journee}). '
                        f'Tirs codés : {d.nom} {tirs[d.id]}, {e.nom} {tirs[e.id]}.')
            vainqueur = (d.nom if m.score_domicile > m.score_exterieur else e.nom if m.score_exterieur > m.score_domicile
                         else None)
            exemples.append({'instruction': 'Résume ce match en une phrase.', 'entree': contexte,
                             'sortie': (f'{vainqueur} gagne {max(m.score_domicile, m.score_exterieur)} à '
                                        f'{min(m.score_domicile, m.score_exterieur)}.' if vainqueur else
                                        f'{d.nom} et {e.nom} font match nul {m.score_domicile} à {m.score_exterieur}.')})
        return exemples
