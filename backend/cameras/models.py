"""Caméras des stades et enregistrements vidéo des matchs (SRS HAITI SCOUT AI, MOD-05, FR-031 et FR-040 à FR-043)."""
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Protocole(models.TextChoices):
    RTSP = 'RTSP', 'RTSP (caméra IP)'
    HLS = 'HLS', 'HLS (flux web)'
    HTTP = 'HTTP', 'Vidéo HTTP (MP4)'


class EtatCamera(models.TextChoices):
    NON_TESTEE = 'NON_TESTEE', 'Jamais vérifiée'
    EN_LIGNE = 'EN_LIGNE', 'En ligne'
    HORS_LIGNE = 'HORS_LIGNE', 'Hors ligne'
    ERREUR = 'ERREUR', 'En erreur'


class Camera(models.Model):
    """Caméra installée dans un stade. Le flux (`url_flux`) est ce que la caméra émet (souvent RTSP sur le réseau
    du stade) ; `url_lecture` est l'adresse que l'application sait lire (HLS ou MP4), s'il y en a une."""
    nom = models.CharField(max_length=80)
    stade = models.CharField(max_length=120, help_text='même libellé que le stade des matchs')
    protocole = models.CharField(max_length=4, choices=Protocole.choices, default=Protocole.RTSP)
    url_flux = models.CharField(max_length=500)
    url_lecture = models.URLField(max_length=500, blank=True)
    # FR-042 : résolution et fréquence d'images configurées sur la caméra
    largeur = models.PositiveSmallIntegerField(default=1920, validators=[MinValueValidator(320), MaxValueValidator(7680)])
    hauteur = models.PositiveSmallIntegerField(default=1080, validators=[MinValueValidator(240), MaxValueValidator(4320)])
    fps = models.PositiveSmallIntegerField(default=25, validators=[MinValueValidator(10), MaxValueValidator(120)])
    active = models.BooleanField(default=True)
    # FR-041 : état et qualité du flux, mesurés à la dernière vérification
    etat = models.CharField(max_length=10, choices=EtatCamera.choices, default=EtatCamera.NON_TESTEE)
    derniere_verification = models.DateTimeField(null=True, blank=True)
    latence_ms = models.PositiveIntegerField(null=True, blank=True)
    message_etat = models.CharField(max_length=200, blank=True)
    # FR-043 : les 4 coins d'un rectangle connu du terrain sur l'image, pour passer des pixels aux mètres
    calibrage = models.JSONField(null=True, blank=True, help_text='{"reference": "TERRAIN", "coins": [[x, y] × 4]}')
    date_creation = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['stade', 'nom']
        constraints = [models.UniqueConstraint(fields=['stade', 'nom'], name='camera_unique_par_stade')]

    def __str__(self):
        return f'{self.stade} · {self.nom}'


class EnregistrementVideo(models.Model):
    """Une caméra reliée à un match (FR-031) : de sa connexion à son arrêt."""
    match = models.ForeignKey('matchs.Match', on_delete=models.CASCADE, related_name='enregistrements')
    camera = models.ForeignKey(Camera, on_delete=models.PROTECT, related_name='enregistrements')
    url_lecture = models.URLField(max_length=500, blank=True)
    debut = models.DateTimeField(default=timezone.now)
    fin = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-debut']
        # une caméra ne filme qu'un match à la fois
        constraints = [models.UniqueConstraint(fields=['camera'], condition=Q(fin__isnull=True),
                                               name='camera_un_enregistrement_en_cours')]

    @property
    def duree_secondes(self):
        return round(((self.fin or timezone.now()) - self.debut).total_seconds())
