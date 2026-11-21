"""Analyse tactique d'un match (SRS HAITI SCOUT AI, MOD-08, §11), calculée sur les événements officiels.

Chaque indicateur documente sa définition et les limites des données (SRS §11) : sans suivi continu des joueurs,
les positions viennent des actions codées (avec ballon), et restent donc approximatives.
Repère : zone_x de 0 à 100 dans le sens de l'attaque de l'équipe qui agit (100 = but adverse), zone_y de 0 à 100
sur la largeur ; terrain de 105 × 68 m."""
import math
from collections import defaultdict

from apprentissage.ml import k_moyennes
from matchs.models import TypeAction

T = TypeAction
LONGUEUR, LARGEUR = 105.0, 68.0
COLONNES, RANGS = 12, 8
FENETRE_TRANSITION = 15     # secondes entre la récupération et le tir
SEUIL_FIABLE = 5            # actions d'un joueur pour une position moyenne fiable
SEUIL_FORMATION = 3         # actions minimales d'un titulaire pour entrer dans la formation observée
ACTIONS_EQUIPE_MIN = 50     # en dessous, les indicateurs d'équipe sont signalés peu fiables
DEFENSIVES = (T.DUEL, T.INTERCEPTION, T.FAUTE)
LIGNE_DECLAREE = {'DC': 'D', 'DL': 'D', 'MD': 'M', 'MC': 'M', 'MO': 'M', 'AIL': 'A', 'BU': 'A'}

DEFINITIONS = {
    'carte_activite': "Cases du terrain où l'équipe (ou le joueur) a réalisé ses actions codées, dans son sens "
                      "d'attaque. Ce n'est pas une heatmap de déplacement : seules les actions avec ballon comptent.",
    'position_moyenne': "Moyenne des positions des actions codées d'un joueur. Fiable à partir de "
                        f"{SEUIL_FIABLE} actions.",
    'formation': "Déclarée : postes de la composition. Observée : les titulaires de champ sont regroupés en lignes "
                 "d'après leur position moyenne (k-moyennes sur la longueur) ; organisation approximative.",
    'bloc': "Largeur et longueur de l'espace où l'équipe agit (du 10e au 90e centile de ses actions) ; hauteur "
            "moyenne de sa ligne la plus basse (formation observée), mesurée depuis son propre but.",
    'passes_progressives': "Passe réussie qui rapproche le ballon du but adverse d'au moins 30 m (dans sa moitié), "
                           "15 m (d'une moitié à l'autre) ou 10 m (dans la moitié adverse). Seules les passes dont "
                           "le point d'arrivée est codé peuvent être classées.",
    'pressing': "PPDA : passes de l'adversaire dans ses 60 % de terrain défensifs, divisées par les actions "
                "défensives de l'équipe (duels, interceptions, fautes) dans cette même zone. Plus il est bas, plus "
                "l'équipe presse haut.",
    'transitions': f"Récupérations et interceptions suivies d'un tir de la même équipe dans les {FENETRE_TRANSITION} "
                   "secondes. Récupération haute : dans les 40 % de terrain adverses.",
}


def _metres(x, y):
    return x * LONGUEUR / 100, y * LARGEUR / 100


def progression(e):
    """Mètres gagnés vers le centre du but adverse par une passe ; None si elle n'est pas progressive."""
    if e['fin_x'] is None or e['fin_y'] is None:
        return None
    (x1, y1), (x2, y2) = _metres(e['zone_x'], e['zone_y']), _metres(e['fin_x'], e['fin_y'])
    gain = math.hypot(LONGUEUR - x1, LARGEUR / 2 - y1) - math.hypot(LONGUEUR - x2, LARGEUR / 2 - y2)
    milieu = LONGUEUR / 2
    seuil = 30 if x2 < milieu else 15 if x1 < milieu else 10
    return round(gain, 1) if gain >= seuil else None


