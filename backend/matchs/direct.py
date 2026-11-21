"""Suivi d'un match en direct : possession du ballon, statistiques des équipes et des joueurs, données physiques."""
from collections import defaultdict

from django.db.models import Count, Max, Sum

from matchs.models import DonneePhysique, Possession, SourceDonnee, StatutValidation, TypeAction

T = TypeAction
S = StatutValidation


def possession(match, evenements):
    """Part du temps de possession de chaque équipe.

    Méthode « chronomètre » : l'analyste indique pendant le codage quelle équipe a le ballon ; chaque période
    est chronométrée (le temps sans possession, ballon hors du jeu, n'est compté pour personne).
    À défaut, méthode « passes » : part des passes tentées par chaque équipe."""
    clubs = (match.club_domicile_id, match.club_exterieur_id)
    periodes = list(match.possessions.all())
    if periodes:
        # une période encore ouverte court jusqu'au dernier instant connu du codage
        dernier = max([p.debut for p in periodes] + [p.fin or 0 for p in periodes]
                      + [e['temps_video'] for e in evenements])
        duree = defaultdict(int)
        for p in periodes:
            duree[p.club_id] += max(0, (p.fin if p.fin is not None else dernier) - p.debut)
        total = sum(duree[c] for c in clubs)
        ouverte = next((p.club_id for p in periodes if p.fin is None), None)
        if total:
            domicile = round(100 * duree[clubs[0]] / total, 1)
            return {'methode': 'chronometre', 'domicile': domicile, 'exterieur': round(100 - domicile, 1),
                    'secondes_domicile': duree[clubs[0]], 'secondes_exterieur': duree[clubs[1]], 'en_cours': ouverte}
        return {'methode': 'chronometre', 'domicile': None, 'exterieur': None, 'en_cours': ouverte}
    passes = defaultdict(int)
    for e in evenements:
        if e['type_action'] == T.PASSE:
            passes[e['club']] += 1
    total = passes[clubs[0]] + passes[clubs[1]]
    if not total:
        return {'methode': None, 'domicile': None, 'exterieur': None, 'en_cours': None}
    domicile = round(100 * passes[clubs[0]] / total, 1)
    return {'methode': 'passes', 'domicile': domicile, 'exterieur': round(100 - domicile, 1), 'en_cours': None}


def _bilan(evenements):
    """Statistiques tirées des événements codés (d'une équipe ou d'un joueur)."""
    def n(type_action, reussi=None):
        return sum(1 for e in evenements if e['type_action'] == type_action and (reussi is None or e['resultat'] == reussi))

    def pct(type_action):
        return round(100 * n(type_action, True) / n(type_action), 1) if n(type_action) else None

    buts = n(T.BUT)
    return {
        'buts': buts, 'tirs': n(T.TIR) + buts, 'tirs_cadres': n(T.TIR, True) + buts,
        'xg': round(sum(e['valeur_xg'] or 0 for e in evenements), 2),
        'passes': n(T.PASSE), 'passes_reussies': n(T.PASSE, True), 'passes_reussies_pct': pct(T.PASSE),
        'centres': n(T.CENTRE), 'dribbles_reussis': n(T.DRIBBLE, True),
        'duels': n(T.DUEL), 'duels_gagnes': n(T.DUEL, True), 'duels_gagnes_pct': pct(T.DUEL),
        'recuperations': n(T.RECUPERATION), 'interceptions': n(T.INTERCEPTION), 'fautes': n(T.FAUTE),
        'cartons': n(T.CARTON), 'corners': n(T.CORNER), 'hors_jeux': n(T.HORS_JEU), 'arrets': n(T.ARRET),
    }


def _physique(donnee):
    return {'distance_m': donnee.distance_m, 'distance_sprint_m': donnee.distance_sprint_m, 'sprints': donnee.sprints,
            'vitesse_max_kmh': donnee.vitesse_max_kmh, 'source': donnee.source}


