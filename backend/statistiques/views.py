"""Statistiques : valeurs par 90 minutes, centiles et indice de performance (RG5 à RG7) — vues de l'API."""
from django.conf import settings
from rest_framework import viewsets
from rest_framework.decorators import permission_classes

from core.auth import AbonnementActif, SPORTIFS, roles
from core.visibilite import joueurs_visibles, saison_demandee
from joueurs.models import GROUPE_POSTE
from statistiques.models import StatistiqueJoueur
from statistiques.serializers import StatistiqueSerializer

P = settings.SYSCOUT


class StatistiqueViewSet(viewsets.ReadOnlyModelViewSet):
    """Classements par poste (RG5 : au moins 450 minutes jouées)."""
    serializer_class = StatistiqueSerializer
    permission_classes = [roles(lecture=SPORTIFS), AbonnementActif]
    TRIS = {'indice_performance', 'buts', 'xg', 'buts_p90', 'xg_p90', 'tirs_p90', 'passes_p90',
            'passes_reussies_pct', 'dribbles_p90', 'duels_gagnes_pct', 'recuperations_p90', 'interceptions_p90',
            'minutes_jouees', 'passes_decisives', 'buts_tete', 'tirs_tete_p90', 'xg_tete_p90'}

    def get_queryset(self):
        p = self.request.query_params
        qs = StatistiqueJoueur.objects.select_related('joueur__club_actuel', 'saison').filter(
            saison=saison_demandee(self.request), joueur__in=joueurs_visibles(self.request.user))
        if p.get('classement', '1') == '1':
            qs = qs.filter(minutes_jouees__gte=P['MINUTES_MIN_CLASSEMENT'])
        if p.get('groupe'):
            qs = qs.filter(joueur__poste__in=[k for k, g in GROUPE_POSTE.items() if g == p['groupe']])
        if p.get('poste'):
            qs = qs.filter(joueur__poste=p['poste'])
        if p.get('joueur'):
            qs = qs.filter(joueur_id=p['joueur'])
        tri = p.get('tri', 'indice_performance')
        return qs.order_by(f'-{tri}' if tri in self.TRIS else '-indice_performance', 'joueur__nom')
