"""Traitements métier : audit, statistiques (RG4 à RG7), abonnements (RG9 à RG11), sauvegarde."""
import json
import math
import shutil
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core import serializers as dj_serializers
from django.core.mail import send_mail
from django.core.management import call_command
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from .models import (GROUPE_POSTE, Abonnement, Composition, EtatAbonnement, EtatMatch, Evenement, Facture, Joueur,
                     Match, OperationAudit, PonderationIndice, StatistiqueJoueur, TypeAction)

P = settings.SYSCOUT
MODULES = ['comptes', 'referentiel', 'joueurs', 'matchs', 'statistiques', 'scouting', 'commercial', 'audit', 'apprentissage']


# ---------------------------------------------------------------- Audit
def adresse_ip(request):
    if request is None:
        return None
    return request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR')


def instantane(obj):
    """Valeurs d'un enregistrement sous forme sérialisable (pour valeur avant / après)."""
    champs = json.loads(dj_serializers.serialize('json', [obj]))[0]['fields']
    champs.pop('password', None)
    if champs.get('url_flux'):  # adresse d'une caméra : son mot de passe n'entre pas dans le journal
        from cameras.sonde import masquer
        champs['url_flux'] = masquer(champs['url_flux'])
    return champs


def journaliser(request, action, obj=None, avant=None, apres=None, utilisateur=None, table='', identifiant=''):
    utilisateur = utilisateur or getattr(request, 'user', None)
    if utilisateur is not None and not getattr(utilisateur, 'pk', None):
        utilisateur = None
    return OperationAudit.objects.create(
        utilisateur=utilisateur, action=action,
        table_concernee=table or (obj._meta.model_name if obj is not None else ''),
        id_enregistrement=str(identifiant or (obj.pk if obj is not None else '')),
        valeur_avant=avant, valeur_apres=apres, adresse_ip=adresse_ip(request))


def notifier(destinataires, sujet, message):
    """Notification par le service de messagerie (seul système externe du SEL)."""
    adresses = [u.courriel for u in destinataires if u and u.courriel]
    if adresses:
        send_mail(f'[SYSCOUT-HT] {sujet}', message, None, adresses, fail_silently=True)


# ---------------------------------------------------------------- Statistiques
STATS_CENTILES = ['buts_p90', 'xg_p90', 'tirs_p90', 'passes_p90', 'passes_reussies_pct', 'dribbles_p90',
                  'duels_gagnes_pct', 'recuperations_p90', 'interceptions_p90']

# RG7 : pondérations par défaut, modifiables par l'administrateur (PonderationIndice)
PONDERATIONS_DEFAUT = {
    'GARDIEN': {'passes_reussies_pct': 3, 'passes_p90': 1, 'recuperations_p90': 3, 'interceptions_p90': 2,
                'duels_gagnes_pct': 2},
    'DEFENSEUR': {'duels_gagnes_pct': 3, 'interceptions_p90': 3, 'recuperations_p90': 3, 'passes_reussies_pct': 2,
                  'passes_p90': 1},
    'MILIEU': {'passes_reussies_pct': 3, 'passes_p90': 3, 'recuperations_p90': 2, 'duels_gagnes_pct': 2,
               'dribbles_p90': 1, 'xg_p90': 1, 'buts_p90': 1},
    'ATTAQUANT': {'buts_p90': 4, 'xg_p90': 3, 'tirs_p90': 2, 'dribbles_p90': 2, 'passes_reussies_pct': 1,
                  'duels_gagnes_pct': 1},
}


def ponderations():
    poids = {g: dict(v) for g, v in PONDERATIONS_DEFAUT.items()}
    perso = defaultdict(dict)
    for p in PonderationIndice.objects.all():
        perso[p.groupe][p.statistique] = p.poids
    poids.update(perso)
    return poids