def tableau(match):
    """Tout ce qu'affiche l'écran « Direct » ; recalculé à chaque appel à partir de ce qui est codé."""
    compositions = list(match.compositions.select_related('joueur'))
    club_de = {c.joueur_id: c.club_id for c in compositions}
    evenements = list(match.evenements.values('id', 'joueur_id', 'type_action', 'resultat', 'valeur_xg', 'minute',
                                              'temps_video', 'source', 'statut_validation'))
    for e in evenements:
        e['club'] = club_de.get(e['joueur_id'])
    physique = {d.joueur_id: d for d in match.donnees_physiques.all()}
    clubs = (match.club_domicile_id, match.club_exterieur_id)

    equipes = []
    for club in clubs:
        bilan = _bilan([e for e in evenements if e['club'] == club])
        mesures = [d for joueur, d in physique.items() if club_de.get(joueur) == club]
        if mesures:  # totaux physiques de l'équipe
            bilan['distance_m'] = sum(d.distance_m or 0 for d in mesures)
            bilan['sprints'] = sum(d.sprints or 0 for d in mesures)
            bilan['vitesse_max_kmh'] = max((d.vitesse_max_kmh or 0 for d in mesures), default=None)
        equipes.append(bilan)

    par_joueur = defaultdict(list)
    for e in evenements:
        par_joueur[e['joueur_id']].append(e)
    joueurs = [{
        'joueur': c.joueur_id, 'nom': c.joueur.nom_complet, 'club': c.club_id, 'poste': c.joueur.poste,
        'numero_maillot': c.numero_maillot, 'est_titulaire': c.est_titulaire, 'minutes_jouees': c.minutes_jouees,
        **_bilan(par_joueur[c.joueur_id]),
        'physique': _physique(physique[c.joueur_id]) if c.joueur_id in physique else None,
    } for c in compositions]

    noms = {c.joueur_id: c.joueur.nom_complet for c in compositions}
    derniers = [{'id': e['id'], 'minute': e['minute'], 'type_action': e['type_action'], 'resultat': e['resultat'],
                 'joueur_nom': noms.get(e['joueur_id']), 'club': e['club'], 'source': e['source'],
                 'statut_validation': e['statut_validation']}
                for e in sorted(evenements, key=lambda e: (e['temps_video'], e['id']))[-10:]][::-1]
    # AC-009 : d'où viennent les chiffres ; les propositions de l'IA non vérifiées n'y entrent pas
    statuts = dict(match.propositions.order_by().values_list('statut').annotate(n=Count('id')))
    return {
        'match': {'id': match.id, 'etat': match.etat, 'etat_libelle': match.get_etat_display(),
                  'journee': match.journee, 'duree': match.duree,
                  'domicile': {'id': clubs[0], 'nom': match.club_domicile.nom, 'sigle': match.club_domicile.sigle},
                  'exterieur': {'id': clubs[1], 'nom': match.club_exterieur.nom, 'sigle': match.club_exterieur.sigle},
                  'score_saisi': [match.score_domicile, match.score_exterieur]},
        'en_direct': match.verrou_actif,
        'minute': max((e['minute'] for e in evenements), default=0),
        'score': [equipes[0]['buts'], equipes[1]['buts']],  # buts codés jusqu'ici
        'possession': possession(match, evenements),
        'equipes': {'domicile': equipes[0], 'exterieur': equipes[1]},
        'joueurs': joueurs, 'nb_evenements': len(evenements), 'derniers': derniers,
        'sources': {
            'analyste': sum(e['source'] == SourceDonnee.HUMAN for e in evenements),
            'ia_confirmes': sum(e['source'] == SourceDonnee.AI and e['statut_validation'] == S.APPROVED
                                for e in evenements),
            'ia_corriges': sum(e['source'] == SourceDonnee.AI and e['statut_validation'] == S.CORRECTED
                               for e in evenements),
        },
        'propositions': {'en_attente': statuts.get(S.PENDING, 0), 'rejetees': statuts.get(S.REJECTED, 0),
                         'non_verifiees': statuts.get(S.UNVERIFIED, 0)},
        # FR-041 : caméras qui filment le match en ce moment, avec leur dernier état mesuré
        'cameras': [{'id': e.camera_id, 'nom': e.camera.nom, 'etat': e.camera.etat,
                     'etat_libelle': e.camera.get_etat_display(), 'latence_ms': e.camera.latence_ms,
                     'message_etat': e.camera.message_etat}
                    for e in match.enregistrements.filter(fin__isnull=True).select_related('camera')],
    }


def changer_possession(match, club, temps):
    """Ferme la période de possession en cours à l'instant `temps` et en ouvre une pour `club` (None = personne)."""
    ouverte = match.possessions.filter(fin__isnull=True).first()
    if ouverte:
        if ouverte.club_id == (club.id if club else None):
            return ouverte
        ouverte.fin = max(temps, ouverte.debut)
        ouverte.save(update_fields=['fin'])
    return Possession.objects.create(match=match, club=club, debut=temps) if club else None


def physique_saison(joueur, saison):
    """Moyennes physiques d'un joueur sur la saison, ramenées à 90 minutes (RG6)."""
    donnees = DonneePhysique.objects.filter(joueur=joueur, match__competition__saison=saison)
    if not donnees.exists():
        return None
    minutes = sum(c.minutes_jouees for c in joueur.compositions.filter(match__in=donnees.values('match')))
    total = donnees.aggregate(distance=Sum('distance_m'), sprint=Sum('distance_sprint_m'), sprints=Sum('sprints'),
                              vmax=Max('vitesse_max_kmh'))

    def p90(valeur):
        return round(valeur * 90 / minutes, 1) if minutes and valeur is not None else None

    return {'matchs_mesures': donnees.count(), 'minutes': minutes, 'distance_m_p90': p90(total['distance']),
            'distance_sprint_m_p90': p90(total['sprint']), 'sprints_p90': p90(total['sprints']),
            'vitesse_max_kmh': total['vmax']}
