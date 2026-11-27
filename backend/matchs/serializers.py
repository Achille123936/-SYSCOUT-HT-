"""Matchs : rencontres, compositions et codage vidéo des événements (CU06, CU07, CU08) — sérialiseurs et contrôles de saisie."""
from django.db import transaction
from rest_framework import serializers

from core.services import calculer_xg
from matchs.models import (Annotation, Composition, DonneePhysique, EtatMatch, Evenement, Match, PisteJoueur,
                           Playlist, PropositionIA, TypeAction, ValidationEvenement)


class CompositionSerializer(serializers.ModelSerializer):
    joueur_nom = serializers.CharField(source='joueur.nom_complet', read_only=True)
    poste = serializers.CharField(source='joueur.poste', read_only=True)

    class Meta:
        model = Composition
        fields = ['id', 'joueur', 'joueur_nom', 'poste', 'club', 'est_titulaire', 'numero_maillot', 'poste_occupe',
                  'minute_entree', 'minute_sortie', 'minutes_jouees']
        read_only_fields = ['minutes_jouees']
        extra_kwargs = {'club': {'required': False}}


class MatchSerializer(serializers.ModelSerializer):
    competition_nom = serializers.CharField(source='competition.nom', read_only=True)
    saison = serializers.IntegerField(source='competition.saison_id', read_only=True)
    domicile_nom = serializers.CharField(source='club_domicile.nom', read_only=True)
    domicile_sigle = serializers.CharField(source='club_domicile.sigle', read_only=True)
    exterieur_nom = serializers.CharField(source='club_exterieur.nom', read_only=True)
    exterieur_sigle = serializers.CharField(source='club_exterieur.sigle', read_only=True)
    etat_libelle = serializers.CharField(source='get_etat_display', read_only=True)
    verrouille_par_nom = serializers.SerializerMethodField()
    video_lecture = serializers.SerializerMethodField()
    nb_evenements = serializers.SerializerMethodField()
    compositions = CompositionSerializer(many=True, required=False)

    class Meta:
        model = Match
        fields = ['id', 'competition', 'competition_nom', 'saison', 'journee', 'date_match', 'stade',
                  'club_domicile', 'domicile_nom', 'domicile_sigle', 'club_exterieur', 'exterieur_nom',
                  'exterieur_sigle', 'score_domicile', 'score_exterieur', 'duree', 'etat', 'etat_libelle',
                  'video_url', 'video_url_2', 'video_lecture', 'verrouille_par', 'verrouille_par_nom', 'nb_evenements',
                  'compositions']
        read_only_fields = ['etat', 'verrouille_par']

    def get_verrouille_par_nom(self, match):
        return match.verrouille_par.nom_complet if match.verrou_actif else None

    def get_video_lecture(self, match):
        if match.video:
            request = self.context.get('request')
            return request.build_absolute_uri(match.video.url) if request else match.video.url
        return match.video_url or None

    def get_nb_evenements(self, match):
        return getattr(match, 'nb_evenements', None) if hasattr(match, 'nb_evenements') else match.evenements.count()

    def validate(self, data):
        inst = self.instance
        if inst and inst.etat in (EtatMatch.CODE, EtatMatch.STATS_PUBLIEES, EtatMatch.ANNULE):
            raise serializers.ValidationError('Un match validé ou annulé ne peut plus être modifié.')
        valeur = lambda champ: data.get(champ, getattr(inst, champ, None))  # noqa: E731
        domicile, exterieur, competition = valeur('club_domicile'), valeur('club_exterieur'), valeur('competition')
        # RG2 : deux clubs différents d'une même compétition
        if domicile == exterieur:
            raise serializers.ValidationError({'club_exterieur': 'Les deux équipes doivent être différentes.'})
        inscrits = set(competition.clubs.values_list('id', flat=True))
        for champ, club in (('club_domicile', domicile), ('club_exterieur', exterieur)):
            if club.id not in inscrits:
                raise serializers.ValidationError({champ: f"{club.nom} n'est pas inscrit à cette compétition."})
        if 'compositions' in data:
            self._controler_compositions(data['compositions'], domicile, exterieur, valeur('duree') or 90)
        return data

    def _controler_compositions(self, lignes, domicile, exterieur, duree):
        vus, titulaires = set(), {domicile.id: 0, exterieur.id: 0}
        for ligne in lignes:
            joueur = ligne['joueur']
            club = ligne.setdefault('club', joueur.club_actuel)
            if club.id not in titulaires:
                raise serializers.ValidationError(
                    {'compositions': f"{joueur.nom_complet} n'appartient à aucune des deux équipes."})
            if joueur.id in vus:
                raise serializers.ValidationError({'compositions': f'{joueur.nom_complet} est inscrit deux fois.'})
            vus.add(joueur.id)
            titulaires[club.id] += ligne.get('est_titulaire', True)
            for champ in ('minute_entree', 'minute_sortie'):
                if ligne.get(champ) is not None and ligne[champ] > duree:
                    raise serializers.ValidationError(
                        {'compositions': f'{joueur.nom_complet} : une minute ne peut dépasser la durée du match.'})
        for club in (domicile, exterieur):
            if titulaires[club.id] != 11:
                raise serializers.ValidationError(
                    {'compositions': f'{club.nom} : {titulaires[club.id]} titulaire(s) coché(s), il en faut 11.'})

    def _enregistrer_compositions(self, match, lignes):
        gardes = {ligne['joueur'].id for ligne in lignes}
        retires = match.compositions.exclude(joueur_id__in=gardes)
        if match.evenements.filter(joueur_id__in=retires.values('joueur_id')).exists():
            raise serializers.ValidationError(
                {'compositions': 'Un joueur qui a déjà des événements codés ne peut pas être retiré (RG3).'})
        retires.delete()
        for ligne in lignes:
            joueur = ligne.pop('joueur')
            Composition.objects.update_or_create(match=match, joueur=joueur, defaults=ligne)

    @transaction.atomic
    def create(self, data):
        lignes = data.pop('compositions', [])
        match = super().create(data)
        if match.video_url:
            match.etat = EtatMatch.VIDEO_IMPORTEE
            match.save(update_fields=['etat'])
        self._enregistrer_compositions(match, lignes)
        return match

    @transaction.atomic
    def update(self, match, data):
        lignes = data.pop('compositions', None)
        match = super().update(match, data)
        if match.etat == EtatMatch.PLANIFIE and match.a_video:
            match.etat = EtatMatch.VIDEO_IMPORTEE
            match.save(update_fields=['etat'])
        if lignes is not None:
            self._enregistrer_compositions(match, lignes)
        else:  # la durée a pu changer : les minutes jouées sont recalculées
            for composition in match.compositions.all():
                composition.save()
        return match