def calculer_xg(zone_x, zone_y):
    """Probabilité qu'un tir se transforme en but selon sa position (but adverse en x = 100, y = 50).

    Si un modèle a été entraîné sur les tirs codés (module apprentissage), c'est lui qui répond."""
    from apprentissage.ml import predire_xg
    from apprentissage.models import ModeleXG
    modele = ModeleXG.objects.filter(actif=True).first()
    if modele:
        return predire_xg(modele.coefficients, zone_x, zone_y)
    dx = (100 - zone_x) * 1.05  # terrain de 105 m x 68 m
    dy = (zone_y - 50) * 0.68
    distance = math.hypot(dx, dy)
    angle = math.atan2(abs(dy), max(dx, 0.1))
    xg = 0.9 * math.exp(-distance / 9) * (0.4 + 0.6 * math.cos(angle))
    return round(min(0.95, max(0.01, xg)), 3)


def controler_codage(match):
    """CU08 étape 2 : buts codés = score, minutes jouées renseignées."""
    erreurs = []
    clubs = dict(match.compositions.values_list('joueur_id', 'club_id'))
    buts = defaultdict(int)
    for joueur_id in match.evenements.filter(type_action=TypeAction.BUT).values_list('joueur_id', flat=True):
        buts[clubs.get(joueur_id)] += 1
    for club, score in ((match.club_domicile, match.score_domicile), (match.club_exterieur, match.score_exterieur)):
        if buts[club.id] != score:
            erreurs.append(f'{club.nom} : {buts[club.id]} but(s) codé(s) pour un score de {score}.')
    if not match.evenements.exists():
        erreurs.append("Aucun événement n'a été codé.")
    actifs = set(match.evenements.values_list('joueur_id', flat=True))
    for c in match.compositions.select_related('joueur'):
        if not c.est_titulaire and c.minute_entree is None and c.joueur_id in actifs:
            erreurs.append(f"{c.joueur.nom_complet} : minute d'entrée non renseignée alors qu'il a des événements.")
    return erreurs


def _centile(valeur, valeurs):
    """Part des joueurs du groupe que ce joueur dépasse (les égalités comptent pour moitié)."""
    if len(valeurs) < 2:
        return 50.0
    dessous = sum(1 for v in valeurs if v < valeur)
    egaux = sum(1 for v in valeurs if v == valeur) - 1
    return round(100 * (dessous + 0.5 * egaux) / (len(valeurs) - 1), 1)


def _passes_decisives(matchs):
    """Dernière passe ou centre réussi d'un coéquipier dans les 10 secondes avant un but."""
    total = defaultdict(int)
    types = [TypeAction.PASSE, TypeAction.CENTRE, TypeAction.BUT]
    for match_id in matchs.values_list('id', flat=True):
        clubs = dict(Composition.objects.filter(match_id=match_id).values_list('joueur_id', 'club_id'))
        evts = list(Evenement.objects.filter(match_id=match_id, type_action__in=types)
                    .values('joueur_id', 'type_action', 'temps_video', 'resultat'))
        for i, but in enumerate(evts):
            if but['type_action'] != TypeAction.BUT:
                continue
            for prec in reversed(evts[max(0, i - 6):i]):
                if (prec['type_action'] != TypeAction.BUT and prec['resultat']
                        and prec['joueur_id'] != but['joueur_id']
                        and clubs.get(prec['joueur_id']) == clubs.get(but['joueur_id'])
                        and but['temps_video'] - prec['temps_video'] <= 10):
                    total[prec['joueur_id']] += 1
                    break
    return total


