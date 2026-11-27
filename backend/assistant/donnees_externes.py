"""Données externes : « Analyse technique de la FIFA », Haïti U-17 masculin, Coupe du monde U-17 Qatar 2026.

Source : capture d'écran d'un direct YouTube (graphique de télévision attribué au FIFA Training Centre, rapports
techniques de la Coupe du monde U17 Qatar 2026), transcrite à la main. Les chiffres n'ont PAS été vérifiés auprès de la FIFA :
à confronter au rapport officiel avant tout usage. Le graphique ne donne pas les scores des matchs, qu'on n'invente pas.
Chaque valeur est (Haïti, adversaire). Données d'équipe seulement : aucun joueur, donc aucun mineur identifié."""

SOURCE = ("graphique « Analyse technique de la FIFA » (FIFA Training Centre) vu dans un direct YouTube, "
          "chiffres transcrits à la main et non vérifiés")

# indicateur -> libellé ; ordre du tableau d'origine
INDICATEURS = {
    'xg': 'Buts attendus (xG)',
    'percees_reussies': 'Percées de lignes réussies',
    'percees_subies': 'Percées subies par la défense',
    'receptions_dernier_tiers': 'Réceptions dans le dernier tiers',
    'centres': 'Centres',
    'progressions': 'Progressions du ballon',
    'pressions': 'Pressions défensives',
    'recuperations_forcees': 'Récupérations forcées',
    'seconds_ballons': 'Seconds ballons gagnés',
    'distance_km': 'Distance parcourue (km)',
}

MATCHS = {
    'France': dict(xg=(0.22, 1.66), percees_reussies=(67, 108), percees_subies=(7, 16),
                   receptions_dernier_tiers=(37, 173), centres=(10, 21), progressions=(27, 34),
                   pressions=(283, 232), recuperations_forcees=(40, 38), seconds_ballons=(71, 77),
                   distance_km=(110.7, 114.2)),
    'Uruguay': dict(xg=(0.50, 1.81), percees_reussies=(68, 107), percees_subies=(9, 8),
                    receptions_dernier_tiers=(79, 101), centres=(16, 15), progressions=(52, 35),
                    pressions=(244, 261), recuperations_forcees=(55, 55), seconds_ballons=(81, 81),
                    distance_km=(110.3, 113.2)),
    'Arabie saoudite': dict(xg=(1.00, 0.77), percees_reussies=(99, 60), percees_subies=(11, 10),
                            receptions_dernier_tiers=(167, 50), centres=(36, 13), progressions=(39, 21),
                            pressions=(163, 242), recuperations_forcees=(48, 36), seconds_ballons=(84, 68),
                            distance_km=(107.5, 109.7)),
}


def _nombre(v):
    return f'{v:.2f}'.replace('.', ',') if isinstance(v, float) and v < 10 else (
        f'{v:.1f}'.replace('.', ',') if isinstance(v, float) else str(v))


def fiche(adversaire):
    """Tableau d'un match, en texte : une ligne par indicateur, « Haïti x – adversaire y »."""
    lignes = [f'Haïti U-17 contre {adversaire} (Coupe du monde U-17 Qatar 2026), source : {SOURCE}.']
    for cle, libelle in INDICATEURS.items():
        h, a = MATCHS[adversaire][cle]
        lignes.append(f'- {libelle} : Haïti {_nombre(h)}, {adversaire} {_nombre(a)}.')
    return '\n'.join(lignes)


def constats(adversaire):
    """Constats déduits des chiffres seulement (comparaisons, aucun résultat de match)."""
    d = MATCHS[adversaire]
    sortie = []
    h, a = d['xg']
    sortie.append(f'Haïti a créé {"plus" if h > a else "moins"} de buts attendus que {adversaire} '
                  f'({_nombre(h)} contre {_nombre(a)}).')
    h, a = d['receptions_dernier_tiers']
    sortie.append(f'Réceptions dans le dernier tiers : {_nombre(h)} pour Haïti, {_nombre(a)} pour {adversaire}.')
    h, a = d['pressions']
    sortie.append(f'Haïti a effectué {"plus" if h > a else "moins"} de pressions défensives que {adversaire} '
                  f'({h} contre {a}).')
    return ' '.join(sortie)


def passages():
    """Passages pour la recherche documentaire : (identifiant, titre, texte)."""
    resultat = [(f'E{i}', f'Haïti U-17 – {adv} (analyse FIFA)', fiche(adv) + ' ' + constats(adv))
                for i, adv in enumerate(MATCHS, 1)]
    resultat.append(('E4', 'Haïti U-17 : synthèse des trois matchs (analyse FIFA)',
                     "Dans le graphique, le meilleur xG d'Haïti est contre l'Arabie saoudite "
                     f"({_nombre(MATCHS['Arabie saoudite']['xg'][0])}) et le plus faible contre la France "
                     f"({_nombre(MATCHS['France']['xg'][0])}). Haïti a parcouru entre 107,5 et 110,7 km par match, "
                     f"un peu moins que ses adversaires. Source : {SOURCE}."))
    return resultat + passages_coupe_du_monde()