class EvenementSerializer(serializers.ModelSerializer):
    joueur_nom = serializers.CharField(source='joueur.nom_complet', read_only=True)
    type_libelle = serializers.CharField(source='get_type_action_display', read_only=True)
    joueur_lie_nom = serializers.CharField(source='joueur_lie.nom_complet', read_only=True, default=None)
    club = serializers.SerializerMethodField()

    class Meta:
        model = Evenement
        fields = ['id', 'match', 'joueur', 'joueur_nom', 'joueur_lie', 'joueur_lie_nom', 'club', 'type_action', 'type_libelle', 'temps_video',
                  'minute', 'zone_x', 'zone_y', 'fin_x', 'fin_y', 'resultat', 'partie_corps', 'valeur_xg',
                  'cle_idempotence', 'source', 'statut_validation', 'confiance']
        # la source et le statut ne se déclarent pas : un événement de l'IA passe par la validation d'une proposition
        read_only_fields = ['valeur_xg', 'source', 'statut_validation', 'confiance']
        # l'unicité est traitée par la vue : un renvoi de la même clé rend l'événement déjà enregistré
        extra_kwargs = {'cle_idempotence': {'validators': []}}

    def get_club(self, evenement):
        clubs = self.context.get('clubs_par_joueur')
        if clubs is None:
            clubs = dict(evenement.match.compositions.values_list('joueur_id', 'club_id'))
        return clubs.get(evenement.joueur_id)

    def validate(self, data):
        inst = self.instance
        match = data.get('match', getattr(inst, 'match', None))
        joueur = data.get('joueur', getattr(inst, 'joueur', None))
        minute = data.get('minute', getattr(inst, 'minute', 0))
        utilisateur = self.context['request'].user
        if inst and 'match' in data and data['match'] != inst.match:
            raise serializers.ValidationError({'match': "Un événement ne change pas de match."})
        if inst and data.get('cle_idempotence', inst.cle_idempotence) != inst.cle_idempotence:
            raise serializers.ValidationError({'cle_idempotence': "La clé d'un événement ne change pas."})
        if match.etat != EtatMatch.EN_CODAGE:
            raise serializers.ValidationError("Ce match n'est pas en cours de codage.")
        if match.verrouille_par_id != utilisateur.id:
            raise serializers.ValidationError('Ce match est verrouillé par un autre analyste.')
        # RG3 : seuls les joueurs de la composition peuvent recevoir des événements
        if not match.compositions.filter(joueur=joueur).exists():
            raise serializers.ValidationError(
                {'joueur': f'{joueur.nom_complet} ne figure pas dans la composition du match (RG3).'})
        if minute > match.duree:
            raise serializers.ValidationError({'minute': 'Une minute ne peut dépasser la durée du match.'})
        # seuls une passe et un centre ont un point d'arrivée ; il se donne en entier (x et y) ou pas du tout
        type_action = data.get('type_action', getattr(inst, 'type_action', None))
        if type_action not in (TypeAction.PASSE, TypeAction.CENTRE):
            data['fin_x'] = data['fin_y'] = None
        elif (data.get('fin_x', getattr(inst, 'fin_x', None)) is None) != (
                data.get('fin_y', getattr(inst, 'fin_y', None)) is None):
            raise serializers.ValidationError({'fin_x': "Indiquez les deux coordonnées du point d'arrivée."})
        self._controler_type(data, inst, match, joueur, minute)
        return data

    def _controler_type(self, data, inst, match, joueur, minute):
        """SRS §8.2 : un arrêt est celui d'un gardien ; un remplacement nomme le joueur entrant et le sortant."""
        type_action = data.get('type_action', getattr(inst, 'type_action', None))
        lie = data.get('joueur_lie', getattr(inst, 'joueur_lie', None))
        compo = {c.joueur_id: c for c in match.compositions.all()}
        if type_action == TypeAction.ARRET:
            c = compo[joueur.id]
            if (c.poste_occupe or joueur.poste) != 'G':
                raise serializers.ValidationError({'joueur': 'Un arrêt est celui du gardien.'})
        if type_action == TypeAction.REMPLACEMENT:
            if lie is None:
                raise serializers.ValidationError({'joueur_lie': 'Indiquez le joueur sortant.'})
            if lie.id == joueur.id or lie.id not in compo:
                raise serializers.ValidationError({'joueur_lie': 'Le joueur sortant doit figurer dans la composition (RG3), et différer du joueur entrant.'})
            if compo[lie.id].club_id != compo[joueur.id].club_id:
                raise serializers.ValidationError({'joueur_lie': 'Le joueur sortant et le joueur entrant sont de la même équipe.'})
        else:
            data['joueur_lie'] = None

    def _appliquer_remplacement(self, evenement):
        """Le remplacement fixe les minutes d'entrée et de sortie des deux compositions (minutes jouées recalculées)."""
        if evenement.type_action != TypeAction.REMPLACEMENT:
            return
        for joueur_id, champ in ((evenement.joueur_id, 'minute_entree'), (evenement.joueur_lie_id, 'minute_sortie')):
            c = evenement.match.compositions.get(joueur_id=joueur_id)
            setattr(c, champ, evenement.minute)
            c.save()

    def _avec_xg(self, data, inst=None):
        type_action = data.get('type_action', getattr(inst, 'type_action', None))
        if type_action in (TypeAction.TIR, TypeAction.BUT):
            data['valeur_xg'] = calculer_xg(data.get('zone_x', getattr(inst, 'zone_x', 50)),
                                            data.get('zone_y', getattr(inst, 'zone_y', 50)))
        else:
            data['valeur_xg'] = None
        if type_action == TypeAction.BUT:
            data['resultat'] = True
        return data

    def create(self, data):
        evenement = super().create(self._avec_xg(data))
        self._appliquer_remplacement(evenement)
        return evenement

    def update(self, evenement, data):
        evenement = super().update(evenement, self._avec_xg(data, evenement))
        self._appliquer_remplacement(evenement)
        return evenement


