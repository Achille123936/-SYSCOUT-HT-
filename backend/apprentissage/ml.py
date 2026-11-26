"""Algorithmes d'apprentissage automatique de SYSCOUT-HT, en Python pur (les volumes du SEL sont petits).

- joueurs similaires : plus proches voisins sur les statistiques centrées-réduites ;
- profils de jeu : regroupement k-moyennes des joueurs d'un même groupe de postes ;
- buts attendus (xG) : régression logistique entraînée sur les tirs codés.
"""
import math

CARACTERISTIQUES = ['buts_p90', 'xg_p90', 'tirs_p90', 'passes_p90', 'passes_reussies_pct', 'dribbles_p90',
                    'duels_gagnes_pct', 'recuperations_p90', 'interceptions_p90']
LIBELLES = {'buts_p90': 'buts', 'xg_p90': 'occasions (xG)', 'tirs_p90': 'tirs', 'passes_p90': 'volume de passes',
            'passes_reussies_pct': 'précision des passes', 'dribbles_p90': 'dribbles',
            'duels_gagnes_pct': 'duels gagnés', 'recuperations_p90': 'récupérations',
            'interceptions_p90': 'interceptions'}


# ---------------------------------------------------------------- Préparation des données
def centrer_reduire(lignes):
    """Met chaque colonne à moyenne 0 et écart-type 1, pour que toutes les statistiques pèsent autant."""
    n, colonnes = len(lignes), list(zip(*lignes))
    moyennes = [sum(c) / n for c in colonnes]
    ecarts = [math.sqrt(sum((v - m) ** 2 for v in c) / n) or 1.0 for c, m in zip(colonnes, moyennes)]
    return [[(v - m) / e for v, m, e in zip(ligne, moyennes, ecarts)] for ligne in lignes], moyennes, ecarts


def distance(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def vecteurs(statistiques):
    """Une ligne de statistiques centrées-réduites par joueur."""
    lignes = [[getattr(s, c) for c in CARACTERISTIQUES] for s in statistiques]
    return centrer_reduire(lignes)[0] if lignes else []


# ---------------------------------------------------------------- Joueurs similaires (plus proches voisins)
def plus_proches(statistiques, cible, k=5):
    """Les k joueurs dont le profil statistique est le plus proche de celui de `cible` (score de 0 à 100)."""
    points = vecteurs(statistiques)
    index = next((i for i, s in enumerate(statistiques) if s.joueur_id == cible.joueur_id), None)
    if index is None or len(statistiques) < 2:
        return []
    ecarts = [(distance(points[index], p), s) for i, (p, s) in enumerate(zip(points, statistiques)) if i != index]
    plus_loin = max(d for d, _ in ecarts) or 1.0
    ecarts.sort(key=lambda couple: couple[0])
    return [(s, round(100 * (1 - d / plus_loin), 1)) for d, s in ecarts[:k]]


# ---------------------------------------------------------------- Profils de jeu (k-moyennes)
def k_moyennes(points, k, iterations=50):
    """Regroupe les points en k groupes. Départ déterministe : le premier centre est le point le plus proche
    de la moyenne, chaque centre suivant est le point le plus éloigné des centres déjà choisis."""
    k = min(k, len(points))
    if k == 0:
        return [], []
    dimension = len(points[0])
    milieu = [sum(p[d] for p in points) / len(points) for d in range(dimension)]
    centres = [min(points, key=lambda p: distance(p, milieu))]
    while len(centres) < k:
        centres.append(max(points, key=lambda p: min(distance(p, c) for c in centres)))
    groupes = [0] * len(points)
    for _ in range(iterations):
        nouveaux = [min(range(k), key=lambda g: distance(p, centres[g])) for p in points]
        for g in range(k):
            membres = [p for p, appartenance in zip(points, nouveaux) if appartenance == g]
            if membres:
                centres[g] = [sum(p[d] for p in membres) / len(membres) for d in range(dimension)]
        if nouveaux == groupes:
            break
        groupes = nouveaux
    return groupes, centres


def decrire_profil(centre):
    """Nom d'un profil : les deux statistiques où son centre dépasse le plus la moyenne du groupe de postes."""
    forts = sorted(zip(centre, CARACTERISTIQUES), reverse=True)[:2]
    return ' et '.join(LIBELLES[c] for _, c in forts).capitalize()


def profils(statistiques, k=3):
    """Associe à chaque joueur un profil de jeu. Renvoie [(statistique, numéro, nom du profil)]."""
    points = vecteurs(statistiques)
    groupes, centres = k_moyennes(points, k)
    noms = [decrire_profil(c) for c in centres]
    return [(s, g, noms[g]) for s, g in zip(statistiques, groupes)]


# ---------------------------------------------------------------- xG : régression logistique
def geometrie_tir(zone_x, zone_y):
    """Distance au but (m) et angle par rapport à l'axe du but (rad) ; but adverse en x = 100, y = 50."""
    dx = (100 - zone_x) * 1.05
    dy = (zone_y - 50) * 0.68
    return math.hypot(dx, dy), math.atan2(abs(dy), max(dx, 0.1))


def sigmoide(z):
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))


