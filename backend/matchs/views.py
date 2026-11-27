"""Matchs : rencontres, compositions et codage vidéo des événements (CU06, CU07, CU08) — vues de l'API."""
import time
import uuid

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from comptes.models import Role
from core.api import AuditMixin
from core.auth import AbonnementActif, SPORTIFS, roles
from core.services import controler_codage, journaliser, recalculer_saison
from matchs import direct, live, stockage
from matchs.models import (MarqueVideo, Annotation, DonneePhysique, EtatMatch, Evenement, Match, PisteJoueur, Playlist,
                           PropositionIA, SourceDonnee, StatutValidation, SuiviJoueur, TypeAction, ValidationEvenement)
from matchs.serializers import (MarqueVideoSerializer, AnnotationSerializer, DonneePhysiqueSerializer, EvenementSerializer,
                                MatchSerializer, PisteJoueurSerializer, PlaylistSerializer,
                                PropositionIASerializer)

S = StatutValidation
# ce qu'un analyste peut confirmer ou corriger dans un événement (ancienne et nouvelle valeur sont conservées)
CHAMPS_EVENEMENT = ('joueur', 'type_action', 'minute', 'temps_video', 'zone_x', 'zone_y', 'fin_x', 'fin_y',
                    'resultat', 'partie_corps')


def releve(objet, *extra):
    """Valeurs d'un événement ou d'une proposition, pour l'historique des décisions."""
    return {c: getattr(objet, f'{c}_id' if c in ('joueur', 'club') else c) for c in (*CHAMPS_EVENEMENT, *extra)}


def exiger_codage(match, utilisateur):
    if match.etat != EtatMatch.EN_CODAGE or match.verrouille_par_id != utilisateur.id:
        raise ValidationError("Ouvrez d'abord le codage de ce match : les décisions se prennent par l'analyste qui "
                              'le code.')


