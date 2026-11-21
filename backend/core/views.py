"""Socle commun de SYSCOUT-HT — vues de l'API."""
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from audit.models import OperationAudit
from commercial.models import Abonnement, EtatAbonnement, Facture, Paiement
from comptes.models import PERSONNEL_CLUB, ROLES_CLUB, Role, Utilisateur
from core import pdf
from core.auth import AbonnementActif, COMMERCIAUX, SPORTIFS, acces_sportif
from core.services import acces_client, journaliser
from core.visibilite import joueurs_visibles, rapports_visibles, statistique_de
from joueurs.models import Joueur
from matchs.models import EtatMatch, Match
from referentiel.models import Club, Saison
from referentiel.serializers import SaisonSerializer
from scouting.models import EtatRapport, RapportScouting
from scouting.views import ShortlistViewSet
from statistiques.models import StatistiqueJoueur

P = settings.SYSCOUT


@api_view(['GET'])
def tableau_de_bord(request):
    u, role = request.user, request.user.role
    saison = Saison.courante()
    cartes, alertes = [], []

    def carte(libelle, valeur, ecran=None):
        cartes.append({'libelle': libelle, 'valeur': valeur, 'ecran': ecran})

    if acces_sportif(u):
        matchs = Match.objects.filter(competition__saison=saison)
        carte('Joueurs suivis', joueurs_visibles(u).count(), 'Joueurs')
        carte('Matchs codés', matchs.filter(etat=EtatMatch.STATS_PUBLIEES).count(), 'Matchs')
    if role in (Role.ANALYSTE, Role.ADMIN):
        a_coder = Match.objects.filter(etat__in=[EtatMatch.VIDEO_IMPORTEE, EtatMatch.EN_CODAGE]).count()
        carte('Matchs à coder', a_coder, 'Matchs')
        carte('Clubs', Club.objects.count(), 'Clubs')
    if role == Role.SCOUT:
        miens = RapportScouting.objects.filter(scout=u)
        carte('Mes rapports', miens.count(), 'Rapports')
        renvoyes = miens.filter(etat=EtatRapport.RENVOYE).count()
        if renvoyes:
            alertes.append(f'{renvoyes} rapport(s) renvoyé(s) à corriger.')
    if role == Role.DIRECTEUR:
        carte('Rapports à valider', RapportScouting.objects.filter(etat=EtatRapport.SOUMIS).count(), 'Rapports')
    if role in (Role.SCOUT, Role.DIRECTEUR, *PERSONNEL_CLUB):
        carte('Shortlists', ShortlistViewSet(request=request).get_queryset().count(), 'Shortlists')
    if role == Role.CLUB_ADMIN:
        membres = Utilisateur.objects.filter(club_id=u.club_id, role__in=(Role.COACH, Role.JOUEUR), is_active=True)
        carte('Membres du club', membres.count(), 'Membres')
    if role == Role.JOUEUR:
        if u.joueur_id:
            carte('Ma fiche', u.joueur.nom_complet, 'MaFiche')
        else:
            alertes.append("Votre compte n'est relié à aucune fiche de joueur : contactez l'administrateur de votre club.")
    if role in COMMERCIAUX:
        carte('Abonnements actifs', Abonnement.objects.filter(etat=EtatAbonnement.ACTIF).count(), 'Abonnements')
        impayees = Facture.objects.filter(statut__in=['IMPAYEE', 'PARTIELLE']).count()
        carte('Factures impayées', impayees, 'Abonnements')
        suspendus = Abonnement.objects.filter(etat=EtatAbonnement.SUSPENDU).count()
        if suspendus:
            alertes.append(f'{suspendus} abonnement(s) suspendu(s) pour impayé (RG10).')
    if role == Role.ADMIN:
        carte('Comptes actifs', Utilisateur.objects.filter(is_active=True).count(), 'Utilisateurs')
        depuis = timezone.now() - timedelta(days=1)
        echecs = OperationAudit.objects.filter(action='ECHEC_CONNEXION', date_heure__gte=depuis).count()
        if echecs:
            alertes.append(f'{echecs} connexion(s) échouée(s) depuis 24 heures.')
        demandes = Utilisateur.objects.filter(demande_inscription=True, is_active=False, last_login__isnull=True).count()
        if demandes:
            alertes.append(f"{demandes} demande(s) d'inscription à valider (Administration › Utilisateurs).")
        bloques = Utilisateur.objects.filter(bloque=True).count()
        if bloques:
            alertes.append(f'{bloques} compte(s) bloqué(s).')
    if role in ROLES_CLUB:
        abonnement = acces_client(u)
        if abonnement and role in PERSONNEL_CLUB:
            carte('Formule', abonnement.formule.nom)
        elif not abonnement:
            alertes.append(AbonnementActif.message)
    if u.doit_changer_mot_de_passe:
        alertes.append('Changez votre mot de passe provisoire (menu Plus › Mot de passe).')
    resultats, meilleurs = [], []
    if saison and acces_sportif(u):
        derniers = (Match.objects.filter(competition__saison=saison, etat=EtatMatch.STATS_PUBLIEES)
                    .select_related('club_domicile', 'club_exterieur').order_by('-date_match')[:6])
        resultats = [{'id': m.id, 'journee': m.journee, 'date_match': m.date_match, 'domicile': m.club_domicile.nom,
                      'exterieur': m.club_exterieur.nom, 'score': f'{m.score_domicile} – {m.score_exterieur}'}
                     for m in derniers]
        tete = (StatistiqueJoueur.objects.filter(saison=saison, indice_performance__isnull=False,
                                                 joueur__in=joueurs_visibles(u))
                .select_related('joueur__club_actuel').order_by('-indice_performance')[:6])
        meilleurs = [{'joueur': s.joueur_id, 'nom': s.joueur.nom_complet, 'poste': s.joueur.poste,
                      'club': s.joueur.club_actuel.nom, 'indice': s.indice_performance, 'buts': s.buts}
                     for s in tete]
    return Response({'saison': SaisonSerializer(saison).data if saison else None, 'cartes': cartes,
                     'alertes': alertes, 'resultats': resultats, 'meilleurs': meilleurs})


