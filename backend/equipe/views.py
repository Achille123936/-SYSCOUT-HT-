"""Équipe : tableau de bord de l'entraîneur (bilan, forme, effectif) et assistant qui répond aux questions."""
import unicodedata

from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from comptes.models import ROLES_CLUB, Role
from core.auth import AbonnementActif, SPORTIFS, roles
from core.visibilite import joueurs_visibles
from joueurs.models import GROUPE_POSTE, GROUPES
from matchs import direct
from matchs.models import EtatMatch, Match
from referentiel.models import Club, Saison
from statistiques.models import StatistiqueJoueur

LECTURE = [roles(lecture=SPORTIFS), AbonnementActif]


def clubs_visibles(utilisateur):
    """Un compte de club voit son propre club et ceux des divisions de sa formule (RG9)."""
    ids = joueurs_visibles(utilisateur).values('club_actuel')
    if utilisateur.role in ROLES_CLUB:
        return Club.objects.filter(Q(id__in=ids) | Q(id=utilisateur.club_id))
    return Club.objects.all()


def bilan_club(club, saison, utilisateur):
    matchs = list(Match.objects.filter(Q(club_domicile=club) | Q(club_exterieur=club), competition__saison=saison,
                                       etat=EtatMatch.STATS_PUBLIEES)
                  .select_related('club_domicile', 'club_exterieur').order_by('date_match'))
    bilan = {'joues': 0, 'victoires': 0, 'nuls': 0, 'defaites': 0, 'buts_pour': 0, 'buts_contre': 0}
    forme, resultats, possessions = [], [], []
    for m in matchs:
        domicile = m.club_domicile_id == club.id
        pour, contre = (m.score_domicile, m.score_exterieur) if domicile else (m.score_exterieur, m.score_domicile)
        issue = 'V' if pour > contre else 'N' if pour == contre else 'D'
        bilan['joues'] += 1
        bilan[{'V': 'victoires', 'N': 'nuls', 'D': 'defaites'}[issue]] += 1
        bilan['buts_pour'] += pour
        bilan['buts_contre'] += contre
        forme.append(issue)
        resultats.append({'id': m.id, 'journee': m.journee, 'date_match': m.date_match, 'issue': issue,
                          'adversaire': (m.club_exterieur if domicile else m.club_domicile).nom,
                          'domicile': domicile, 'score': f'{pour} – {contre}'})
    for m in matchs[-5:]:  # possession moyenne sur les 5 derniers matchs
        club_de = dict(m.compositions.values_list('joueur_id', 'club_id'))
        evenements = list(m.evenements.values('joueur_id', 'type_action', 'temps_video'))
        for e in evenements:
            e['club'] = club_de.get(e['joueur_id'])
        p = direct.possession(m, evenements)
        if p['domicile'] is not None:
            possessions.append(p['domicile'] if m.club_domicile_id == club.id else p['exterieur'])
    bilan['points'] = 3 * bilan['victoires'] + bilan['nuls']
    bilan['difference'] = bilan['buts_pour'] - bilan['buts_contre']
    bilan['possession_moyenne'] = round(sum(possessions) / len(possessions), 1) if possessions else None

    stats = {s.joueur_id: s for s in StatistiqueJoueur.objects.filter(saison=saison, joueur__club_actuel=club)}
    effectif = []
    for j in joueurs_visibles(utilisateur).filter(club_actuel=club).order_by('poste', 'nom'):
        s = stats.get(j.id)
        effectif.append({'joueur': j.id, 'nom': j.nom_complet, 'poste': j.poste, 'groupe': j.groupe_poste,
                         'age': j.calculer_age(), 'minutes_jouees': s.minutes_jouees if s else 0,
                         'matchs_joues': s.matchs_joues if s else 0, 'buts': s.buts if s else 0,
                         'passes_decisives': s.passes_decisives if s else 0,
                         'indice_performance': s.indice_performance if s else None})
    a_venir = Match.objects.filter(Q(club_domicile=club) | Q(club_exterieur=club), competition__saison=saison,
                                   etat__in=[EtatMatch.PLANIFIE, EtatMatch.VIDEO_IMPORTEE, EtatMatch.EN_CODAGE])
    return {
        'club': {'id': club.id, 'nom': club.nom, 'sigle': club.sigle, 'ville': club.ville, 'division': club.division,
                 'stade': club.stade},
        'saison': saison.libelle, 'bilan': bilan, 'forme': forme[-5:], 'resultats': resultats[::-1][:8],
        'matchs_non_codes': a_venir.count(), 'effectif': effectif,
        'meilleur_buteur': max(effectif, key=lambda j: j['buts'], default=None) if any(j['buts'] for j in effectif) else None,
        'meilleur_indice': max((j for j in effectif if j['indice_performance'] is not None),
                               key=lambda j: j['indice_performance'], default=None),
    }


