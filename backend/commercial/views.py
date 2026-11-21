"""Commercial : formules, abonnements, factures et paiements (CU13, CU14) — vues de l'API."""
from datetime import date

from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from commercial.models import Abonnement, EtatAbonnement, Facture, Formule, Paiement
from commercial.serializers import AbonnementSerializer, FactureSerializer, FormuleSerializer, PaiementSerializer
from comptes.models import Role
from core.api import AuditMixin, exiger_role
from core.auth import COMMERCIAUX, roles
from core.services import apres_paiement, generer_facture, instantane, journaliser, mettre_a_jour_abonnements


class FormuleViewSet(AuditMixin, viewsets.ModelViewSet):
    queryset = Formule.objects.all()
    serializer_class = FormuleSerializer
    permission_classes = [roles(Role.ADMIN, lecture=COMMERCIAUX)]


class AbonnementViewSet(AuditMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.ListModelMixin,
                        viewsets.GenericViewSet):
    serializer_class = AbonnementSerializer
    permission_classes = [roles(*COMMERCIAUX, lecture=COMMERCIAUX)]

    def get_queryset(self):
        qs = Abonnement.objects.select_related('club', 'formule').prefetch_related('factures__paiements')
        p = self.request.query_params
        if p.get('etat'):
            qs = qs.filter(etat=p['etat'])
        if p.get('club'):
            qs = qs.filter(club_id=p['club'])
        return qs

    def list(self, request, *args, **kwargs):
        mettre_a_jour_abonnements()  # RG10
        return super().list(request, *args, **kwargs)

    def _changer_etat(self, abonnement, etat):
        avant = abonnement.etat
        abonnement.etat = etat
        abonnement.save(update_fields=['etat'])
        journaliser(self.request, 'MODIFICATION', abonnement, avant={'etat': avant}, apres={'etat': etat})
        return self._reponse(abonnement)

    def _reponse(self, abonnement):
        return Response(self.get_serializer(self.get_queryset().get(pk=abonnement.pk)).data)

    @action(detail=True, methods=['post'])
    def renouveler(self, request, pk=None):
        """Nouvelle période : une facture est émise, à régler avant la fin de la période en cours."""
        abonnement = self.get_object()
        if abonnement.etat not in (EtatAbonnement.ACTIF, EtatAbonnement.EXPIRE):
            raise ValidationError('Seul un abonnement actif ou expiré peut être renouvelé.')
        if abonnement.factures.filter(statut__in=['IMPAYEE', 'PARTIELLE']).exists():
            raise ValidationError('Une facture de cet abonnement est encore impayée.')
        debut = max(abonnement.date_echeance, date.today())
        facture = generer_facture(abonnement, debut, date_echeance=debut)
        journaliser(request, 'CREATION', facture, apres=instantane(facture))
        if abonnement.etat == EtatAbonnement.EXPIRE:
            return self._changer_etat(abonnement, EtatAbonnement.EN_ATTENTE)
        return self._reponse(abonnement)

    @action(detail=True, methods=['post'])
    def resilier(self, request, pk=None):
        abonnement = self.get_object()
        if abonnement.etat in (EtatAbonnement.RESILIE, EtatAbonnement.EXPIRE):
            raise ValidationError('Cet abonnement est déjà terminé.')
        return self._changer_etat(abonnement, EtatAbonnement.RESILIE)


class FactureViewSet(viewsets.ReadOnlyModelViewSet):
    """Les factures ne sont jamais supprimées, mais annulées avec motif (SEL 3.6.6)."""
    serializer_class = FactureSerializer
    permission_classes = [roles(*COMMERCIAUX, lecture=COMMERCIAUX)]

    def get_queryset(self):
        qs = Facture.objects.select_related('abonnement__club', 'abonnement__formule').prefetch_related('paiements')
        p = self.request.query_params
        if p.get('q'):
            qs = qs.filter(Q(numero_facture__icontains=p['q']) | Q(abonnement__club__nom__icontains=p['q']))
        if p.get('statut'):
            qs = qs.filter(statut=p['statut'])
        if p.get('du') == '1':
            qs = qs.filter(statut__in=['IMPAYEE', 'PARTIELLE'])
        return qs

    @action(detail=True, methods=['post'])
    def annuler(self, request, pk=None):
        facture = self.get_object()
        motif = str(request.data.get('motif', '')).strip()
        if not motif:
            raise ValidationError({'motif': "Indiquez le motif de l'annulation."})
        if facture.paiements.filter(annule=False).exists():
            raise ValidationError("Annulez d'abord les paiements de cette facture.")
        avant = facture.statut
        facture.statut, facture.motif_annulation = 'ANNULEE', motif
        facture.save(update_fields=['statut', 'motif_annulation'])
        journaliser(request, 'MODIFICATION', facture, avant={'statut': avant}, apres={'statut': 'ANNULEE',
                                                                                     'motif': motif})
        return Response(self.get_serializer(facture).data)