SEL_EXPORT = 'syscout.export'


def _document(utilisateur, genre, identifiant, autre=None, saison=None):
    """Construit le PDF demandé en respectant ce que l'utilisateur a le droit de voir."""
    saison = Saison.objects.filter(pk=saison).first() or Saison.courante()
    try:
        if genre in ('joueur', 'comparaison'):
            # un compte « Joueur » peut exporter sa propre fiche (joueurs_visibles se limite à elle)
            if not acces_sportif(utilisateur) and not (utilisateur.role == Role.JOUEUR and acces_client(utilisateur)):
                raise PermissionDenied()
            joueur = joueurs_visibles(utilisateur).get(pk=identifiant)
            if genre == 'joueur':
                return f'fiche_{joueur.nom}_{joueur.prenom}', pdf.pdf_joueur(joueur, statistique_de(joueur, saison))
            # `autre` : un identifiant, ou une liste (jusqu'à quatre autres joueurs, SRS §12.2)
            autres = autre if isinstance(autre, (list, tuple)) else [autre]
            if not 1 <= len(autres) <= 4 or len({str(joueur.pk), *map(str, autres)}) != len(autres) + 1:
                raise ValidationError('Comparez de 2 à 5 joueurs différents.')
            retenus = [joueur] + [joueurs_visibles(utilisateur).get(pk=i) for i in autres]
            return ('comparaison_' + '_'.join(j.nom for j in retenus),
                    pdf.pdf_comparaison([(j, statistique_de(j, saison)) for j in retenus]))
        if genre == 'rapport':
            if utilisateur.role not in SPORTIFS:
                raise PermissionDenied()
            rapport = rapports_visibles(utilisateur).get(pk=identifiant)
            return f'rapport_{rapport.joueur.nom}_{rapport.id}', pdf.pdf_rapport(rapport)
        if genre == 'match':
            if not acces_sportif(utilisateur):
                raise PermissionDenied()
            from matchs import direct
            match = Match.objects.select_related('competition', 'club_domicile', 'club_exterieur').get(pk=identifiant)
            return (f'match_J{match.journee}_{match.club_domicile.sigle}_{match.club_exterieur.sigle}',
                    pdf.pdf_match(direct.tableau(match), match.date_match, match.stade, match.competition.nom))
        if genre in ('facture', 'recu'):
            if utilisateur.role not in COMMERCIAUX:
                raise PermissionDenied()
            if genre == 'facture':
                facture = Facture.objects.get(pk=identifiant)
                return f'facture_{facture.numero_facture}', pdf.pdf_facture(facture)
            return f'recu_{int(identifiant):06d}', pdf.pdf_recu(Paiement.objects.get(pk=identifiant))
    except (Match.DoesNotExist, Joueur.DoesNotExist, RapportScouting.DoesNotExist, Facture.DoesNotExist, Paiement.DoesNotExist,
            ValueError, TypeError):
        raise NotFound('Document introuvable.')
    raise ValidationError({'type': 'Type de document inconnu.'})