@api_view(['GET'])
@permission_classes(LECTURE)
def equipes(request):
    """Liste des équipes que l'utilisateur peut consulter ; la sienne en premier pour un club client."""
    clubs = list(clubs_visibles(request.user).values('id', 'nom', 'sigle', 'division'))
    clubs.sort(key=lambda c: (c['id'] != request.user.club_id, c['nom']))
    return Response({'mon_club': request.user.club_id, 'clubs': clubs})


@api_view(['GET'])
@permission_classes(LECTURE)
def equipe(request, club_id):
    club = clubs_visibles(request.user).filter(pk=club_id).first()
    saison = Saison.courante()
    if not club or not saison:
        raise NotFound('Équipe introuvable.')
    return Response(bilan_club(club, saison, request.user))


# ---------------------------------------------------------------- Assistant
def simplifier(texte):
    """Minuscules sans accents, pour reconnaître « défenseur », « defenseur » ou « DEFENSEUR »."""
    sans_accents = ''.join(c for c in unicodedata.normalize('NFD', texte) if unicodedata.category(c) != 'Mn')
    mots = ''.join(c if c.isalnum() else ' ' for c in sans_accents.casefold()).split()
    return ' ' + ' '.join(mots) + ' '  # entouré d'espaces : on cherche des mots entiers, pas des morceaux de mots


MOTS_GROUPE = {'GARDIEN': ['gardien', 'gadyen', 'goal'], 'DEFENSEUR': ['defenseur', 'defansè', 'defense', 'defans'],
               'MILIEU': ['milieu', 'milye'], 'ATTAQUANT': ['attaquant', 'atakan', 'buteurs', 'avant']}
AIDE = ("Je réponds à partir des données de SYSCOUT-HT. Essayez par exemple :\n"
        "• « meilleurs buteurs »\n• « meilleurs défenseurs » (ou gardiens, milieux, attaquants)\n"
        "• le nom d'un joueur : « Wilson Joseph »\n• le nom d'une équipe : « bilan de Lions du Cap »\n"
        "• « derniers résultats »\n• « matchs à coder »")


