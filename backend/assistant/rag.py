"""Recherche documentaire de l'assistant : trouve, parmi les données autorisées de l'utilisateur, les passages utiles.

Sources : connaissances de base du football, définitions des indicateurs de SYSCOUT-HT, statistiques des joueurs
visibles de l'utilisateur (RG9) et résultats des matchs publiés. Les mineurs en sont exclus (RG12) : ces passages
sont envoyés à un service externe, donc aucune donnée de mineur n'est jamais incluse.
Méthode : mots-clés sans accents, pondération BM25 simplifiée ; pas de base vectorielle (volume modeste)."""
import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass

from core.visibilite import joueurs_visibles
from matchs.models import EtatMatch, Match
from matchs.tactique import DEFINITIONS
from referentiel.models import Saison
from statistiques.models import StatistiqueJoueur

from . import donnees_externes
from .connaissances import QR

MOTS_VIDES = set('le la les un une des du de d l et ou a au aux en est sont que qui quoi quel quelle quels quelles '
                 'pour par sur dans ce cet cette ces il elle ils on se sa son ses ne pas plus ou comment pourquoi '
                 'what is the of and to in'.split())
LIBELLES = {'buts_p90': 'buts', 'xg_p90': 'xG', 'tirs_p90': 'tirs', 'passes_p90': 'passes',
            'dribbles_p90': 'dribbles', 'recuperations_p90': 'récupérations', 'interceptions_p90': 'interceptions'}


@dataclass
class Passage:
    identifiant: str
    titre: str
    texte: str


def mots(texte):
    """Mots en minuscules, sans accents ni mots vides."""
    brut = unicodedata.normalize('NFD', texte.lower())
    brut = ''.join(c for c in brut if unicodedata.category(c) != 'Mn')
    return [m for m in re.findall(r'[a-z0-9]+', brut) if m not in MOTS_VIDES and len(m) > 1]


def passages_connaissances():
    return ([Passage(f'K{i}', q, r) for i, (q, r) in enumerate(QR, 1)]
            + [Passage(f'D{i}', f"Définition SYSCOUT-HT : {cle.replace('_', ' ')}", texte)
               for i, (cle, texte) in enumerate(DEFINITIONS.items(), 1)]
            + [Passage(*p) for p in donnees_externes.passages()])


def passages_joueurs(utilisateur):
    """Une fiche par joueur majeur, visible et éligible (au moins 450 minutes), pour la saison courante."""
    saison = Saison.courante()
    if saison is None:
        return []
    visibles = joueurs_visibles(utilisateur)
    passages = []
    for s in StatistiqueJoueur.objects.filter(saison=saison, joueur__in=visibles).select_related('joueur__club_actuel'):
        j = s.joueur
        if not s.eligible or j.est_mineur:
            continue
        lignes = [f'{j.nom_complet}, {j.get_poste_display()}, {j.club_actuel.nom}, {s.minutes_jouees} minutes '
                  f'sur {s.matchs_joues} matchs (saison {saison.libelle}).']
        for cle, libelle in LIBELLES.items():
            centile = (s.centiles or {}).get(cle)
            if centile is not None:
                lignes.append(f'{libelle} par 90 min : {getattr(s, cle):.2f} (centile {centile:.0f}).')
        if s.indice_performance is not None:
            lignes.append(f'Indice de performance : {s.indice_performance:.0f}.')
        passages.append(Passage(f'J{j.id}', f'Statistiques de {j.nom_complet}', ' '.join(lignes)))
    return passages


def passages_matchs():
    return [Passage(f'M{m.id}', f'Match {m.club_domicile.nom} - {m.club_exterieur.nom}',
                    f'Journée {m.journee} : {m.club_domicile.nom} {m.score_domicile} - {m.score_exterieur} '
                    f'{m.club_exterieur.nom}.')
            for m in Match.objects.filter(etat=EtatMatch.STATS_PUBLIEES).select_related('club_domicile', 'club_exterieur')]


def classer(question, passages, k=8):
    """Les k passages les plus pertinents (BM25 simplifié), du plus au moins pertinent ; aucun si rien ne correspond."""
    requete = set(mots(question))
    if not requete or not passages:
        return []
    documents = [Counter(mots(f'{p.titre} {p.texte}')) for p in passages]
    n = len(passages)
    longueur_moyenne = sum(sum(d.values()) for d in documents) / n or 1
    frequence = Counter(m for d in documents for m in d)
    notes = []
    for passage, d in zip(passages, documents):
        taille, note = sum(d.values()), 0.0
        for m in requete:
            if m in d:
                idf = math.log(1 + (n - frequence[m] + 0.5) / (frequence[m] + 0.5))
                note += idf * d[m] * 2.2 / (d[m] + 1.2 * (0.25 + 0.75 * taille / longueur_moyenne))
        if requete & set(mots(passage.titre)):
            note *= 1.5  # un mot de la question dans le titre (ex. le nom d'un joueur) compte davantage
        notes.append(note)
    ordre = sorted(range(n), key=lambda i: -notes[i])
    return [passages[i] for i in ordre[:k] if notes[i] > 0]


def rechercher(question, utilisateur, k=8):
    return classer(question, passages_connaissances() + passages_joueurs(utilisateur) + passages_matchs(), k)
