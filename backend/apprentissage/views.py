"""Apprentissage automatique : joueurs similaires, profils de jeu et modèle xG — vues de l'API."""
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from apprentissage import ml
from apprentissage.models import ModeleXG
from comptes.models import Role
from core.auth import AbonnementActif, SPORTIFS, roles
from core.services import journaliser
from core.visibilite import joueurs_visibles, saison_demandee
from joueurs.models import GROUPE_POSTE, GROUPES
from matchs.models import EtatMatch, Evenement, TypeAction
from statistiques.models import StatistiqueJoueur
from statistiques.serializers import StatistiqueSerializer

P = settings.SYSCOUT
TIRS_MINIMUM = 50
LECTURE = [roles(lecture=SPORTIFS), AbonnementActif]


def statistiques_du_groupe(utilisateur, saison, groupe):
    """Joueurs comparables : même groupe de postes, au moins 450 minutes (RG5), visibles par l'utilisateur."""
    postes = [poste for poste, g in GROUPE_POSTE.items() if g == groupe]
    return list(StatistiqueJoueur.objects.select_related('joueur__club_actuel', 'saison').filter(
        saison=saison, joueur__poste__in=postes, minutes_jouees__gte=P['MINUTES_MIN_CLASSEMENT'],
        joueur__in=joueurs_visibles(utilisateur)).order_by('joueur_id'))


@api_view(['GET'])
@permission_classes(LECTURE)
def similaires(request):
    """Recherche de joueurs similaires : les plus proches voisins du joueur dans son groupe de postes."""
    saison = saison_demandee(request)
    try:
        joueur = joueurs_visibles(request.user).get(pk=request.query_params.get('joueur'))
    except Exception:
        raise NotFound('Joueur introuvable.')
    groupe = statistiques_du_groupe(request.user, saison, joueur.groupe_poste)
    cible = next((s for s in groupe if s.joueur_id == joueur.id), None)
    if cible is None:
        return Response({'eligible': False, 'profil': None, 'similaires': [],
                         'detail': 'Moins de 450 minutes jouées cette saison : pas de comparaison possible (RG5).'})
    profil = next(nom for s, _, nom in ml.profils(groupe) if s.joueur_id == joueur.id)
    voisins = ml.plus_proches(groupe, cible, k=int(request.query_params.get('k', 5)))
    return Response({'eligible': True, 'profil': profil, 'compares': len(groupe), 'similaires': [
        {**StatistiqueSerializer(s).data, 'similarite': score} for s, score in voisins]})


@api_view(['GET'])
@permission_classes(LECTURE)
def profils(request):
    """Profils de jeu d'un groupe de postes (k-moyennes), avec les joueurs de chaque profil."""
    groupe = request.query_params.get('groupe', 'ATTAQUANT')
    if groupe not in dict(GROUPES):
        raise ValidationError({'groupe': 'Groupe de postes inconnu.'})
    resultat = {}
    for s, numero, nom in ml.profils(statistiques_du_groupe(request.user, saison_demandee(request), groupe)):
        resultat.setdefault(numero, {'nom': nom, 'joueurs': []})['joueurs'].append({
            'joueur': s.joueur_id, 'joueur_nom': s.joueur.nom_complet, 'club_nom': s.joueur.club_actuel.nom,
            'poste': s.joueur.poste, 'indice_performance': s.indice_performance})
    for profil in resultat.values():
        profil['joueurs'].sort(key=lambda j: -(j['indice_performance'] or 0))
    return Response({'groupe': groupe, 'profils': [resultat[numero] for numero in sorted(resultat)]})


TIRS_AFFICHES = 400


def _tirs_valides():
    return list(Evenement.objects.filter(
        match__etat=EtatMatch.STATS_PUBLIEES, type_action__in=[TypeAction.TIR, TypeAction.BUT],
    ).values_list('zone_x', 'zone_y', 'type_action'))


def _qualite(modele):
    """Carte des tirs et calibration, mesurées sur les tirs des matchs validés (ceux de l'entraînement : la mesure
    est donc optimiste et ne remplace pas une évaluation sur de nouveaux matchs)."""
    tirs = _tirs_valides()
    predictions = [ml.predire_xg(modele.coefficients, x, y) for x, y, _ in tirs]
    cibles = [1.0 if t == TypeAction.BUT else 0.0 for _, _, t in tirs]
    return {'calibration': ml.calibration_xg(predictions, cibles),
            'carte_tirs': [{'x': x, 'y': y, 'xg': p, 'but': bool(c)}
                           for (x, y, _), p, c in list(zip(tirs, predictions, cibles))[-TIRS_AFFICHES:]]}


def _etat_modele(modele):
    if modele is None:
        return {'entraine': False, 'detail': 'Aucun modèle entraîné : la formule géométrique par défaut est utilisée.'}
    gain = 100 * (1 - modele.perte / modele.perte_reference) if modele.perte_reference else 0
    return {'entraine': True, 'date_entrainement': modele.date_entrainement, 'nb_tirs': modele.nb_tirs,
            'nb_buts': modele.nb_buts, 'perte': modele.perte, 'perte_reference': modele.perte_reference,
            'gain_pct': round(gain, 1),
            # ce que le modèle a appris, sur trois tirs de référence dans l'axe du but
            'exemples': [{'tir': nom, 'xg': ml.predire_xg(modele.coefficients, x, 50)}
                         for nom, x in (('6 mètres', 94.3), ('Point de penalty (11 m)', 89.5), ('25 mètres', 76.2))],
            **_qualite(modele)}


@api_view(['GET', 'POST'])
@permission_classes([roles(Role.ADMIN, Role.ANALYSTE, lecture=SPORTIFS)])
def modele_xg(request):
    """GET : état du modèle xG actif. POST : entraînement sur les tirs des matchs validés."""
    if request.method == 'GET':
        return Response(_etat_modele(ModeleXG.objects.filter(actif=True).first()))
    tirs = _tirs_valides()
    buts = sum(1 for _, _, type_action in tirs if type_action == TypeAction.BUT)
    if len(tirs) < TIRS_MINIMUM or buts == 0 or buts == len(tirs):
        raise ValidationError(f"Il faut au moins {TIRS_MINIMUM} tirs codés dans des matchs validés, dont des buts "
                              f"et des tirs manqués, pour entraîner le modèle ({len(tirs)} tirs, {buts} buts).")
    resultat = ml.entrainer_xg([(x, y, type_action == TypeAction.BUT) for x, y, type_action in tirs])
    modele = ModeleXG.objects.create(
        entraine_par=request.user, nb_tirs=len(tirs), nb_buts=buts, perte=resultat.pop('perte'),
        perte_reference=resultat.pop('perte_reference'), coefficients=resultat)
    journaliser(request, 'CREATION', modele, apres={'nb_tirs': len(tirs), 'nb_buts': buts, 'perte': modele.perte})
    return Response(_etat_modele(modele), status=status.HTTP_201_CREATED)