def repondre(question, utilisateur):
    q = simplifier(question)
    saison = Saison.courante()
    visibles = joueurs_visibles(utilisateur)
    stats = StatistiqueJoueur.objects.filter(saison=saison, joueur__in=visibles).select_related('joueur__club_actuel')
    lien_joueur = lambda j: {'ecran': 'JoueurDetail', 'params': {'id': j.id}, 'titre': j.nom_complet}  # noqa: E731

    # 1. un joueur est nommé
    mots = set(q.split())
    for j in visibles.select_related('club_actuel'):
        # le nom entier doit apparaître, avec le prénom — ou seul si la question est très courte
        if simplifier(j.nom) in q and (simplifier(j.prenom) in q or len(mots) <= 3):
            s = stats.filter(joueur=j).first()
            texte = f'{j.nom_complet}, {j.get_poste_display().lower()} de {j.club_actuel.nom}, {j.calculer_age()} ans.'
            if s:
                texte += (f' Cette saison : {s.matchs_joues} matchs, {s.minutes_jouees} minutes, {s.buts} but(s), '
                          f'{s.passes_decisives} passe(s) décisive(s), {s.passes_reussies_pct} % de passes réussies.')
                texte += (f' Indice de performance : {round(s.indice_performance)}/100.' if s.indice_performance is not None
                          else ' Pas encore d\'indice : moins de 450 minutes jouées.')
            else:
                texte += " Aucune statistique publiée cette saison."
            return texte, [lien_joueur(j)]

    # 2. une équipe est nommée
    for club in clubs_visibles(utilisateur):
        if simplifier(club.nom) in q or (club.sigle and simplifier(club.sigle) in q):
            b = bilan_club(club, saison, utilisateur)
            bilan = b['bilan']
            texte = (f"{club.nom} ({club.division}) : {bilan['joues']} matchs, {bilan['victoires']} victoire(s), "
                     f"{bilan['nuls']} nul(s), {bilan['defaites']} défaite(s), {bilan['buts_pour']} buts marqués, "
                     f"{bilan['buts_contre']} encaissés, {bilan['points']} points.")
            if b['forme']:
                texte += f" Forme récente : {' '.join(b['forme'])}."
            if b['meilleur_buteur']:
                texte += f" Meilleur buteur : {b['meilleur_buteur']['nom']} ({b['meilleur_buteur']['buts']})."
            return texte, [{'ecran': 'Equipe', 'params': {'id': club.id}, 'titre': club.nom}]

    # 3. classements
    if any(m in q for m in ('buteur', ' but ', ' buts ', ' bi ', ' gol ')):
        tete = list(stats.filter(buts__gt=0).order_by('-buts', 'minutes_jouees')[:5])
        if tete:
            lignes = [f'{i}. {s.joueur.nom_complet} ({s.joueur.club_actuel.nom}) : {s.buts} buts'
                      for i, s in enumerate(tete, 1)]
            return 'Meilleurs buteurs de la saison :\n' + '\n'.join(lignes), [lien_joueur(s.joueur) for s in tete[:3]]
    for groupe, synonymes in MOTS_GROUPE.items():
        if any(m in q for m in synonymes):
            postes = [p for p, g in GROUPE_POSTE.items() if g == groupe]
            tete = list(stats.filter(joueur__poste__in=postes, indice_performance__isnull=False)
                        .order_by('-indice_performance')[:5])
            if tete:
                lignes = [f'{i}. {s.joueur.nom_complet} ({s.joueur.club_actuel.nom}) : indice {round(s.indice_performance)}'
                          for i, s in enumerate(tete, 1)]
                return (f'Meilleurs {dict(GROUPES)[groupe].lower()} (indice de performance, 450 minutes minimum) :\n'
                        + '\n'.join(lignes)), [lien_joueur(s.joueur) for s in tete[:3]]
    if any(m in q for m in ('meilleur', 'classement', 'top', 'pi bon')):
        tete = list(stats.filter(indice_performance__isnull=False).order_by('-indice_performance')[:5])
        if tete:
            lignes = [f'{i}. {s.joueur.nom_complet} ({s.joueur.poste}, {s.joueur.club_actuel.nom}) : '
                      f'indice {round(s.indice_performance)}' for i, s in enumerate(tete, 1)]
            return 'Meilleurs indices de performance :\n' + '\n'.join(lignes), [lien_joueur(s.joueur) for s in tete[:3]]

    # 4. matchs
    if 'coder' in q or 'kode' in q:
        n = Match.objects.filter(etat__in=[EtatMatch.VIDEO_IMPORTEE, EtatMatch.EN_CODAGE]).count()
        return f'{n} match(s) attendent leur codage.', [{'ecran': 'Matchs', 'params': {}, 'titre': 'Matchs'}]
    if any(m in q for m in ('resultat', 'rezilta', 'dernier', 'score', 'match')):
        derniers = Match.objects.filter(etat=EtatMatch.STATS_PUBLIEES).select_related(
            'club_domicile', 'club_exterieur').order_by('-date_match')[:5]
        if derniers:
            lignes = [f'J{m.journee} · {m.club_domicile.nom} {m.score_domicile} – {m.score_exterieur} {m.club_exterieur.nom}'
                      for m in derniers]
            return 'Derniers résultats :\n' + '\n'.join(lignes), [
                {'ecran': 'MatchDetail', 'params': {'id': derniers[0].id}, 'titre': 'Dernier match'}]
    return AIDE, []


@api_view(['POST'])
@permission_classes([roles(*SPORTIFS, lecture=SPORTIFS), AbonnementActif])
def assistant(request):
    question = str(request.data.get('question', '')).strip()[:300]
    if not question:
        return Response({'reponse': AIDE, 'liens': []})
    reponse, liens = repondre(question, request.user)
    return Response({'reponse': reponse, 'liens': liens})