class MatchViewSet(AuditMixin, viewsets.ModelViewSet):
    serializer_class = MatchSerializer
    permission_classes = [roles(Role.ADMIN, Role.ANALYSTE, lecture=SPORTIFS), AbonnementActif]

    def get_queryset(self):
        qs = (Match.objects.select_related('competition', 'club_domicile', 'club_exterieur', 'verrouille_par')
              .prefetch_related('compositions__joueur').annotate(nb_evenements=Count('evenements', distinct=True)))
        p = self.request.query_params
        for champ, filtre in (('competition', 'competition_id'), ('saison', 'competition__saison_id'),
                              ('etat', 'etat'), ('joueur', 'compositions__joueur_id')):
            if p.get(champ):
                qs = qs.filter(**{filtre: p[champ]})
        if p.get('club'):
            qs = qs.filter(Q(club_domicile_id=p['club']) | Q(club_exterieur_id=p['club']))
        return qs.order_by('-date_match', '-id')  # l'ordre du modèle est ignoré par les requêtes avec agrégat

    def perform_destroy(self, instance):
        if instance.etat in (EtatMatch.CODE, EtatMatch.STATS_PUBLIEES):
            raise ValidationError('Un match validé ne peut pas être supprimé.')
        super().perform_destroy(instance)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        live.diffuser(serializer.instance.id, 'match.updated')

    def _changement_d_etat(self, match):
        live.diffuser(match.id, 'match.status.changed', {'etat': match.etat, 'en_direct': match.verrou_actif})

    def _reponse(self, match, **extra):
        match = self.get_queryset().get(pk=match.pk)
        return Response({**self.get_serializer(match).data, **extra})

    def _exiger_verrou(self, match):
        if match.verrou_actif and match.verrouille_par_id != self.request.user.id:
            return Response({'detail': f'Match verrouillé par {match.verrouille_par.nom_complet}.'},
                            status=status.HTTP_423_LOCKED)
        return None

    @staticmethod
    def _controler_fichier_video(fichier):
        """SRS §18 : un fichier importé a un type et une taille acceptés."""
        p = settings.SYSCOUT
        nom = (fichier.name or '').lower()
        if not nom.endswith(p['VIDEO_EXTENSIONS']):
            raise ValidationError({'video': f"Format non accepté. Formats acceptés : {', '.join(p['VIDEO_EXTENSIONS'])}."})
        if fichier.size > p['VIDEO_MAX_MO'] * 1024 * 1024:
            raise ValidationError({'video': f"Fichier trop volumineux ({round(fichier.size / 1048576)} Mo) : {p['VIDEO_MAX_MO']} Mo au plus."})
        if fichier.size == 0:
            raise ValidationError({'video': 'Le fichier est vide.'})

    @action(detail=True, methods=['post'], url_path='televersement-video')
    def televersement_video(self, request, pk=None):
        """Où envoyer la vidéo ? Avec un stockage S3 : une adresse signée où le navigateur dépose le fichier directement
        (il ne passe pas par le serveur) ; sinon `mode: local`, et le fichier s'envoie à `importer-video`."""
        match = self.get_object()
        if match.etat not in (EtatMatch.PLANIFIE, EtatMatch.VIDEO_IMPORTEE):
            raise ValidationError("La vidéo ne peut plus être remplacée : le codage a commencé.")
        nom = str(request.data.get('nom', ''))
        try:
            taille = int(request.data.get('taille', 0))
        except (TypeError, ValueError):
            raise ValidationError({'taille': 'Taille invalide.'})
        p = settings.SYSCOUT
        if not nom.lower().endswith(p['VIDEO_EXTENSIONS']):
            raise ValidationError({'nom': f"Format non accepté. Formats acceptés : {', '.join(p['VIDEO_EXTENSIONS'])}."})
        if not 0 < taille <= p['VIDEO_MAX_MO'] * 1024 * 1024:
            raise ValidationError({'taille': f"Fichier vide ou de plus de {p['VIDEO_MAX_MO']} Mo."})
        if not stockage.actif():
            return Response({'mode': 'local'})
        type_mime = str(request.data.get('type') or 'video/mp4')[:100]
        return Response(stockage.adresse_d_envoi(match, nom, type_mime))

    @action(detail=True, methods=['post'], url_path='importer-video')
    def importer_video(self, request, pk=None):
        """CU06 étapes 7-8 : la vidéo est stockée (disque du serveur ou stockage S3) et le match passe à « Vidéo importée ».
        Trois sources : un fichier (`video`), l'adresse d'une vidéo hébergée (`video_url`), ou la clé d'un fichier déjà
        déposé sur le stockage S3 avec l'adresse de `televersement-video` (`cle`)."""
        match = self.get_object()
        if match.etat not in (EtatMatch.PLANIFIE, EtatMatch.VIDEO_IMPORTEE):
            raise ValidationError("La vidéo ne peut plus être remplacée : le codage a commencé.")
        fichier, adresse, cle = request.FILES.get('video'), request.data.get('video_url'), request.data.get('cle')
        if not fichier and not adresse and not cle:
            raise ValidationError({'video': 'Choisissez un fichier vidéo ou indiquez son adresse.'})
        ancienne = match.video.name if match.video else ''
        if cle:
            if not stockage.actif():
                raise ValidationError({'cle': "Ce serveur n'utilise pas de stockage S3."})
            stockage.verifier_arrivee(match, cle)
            match.video, match.video_url = cle, ''
        elif fichier:
            self._controler_fichier_video(fichier)
            match.video, match.video_url = fichier, ''
        else:
            match.video, match.video_url = None, adresse
        match.etat = EtatMatch.VIDEO_IMPORTEE
        match.full_clean(exclude=['video'])
        match.save()
        if ancienne and ancienne != (match.video.name if match.video else ''):
            try:
                match.video.storage.delete(ancienne)  # la vidéo remplacée ne reste pas sur le stockage
            except Exception:  # noqa: BLE001 — un nettoyage raté ne fait pas échouer l'importation
                pass
        journaliser(request, 'MODIFICATION', match, apres={'video': match.video.name or match.video_url})
        return self._reponse(match)

    @action(detail=True, methods=['post'], url_path='ouvrir-codage')
    def ouvrir_codage(self, request, pk=None):
        """CU07 étape 2 : le système verrouille le match pour cet analyste."""
        match = self.get_object()
        if match.etat not in (EtatMatch.VIDEO_IMPORTEE, EtatMatch.EN_CODAGE):
            raise ValidationError("Le codage exige un match à l'état « Vidéo importée » ou « En codage ».")
        if not match.compositions.exists():
            raise ValidationError("Saisissez d'abord les compositions du match (RG3).")
        refus = self._exiger_verrou(match)
        if refus:
            return refus
        deja_en_direct = match.verrou_actif  # l'écran de codage renouvelle le verrou toutes les 30 secondes
        match.verrouille_par, match.verrouille_le = request.user, timezone.now()
        match.etat, match.code_par = EtatMatch.EN_CODAGE, request.user
        match.save(update_fields=['verrouille_par', 'verrouille_le', 'etat', 'code_par'])
        if not deja_en_direct:
            self._changement_d_etat(match)
        return self._reponse(match)

    @action(detail=True, methods=['post'], url_path='fermer-codage')
    def fermer_codage(self, request, pk=None):
        """CU07 étape 8 : le verrou est libéré, le match reste « En codage »."""
        match = self.get_object()
        if match.verrouille_par_id == request.user.id or request.user.role == Role.ADMIN:
            match.verrouille_par = match.verrouille_le = None
            match.save(update_fields=['verrouille_par', 'verrouille_le'])
            self._changement_d_etat(match)
        return self._reponse(match)

    @action(detail=True, methods=['post'])
    def valider(self, request, pk=None):
        """CU08 : contrôle de cohérence puis calcul des statistiques, centiles et indices (RG4)."""
        match = self.get_object()
        if match.etat != EtatMatch.EN_CODAGE:
            raise ValidationError("Seul un match « En codage » peut être validé.")
        refus = self._exiger_verrou(match)
        if refus:
            return refus
        erreurs = controler_codage(match)
        if erreurs:
            return Response({'detail': 'Le codage est incohérent.', 'erreurs': erreurs},
                            status=status.HTTP_400_BAD_REQUEST)
        debut = time.perf_counter()
        match.etat = EtatMatch.STATS_PUBLIEES  # passe par « Codé » puis publie dans la même transaction
        match.verrouille_par = match.verrouille_le = None
        match.save(update_fields=['etat', 'verrouille_par', 'verrouille_le'])
        # SRS §10 : une proposition de l'IA que personne n'a vérifiée reste hors des statistiques, marquée comme telle
        non_verifiees = list(match.propositions.filter(statut=S.PENDING))
        for proposition in non_verifiees:
            ValidationEvenement.objects.create(
                proposition=proposition, match=match, validateur=request.user, statut_avant=S.PENDING,
                statut_apres=S.UNVERIFIED, avant=releve(proposition), apres=releve(proposition),
                commentaire='Match validé sans vérification de cette proposition.')
        match.propositions.filter(id__in=[p.id for p in non_verifiees]).update(statut=S.UNVERIFIED)
        nombre = recalculer_saison(match.competition.saison)
        journaliser(request, 'MODIFICATION', match, avant={'etat': 'EN_CODAGE'}, apres={'etat': match.etat})
        self._changement_d_etat(match)
        return self._reponse(match, joueurs_calcules=nombre, duree_calcul=round(time.perf_counter() - debut, 2),
                             propositions_non_verifiees=len(non_verifiees))

    @action(detail=True, methods=['post'])
    def corriger(self, request, pk=None):
        """Une correction ramène le match « En codage » et retire ses statistiques de la saison."""
        match = self.get_object()
        if match.etat not in (EtatMatch.CODE, EtatMatch.STATS_PUBLIEES):
            raise ValidationError("Seul un match validé peut être corrigé.")
        avant = match.etat
        match.etat = EtatMatch.EN_CODAGE
        match.verrouille_par, match.verrouille_le = request.user, timezone.now()
        match.save(update_fields=['etat', 'verrouille_par', 'verrouille_le'])
        recalculer_saison(match.competition.saison)
        journaliser(request, 'MODIFICATION', match, avant={'etat': avant}, apres={'etat': match.etat})
        self._changement_d_etat(match)
        return self._reponse(match)

    @action(detail=True)
    def direct(self, request, pk=None):
        """Suivi en direct : score codé, possession, statistiques des équipes et des joueurs, données physiques."""
        return Response(direct.tableau(self.get_object()))

    @action(detail=True)
    def tactique(self, request, pk=None):
        """MOD-08 : carte d'activité, positions moyennes, formation, bloc, passes progressives, pressing (PPDA)
        et transitions, avec leurs définitions et les limites des données. ?debut= et ?fin= (minutes)."""
        from matchs.tactique import analyse
        try:
            debut = max(0, int(request.query_params.get('debut') or 0))
            fin = request.query_params.get('fin')
            fin = int(fin) if fin not in (None, '') else None
        except ValueError:
            raise ValidationError('Les minutes de début et de fin sont des nombres entiers.')
        return Response(analyse(self.get_object(), debut, fin))

    @action(detail=True, methods=['post'])
    def possession(self, request, pk=None):
        """Pendant le codage, l'analyste indique quelle équipe a le ballon : chaque période est chronométrée."""
        match = self.get_object()
        if match.etat != EtatMatch.EN_CODAGE or match.verrouille_par_id != request.user.id:
            raise ValidationError("La possession se chronomètre pendant le codage du match, par l'analyste qui code.")
        club = request.data.get('club')
        clubs = {match.club_domicile_id: match.club_domicile, match.club_exterieur_id: match.club_exterieur}
        if club is not None and club not in clubs:
            raise ValidationError({'club': "Ce club ne joue pas ce match."})
        try:
            temps = max(0, int(request.data.get('temps_video', 0)))
        except (TypeError, ValueError):
            raise ValidationError({'temps_video': 'Indiquez la seconde de la vidéo.'})
        direct.changer_possession(match, clubs.get(club), temps)
        live.diffuser(match.id, 'match.possession.updated', {'club': club, 'temps_video': temps})
        return Response(direct.possession(match, self._evenements_avec_club(match)))

    def _evenements_avec_club(self, match):
        club_de = dict(match.compositions.values_list('joueur_id', 'club_id'))
        evenements = list(match.evenements.values('joueur_id', 'type_action', 'temps_video'))
        for e in evenements:
            e['club'] = club_de.get(e['joueur_id'])
        return evenements

    @action(detail=True, methods=['get', 'put'])
    def physique(self, request, pk=None):
        """Données physiques des joueurs du match (capteurs GPS ou saisie manuelle)."""
        match = self.get_object()
        if request.method == 'PUT':
            lignes = request.data.get('donnees')
            if not isinstance(lignes, list):
                raise ValidationError({'donnees': 'Envoyez la liste des données, une ligne par joueur.'})
            dans_la_composition = set(match.compositions.values_list('joueur_id', flat=True))
            for ligne in lignes:
                s = DonneePhysiqueSerializer(data=ligne)
                s.is_valid(raise_exception=True)
                joueur = s.validated_data.pop('joueur')
                if joueur.id not in dans_la_composition:
                    raise ValidationError(f'{joueur.nom_complet} ne figure pas dans la composition du match (RG3).')
                mesures = {k: v for k, v in s.validated_data.items() if k != 'source'}
                if all(v is None for v in mesures.values()):  # ligne vidée : la donnée est retirée
                    DonneePhysique.objects.filter(match=match, joueur=joueur).delete()
                else:
                    DonneePhysique.objects.update_or_create(match=match, joueur=joueur, defaults=s.validated_data)
            journaliser(request, 'MODIFICATION', match, apres={'donnees_physiques': len(lignes)})
            live.diffuser(match.id, 'match.physical.updated')
        donnees = match.donnees_physiques.select_related('joueur')
        return Response(DonneePhysiqueSerializer(donnees, many=True).data)

    @action(detail=True, methods=['post'])
    def gps(self, request, pk=None):
        """Capteur GPS : reçoit la trace d'un joueur (téléphone ou balise) et en tire ses données physiques."""
        from apprentissage.ml import analyser_trace
        match = self.get_object()
        composition = match.compositions.filter(joueur_id=request.data.get('joueur')).first()
        if not composition:
            raise ValidationError({'joueur': 'Ce joueur ne figure pas dans la composition du match (RG3).'})
        try:
            points = [(float(p['t']), float(p['lat']), float(p['lon'])) for p in request.data.get('points', [])]
        except (KeyError, TypeError, ValueError):
            raise ValidationError({'points': 'Chaque point comporte t (secondes), lat et lon.'})
        if any(not (-90 <= lat <= 90 and -180 <= lon <= 180) for _, lat, lon in points):
            raise ValidationError({'points': 'Coordonnées GPS invalides.'})
        resultat = analyser_trace(points)
        if resultat is None:
            raise ValidationError({'points': 'Trace trop courte : il faut au moins 4 positions valides.'})
        champs = ('distance_m', 'distance_sprint_m', 'sprints', 'vitesse_max_kmh')
        DonneePhysique.objects.update_or_create(match=match, joueur_id=composition.joueur_id,
                                                defaults={**{c: resultat[c] for c in champs}, 'source': 'GPS'})
        journaliser(request, 'MODIFICATION', match, apres={'gps_joueur': composition.joueur_id, **resultat})
        live.diffuser(match.id, 'match.physical.updated', {'joueur': composition.joueur_id})
        return Response(resultat, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def suivi(self, request, pk=None):
        """Télestration : suivi d'un joueur sur la vidéo. L'image est calibrée sur le terrain par 4 points, le trajet
        est converti en mètres, puis analysé comme une trace GPS (distance, sprints, vitesse maximale)."""
        from django.db.models import Max, Sum
        from apprentissage.ml import REFERENCES, analyser_suivi
        match = self.get_object()
        composition = match.compositions.filter(joueur_id=request.data.get('joueur')).first()
        if not composition:
            raise ValidationError({'joueur': 'Choisissez un joueur de la composition du match (RG3).'})
        reference = request.data.get('reference')
        if reference not in REFERENCES:
            raise ValidationError({'reference': 'Rectangle de référence inconnu.'})
        try:
            coins = [(float(x), float(y)) for x, y in request.data.get('coins', [])]
            image = [(float(p['t']), float(p['x']), float(p['y'])) for p in request.data.get('points', [])]
        except (KeyError, TypeError, ValueError):
            raise ValidationError({'points': "Chaque point comporte t (secondes), x et y (en % de l'image)."})
        if len(coins) != 4:
            raise ValidationError({'coins': "Le calibrage demande 4 points sur l'image."})
        resultat, trajet = analyser_suivi(coins, reference, image)
        if resultat is None:
            raise ValidationError({'points': 'Suivi trop court ou calibrage incorrect : suivez le joueur au moins '
                                             "2 secondes, et vérifiez les 4 points de calibrage."})
        SuiviJoueur.objects.create(
            match=match, joueur_id=composition.joueur_id, auteur=request.user, debut=trajet[0][0], fin=trajet[-1][0],
            distance_m=resultat['distance_m'], distance_sprint_m=resultat['distance_sprint_m'],
            sprints=resultat['sprints'], vitesse_max_kmh=resultat['vitesse_max_kmh'],
            trajet=[[round(t, 2), round(x, 1), round(y, 1)] for t, x, y in trajet])
        # le tracé reste visible à la relecture de la vidéo, comme tout dessin de télestration
        pas = max(1, len(image) // 400 + (1 if len(image) % 400 else 0))
        Annotation.objects.create(
            match=match, auteur=request.user, temps_video=int(trajet[0][0]), forme='TRAIT',
            duree=max(1, min(60, int(trajet[-1][0] - trajet[0][0]) + 2)), couleur=request.data.get('couleur', '#22c38e'),
            points=[[min(100, max(0, x)), min(100, max(0, y))] for _, x, y in sorted(image)[::pas]][:400])
        # cumul des séquences du joueur = ses données physiques « suivi vidéo » (sans écraser un relevé GPS ou manuel)
        cumul = SuiviJoueur.objects.filter(match=match, joueur_id=composition.joueur_id).aggregate(
            distance_m=Sum('distance_m'), distance_sprint_m=Sum('distance_sprint_m'), sprints=Sum('sprints'),
            vitesse_max_kmh=Max('vitesse_max_kmh'), secondes=Sum('fin') - Sum('debut'))
        secondes = cumul.pop('secondes')
        existante = DonneePhysique.objects.filter(match=match, joueur_id=composition.joueur_id).first()
        enregistre = existante is None or existante.source == 'VIDEO'
        if enregistre:
            DonneePhysique.objects.update_or_create(
                match=match, joueur_id=composition.joueur_id,
                defaults={'distance_m': round(cumul['distance_m']), 'sprints': cumul['sprints'], 'source': 'VIDEO',
                          'distance_sprint_m': round(cumul['distance_sprint_m']),
                          'vitesse_max_kmh': cumul['vitesse_max_kmh']})
            live.diffuser(match.id, 'match.physical.updated', {'joueur': composition.joueur_id})
        return Response({'sequence': resultat, 'cumul': {**cumul, 'secondes_suivies': round(secondes)},
                         'enregistre': enregistre, 'joueur_nom': composition.joueur.nom_complet},
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def annuler(self, request, pk=None):
        match = self.get_object()
        if match.etat != EtatMatch.PLANIFIE:
            raise ValidationError("Seul un match planifié peut être annulé.")
        match.etat = EtatMatch.ANNULE
        match.save(update_fields=['etat'])
        journaliser(request, 'MODIFICATION', match, avant={'etat': 'PLANIFIE'}, apres={'etat': 'ANNULE'})
        self._changement_d_etat(match)
        return self._reponse(match)


class EvenementViewSet(viewsets.ModelViewSet):
    """CU07 : chaque événement est enregistré dès sa saisie (aucune perte en cas de coupure)."""
    serializer_class = EvenementSerializer
    permission_classes = [roles(Role.ADMIN, Role.ANALYSTE, lecture=SPORTIFS), AbonnementActif]
    pagination_class = None

    def get_queryset(self):
        qs = Evenement.objects.select_related('joueur', 'match')
        p = self.request.query_params
        if self.action == 'list':
            if not p.get('match'):
                raise ValidationError({'match': 'Indiquez le match.'})
            qs = qs.filter(match_id=p['match'])
            if p.get('joueur'):
                qs = qs.filter(joueur_id=p['joueur'])
        return qs

    def get_serializer_context(self):
        contexte = super().get_serializer_context()
        match = self.request.query_params.get('match')
        if self.action == 'list' and match:
            contexte['clubs_par_joueur'] = dict(
                Match.objects.get(pk=match).compositions.values_list('joueur_id', 'club_id'))
        return contexte

    def create(self, request, *args, **kwargs):
        """NFR-008 : un appareil qui renvoie un événement après une coupure réseau donne la même clé
        d'idempotence ; l'événement déjà enregistré est alors rendu (200) au lieu d'être créé une seconde fois."""
        cle = request.data.get('cle_idempotence')
        if not cle:
            return super().create(request, *args, **kwargs)
        try:
            cle = uuid.UUID(str(cle))
        except ValueError:
            raise ValidationError({'cle_idempotence': "Clé d'idempotence invalide (UUID attendu)."})
        deja = self._deja_recu(cle)
        if deja:
            return deja
        try:
            with transaction.atomic():
                return super().create(request, *args, **kwargs)
        except IntegrityError:  # le même envoi est arrivé deux fois en même temps
            deja = self._deja_recu(cle)
            if deja:
                return deja
            raise

    def _deja_recu(self, cle):
        evenement = Evenement.objects.select_related('joueur', 'match').filter(cle_idempotence=cle).first()
        if evenement is None:
            return None
        if str(evenement.match_id) != str(self.request.data.get('match')):
            raise ValidationError({'cle_idempotence': 'Cette clé a déjà servi pour un autre match.'})
        return Response(self.get_serializer(evenement).data, status=status.HTTP_200_OK)

    def _prolonger_verrou(self, match):
        Match.objects.filter(pk=match.pk).update(verrouille_le=timezone.now())

    def _diffuser(self, evenement, type_message, donnees, buts):
        live.diffuser(evenement.match_id, type_message, donnees, evenement.cle_idempotence)
        if buts:
            live.diffuser(evenement.match_id, 'match.score.updated')

    def perform_create(self, serializer):
        evenement = serializer.save()
        self._prolonger_verrou(evenement.match)
        self._diffuser(evenement, 'match.event.created', serializer.data, evenement.type_action == TypeAction.BUT)
        # SRS §16 : l'horloge du match avance avec le codage (minute et seconde de vidéo du dernier événement)
        live.diffuser(evenement.match_id, 'match.clock.updated', {'minute': evenement.minute, 'temps_video': evenement.temps_video})

    def perform_update(self, serializer):
        """SRS §10 : toute correction est historisée ; un événement venu de l'IA devient « corrigé »."""
        avant, statut_avant = releve(serializer.instance), serializer.instance.statut_validation
        etait_un_but = serializer.instance.type_action == TypeAction.BUT
        ia = serializer.instance.source == SourceDonnee.AI
        evenement = serializer.save(**({'statut_validation': S.CORRECTED} if ia else {}))
        apres = releve(evenement)
        if apres != avant:
            ValidationEvenement.objects.create(
                evenement=evenement, proposition=PropositionIA.objects.filter(evenement=evenement).first(),
                match=evenement.match, validateur=self.request.user, statut_avant=statut_avant,
                statut_apres=evenement.statut_validation, avant=avant, apres=apres,
                commentaire=str(self.request.data.get('commentaire', ''))[:300])
        self._prolonger_verrou(evenement.match)
        self._diffuser(evenement, 'match.event.updated', serializer.data,
                       etait_un_but or evenement.type_action == TypeAction.BUT)

    def perform_destroy(self, instance):
        match = instance.match
        if match.etat != EtatMatch.EN_CODAGE or match.verrouille_par_id != self.request.user.id:
            raise ValidationError("Ce match n'est pas en cours de codage par vous.")
        identifiant = instance.id
        # un événement confirmé depuis une proposition de l'IA, puis supprimé : la proposition est rejetée
        proposition = PropositionIA.objects.filter(evenement=instance).first()
        if proposition:
            ValidationEvenement.objects.create(
                proposition=proposition, match=match, validateur=self.request.user, statut_avant=proposition.statut,
                statut_apres=S.REJECTED, avant=releve(instance), apres={},
                commentaire="Événement supprimé par l'analyste après sa confirmation.")
            proposition.statut = S.REJECTED
            proposition.save(update_fields=['statut'])
        instance.delete()
        instance.id = identifiant  # effacé par delete(), utile au message
        self._prolonger_verrou(match)
        self._diffuser(instance, 'match.event.deleted', {'id': identifiant}, instance.type_action == TypeAction.BUT)


class PropositionIAViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                           viewsets.GenericViewSet):
    """FR-057 : le moteur IA envoie ses propositions (une, ou un lot) ; l'analyste qui code le match les confirme,
    les corrige ou les rejette. Données non vérifiées : réservées aux analystes et à l'administrateur."""
    serializer_class = PropositionIASerializer
    permission_classes = [roles(Role.ADMIN, Role.ANALYSTE, lecture=(Role.ADMIN, Role.ANALYSTE))]
    pagination_class = None
    LOT_MAX = 500

    def get_queryset(self):
        qs = PropositionIA.objects.select_related('joueur', 'match').prefetch_related('validations__validateur')
        if self.action == 'list':
            p = self.request.query_params
            if not p.get('match'):
                raise ValidationError({'match': 'Indiquez le match.'})
            qs = qs.filter(match_id=p['match'])
            if p.get('statut'):
                qs = qs.filter(statut__in=p['statut'].split(','))
        return qs

    def create(self, request, *args, **kwargs):
        """Un lot arrive en entier ou pas du tout. Une proposition renvoyée avec la même clé d'idempotence
        n'est enregistrée qu'une fois (le moteur peut renvoyer un lot après une coupure)."""
        lot = isinstance(request.data, list)
        lignes = request.data if lot else [request.data]
        if not 1 <= len(lignes) <= self.LOT_MAX:
            raise ValidationError(f'Envoyez de 1 à {self.LOT_MAX} propositions à la fois.')
        recues, nouvelles = [], []
        for rang, ligne in enumerate(lignes, start=1):
            try:
                existante = self._deja_recue(ligne)
                if existante:
                    recues.append(existante)
                    continue
                s = self.get_serializer(data=ligne)
                s.is_valid(raise_exception=True)
            except ValidationError as erreur:
                raise ValidationError({f'proposition {rang}': erreur.detail} if lot else erreur.detail)
            nouvelles.append(s.save())
            recues.append(nouvelles[-1])
        for match_id in {p.match_id for p in nouvelles}:
            live.diffuser(match_id, 'ai.detection.created',
                          {'nombre': sum(p.match_id == match_id for p in nouvelles)})
        donnees = self.get_serializer(recues, many=True).data
        return Response(donnees if lot else donnees[0],
                        status=status.HTTP_201_CREATED if nouvelles else status.HTTP_200_OK)

    def _deja_recue(self, ligne):
        cle = ligne.get('cle_idempotence') if isinstance(ligne, dict) else None
        if not cle:
            return None
        try:
            cle = uuid.UUID(str(cle))
        except ValueError:
            raise ValidationError({'cle_idempotence': "Clé d'idempotence invalide (UUID attendu)."})
        existante = PropositionIA.objects.filter(cle_idempotence=cle).first()
        if existante and str(existante.match_id) != str(ligne.get('match')):
            raise ValidationError({'cle_idempotence': 'Cette clé a déjà servi pour un autre match.'})
        return existante

    @action(detail=True, methods=['post'])
    def valider(self, request, pk=None):
        """SRS §10 — decision : « confirmer » (telle quelle), « corriger » (avec les champs modifiés) ou « rejeter ».
        Confirmée ou corrigée, la proposition devient un événement officiel, contrôlé comme une saisie (verrou,
        composition, minute) ; chaque décision est historisée."""
        proposition = PropositionIA.objects.select_for_update().get(pk=self.get_object().pk)
        match = proposition.match
        exiger_codage(match, request.user)
        if proposition.statut not in (S.PENDING, S.UNVERIFIED):
            raise ValidationError(f'Cette proposition est déjà traitée ({proposition.get_statut_display().lower()}).')
        decision = request.data.get('decision')
        if decision not in ('confirmer', 'corriger', 'rejeter'):
            raise ValidationError({'decision': 'Choisissez « confirmer », « corriger » ou « rejeter ».'})
        commentaire = str(request.data.get('commentaire', '')).strip()[:300]
        statut_avant, avant = proposition.statut, releve(proposition, 'club', 'piste', 'confiance')

        evenement = None
        if decision == 'rejeter':
            proposition.statut = S.REJECTED
        else:
            if decision == 'confirmer' and proposition.joueur_id is None:
                raise ValidationError({'joueur': "L'IA n'a pas identifié le joueur : choisissez-le et corrigez."})
            donnees = {**releve(proposition), 'match': match.id}
            if decision == 'corriger':
                donnees.update({c: request.data[c] for c in CHAMPS_EVENEMENT if c in request.data})
            donnees = {c: v for c, v in donnees.items() if v is not None}
            s = EvenementSerializer(data=donnees, context=self.get_serializer_context())
            s.is_valid(raise_exception=True)
            evenement = s.save(source=SourceDonnee.AI, confiance=proposition.confiance)
            # « corrigé » seulement si une valeur a vraiment changé
            if releve(evenement) != releve(proposition):
                evenement.statut_validation = S.CORRECTED
                evenement.save(update_fields=['statut_validation'])
            proposition.statut, proposition.evenement = evenement.statut_validation, evenement
            Match.objects.filter(pk=match.pk).update(verrouille_le=timezone.now())
        proposition.save(update_fields=['statut', 'evenement'])
        ValidationEvenement.objects.create(
            proposition=proposition, evenement=evenement, match=match, validateur=request.user,
            statut_avant=statut_avant, statut_apres=proposition.statut, avant=avant,
            apres=releve(evenement) if evenement else {}, commentaire=commentaire)

        live.diffuser(match.id, 'match.event.validated',
                      {'proposition': proposition.id, 'statut': proposition.statut,
                       'evenement': evenement and EvenementSerializer(evenement, context=self.get_serializer_context()).data})
        if evenement and evenement.type_action == TypeAction.BUT:
            live.diffuser(match.id, 'match.score.updated')
        proposition = self.get_queryset().get(pk=proposition.pk)
        return Response(self.get_serializer(proposition).data)


class PisteJoueurViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """FR-052 : le moteur IA envoie les points de trajectoire des joueurs ; l'analyste relie une piste à un joueur.
    Une piste n'est pas une identité (SRS §9.1) et n'entre dans aucune statistique officielle."""
    serializer_class = PisteJoueurSerializer
    permission_classes = [roles(Role.ADMIN, Role.ANALYSTE, lecture=(Role.ADMIN, Role.ANALYSTE))]
    pagination_class = None
    LOT_MAX = 2000

    def get_queryset(self):
        p = self.request.query_params
        if not p.get('match'):
            raise ValidationError({'match': 'Indiquez le match.'})
        qs = PisteJoueur.objects.filter(match_id=p['match'])
        if p.get('piste'):
            qs = qs.filter(piste=p['piste'])
        if p.get('joueur'):
            qs = qs.filter(joueur_id=p['joueur'])
        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Un lot (1 à 2000 points) arrive en entier ou pas du tout. Un point déjà reçu (même match, piste et
        instant) est ignoré : le moteur peut renvoyer un lot après une coupure."""
        lignes = request.data if isinstance(request.data, list) else [request.data]
        if not 1 <= len(lignes) <= self.LOT_MAX:
            raise ValidationError(f'Envoyez de 1 à {self.LOT_MAX} points à la fois.')
        points = []
        for rang, ligne in enumerate(lignes, start=1):
            s = self.get_serializer(data=ligne)
            try:
                s.is_valid(raise_exception=True)
            except ValidationError as erreur:
                raise ValidationError({f'point {rang}': erreur.detail})
            points.append(PisteJoueur(**s.validated_data))
        existants = set(PisteJoueur.objects.filter(match_id__in={p.match_id for p in points}, piste__in={p.piste for p in points})
                        .values_list('match_id', 'piste', 'temps_video'))
        vus, nouveaux = set(existants), []
        for point in points:
            cle = (point.match_id, point.piste, point.temps_video)
            if cle not in vus:
                vus.add(cle)
                nouveaux.append(point)
        PisteJoueur.objects.bulk_create(nouveaux)
        for match_id in {p.match_id for p in nouveaux}:
            lot = [p for p in nouveaux if p.match_id == match_id]
            live.diffuser(match_id, 'ai.tracking.updated',
                          {'points': len(lot), 'pistes': sorted({p.piste for p in lot}),
                           'temps_video': max(p.temps_video for p in lot)})
        return Response({'recus': len(points), 'enregistres': len(nouveaux), 'ignores': len(points) - len(nouveaux)},
                        status=status.HTTP_201_CREATED if nouveaux else status.HTTP_200_OK)

    COLONNES, LIGNES = 20, 12

    @action(detail=False, methods=['get'])
    def heatmap(self, request):
        """FR-055 : zones d'activité calculées sur les points de suivi de l'IA (`?match=`, et au choix `&joueur=`,
        `&piste=`, `&club=`, `&confiance_min=`). Données non vérifiées : la réponse dit ce qu'elles couvrent."""
        qs = self.get_queryset()
        p = request.query_params
        if p.get('club'):
            qs = qs.filter(club_id=p['club'])
        try:
            confiance_min = float(p.get('confiance_min', 0))
        except ValueError:
            raise ValidationError({'confiance_min': 'Nombre entre 0 et 1 attendu.'})
        qs = qs.filter(confiance__gte=confiance_min)
        grille = [[0] * self.COLONNES for _ in range(self.LIGNES)]
        total, somme_confiance, pistes, sans_identite = 0, 0.0, set(), set()
        for piste, joueur, x, y, confiance in qs.values_list('piste', 'joueur_id', 'x', 'y', 'confiance').iterator():
            colonne = min(int(x / 100 * self.COLONNES), self.COLONNES - 1)
            ligne = min(int(y / 100 * self.LIGNES), self.LIGNES - 1)
            grille[ligne][colonne] += 1
            total += 1
            somme_confiance += confiance
            pistes.add(piste)
            if joueur is None:
                sans_identite.add(piste)
        confiance_moyenne = somme_confiance / total if total else None
        avertissements = ["Données du moteur IA, non vérifiées : à ne pas présenter comme officielles."]
        if not total:
            avertissements.append('Aucun point de suivi pour ces critères.')
        else:
            if sans_identite:
                avertissements.append(f'{len(sans_identite)} piste(s) sur {len(pistes)} ne sont pas encore reliées à un joueur.')
            if confiance_moyenne < 0.6:
                avertissements.append(f'Confiance moyenne faible ({confiance_moyenne:.2f}) : suivi incomplet ou incertain.')
            if total < 200:
                avertissements.append('Peu de points : cette heatmap ne représente pas fidèlement la présence sur le terrain.')
        return Response({'colonnes': self.COLONNES, 'lignes': self.LIGNES, 'grille': grille,
                         'maximum': max(max(l) for l in grille), 'points': total,
                         'pistes': len(pistes), 'pistes_sans_identite': len(sans_identite),
                         'confiance_moyenne': confiance_moyenne, 'source': 'AI', 'statut': 'UNVERIFIED',
                         'avertissements': avertissements})

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def identifier(self, request):
        """Un analyste relie une piste à un joueur de la composition du match (ou la détache avec joueur=null)."""
        match = Match.objects.filter(pk=request.data.get('match')).first()
        piste = str(request.data.get('piste', '')).strip()
        if match is None or not piste:
            raise ValidationError('Indiquez le match et la piste.')
        points = PisteJoueur.objects.filter(match=match, piste=piste)
        if not points.exists():
            raise ValidationError({'piste': 'Piste inconnue pour ce match.'})
        joueur_id = request.data.get('joueur')
        joueur = club = None
        if joueur_id is not None:
            composition = match.compositions.select_related('joueur').filter(joueur_id=joueur_id).first()
            if composition is None:
                raise ValidationError({'joueur': 'Ce joueur ne figure pas dans la composition du match (RG3).'})
            joueur, club = composition.joueur, composition.club
        avant = set(points.values_list('joueur_id', flat=True))
        points.update(joueur=joueur, **({'club': club} if club else {}))
        journaliser(request, 'MODIFICATION', table='pistejoueur', identifiant=f'{match.id}/{piste}',
                    avant={'joueur': sorted(j for j in avant if j)}, apres={'joueur': joueur and joueur.id})
        live.diffuser(match.id, 'ai.tracking.updated', {'pistes': [piste], 'joueur': joueur and joueur.id})
        return Response({'piste': piste, 'joueur': joueur and joueur.id, 'points': points.count()})


class AnnotationViewSet(viewsets.ModelViewSet):
    """Télestration : les analystes dessinent sur la vidéo ; les autres rôles sportifs voient les dessins."""
    serializer_class = AnnotationSerializer
    permission_classes = [roles(Role.ADMIN, Role.ANALYSTE, lecture=SPORTIFS), AbonnementActif]
    pagination_class = None

    def get_queryset(self):
        qs = Annotation.objects.select_related('auteur', 'match')
        if self.action == 'list':
            match = self.request.query_params.get('match')
            if not match:
                raise ValidationError({'match': 'Indiquez le match.'})
            qs = qs.filter(match_id=match)
        return qs

    def perform_create(self, serializer):
        serializer.save(auteur=self.request.user)

    def _exiger_auteur(self, annotation):
        if annotation.auteur_id != self.request.user.id and self.request.user.role != Role.ADMIN:
            raise PermissionDenied("Seul l'auteur d'un dessin peut le modifier ou l'effacer.")

    def perform_update(self, serializer):
        self._exiger_auteur(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._exiger_auteur(instance)
        instance.delete()


class MarqueVideoViewSet(AnnotationViewSet):
    """Tableau de codage : mêmes droits que la télestration (les analystes marquent, les rôles sportifs consultent)."""
    serializer_class = MarqueVideoSerializer

    def get_queryset(self):
        qs = MarqueVideo.objects.select_related('auteur', 'match')
        if self.action == 'list':
            match = self.request.query_params.get('match')
            if not match or not match.isdigit():
                raise ValidationError({'match': 'Indiquez le match.'})
            qs = qs.filter(match_id=match)
        return qs


class PlaylistViewSet(viewsets.ModelViewSet):
    """Playlists de clips : chacun enregistre les siennes ; toutes sont visibles des rôles sportifs."""
    serializer_class = PlaylistSerializer
    permission_classes = [roles(*SPORTIFS, lecture=SPORTIFS), AbonnementActif]
    pagination_class = None

    def get_queryset(self):
        qs = Playlist.objects.select_related('auteur')
        match = self.request.query_params.get('match')
        return qs.filter(match_id=match) if match else qs

    def perform_create(self, serializer):
        serializer.save(auteur=self.request.user)

    def _exiger_auteur(self, playlist):
        if playlist.auteur_id != self.request.user.id and self.request.user.role != Role.ADMIN:
            raise PermissionDenied("Seul l'auteur d'une playlist peut la modifier ou la supprimer.")

    def perform_update(self, serializer):
        self._exiger_auteur(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._exiger_auteur(instance)
        instance.delete()


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def matchs_en_direct(request):
    """Page d'accueil : les matchs codés en ce moment (score, minute), visibles sans compte. Rien de plus que le
    score et l'affiche : les statistiques, les joueurs et la vidéo restent derrière la connexion."""
    en_cours = Match.objects.filter(etat=EtatMatch.EN_CODAGE).select_related(
        'competition', 'club_domicile', 'club_exterieur').order_by('-verrouille_le')
    resultat = []
    for match in en_cours:
        if not match.verrou_actif:
            continue  # codage abandonné : le match n'est plus suivi
        tableau = direct.tableau(match)
        resultat.append({
            'id': match.id, 'competition': match.competition.nom, 'journee': match.journee, 'stade': match.stade,
            'domicile': {'nom': match.club_domicile.nom, 'sigle': match.club_domicile.sigle},
            'exterieur': {'nom': match.club_exterieur.nom, 'sigle': match.club_exterieur.sigle},
            'score': tableau['score'], 'minute': min(tableau['minute'], match.duree)})
        if len(resultat) == 10:
            break
    return Response(resultat)
