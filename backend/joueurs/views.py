"""Joueurs : fiches et historique des clubs (CU05, CU09, CU10) — vues de l'API."""
from datetime import date

from django.db.models import F, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from comptes.models import Role
from core.api import AuditMixin, exiger_role
from core.auth import AbonnementActif, LECTEURS_JOUEURS, roles
from core.visibilite import joueurs_visibles, rapports_visibles, saison_demandee, statistique_de
from matchs.direct import physique_saison
from matchs.models import EtatMatch, Evenement
from joueurs.models import GROUPE_POSTE, Joueur
from joueurs.serializers import HistoriqueClubSerializer, JoueurSerializer
from referentiel.serializers import SaisonSerializer
from scouting.models import EtatRapport
from scouting.serializers import RapportSerializer
from statistiques.serializers import StatistiqueSerializer


class JoueurViewSet(AuditMixin, viewsets.ModelViewSet):
    serializer_class = JoueurSerializer
    permission_classes = [roles(Role.ADMIN, Role.ANALYSTE, Role.SCOUT, Role.CLUB_ADMIN, lecture=LECTEURS_JOUEURS),
                          AbonnementActif]

    def _exiger_son_club(self, club):
        """FR-011 : l'administrateur d'un club n'enregistre et ne modifie que les joueurs de son club."""
        u = self.request.user
        if u.role == Role.CLUB_ADMIN and (club is None or club.id != u.club_id):
            raise PermissionDenied("Vous gérez seulement les joueurs de votre club.")

    def perform_create(self, serializer):
        self._exiger_son_club(serializer.validated_data.get('club_actuel'))
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._exiger_son_club(serializer.instance.club_actuel)
        if 'club_actuel' in serializer.validated_data:
            self._exiger_son_club(serializer.validated_data['club_actuel'])
        super().perform_update(serializer)

    def get_queryset(self):
        qs = joueurs_visibles(self.request.user)
        if self.action != 'list':
            return qs
        p = self.request.query_params
        if p.get('q'):
            for mot in p['q'].split():
                qs = qs.filter(Q(nom__icontains=mot) | Q(prenom__icontains=mot))
        for champ, filtre in (('poste', 'poste'), ('pied_fort', 'pied_fort'), ('club', 'club_actuel_id'),
                              ('division', 'club_actuel__division'), ('indice_min', 'indice_performance__gte')):
            if p.get(champ):
                qs = qs.filter(**{filtre: p[champ]})
        if p.get('groupe'):
            qs = qs.filter(poste__in=[k for k, g in GROUPE_POSTE.items() if g == p['groupe']])
        aujourdhui = date.today()
        if p.get('age_max'):  # né après la date qui donnerait age_max + 1 ans
            qs = qs.filter(date_naissance__gt=aujourdhui.replace(year=aujourdhui.year - int(p['age_max']) - 1))
        if p.get('age_min'):
            qs = qs.filter(date_naissance__lte=aujourdhui.replace(year=aujourdhui.year - int(p['age_min'])))
        if p.get('tri') == 'nom':
            return qs.order_by('nom', 'prenom')
        # CU10 : liste triée par indice (les joueurs sans indice en dernier)
        return qs.order_by(F('indice_performance').desc(nulls_last=True), 'nom', 'prenom')

    def update(self, request, *args, **kwargs):
        exiger_role(request, Role.ADMIN, Role.ANALYSTE, Role.CLUB_ADMIN)  # le scout crée un joueur mais ne le modifie pas
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        exiger_role(request, Role.ADMIN)
        return super().destroy(request, *args, **kwargs)

    def _fiche(self, joueur, saison):
        rapports = rapports_visibles(self.request.user).filter(joueur=joueur, etat=EtatRapport.VALIDE)
        stat = statistique_de(joueur, saison)
        return {'joueur': self.get_serializer(joueur).data,
                'statistique': StatistiqueSerializer(stat).data if stat else None,
                'dernier_rapport': RapportSerializer(rapports.first()).data if rapports.exists() else None}

    @action(detail=True)
    def radar(self, request, pk=None):
        """CU09 : radar du joueur (centiles par poste) pour la saison, avec son historique de clubs."""
        joueur, saison = self.get_object(), saison_demandee(request)
        fiche = self._fiche(joueur, saison)
        fiche['saison'] = SaisonSerializer(saison).data
        fiche['physique'] = physique_saison(joueur, saison)
        fiche['historique'] = HistoriqueClubSerializer(joueur.historique.select_related('club'), many=True).data
        return Response(fiche)

    @action(detail=True, url_path='matchs')
    def journal(self, request, pk=None):
        """Les matchs validés du joueur dans la saison, du plus récent au plus ancien, avec ses chiffres."""
        joueur, saison = self.get_object(), saison_demandee(request)
        compositions = (joueur.compositions.filter(match__competition__saison=saison,
                                                   match__etat=EtatMatch.STATS_PUBLIEES)
                        .select_related('match__club_domicile', 'match__club_exterieur').order_by('-match__date_match'))
        lignes = []
        for c in compositions:
            m = c.match
            compte = {}
            for type_action, resultat, xg in m.evenements.filter(joueur=joueur).values_list(
                    'type_action', 'resultat', 'valeur_xg'):
                compte[type_action] = compte.get(type_action, 0) + 1
                compte[(type_action, resultat)] = compte.get((type_action, resultat), 0) + 1
                compte['xg'] = compte.get('xg', 0) + (xg or 0)
            domicile = c.club_id == m.club_domicile_id
            passes = compte.get('PASSE', 0)
            lignes.append({
                'match': m.id, 'journee': m.journee, 'date_match': m.date_match,
                'adversaire': (m.club_exterieur if domicile else m.club_domicile).nom, 'domicile': domicile,
                'score': (f'{m.score_domicile} – {m.score_exterieur}' if domicile
                          else f'{m.score_exterieur} – {m.score_domicile}'),
                'est_titulaire': c.est_titulaire, 'minutes_jouees': c.minutes_jouees,
                'buts': compte.get('BUT', 0), 'tirs': compte.get('TIR', 0) + compte.get('BUT', 0),
                'xg': round(compte.get('xg', 0), 2), 'passes': passes,
                'passes_reussies_pct': round(100 * compte.get(('PASSE', True), 0) / passes) if passes else None,
                'duels_gagnes': compte.get(('DUEL', True), 0), 'duels': compte.get('DUEL', 0),
                'recuperations': compte.get('RECUPERATION', 0)})
        return Response({'saison': saison.libelle, 'matchs': lignes})

    @action(detail=True)
    def carte(self, request, pk=None):
        """Positions des actions du joueur sur le terrain, dans les matchs validés de la saison."""
        joueur, saison = self.get_object(), saison_demandee(request)
        actions = Evenement.objects.filter(joueur=joueur, match__competition__saison=saison,
                                           match__etat=EtatMatch.STATS_PUBLIEES)
        type_action = request.query_params.get('type')
        if type_action:
            actions = actions.filter(type_action=type_action)
        points = list(actions.values('type_action', 'zone_x', 'zone_y', 'resultat', 'valeur_xg', 'minute')[:5000])
        tirs = [p for p in points if p['type_action'] in ('TIR', 'BUT')]
        return Response({'saison': saison.libelle, 'actions': points, 'tirs': {
            'nombre': len(tirs), 'buts': sum(1 for p in tirs if p['type_action'] == 'BUT'),
            'xg': round(sum(p['valeur_xg'] or 0 for p in tirs), 2)}})

    @action(detail=False)
    def comparer(self, request):
        """CU09 : de deux à cinq joueurs côte à côte, sur la même saison (`?ids=1,2,3` ou `?a=1&b=2`). Chaque fiche
        porte ses minutes jouées ; `avertissements` signale les joueurs sous le seuil de 450 minutes (RG5)."""
        saison = saison_demandee(request)
        p = request.query_params
        brut = p.get('ids') or ','.join(x for x in (p.get('a'), p.get('b')) if x)
        try:
            ids = [int(x) for x in brut.split(',') if x.strip()]
        except ValueError:
            raise NotFound('Joueur introuvable.')
        if len(set(ids)) != len(ids):
            raise ValidationError('Choisissez des joueurs différents.')
        if not 2 <= len(ids) <= 5:
            raise ValidationError('Comparez de 2 à 5 joueurs.')
        qs = self.get_queryset()
        try:
            fiches = [self._fiche(qs.get(pk=i), saison) for i in ids]
        except Joueur.DoesNotExist:
            raise NotFound('Joueur introuvable.')
        avertissements = [f"{f['joueur']['nom_complet']} : {f['statistique']['minutes_jouees'] if f['statistique'] else 0} "
                          'minutes jouées, moins de 450 : comparaison peu fiable (RG5).'
                          for f in fiches if not f['statistique'] or f['statistique']['minutes_jouees'] < 450]
        return Response({'saison': SaisonSerializer(saison).data, 'joueurs': fiches, 'avertissements': avertissements,
                         'a': fiches[0], 'b': fiches[1]})