def carte(evenements):
    cases = [0] * (COLONNES * RANGS)
    for e in evenements:
        c = min(COLONNES - 1, int(e['zone_x'] / 100 * COLONNES))
        r = min(RANGS - 1, int(e['zone_y'] / 100 * RANGS))
        cases[r * COLONNES + c] += 1
    return {'colonnes': COLONNES, 'rangs': RANGS, 'cases': cases}


def centile(valeurs, p):
    valeurs = sorted(valeurs)
    rang = (len(valeurs) - 1) * p / 100
    bas = int(rang)
    haut = min(bas + 1, len(valeurs) - 1)
    return valeurs[bas] + (valeurs[haut] - valeurs[bas]) * (rang - bas)


def lignes(positions):
    """Regroupe les titulaires de champ en 3 lignes, ou 4 si cela décrit nettement mieux leur étagement
    (une ligne arrière de moins de 3 joueurs ne correspond à aucun système de jeu : ce découpage est écarté)."""
    points = [[p['x']] for p in positions]

    def decoupage(k):
        groupes, centres = k_moyennes(points, k)
        erreur = sum((p[0] - centres[g][0]) ** 2 for p, g in zip(points, groupes))
        ordre = sorted(range(len(centres)), key=lambda g: centres[g][0])
        return [[positions[i] for i, g in enumerate(groupes) if g == o] for o in ordre], erreur

    trois, erreur3 = decoupage(3)
    quatre, erreur4 = decoupage(4)
    retenu = quatre if erreur4 < 0.35 * erreur3 and all(quatre) and len(quatre[0]) >= 3 else trois
    return [ligne for ligne in retenu if ligne]


