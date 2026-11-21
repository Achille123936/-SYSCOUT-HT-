"""Statistiques : valeurs par 90 minutes, centiles et indice de performance (RG5 à RG7) — modèle du domaine."""
from django.conf import settings
from django.db import models

from joueurs.models import GROUPES, Joueur
from referentiel.models import Saison


class StatistiqueJoueur(models.Model):
    """Valeurs calculées d'un joueur pour une saison (par 90 minutes) et leurs centiles."""
    joueur = models.ForeignKey(Joueur, on_delete=models.CASCADE, related_name='statistiques')
    saison = models.ForeignKey(Saison, on_delete=models.CASCADE, related_name='statistiques')
    minutes_jouees = models.PositiveIntegerField(default=0)
    matchs_joues = models.PositiveSmallIntegerField(default=0)
    buts = models.PositiveSmallIntegerField(default=0)
    passes_decisives = models.PositiveSmallIntegerField(default=0)
    xg = models.FloatField(default=0)
    buts_p90 = models.FloatField(default=0)
    xg_p90 = models.FloatField(default=0)
    tirs_p90 = models.FloatField(default=0)
    passes_p90 = models.FloatField(default=0)
    passes_reussies_pct = models.FloatField(default=0)
    dribbles_p90 = models.FloatField(default=0)
    duels_gagnes_pct = models.FloatField(default=0)
    recuperations_p90 = models.FloatField(default=0)
    interceptions_p90 = models.FloatField(default=0)
    # jeu de tête : tirs (buts compris), buts et xG des tirs dont la partie du corps codée est la tête
    tirs_tete = models.PositiveSmallIntegerField(default=0)
    buts_tete = models.PositiveSmallIntegerField(default=0)
    xg_tete = models.FloatField(default=0)
    tirs_tete_p90 = models.FloatField(default=0)
    buts_tete_p90 = models.FloatField(default=0)
    xg_tete_p90 = models.FloatField(default=0)
    centiles = models.JSONField(default=dict, blank=True)
    indice_performance = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ['-indice_performance']
        constraints = [models.UniqueConstraint(fields=['joueur', 'saison'], name='stat_unique_par_saison')]

    @property
    def eligible(self):
        """RG5 : au moins 450 minutes pour figurer dans les classements et les centiles."""
        return self.minutes_jouees >= settings.SYSCOUT['MINUTES_MIN_CLASSEMENT']


class PonderationIndice(models.Model):
    """Poids d'une statistique dans l'indice de performance d'un groupe de postes (paramètre de l'administrateur)."""
    groupe = models.CharField(max_length=10, choices=GROUPES)
    statistique = models.CharField(max_length=30)
    poids = models.FloatField(default=1)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['groupe', 'statistique'], name='ponderation_unique')]