def exemples():
    """Exemples d'instructions (JSONL) pour ajuster le modèle : toutes les réponses viennent du tableau."""
    sortie = []
    for adv in MATCHS:
        sortie.append({'instruction': f'Donne les statistiques techniques de Haïti U-17 contre {adv}.',
                       'entree': '', 'sortie': fiche(adv)})
        sortie.append({'instruction': f'Compare les chiffres de Haïti et de {adv} en quelques phrases.',
                       'entree': fiche(adv), 'sortie': constats(adv)})
        for cle, libelle in INDICATEURS.items():
            h, a = MATCHS[adv][cle]
            sortie.append({'instruction': f'{libelle} dans Haïti – {adv} (U-17, Qatar 2026) ?', 'entree': '',
                           'sortie': f'Haïti {_nombre(h)}, {adv} {_nombre(a)} (source : analyse FIFA vue dans un direct, '
                                     "non vérifiée)."})
    return sortie + exemples_coupe_du_monde()


# ---------------------------------------------------------------- Coupe du monde 2026 (adultes), site tiers
SOURCE_CM = ("page « FIFA World Cup 2026 » d'un site tiers, attribuée au FIFA Training Centre (Post-Match Summary), "
             "chiffres transcrits à la main depuis des captures d'écran partielles et non vérifiés")

# (équipe, matchs joués, distance/match en km, possession %, xG/match, tirs/match, précision des passes %, percées de lignes/match)
EQUIPES_CM = [
    ('Allemagne', 4, 127.2, 56.0, 2.16, 18.5, 90, 133.3),
    ('Australie', 4, 123.5, 34.7, 0.68, 10.5, 80, 82.0),
    ('Belgique', 6, 123.2, 45.7, 1.77, 18.7, 85, 102.0),
    ('Sénégal', 4, 123.2, 49.4, 1.81, 17.0, 88, 111.0),
    ('Norvège', 6, 122.3, 48.9, 1.66, 10.8, 87, 97.8),
    ('Suisse', 6, 121.4, 48.5, 1.60, 12.3, 86, 107.5),
]

# (équipe déduite des joueurs, numéro, nom, distance en km, vitesse maximale en km/h) : un match non identifié sur la capture
JOUEURS_CM = [
    ('France', 10, 'Kylian Mbappé', 8.7, 35.3), ('France', 11, 'Michael Olise', 8.7, 28.4),
    ('France', 12, 'Bradley Barcola', 6.1, 33.9), ('France', 14, 'Adrien Rabiot', 5.3, 29.3),
    ('France', 17, 'William Saliba', 2.4, 26.3), ('France', 6, 'Manu Koné', 6.0, 30.3),
    ('France', 19, 'Théo Hernandez', 2.7, 33.0), ('France', 20, 'Désiré Doué', 4.4, 27.9),
    ('France', 24, 'Rayan Cherki', 3.3, 27.2), ('France', 26, 'Maxence Lacroix', 7.9, 31.7),
    ('Espagne', 16, 'Rodri', 12.6, 30.6), ('Espagne', 19, 'Lamine Yamal', 9.5, 32.9),
    ('Espagne', 21, 'Mikel Oyarzabal', 8.3, 29.5), ('Espagne', 22, 'Pau Cubarsí', 10.2, 32.4),
    ('Espagne', 24, 'Marc Cucurella', 10.1, 30.2), ('Espagne', 5, 'Marcos Llorente', 1.7, 25.2),
    ('Espagne', 6, 'Mikel Merino', 2.7, 25.2), ('Espagne', 7, 'Ferran Torres', 2.7, 30.6),
    ('Espagne', 17, 'Nico Williams', 1.7, 31.4), ('Espagne', 20, 'Pedri', 2.7, 27.8),
]
AVERTISSEMENT_JOUEURS = ("La capture ne dit pas de quel match il s'agit ni combien de minutes chaque joueur a jouées : "
                         "une petite distance peut venir d'un temps de jeu court.")


def _fiche_equipe(t):
    nom, m, dist, poss, xg, tirs, passes, percees = t
    return (f'{nom} à la Coupe du monde 2026 ({m} matchs) : distance {_nombre(dist)} km par match, possession '
            f'{_nombre(poss)} %, xG {_nombre(xg)} par match, {_nombre(tirs)} tirs par match, précision des passes '
            f'{passes} %, {_nombre(percees)} percées de lignes par match. Source : {SOURCE_CM}.')


def _fiche_joueur(j):
    equipe, numero, nom, km, vitesse = j
    km, vitesse = f'{km:.1f}'.replace('.', ','), f'{vitesse:.1f}'.replace('.', ',')
    return (f'{nom} ({equipe}, n°{numero}) : {km} km parcourus, vitesse maximale {vitesse} km/h '
            f'dans un match non identifié de la Coupe du monde 2026. {AVERTISSEMENT_JOUEURS} Source : {SOURCE_CM}.')


def passages_coupe_du_monde():
    resultat = [(f'C{i}', f"{t[0]} – statistiques d'équipe, Coupe du monde 2026", _fiche_equipe(t))
                for i, t in enumerate(EQUIPES_CM, 1)]
    resultat += [(f'P{i}', f'{j[2]} – distance et vitesse, Coupe du monde 2026', _fiche_joueur(j))
                 for i, j in enumerate(JOUEURS_CM, 1)]
    return resultat


def exemples_coupe_du_monde():
    sortie = []
    for t in EQUIPES_CM:
        sortie.append({'instruction': f'Donne les statistiques de {t[0]} à la Coupe du monde 2026.', 'entree': '',
                       'sortie': _fiche_equipe(t)})
    for j in JOUEURS_CM:
        sortie.append({'instruction': f'Quelle distance et quelle vitesse maximale pour {j[2]} ?', 'entree': '',
                       'sortie': _fiche_joueur(j)})
    return sortie