class ValidationEvenementSerializer(serializers.ModelSerializer):
    validateur_nom = serializers.CharField(source='validateur.nom_complet', read_only=True)

    class Meta:
        model = ValidationEvenement
        fields = ['id', 'validateur', 'validateur_nom', 'statut_avant', 'statut_apres', 'avant', 'apres',
                  'commentaire', 'date']


class PropositionIASerializer(serializers.ModelSerializer):
    """Proposition envoyée par le moteur IA (FR-057). Elle ne change pas de match et ne se modifie pas :
    l'analyste la confirme, la corrige ou la rejette."""
    joueur_nom = serializers.CharField(source='joueur.nom_complet', read_only=True, default=None)
    type_libelle = serializers.CharField(source='get_type_action_display', read_only=True)
    statut_libelle = serializers.CharField(source='get_statut_display', read_only=True)
    historique = ValidationEvenementSerializer(source='validations', many=True, read_only=True)

    class Meta:
        model = PropositionIA
        fields = ['id', 'match', 'type_action', 'type_libelle', 'temps_video', 'minute', 'joueur', 'joueur_nom',
                  'club', 'piste', 'numero_maillot', 'zone_x', 'zone_y', 'fin_x', 'fin_y', 'resultat',
                  'partie_corps', 'confiance', 'modele', 'statut', 'statut_libelle', 'evenement', 'cle_idempotence',
                  'date_creation', 'historique']
        read_only_fields = ['statut', 'evenement']
        extra_kwargs = {'cle_idempotence': {'validators': []}, 'confiance': {'required': True}}

    def validate(self, data):
        match = data['match']
        if match.etat in (EtatMatch.CODE, EtatMatch.STATS_PUBLIEES, EtatMatch.ANNULE):
            raise serializers.ValidationError({'match': "Ce match est clos : il ne reçoit plus de propositions."})
        if data['minute'] > match.duree:
            raise serializers.ValidationError({'minute': 'Une minute ne peut dépasser la durée du match.'})
        clubs = (match.club_domicile_id, match.club_exterieur_id)
        if data.get('club') and data['club'].id not in clubs:
            raise serializers.ValidationError({'club': "Ce club ne joue pas ce match."})
        if data.get('joueur'):
            composition = match.compositions.filter(joueur=data['joueur']).first()
            if not composition:
                raise serializers.ValidationError(
                    {'joueur': f"{data['joueur'].nom_complet} ne figure pas dans la composition du match (RG3)."})
            data.setdefault('club', composition.club)
        if data.get('type_action') not in (TypeAction.PASSE, TypeAction.CENTRE):
            data['fin_x'] = data['fin_y'] = None
        return data