def analyse_equipe(club, compositions, evenements, adverses):
    """Indicateurs d'une équipe ; `adverses` = événements de l'autre équipe (pour le pressing)."""
    par_joueur = defaultdict(list)
    for e in evenements:
        par_joueur[e['joueur_id']].append(e)

    positions = []
    for c in compositions:
        actions = par_joueur.get(c.joueur_id, [])
        if not actions:
            continue
        x = sum(a['zone_x'] for a in actions) / len(actions)
        y = sum(a['zone_y'] for a in actions) / len(actions)
        positions.append({'joueur': c.joueur_id, 'nom': c.joueur.nom_complet, 'numero_maillot': c.numero_maillot,
                          'poste': c.poste_occupe or c.joueur.poste, 'est_titulaire': c.est_titulaire,
                          'x': round(x, 1), 'y': round(y, 1), 'actions': len(actions),
                          'fiable': len(actions) >= SEUIL_FIABLE})

    titulaires = [c for c in compositions if c.est_titulaire and (c.poste_occupe or c.joueur.poste) != 'G']
    declaree = defaultdict(int)
    for c in titulaires:
        declaree[LIGNE_DECLAREE.get(c.poste_occupe or c.joueur.poste, 'M')] += 1
    champ = [p for p in positions if p['est_titulaire'] and p['poste'] != 'G' and p['actions'] >= SEUIL_FORMATION]
    observee, bloc = None, None
    if len(champ) >= 8:
        groupes = lignes(champ)
        observee = {'schema': '-'.join(str(len(g)) for g in groupes), 'joueurs_pris_en_compte': len(champ),
                    'lignes': [[p['joueur'] for p in g] for g in groupes]}
    if len(evenements) >= 10:
        # espace occupé par les actions de l'équipe, du 10e au 90e centile (les positions moyennes des joueurs,
        # elles, se resserrent vers le milieu et sous-estiment la largeur)
        xs, ys = [e['zone_x'] for e in evenements], [e['zone_y'] for e in evenements]
        bloc = {'largeur_m': round((centile(ys, 90) - centile(ys, 10)) * LARGEUR / 100, 1),
                'longueur_m': round((centile(xs, 90) - centile(xs, 10)) * LONGUEUR / 100, 1),
                'hauteur_defense_m': (round(sum(p['x'] for p in groupes[0]) / len(groupes[0]) * LONGUEUR / 100, 1)
                                      if observee else None)}

    passes = [e for e in evenements if e['type_action'] == T.PASSE and e['resultat']]
    avec_arrivee = [e for e in passes if e['fin_x'] is not None]
    progressives = []
    for e in avec_arrivee:
        gain = progression(e)
        if gain is not None:
            progressives.append({'joueur': e['joueur_id'], 'minute': e['minute'], 'gain_m': gain,
                                 'depart': [e['zone_x'], e['zone_y']], 'arrivee': [e['fin_x'], e['fin_y']]})

    passes_adverses = sum(1 for e in adverses if e['type_action'] == T.PASSE and e['zone_x'] <= 60)
    actions_def = sum(1 for e in evenements if e['type_action'] in DEFENSIVES and e['zone_x'] >= 40)

    chronologie = sorted(evenements + adverses, key=lambda e: (e['temps_video'], e['id']))
    recuperations = [e for e in evenements if e['type_action'] in (T.RECUPERATION, T.INTERCEPTION)]
    tirs = [e['temps_video'] for e in chronologie if e['club'] == club and e['type_action'] in (T.TIR, T.BUT)]
    rapides = sum(1 for r in recuperations
                  if any(0 <= t - r['temps_video'] <= FENETRE_TRANSITION for t in tirs))

    avertissements = []
    if len(evenements) < ACTIONS_EQUIPE_MIN:
        avertissements.append(f'Seulement {len(evenements)} actions codées : indicateurs peu fiables.')
    if observee is None:
        avertissements.append('Pas assez de titulaires avec des actions codées pour observer une formation.')
    if passes and len(avec_arrivee) < len(passes):
        avertissements.append(f"{len(avec_arrivee)} passe(s) réussie(s) sur {len(passes)} ont un point d'arrivée "
                              'codé : les passes progressives sont comptées sur celles-là seulement.')
    return {
        'club': club, 'actions': len(evenements), 'carte_activite': carte(evenements),
        'positions_moyennes': positions,
        'formation': {'declaree': '-'.join(str(declaree[l]) for l in 'DMA' if declaree[l]), 'observee': observee},
        'bloc': bloc,
        'passes_progressives': {'nombre': len(progressives), 'passes_classables': len(avec_arrivee),
                                'passes_reussies': len(passes), 'detail': progressives},
        'pressing': {'ppda': round(passes_adverses / actions_def, 1) if actions_def else None,
                     'passes_adverses': passes_adverses, 'actions_defensives': actions_def},
        'transitions': {'recuperations': len(recuperations),
                        'recuperations_hautes': sum(1 for r in recuperations if r['zone_x'] >= 60),
                        'suivies_d_un_tir': rapides},
        'avertissements': avertissements,
    }


def analyse(match, debut=0, fin=None):
    """Les deux équipes, entre les minutes `debut` et `fin` (le match entier par défaut)."""
    compositions = list(match.compositions.select_related('joueur'))
    club_de = {c.joueur_id: c.club_id for c in compositions}
    qs = match.evenements.filter(minute__gte=debut)
    if fin is not None:
        qs = qs.filter(minute__lte=fin)
    evenements = list(qs.values('id', 'joueur_id', 'type_action', 'minute', 'temps_video', 'zone_x', 'zone_y',
                                'fin_x', 'fin_y', 'resultat'))
    for e in evenements:
        e['club'] = club_de.get(e['joueur_id'])
    clubs = (match.club_domicile_id, match.club_exterieur_id)
    equipes = {}
    for cote, club, autre in (('domicile', clubs[0], clubs[1]), ('exterieur', clubs[1], clubs[0])):
        equipes[cote] = analyse_equipe(
            club, [c for c in compositions if c.club_id == club],
            [e for e in evenements if e['club'] == club], [e for e in evenements if e['club'] == autre])
    return {'match': match.id, 'periode': {'debut': debut, 'fin': fin}, 'source': 'événements officiels codés',
            'equipes': equipes, 'definitions': DEFINITIONS}