@transaction.atomic
def recalculer_saison(saison):
    """RG4 à RG7 : statistiques par 90 minutes, centiles par poste et indice de performance de la saison."""
    matchs = Match.objects.filter(competition__saison=saison, etat=EtatMatch.STATS_PUBLIEES)
    minutes = {r['joueur_id']: r for r in Composition.objects.filter(match__in=matchs).values('joueur_id')
               .annotate(total=Sum('minutes_jouees'), matchs=Count('id', filter=Q(minutes_jouees__gt=0)))}
    compte = defaultdict(lambda: defaultdict(int))
    xg = defaultdict(float)
    for r in (Evenement.objects.filter(match__in=matchs).values('joueur_id', 'type_action', 'resultat')
              .annotate(n=Count('id'), somme_xg=Sum('valeur_xg'))):
        compte[r['joueur_id']][(r['type_action'], r['resultat'])] += r['n']
        xg[r['joueur_id']] += r['somme_xg'] or 0
    decisives = _passes_decisives(matchs)
    # jeu de tête : tirs et buts codés « Tête », avec la somme de leur xG
    tete = {r['joueur_id']: r for r in Evenement.objects.filter(
        match__in=matchs, partie_corps='TETE', type_action__in=[TypeAction.TIR, TypeAction.BUT]).values('joueur_id')
        .annotate(tirs=Count('id'), buts=Count('id', filter=Q(type_action=TypeAction.BUT)), xg=Sum('valeur_xg'))}

    StatistiqueJoueur.objects.filter(saison=saison).delete()
    stats = []
    for joueur in Joueur.objects.filter(id__in=minutes.keys()):
        m = minutes[joueur.id]['total'] or 0
        c = compte[joueur.id]

        def n(t):
            return c[(t, True)] + c[(t, False)]

        def p90(v):  # RG6
            return round(v * 90 / m, 2) if m else 0

        def pct(t):
            return round(100 * c[(t, True)] / n(t), 1) if n(t) else 0

        buts = n(TypeAction.BUT)
        de_la_tete = tete.get(joueur.id, {'tirs': 0, 'buts': 0, 'xg': 0})
        xg_tete = de_la_tete['xg'] or 0
        stats.append(StatistiqueJoueur(
            tirs_tete=de_la_tete['tirs'], buts_tete=de_la_tete['buts'], xg_tete=round(xg_tete, 2),
            tirs_tete_p90=p90(de_la_tete['tirs']), buts_tete_p90=p90(de_la_tete['buts']), xg_tete_p90=p90(xg_tete),
            joueur=joueur, saison=saison, minutes_jouees=m, matchs_joues=minutes[joueur.id]['matchs'],
            buts=buts, passes_decisives=decisives[joueur.id], xg=round(xg[joueur.id], 2),
            buts_p90=p90(buts), xg_p90=p90(xg[joueur.id]), tirs_p90=p90(n(TypeAction.TIR) + buts),
            passes_p90=p90(n(TypeAction.PASSE)), passes_reussies_pct=pct(TypeAction.PASSE),
            dribbles_p90=p90(c[(TypeAction.DRIBBLE, True)]), duels_gagnes_pct=pct(TypeAction.DUEL),
            recuperations_p90=p90(n(TypeAction.RECUPERATION)), interceptions_p90=p90(n(TypeAction.INTERCEPTION))))

    # RG5 : centiles parmi les joueurs du même groupe de postes ayant joué au moins 450 minutes
    poids = ponderations()
    groupes = defaultdict(list)
    for s in stats:
        if s.eligible:
            groupes[GROUPE_POSTE[s.joueur.poste]].append(s)
    for groupe, membres in groupes.items():
        for cle in STATS_CENTILES:
            valeurs = [getattr(s, cle) for s in membres]
            for s in membres:
                s.centiles[cle] = _centile(getattr(s, cle), valeurs)
        w = poids[groupe]
        for s in membres:  # RG7 : note de 0 à 100
            s.indice_performance = round(sum(s.centiles.get(k, 0) * p for k, p in w.items()) / sum(w.values()), 1)
    StatistiqueJoueur.objects.bulk_create(stats)

    if saison.est_courante:
        Joueur.objects.exclude(indice_performance=None).update(indice_performance=None)
        for s in stats:
            if s.indice_performance is not None:
                Joueur.objects.filter(pk=s.joueur_id).update(indice_performance=s.indice_performance)
    return len(stats)


# ---------------------------------------------------------------- Abonnements
def ajouter_mois(d, mois):
    annee, m = divmod(d.month - 1 + mois, 12)
    annee += d.year
    return date(annee, m + 1, min(d.day, monthrange(annee, m + 1)[1]))


