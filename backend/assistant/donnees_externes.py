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
    return resultat


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
    return sortie