class PisteJoueurSerializer(serializers.ModelSerializer):
    """Point de trajectoire envoyé par le moteur IA : validé avant enregistrement, jamais modifiable ensuite."""
    class Meta:
        model = PisteJoueur
        fields = ['id', 'match', 'piste', 'joueur', 'club', 'temps_video', 'x', 'y', 'confiance', 'modele']
        read_only_fields = ['joueur']
        extra_kwargs = {'confiance': {'required': True}, 'piste': {'allow_blank': False}}
        validators = []  # l'unicité (match, piste, instant) rend le renvoi d'un lot sans effet

    def validate(self, data):
        match = data['match']
        if match.etat in (EtatMatch.CODE, EtatMatch.STATS_PUBLIEES, EtatMatch.ANNULE):
            raise serializers.ValidationError({'match': "Ce match est clos : il ne reçoit plus de pistes."})
        if data.get('club') and data['club'].id not in (match.club_domicile_id, match.club_exterieur_id):
            raise serializers.ValidationError({'club': 'Ce club ne joue pas ce match.'})
        return data


class AnnotationSerializer(serializers.ModelSerializer):
    # nombre de points attendu par forme (minimum, maximum)
    NB_POINTS = {'FLECHE': (2, 2), 'CERCLE': (2, 2), 'ZONE': (2, 2), 'LIGNE': (2, 2), 'SPOT': (2, 2),
                 'MESURE': (2, 2), 'OVALE': (2, 2), 'COURBE': (3, 3), 'TEXTE': (1, 1), 'JOUEUR': (1, 1),
                 'TRAIT': (2, 400), 'CHAINE': (2, 12), 'POLY': (3, 12)}
    MESUREES = ('MESURE', 'CHAINE', 'POLY')

    auteur_nom = serializers.CharField(source='auteur.nom_complet', read_only=True)
    # calibrage de l'image sur le terrain : s'il est fourni, les distances du dessin sont calculées en mètres
    coins = serializers.ListField(child=serializers.ListField(child=serializers.FloatField(), min_length=2,
                                                              max_length=2),
                                  min_length=4, max_length=4, write_only=True, required=False)
    reference = serializers.ChoiceField(choices=['TERRAIN', 'MOITIE', 'SURFACE'], write_only=True, required=False)
    # vitesse affichée sous une étiquette joueur (km/h)
    vitesse = serializers.FloatField(min_value=0, max_value=45, write_only=True, required=False)

    class Meta:
        model = Annotation
        fields = ['id', 'match', 'auteur', 'auteur_nom', 'temps_video', 'duree', 'forme', 'couleur', 'points', 'texte',
                  'mesures', 'coins', 'reference', 'vitesse']
        read_only_fields = ['auteur', 'mesures']

    def validate_couleur(self, valeur):
        if len(valeur) != 7 or valeur[0] != '#' or any(c not in '0123456789abcdefABCDEF' for c in valeur[1:]):
            raise serializers.ValidationError('Couleur invalide (format #rrggbb).')
        return valeur

    def validate(self, data):
        inst = self.instance
        forme = data.get('forme', getattr(inst, 'forme', None))
        points = data.get('points', getattr(inst, 'points', None))
        match = data.get('match', getattr(inst, 'match', None))
        correct = isinstance(points, list) and all(
            isinstance(p, (list, tuple)) and len(p) == 2
            and all(isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= 100 for v in p)
            for p in points)
        if not correct:
            raise serializers.ValidationError({'points': "Chaque point est un couple [x, y] en % de l'image (0 à 100)."})
        minimum, maximum = self.NB_POINTS[forme]
        if not minimum <= len(points) <= maximum:
            attendu = (f'{minimum} point(s)' if minimum == maximum else f'de {minimum} à {maximum} points')
            raise serializers.ValidationError({'points': f'Cette forme se définit par {attendu}.'})
        if forme in ('TEXTE', 'JOUEUR') and not data.get('texte', getattr(inst, 'texte', '')).strip():
            raise serializers.ValidationError({'texte': 'Saisissez le texte à afficher.'})
        if inst and 'match' in data and data['match'] != inst.match:
            raise serializers.ValidationError({'match': 'Une annotation ne change pas de match.'})
        if not match.a_video:
            raise serializers.ValidationError("Ce match n'a pas de vidéo à annoter.")
        coins, reference, vitesse = data.pop('coins', None), data.pop('reference', None), data.pop('vitesse', None)
        if forme == 'JOUEUR':
            if vitesse is not None or not inst:
                data['mesures'] = [] if vitesse is None else [round(vitesse, 1)]
        elif forme in self.MESUREES and coins and reference:
            from apprentissage.ml import distances_terrain
            mesures = distances_terrain(coins, reference, points, ferme=forme == 'POLY')
            if mesures is None:
                raise serializers.ValidationError(
                    {'coins': 'Calibrage incorrect : désignez de nouveau les 4 coins de la zone de référence.'})
            data['mesures'] = mesures
        elif 'points' in data or 'forme' in data:  # dessin sans calibrage, ou déplacé : plus de distances à afficher
            data['mesures'] = []
        return data


class DonneePhysiqueSerializer(serializers.ModelSerializer):
    joueur_nom = serializers.CharField(source='joueur.nom_complet', read_only=True)

    class Meta:
        model = DonneePhysique
        fields = ['id', 'joueur', 'joueur_nom', 'distance_m', 'distance_sprint_m', 'sprints', 'vitesse_max_kmh',
                  'source']

    def validate(self, data):
        distance, sprint = data.get('distance_m'), data.get('distance_sprint_m')
        if distance is not None and sprint is not None and sprint > distance:
            raise serializers.ValidationError(
                {'distance_sprint_m': 'La distance à haute intensité ne peut pas dépasser la distance totale.'})
        return data


class PlaylistSerializer(serializers.ModelSerializer):
    auteur_nom = serializers.CharField(source='auteur.nom_complet', read_only=True)

    class Meta:
        model = Playlist
        fields = ['id', 'match', 'auteur', 'auteur_nom', 'nom', 'filtres', 'date_creation']
        read_only_fields = ['auteur']

    def validate_filtres(self, filtres):
        if not isinstance(filtres, dict) or set(filtres) - {'type', 'equipe', 'joueur', 'resultat', 'categorie'}:
            raise serializers.ValidationError('Critères inconnus.')
        return filtres
