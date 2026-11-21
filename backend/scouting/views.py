"""Scouting : rapports et shortlists (CU10, CU11, CU12) — vues de l'API."""
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from comptes.models import PERSONNEL_CLUB, Role, Utilisateur
from core.api import AuditMixin, exiger_role
from core.auth import AbonnementActif, SPORTIFS, roles
from core.services import instantane, journaliser, notifier
from core.visibilite import joueurs_visibles, rapports_visibles
from joueurs.models import Joueur
from scouting.models import EtatRapport, Shortlist
from scouting.serializers import RapportSerializer, ShortlistSerializer


class RapportViewSet(AuditMixin, viewsets.ModelViewSet):
    serializer_class = RapportSerializer
    permission_classes = [roles(Role.SCOUT, Role.DIRECTEUR, Role.ADMIN, lecture=SPORTIFS), AbonnementActif]

    def get_queryset(self):
        qs = rapports_visibles(self.request.user)
        p = self.request.query_params
        if p.get('etat'):
            qs = qs.filter(etat=p['etat'])
        if p.get('joueur'):
            qs = qs.filter(joueur_id=p['joueur'])
        if p.get('miens') == '1':
            qs = qs.filter(scout=self.request.user)
        return qs

    def create(self, request, *args, **kwargs):
        exiger_role(request, Role.SCOUT)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        rapport = serializer.save(scout=self.request.user)
        journaliser(self.request, 'CREATION', rapport, apres=instantane(rapport))

    def _exiger_auteur(self, rapport):
        if rapport.scout_id != self.request.user.id:
            raise PermissionDenied('Seul le scout qui a rédigé ce rapport peut le modifier.')
        if rapport.etat not in (EtatRapport.BROUILLON, EtatRapport.RENVOYE):
            raise ValidationError('Un rapport soumis ou validé ne peut plus être modifié.')

    def perform_update(self, serializer):
        self._exiger_auteur(serializer.instance)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._exiger_auteur(instance)
        super().perform_destroy(instance)

    def _transition(self, rapport, etat, **champs):
        avant = rapport.etat
        rapport.etat = etat
        for champ, valeur in champs.items():
            setattr(rapport, champ, valeur)
        rapport.save()
        journaliser(self.request, 'MODIFICATION', rapport, avant={'etat': avant}, apres={'etat': etat, **{
            k: str(v) for k, v in champs.items() if k == 'commentaire_validation'}})
        return Response(self.get_serializer(rapport).data)

    @action(detail=True, methods=['post'])
    def soumettre(self, request, pk=None):
        """CU11 étape 6 : le rapport passe à « Soumis » et le directeur sportif est notifié."""
        rapport = self.get_object()
        self._exiger_auteur(rapport)
        notifier(Utilisateur.objects.filter(role=Role.DIRECTEUR, is_active=True), 'Nouveau rapport à valider',
                 f'{rapport.scout.nom_complet} a soumis un rapport sur {rapport.joueur.nom_complet}.')
        return self._transition(rapport, EtatRapport.SOUMIS)

    def _decision(self, request, etat, sujet):
        exiger_role(request, Role.DIRECTEUR)
        rapport = self.get_object()
        if rapport.etat != EtatRapport.SOUMIS:
            raise ValidationError('Seul un rapport « Soumis » peut être validé ou renvoyé.')
        commentaire = str(request.data.get('commentaire', '')).strip()
        if etat == EtatRapport.RENVOYE and not commentaire:
            raise ValidationError({'commentaire': 'Indiquez le motif du renvoi.'})
        notifier([rapport.scout], sujet, f'Votre rapport sur {rapport.joueur.nom_complet} : {sujet.lower()}.\n'
                 + (f'Commentaire : {commentaire}' if commentaire else ''))  # EF 12.2
        return self._transition(rapport, etat, commentaire_validation=commentaire, valide_par=request.user,
                                date_validation=timezone.now())

    @action(detail=True, methods=['post'])
    def valider(self, request, pk=None):
        return self._decision(request, EtatRapport.VALIDE, 'Rapport validé')

    @action(detail=True, methods=['post'])
    def renvoyer(self, request, pk=None):
        return self._decision(request, EtatRapport.RENVOYE, 'Rapport renvoyé')

    @action(detail=True, methods=['post'])
    def archiver(self, request, pk=None):
        exiger_role(request, Role.DIRECTEUR, Role.ADMIN)
        rapport = self.get_object()
        if rapport.etat != EtatRapport.VALIDE:
            raise ValidationError('Seul un rapport validé peut être archivé.')
        return self._transition(rapport, EtatRapport.ARCHIVE)


class ShortlistViewSet(AuditMixin, viewsets.ModelViewSet):
    serializer_class = ShortlistSerializer
    permission_classes = [roles(Role.SCOUT, Role.DIRECTEUR, Role.ADMIN, *PERSONNEL_CLUB,
                                lecture=(Role.SCOUT, Role.DIRECTEUR, Role.ADMIN, *PERSONNEL_CLUB)), AbonnementActif]

    def get_queryset(self):
        u = self.request.user
        qs = Shortlist.objects.select_related('proprietaire').prefetch_related('joueurs__club_actuel')
        if u.role in PERSONNEL_CLUB:  # « Shortlist de son club », partagée par le personnel du club
            return qs.filter(proprietaire__club_id=u.club_id, proprietaire__role__in=PERSONNEL_CLUB)
        return qs.filter(proprietaire=u)

    def perform_create(self, serializer):
        liste = serializer.save(proprietaire=self.request.user)
        journaliser(self.request, 'CREATION', liste, apres=instantane(liste))

    def _joueur(self, request):
        try:
            return joueurs_visibles(request.user).get(pk=request.data.get('joueur'))
        except (Joueur.DoesNotExist, ValueError):
            raise ValidationError({'joueur': 'Joueur introuvable.'})

    @action(detail=True, methods=['post'])
    def ajouter(self, request, pk=None):
        liste, joueur = self.get_object(), self._joueur(request)
        liste.joueurs.add(joueur)
        journaliser(request, 'MODIFICATION', liste, apres={'joueur_ajoute': joueur.nom_complet})
        return Response(self.get_serializer(liste).data)

    @action(detail=True, methods=['post'])
    def retirer(self, request, pk=None):
        liste, joueur = self.get_object(), self._joueur(request)
        liste.joueurs.remove(joueur)
        journaliser(request, 'MODIFICATION', liste, apres={'joueur_retire': joueur.nom_complet})
        return Response(self.get_serializer(liste).data)