def entrainer_xg(tirs, iterations=800, pas=0.3):
    """Apprend P(but) à partir de la position des tirs. `tirs` = [(zone_x, zone_y, but?)].

    Descente de gradient sur la perte logistique. Renvoie les coefficients et la qualité du modèle."""
    brut = [list(geometrie_tir(x, y)) for x, y, _ in tirs]
    cibles = [1.0 if but else 0.0 for _, _, but in tirs]
    donnees, moyennes, ecarts = centrer_reduire(brut)
    n = len(donnees)
    poids, biais = [0.0, 0.0], 0.0
    for _ in range(iterations):
        gradient, gradient_biais = [0.0, 0.0], 0.0
        for ligne, cible in zip(donnees, cibles):
            erreur = sigmoide(biais + sum(w * v for w, v in zip(poids, ligne))) - cible
            gradient_biais += erreur
            for j, v in enumerate(ligne):
                gradient[j] += erreur * v
        biais -= pas * gradient_biais / n
        poids = [w - pas * g / n for w, g in zip(poids, gradient)]
    probabilites = [sigmoide(biais + sum(w * v for w, v in zip(poids, ligne))) for ligne in donnees]
    perte = -sum(c * math.log(max(p, 1e-9)) + (1 - c) * math.log(max(1 - p, 1e-9))
                 for p, c in zip(probabilites, cibles)) / n
    taux = sum(cibles) / n
    reference = -(taux * math.log(max(taux, 1e-9)) + (1 - taux) * math.log(max(1 - taux, 1e-9)))
    return {'poids': poids, 'biais': biais, 'moyennes': moyennes, 'ecarts': ecarts,
            'perte': round(perte, 4), 'perte_reference': round(reference, 4), 'taux_de_but': round(taux, 4)}


def predire_xg(coefficients, zone_x, zone_y):
    valeurs = geometrie_tir(zone_x, zone_y)
    z = coefficients['biais'] + sum(
        w * (v - m) / e for w, v, m, e in zip(coefficients['poids'], valeurs, coefficients['moyennes'],
                                              coefficients['ecarts']))
    return round(min(0.95, max(0.01, sigmoide(z))), 3)