def generer_facture(abonnement, periode_debut, date_echeance=None):
    """Facture d'une période : montant HT = prix mensuel x durée, plus la taxe sur le chiffre d'affaires."""
    ht = abonnement.montant_htg
    taxe = (ht * Decimal(str(P['TAUX_TCA']))).quantize(Decimal('0.01'))
    annee = date.today().year
    numero = Facture.objects.filter(numero_facture__startswith=f'F{annee}-').count() + 1
    return Facture.objects.create(
        numero_facture=f'F{annee}-{numero:05d}', abonnement=abonnement,
        date_echeance=date_echeance or periode_debut, periode_debut=periode_debut,
        periode_fin=ajouter_mois(periode_debut, abonnement.duree_mois),
        montant_ht=ht, taxe=taxe, montant_ttc=ht + taxe, solde_du=ht + taxe)


def apres_paiement(facture):
    """CU14 étape 6 : l'abonnement devient (ou redevient) actif quand la facture est soldée."""
    facture.calculer_solde()
    abo = facture.abonnement
    reactivable = (EtatAbonnement.EN_ATTENTE, EtatAbonnement.SUSPENDU, EtatAbonnement.ACTIF)
    if facture.statut == 'PAYEE' and abo.etat in reactivable:
        abo.etat = EtatAbonnement.ACTIF
        abo.date_echeance = max(abo.date_echeance, facture.periode_fin)
        abo.save(update_fields=['etat', 'date_echeance'])
    return abo


def mettre_a_jour_abonnements(aujourdhui=None):
    """RG10 : suspension 15 jours après l'échéance impayée ; expiration à l'échéance sans renouvellement."""
    aujourdhui = aujourdhui or date.today()
    limite = aujourdhui - timedelta(days=P['JOURS_AVANT_SUSPENSION'])
    suspendus = list(Abonnement.objects.filter(
        etat__in=[EtatAbonnement.EN_ATTENTE, EtatAbonnement.ACTIF],
        factures__statut__in=['IMPAYEE', 'PARTIELLE'], factures__date_echeance__lt=limite,
    ).values_list('id', flat=True).distinct())
    Abonnement.objects.filter(id__in=suspendus).update(etat=EtatAbonnement.SUSPENDU)
    expires = list(Abonnement.objects.filter(etat=EtatAbonnement.ACTIF, date_echeance__lt=aujourdhui)
                   .exclude(factures__statut__in=['IMPAYEE', 'PARTIELLE']).values_list('id', flat=True))
    Abonnement.objects.filter(id__in=expires).update(etat=EtatAbonnement.EXPIRE)
    return {'suspendus': len(suspendus), 'expires': len(expires)}


def acces_client(utilisateur):
    """RG9 : un club client ne voit que les données de sa formule, et seulement si son abonnement est actif."""
    if not utilisateur.club_id:
        return None
    return (Abonnement.objects.filter(club_id=utilisateur.club_id, etat=EtatAbonnement.ACTIF)
            .select_related('formule').order_by('-formule__prix_mensuel_htg').first())


# ---------------------------------------------------------------- Sauvegarde
def sauvegarder():
    """CU16 : copie la base et les nouvelles vidéos sur le disque externe et le serveur cloud."""
    horodatage = timezone.localtime().strftime('%Y%m%d_%H%M%S')
    resultats = []
    for destination in P['SAUVEGARDES']:
        destination = Path(destination)
        destination.mkdir(parents=True, exist_ok=True)
        fichier = destination / f'base_{horodatage}.json'
        with open(fichier, 'w', encoding='utf-8') as f:
            call_command('dumpdata', *MODULES, indent=1, stdout=f)
        copies = 0
        media = Path(settings.MEDIA_ROOT)
        if media.exists():
            for source in media.rglob('*'):
                cible = destination / 'media' / source.relative_to(media)
                if source.is_file() and (not cible.exists() or cible.stat().st_size != source.stat().st_size):
                    cible.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, cible)
                    copies += 1
        resultats.append({'destination': destination.name, 'fichier': fichier.name,
                          'taille_ko': round(fichier.stat().st_size / 1024, 1), 'fichiers_copies': copies})
    return resultats
