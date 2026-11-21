"""Caméras des stades (FR-040 à FR-043) et leur connexion aux matchs (FR-031) — vues de l'API."""
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from cameras.models import Camera, EnregistrementVideo, EtatCamera
from cameras.serializers import CameraSerializer, EnregistrementVideoSerializer, valider_calibrage
from cameras.sonde import sonder
from comptes.models import Role
from core.api import AuditMixin, identique
from core.auth import roles
from core.services import journaliser
from matchs import live
from matchs.models import EtatMatch, Match

TECHNIQUES = (Role.ADMIN, Role.ANALYSTE)


def verifier_camera(camera):
    """FR-041 : mesure l'état du flux ; les matchs que la caméra filme sont prévenus d'un changement d'état."""
    avant = camera.etat
    camera.etat, camera.latence_ms, camera.message_etat = sonder(camera.url_flux)
    camera.derniere_verification = timezone.now()
    camera.save(update_fields=['etat', 'latence_ms', 'message_etat', 'derniere_verification'])
    if camera.etat != avant:
        for match_id in camera.enregistrements.filter(fin__isnull=True).values_list('match_id', flat=True):
            live.diffuser(match_id, 'camera.status.changed', etat_camera(camera))
    return camera


def etat_camera(camera):
    return {'camera': camera.id, 'nom': camera.nom, 'etat': camera.etat, 'etat_libelle': camera.get_etat_display(),
            'latence_ms': camera.latence_ms, 'message_etat': camera.message_etat,
            'derniere_verification': camera.derniere_verification and camera.derniere_verification.isoformat()}


class CameraViewSet(AuditMixin, viewsets.ModelViewSet):
    """L'administrateur installe et configure les caméras ; l'analyste les vérifie et calibre leur image."""
    serializer_class = CameraSerializer
    permission_classes = [roles(Role.ADMIN, lecture=TECHNIQUES)]

    def get_permissions(self):
        if self.action in ('verifier', 'calibrer'):
            return [roles(*TECHNIQUES)()]
        return super().get_permissions()

    def get_queryset(self):
        qs = Camera.objects.prefetch_related('enregistrements')
        p = self.request.query_params
        if p.get('stade'):
            qs = qs.filter(stade__iexact=p['stade'].strip())
        if p.get('active') in ('1', 'true'):
            qs = qs.filter(active=True)
        return qs

    @action(detail=True, methods=['post'])
    def verifier(self, request, pk=None):
        """« Connecter » la caméra : la sonde vérifie qu'elle répond et mesure le temps de réponse."""
        camera = verifier_camera(self.get_object())
        return Response(self.get_serializer(camera).data)

    @action(detail=True)
    def etat(self, request, pk=None):
        """Dernier état mesuré (sans nouvelle vérification)."""
        return Response(etat_camera(self.get_object()))

    @action(detail=True, methods=['post'])
    def calibrer(self, request, pk=None):
        """FR-043 : repère du terrain sur l'image de cette caméra, réutilisé pour mesurer en mètres."""
        camera = self.get_object()
        avant = camera.calibrage
        camera.calibrage = valider_calibrage(request.data)
        camera.save(update_fields=['calibrage'])
        journaliser(request, 'MODIFICATION', camera, avant={'calibrage': avant}, apres={'calibrage': camera.calibrage})
        return Response(self.get_serializer(camera).data)


class EnregistrementVideoViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                                 viewsets.GenericViewSet):
    """FR-031 : relier une caméra autorisée à un match, puis l'arrêter. La caméra doit être active, installée au
    stade du match, libre, et répondre au moment de la connexion."""
    serializer_class = EnregistrementVideoSerializer
    permission_classes = [roles(*TECHNIQUES, lecture=TECHNIQUES)]
    pagination_class = None

    def get_queryset(self):
        qs = EnregistrementVideo.objects.select_related('camera', 'match')
        if self.action == 'list':
            match = self.request.query_params.get('match')
            if not match:
                raise ValidationError({'match': 'Indiquez le match.'})
            qs = qs.filter(match_id=match)
        return qs

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        match, camera = s.validated_data['match'], s.validated_data['camera']
        if match.etat in (EtatMatch.CODE, EtatMatch.STATS_PUBLIEES, EtatMatch.ANNULE):
            raise ValidationError({'match': 'Ce match est clos.'})
        if not camera.active:
            raise ValidationError({'camera': 'Cette caméra est désactivée.'})
        if match.stade and not identique(camera.stade, match.stade):
            raise ValidationError({'camera': f'Cette caméra est installée à « {camera.stade} », '
                                             f'le match se joue à « {match.stade} ».'})
        occupee = camera.enregistrements.filter(fin__isnull=True).select_related('match').first()
        if occupee:
            raise ValidationError({'camera': f'Cette caméra filme déjà un autre match ({occupee.match}).'})
        verifier_camera(camera)
        if camera.etat != EtatCamera.EN_LIGNE:
            # réponse directe (pas d'exception) : l'état mesuré de la caméra reste enregistré
            return Response({'camera': [f'Caméra injoignable : {camera.message_etat}']},
                            status=status.HTTP_400_BAD_REQUEST)
        enregistrement = EnregistrementVideo.objects.create(match=match, camera=camera, url_lecture=camera.url_lecture)
        # le flux lisible devient la vidéo du match (ou son second angle) : le codage peut commencer en direct
        if camera.url_lecture:
            match = Match.objects.get(pk=match.pk)
            if not match.a_video:
                match.video_url = camera.url_lecture
            elif not match.video_url_2 and camera.url_lecture != match.video_url:
                match.video_url_2 = camera.url_lecture
            if match.etat == EtatMatch.PLANIFIE and match.a_video:
                match.etat = EtatMatch.VIDEO_IMPORTEE
            match.save(update_fields=['video_url', 'video_url_2', 'etat'])
        journaliser(request, 'CREATION', enregistrement, apres={'match': match.id, 'camera': camera.id})
        live.diffuser(match.id, 'camera.connected', etat_camera(camera))
        return Response(self.get_serializer(enregistrement).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def arreter(self, request, pk=None):
        enregistrement = self.get_object()
        if enregistrement.fin is None:
            enregistrement.fin = timezone.now()
            enregistrement.save(update_fields=['fin'])
            journaliser(request, 'MODIFICATION', enregistrement, apres={'fin': enregistrement.fin.isoformat()})
            live.diffuser(enregistrement.match_id, 'camera.disconnected', etat_camera(enregistrement.camera))
        return Response(self.get_serializer(enregistrement).data)