class PaiementViewSet(mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.ListModelMixin,
                      viewsets.GenericViewSet):
    serializer_class = PaiementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        exiger_role(self.request, Role.ADMIN, Role.AGENT, Role.DIRECTEUR)
        qs = Paiement.objects.select_related('facture__abonnement__club', 'encaisse_par')
        facture = self.request.query_params.get('facture')
        return qs.filter(facture_id=facture) if facture else qs

    def create(self, request, *args, **kwargs):
        exiger_role(request, *COMMERCIAUX)
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        paiement = s.save(encaisse_par=request.user)
        abonnement = apres_paiement(paiement.facture)
        journaliser(request, 'CREATION', paiement, apres=instantane(paiement))
        return Response({**self.get_serializer(paiement).data, 'solde_du': paiement.facture.solde_du,
                         'facture_statut': paiement.facture.statut, 'abonnement_etat': abonnement.etat},
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def annuler(self, request, pk=None):
        """Annulation d'un paiement avec l'accord de la direction (SEL 3.4.3) : jamais de suppression."""
        exiger_role(request, Role.ADMIN, Role.DIRECTEUR)
        paiement = self.get_object()
        motif = str(request.data.get('motif', '')).strip()
        if paiement.annule:
            raise ValidationError('Ce paiement est déjà annulé.')
        if not motif:
            raise ValidationError({'motif': "Indiquez le motif de l'annulation."})
        paiement.annule, paiement.motif_annulation = True, motif
        paiement.save(update_fields=['annule', 'motif_annulation'])
        facture = paiement.facture
        facture.calculer_solde()
        abonnement = facture.abonnement
        if abonnement.etat == EtatAbonnement.ACTIF and not abonnement.factures.filter(statut='PAYEE').exists():
            abonnement.etat = EtatAbonnement.EN_ATTENTE
            abonnement.save(update_fields=['etat'])
        journaliser(request, 'MODIFICATION', paiement, avant={'annule': False}, apres={'annule': True, 'motif': motif})
        return Response(self.get_serializer(paiement).data)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def formules_publiques(request):
    """Offres d'abonnement et prix (RG11), visibles sans compte sur la page d'accueil."""
    return Response(FormuleSerializer(Formule.objects.all(), many=True).data)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def chiffres_publics(request):
    """Page d'accueil : chiffres agrégés de la plateforme (aucune donnée personnelle), visibles sans compte."""
    from django.conf import settings
    from django.db.models import Avg, Count, Max

    from joueurs.models import Joueur
    from matchs.models import DonneePhysique, EtatMatch, Evenement, Match
    from referentiel.models import Club, Competition, Saison
    from statistiques.models import StatistiqueJoueur

    saison = Saison.objects.filter(est_courante=True).first()
    competitions = Competition.objects.filter(saison=saison) if saison else Competition.objects.none()
    # moyennes de la saison parmi les joueurs classés (RG5 : au moins 450 minutes)
    moyennes = StatistiqueJoueur.objects.filter(
        saison=saison, minutes_jouees__gte=settings.SYSCOUT['MINUTES_MIN_CLASSEMENT']).aggregate(
        xg_p90=Avg('xg_p90'), dribbles_p90=Avg('dribbles_p90'), passes_reussies_pct=Avg('passes_reussies_pct'),
        duels_gagnes_pct=Avg('duels_gagnes_pct'), recuperations_p90=Avg('recuperations_p90'),
        interceptions_p90=Avg('interceptions_p90'))
    physique = DonneePhysique.objects.aggregate(vitesse_max_kmh=Max('vitesse_max_kmh'), distance_m=Avg('distance_m'))
    clubs = Club.objects.filter(competitions__in=competitions).distinct().order_by('division', 'nom')
    return Response({
        'saison': saison.libelle if saison else None,
        'joueurs': Joueur.objects.count(),
        'matchs_codes': Match.objects.filter(etat=EtatMatch.STATS_PUBLIEES).count(),
        'evenements': Evenement.objects.count(),
        'clubs': [{'nom': c.nom, 'sigle': c.sigle, 'ville': c.ville, 'division': c.division} for c in clubs],
        'competitions': [{'nom': c.nom, 'niveau': c.niveau, 'clubs': c.nb}
                         for c in competitions.annotate(nb=Count('clubs')).order_by('niveau', 'nom')],
        'moyennes': {k: round(v, 2) if v is not None else None for k, v in {**moyennes, **physique}.items()},
    })