def calibration_xg(predictions, cibles, classes=5):
    """Calibration d'un modèle xG : pour chaque tranche de probabilité prédite, xG moyen et fréquence observée de buts.

    Renvoie aussi le score de Brier du modèle et celui d'une référence qui prédit toujours le taux de but moyen
    (plus bas = meilleur). Un modèle bien calibré suit la diagonale (xG moyen ≈ fréquence observée)."""
    n = len(predictions)
    if n == 0:
        return {'tranches': [], 'brier': None, 'brier_reference': None}
    ordre = sorted(range(n), key=lambda i: predictions[i])
    tranches = []
    for k in range(classes):
        indices = ordre[k * n // classes:(k + 1) * n // classes]
        if not indices:
            continue
        tranches.append({'xg_moyen': round(sum(predictions[i] for i in indices) / len(indices), 3),
                         'frequence': round(sum(cibles[i] for i in indices) / len(indices), 3),
                         'tirs': len(indices)})
    taux = sum(cibles) / n
    return {'tranches': tranches,
            'brier': round(sum((p - c) ** 2 for p, c in zip(predictions, cibles)) / n, 4),
            'brier_reference': round(sum((taux - c) ** 2 for c in cibles) / n, 4)}


# ---------------------------------------------------------------- Capteur GPS : de la trace aux données physiques
RAYON_TERRE = 6371000.0
VITESSE_IMPOSSIBLE = 12.5   # m/s (45 km/h) : au-delà, c'est une erreur du GPS
SPRINT_MINIMUM = 5.5        # m/s (19,8 km/h) : en dessous, un effort n'est jamais compté comme sprint


def haversine(lat1, lon1, lat2, lon2):
    """Distance en mètres entre deux positions GPS."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * RAYON_TERRE * math.asin(math.sqrt(a))


def analyser_trace(points):
    """Données physiques à partir d'une trace GPS : [(t en secondes, latitude, longitude)]."""
    points = sorted(points)
    if not points:
        return None
    _, lat0, lon0 = points[0]
    echelle = math.cos(math.radians(lat0))
    # projection locale en mètres autour du premier point (exacte à l'échelle d'un terrain)
    return analyser_positions([(t, RAYON_TERRE * math.radians(lon - lon0) * echelle,
                                RAYON_TERRE * math.radians(lat - lat0)) for t, lat, lon in points])


def lisser_positions(points, fenetre=5):
    """Moyenne glissante des positions : gomme le tremblement du doigt qui suit un joueur sur la vidéo."""
    demi = fenetre // 2
    lisses = []
    for i, (t, _, _) in enumerate(points):
        voisins = points[max(0, i - demi):i + demi + 1]
        lisses.append((t, sum(p[1] for p in voisins) / len(voisins), sum(p[2] for p in voisins) / len(voisins)))
    return lisses


def analyser_positions(points):
    """Calcule les données physiques d'un joueur à partir de ses positions en mètres : [(t en secondes, x, y)].

    Les vitesses sont regroupées en trois allures (marche, course, sprint) par k-moyennes : le seuil de sprint
    s'adapte donc au joueur, avec un plancher de 19,8 km/h pour qu'une simple course ne compte pas comme sprint."""
    points = sorted(points)
    segments = []  # (instant, distance, vitesse, durée)
    for (t1, x1, y1), (t2, x2, y2) in zip(points, points[1:]):
        dt = t2 - t1
        if dt <= 0:
            continue
        d = math.hypot(x2 - x1, y2 - y1)
        if d / dt <= VITESSE_IMPOSSIBLE:  # les sauts de position sont écartés
            segments.append((t2, d, d / dt, dt))
    if len(segments) < 3:
        return None
    brutes = [s[2] for s in segments]
    # médiane glissante sur 3 mesures : elle gomme le bruit sans effacer les accélérations
    vitesses = [sorted(brutes[max(0, i - 1):i + 2])[len(brutes[max(0, i - 1):i + 2]) // 2] for i in range(len(brutes))]
    groupes, centres = k_moyennes([[v] for v in vitesses], 3)
    rapide = max(range(len(centres)), key=lambda g: centres[g][0])
    seuil = max(min(v for v, g in zip(vitesses, groupes) if g == rapide), SPRINT_MINIMUM)
    distance = distance_sprint = 0.0
    sprints, en_sprint, duree_sprint = 0, False, 0.0
    for (_, d, _, dt), v in zip(segments, vitesses):
        distance += d
        if v >= seuil:
            distance_sprint += d
            duree_sprint += dt
            if not en_sprint and duree_sprint >= 1:  # un sprint dure au moins une seconde
                sprints, en_sprint = sprints + 1, True
        else:
            en_sprint, duree_sprint = False, 0.0
    allures = sorted(round(c[0] * 3.6, 1) for c in centres)
    return {'distance_m': round(distance), 'distance_sprint_m': round(distance_sprint), 'sprints': sprints,
            'vitesse_max_kmh': round(max(vitesses) * 3.6, 1), 'seuil_sprint_kmh': round(seuil * 3.6, 1),
            'allures_kmh': allures, 'duree_s': round(points[-1][0] - points[0][0]),
            'mesures': len(segments), 'mesures_ecartees': len(points) - 1 - len(segments)}


# ---------------------------------------------------------------- Suivi vidéo : de l'image au terrain
# rectangles de référence que l'analyste désigne sur l'image, en mètres (longueur, largeur)
REFERENCES = {'TERRAIN': (105.0, 68.0), 'MOITIE': (52.5, 68.0), 'SURFACE': (16.5, 40.32)}


def homographie(source, cible):
    """Transformation de perspective qui envoie 4 points de l'image sur 4 points du terrain.

    Résout les 8 inconnues par élimination de Gauss ; renvoie None si les 4 points sont alignés ou confondus."""
    lignes = []
    for (x, y), (u, v) in zip(source, cible):
        lignes.append([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
        lignes.append([0, 0, 0, x, y, 1, -v * x, -v * y, v])
    for colonne in range(8):
        pivot = max(range(colonne, 8), key=lambda i: abs(lignes[i][colonne]))
        if abs(lignes[pivot][colonne]) < 1e-9:
            return None
        lignes[colonne], lignes[pivot] = lignes[pivot], lignes[colonne]
        for i in range(8):
            if i != colonne:
                facteur = lignes[i][colonne] / lignes[colonne][colonne]
                lignes[i] = [a - facteur * b for a, b in zip(lignes[i], lignes[colonne])]
    return [lignes[i][8] / lignes[i][i] for i in range(8)]


def projeter(h, x, y):
    """Position sur le terrain (mètres) d'un point de l'image."""
    diviseur = h[6] * x + h[7] * y + 1
    if abs(diviseur) < 1e-9:
        return None
    return (h[0] * x + h[1] * y + h[2]) / diviseur, (h[3] * x + h[4] * y + h[5]) / diviseur


def distances_terrain(coins, reference, points, ferme=False):
    """Longueur en mètres de chaque segment d'un dessin posé sur l'image (flèche, liaison entre joueurs, triangle).
    `ferme` ajoute le segment qui relie le dernier point au premier. Renvoie None si le calibrage est inexploitable."""
    longueur, largeur = REFERENCES[reference]
    h = homographie(coins, [(0, 0), (longueur, 0), (longueur, largeur), (0, largeur)])
    if h is None:
        return None
    terrain = [projeter(h, x, y) for x, y in points]
    if any(p is None for p in terrain):
        return None
    if ferme:
        terrain.append(terrain[0])
    mesures = [round(math.hypot(b[0] - a[0], b[1] - a[1]), 1) for a, b in zip(terrain, terrain[1:])]
    # au-delà de la diagonale du terrain, la mesure trahit un calibrage faux
    return mesures if all(m <= 130 for m in mesures) else None


def analyser_suivi(coins, reference, points):
    """Suivi d'un joueur sur la vidéo : `coins` = les 4 coins du rectangle de référence sur l'image (haut-gauche,
    haut-droit, bas-droit, bas-gauche), `points` = [(t, x, y)] sur l'image. Renvoie (données physiques, trajet en m)."""
    longueur, largeur = REFERENCES[reference]
    h = homographie(coins, [(0, 0), (longueur, 0), (longueur, largeur), (0, largeur)])
    if h is None:
        return None, []
    terrain = []
    for t, x, y in sorted(points):
        position = projeter(h, x, y)
        # un point projeté très loin du terrain trahit un mauvais calibrage ou un geste hors de l'image utile
        if position and -30 <= position[0] <= 135 and -30 <= position[1] <= 98:
            terrain.append((t, position[0], position[1]))
    terrain = lisser_positions(terrain)
    return analyser_positions(terrain), terrain
