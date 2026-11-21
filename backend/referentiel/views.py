"""Référentiel : clubs, saisons et compétitions (CU03, CU04) — vues de l'API."""
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from comptes.models import Role
from core.api import AuditMixin
from core.auth import roles
from referentiel.models import Club, Competition, Saison
from referentiel.serializers import ClubSerializer, CompetitionSerializer, SaisonSerializer


class ClubViewSet(AuditMixin, viewsets.ModelViewSet):
    serializer_class = ClubSerializer
    permission_classes = [roles(Role.ADMIN, Role.ANALYSTE, Role.AGENT)]

    def get_queryset(self):
        qs = Club.objects.all()
        p = self.request.query_params
        if p.get('q'):
            qs = qs.filter(Q(nom__icontains=p['q']) | Q(ville__icontains=p['q']) | Q(sigle__icontains=p['q']))
        if p.get('division'):
            qs = qs.filter(division=p['division'])
        if p.get('competition'):
            qs = qs.filter(competitions__id=p['competition'])
        return qs


class SaisonViewSet(AuditMixin, viewsets.ModelViewSet):
    queryset = Saison.objects.all()
    serializer_class = SaisonSerializer
    permission_classes = [roles(Role.ADMIN, Role.ANALYSTE)]


class CompetitionViewSet(AuditMixin, viewsets.ModelViewSet):
    serializer_class = CompetitionSerializer
    permission_classes = [roles(Role.ADMIN, Role.ANALYSTE)]

    def get_queryset(self):
        qs = Competition.objects.select_related('saison').prefetch_related('clubs')
        saison = self.request.query_params.get('saison')
        return qs.filter(saison_id=saison) if saison else qs

    @action(detail=True)
    def classement(self, request, pk=None):
        """Classement des équipes : 3 points par victoire, 1 par nul ; départage à la différence de buts
        puis aux buts marqués. Seuls les matchs validés comptent."""
        from matchs.models import EtatMatch, Match
        competition = self.get_object()
        lignes = {c.id: {'club': c.id, 'nom': c.nom, 'sigle': c.sigle, 'joues': 0, 'victoires': 0, 'nuls': 0,
                         'defaites': 0, 'buts_pour': 0, 'buts_contre': 0, 'forme': []}
                  for c in competition.clubs.all()}
        matchs = Match.objects.filter(competition=competition, etat=EtatMatch.STATS_PUBLIEES).order_by('date_match')
        for m in matchs:
            for club, pour, contre in ((m.club_domicile_id, m.score_domicile, m.score_exterieur),
                                       (m.club_exterieur_id, m.score_exterieur, m.score_domicile)):
                ligne = lignes.get(club)
                if ligne is None:
                    continue
                issue = 'V' if pour > contre else 'N' if pour == contre else 'D'
                ligne['joues'] += 1
                ligne[{'V': 'victoires', 'N': 'nuls', 'D': 'defaites'}[issue]] += 1
                ligne['buts_pour'] += pour
                ligne['buts_contre'] += contre
                ligne['forme'].append(issue)
        for ligne in lignes.values():
            ligne['points'] = 3 * ligne['victoires'] + ligne['nuls']
            ligne['difference'] = ligne['buts_pour'] - ligne['buts_contre']
            ligne['forme'] = ligne['forme'][-5:]
        tableau = sorted(lignes.values(), key=lambda x: (-x['points'], -x['difference'], -x['buts_pour'], x['nom']))
        for rang, ligne in enumerate(tableau, start=1):
            ligne['rang'] = rang
        return Response({'competition': competition.nom, 'saison': competition.saison.libelle,
                         'matchs_joues': matchs.count(), 'classement': tableau})