@api_view(['POST'])
def exporter(request):
    """Vérifie les droits, journalise l'export et renvoie un lien de téléchargement valable 2 minutes."""
    demande = {'u': request.user.id, 'type': request.data.get('type'), 'id': request.data.get('id'),
               'autre': request.data.get('autre'), 'saison': request.data.get('saison')}
    nom, _ = _document(request.user, demande['type'], demande['id'], demande['autre'], demande['saison'])
    journaliser(request, 'EXPORT', table=str(demande['type']), identifiant=demande['id'], apres={'fichier': nom})
    ticket = signing.dumps(demande, salt=SEL_EXPORT)
    return Response({'url': request.build_absolute_uri(f'/api/exports/telecharger/?ticket={ticket}'),
                     'fichier': f'{nom}.pdf'})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def telecharger(request):
    try:
        demande = signing.loads(request.query_params.get('ticket', ''), salt=SEL_EXPORT,
                                max_age=P['DUREE_TICKET_EXPORT'])
        utilisateur = Utilisateur.objects.get(pk=demande['u'], is_active=True)
    except (signing.BadSignature, Utilisateur.DoesNotExist):
        return Response({'detail': 'Lien de téléchargement expiré. Relancez l\'export.'},
                        status=status.HTTP_403_FORBIDDEN)
    nom, contenu = _document(utilisateur, demande['type'], demande['id'], demande['autre'], demande['saison'])
    reponse = HttpResponse(contenu, content_type='application/pdf')
    reponse['Content-Disposition'] = f'inline; filename="{nom}.pdf"'
    return reponse


@api_view(['GET'])
def indicateurs(request):
    """SRS §2.1 : indicateurs de réussite de la plateforme (administrateur). Ce que le serveur ne peut pas mesurer lui-même
    (performance de l'IA, taux de synchronisation) est rendu à `None` avec la façon de le mesurer, jamais inventé."""
    from django.db.models import Count, Q

    from matchs.models import Evenement, PropositionIA, SourceDonnee
    from referentiel.models import Competition

    if request.user.role != Role.ADMIN:
        raise PermissionDenied()
    maintenant = timezone.now()
    matchs = Match.objects.all()
    evenements = Evenement.objects
    propositions = dict(PropositionIA.objects.order_by().values_list('statut').annotate(n=Count('id')))
    decidees = sum(propositions.get(k, 0) for k in ('APPROVED', 'CORRECTED', 'REJECTED'))
    corrigees = propositions.get('CORRECTED', 0) + propositions.get('REJECTED', 0)
    total_ev = evenements.count()
    return Response({
        'genere_le': maintenant,
        'couverture': {'clubs': Club.objects.count(), 'competitions': Competition.objects.count(),
                       'joueurs': Joueur.objects.count(), 'matchs': matchs.count(),
                       'matchs_codes': matchs.filter(etat=EtatMatch.STATS_PUBLIEES).count()},
        'qualite_donnees': {
            'evenements': total_ev,
            'evenements_ia': evenements.filter(source=SourceDonnee.AI).count(),
            # tout événement officiel est validé par construction (saisie de l'analyste ou décision sur une proposition)
            'part_validee_pct': 100.0 if total_ev else None,
            'propositions': {'en_attente': propositions.get('PENDING', 0), 'confirmees': propositions.get('APPROVED', 0),
                             'corrigees': propositions.get('CORRECTED', 0), 'rejetees': propositions.get('REJECTED', 0),
                             'non_verifiees': propositions.get('UNVERIFIED', 0)},
            # erreurs de l'IA repérées par les analystes : propositions corrigées ou rejetées parmi les décidées
            'taux_erreurs_detectees_pct': round(100 * corrigees / decidees, 1) if decidees else None},
        'performance_ia': {'precision': None, 'rappel': None, 'f1': None, 'idf1': None,
                           'mesure': "hors ligne, sur un jeu annoté : python -m syscout_vision.evaluation (dossier vision/)"},
        'utilisation': {
            'analystes_actifs_30j': Utilisateur.objects.filter(role=Role.ANALYSTE, is_active=True,
                                                               derniere_activite__gte=maintenant - timedelta(days=30)).count(),
            'rapports': RapportScouting.objects.count(),
            'rapports_valides': RapportScouting.objects.filter(etat=EtatRapport.VALIDE).count(),
            'videos_indexees': matchs.exclude((Q(video__isnull=True) | Q(video='')) & Q(video_url='')).count()},
        'disponibilite': {'disponibilite_mensuelle_pct': None, 'taux_synchronisation_pct': None,
                          'mesure': "par la supervision de l'hébergeur (/sante/) et les journaux de synchronisation"},
    })
