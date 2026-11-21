"""Scouting : rapports et shortlists (CU10, CU11, CU12) — modèle du domaine."""
from datetime import date

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from joueurs.models import Joueur
from matchs.models import Match


class EtatRapport(models.TextChoices):
    BROUILLON = 'BROUILLON', 'Brouillon'
    SOUMIS = 'SOUMIS', 'Soumis'
    RENVOYE = 'RENVOYE', 'Renvoyé'
    VALIDE = 'VALIDE', 'Validé'
    ARCHIVE = 'ARCHIVE', 'Archivé'


class RapportScouting(models.Model):
    """Évaluation écrite d'un joueur par un scout (RG8)."""
    RECOMMANDATIONS = [('RECRUTER', 'Recruter'), ('SUIVRE', 'Suivre'), ('NE_PAS_RETENIR', 'Ne pas retenir')]

    joueur = models.ForeignKey(Joueur, on_delete=models.PROTECT, related_name='rapports')
    scout = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='rapports_rediges')
    match_observe = models.ForeignKey(Match, null=True, blank=True, on_delete=models.SET_NULL, related_name='rapports')
    date_rapport = models.DateField(default=date.today)
    forces = models.TextField()
    faiblesses = models.TextField()
    note = models.PositiveSmallIntegerField(validators=[MinValueValidator(0), MaxValueValidator(10)])
    recommandation = models.CharField(max_length=14, choices=RECOMMANDATIONS)
    commentaire_validation = models.TextField(blank=True)
    etat = models.CharField(max_length=10, choices=EtatRapport.choices, default=EtatRapport.BROUILLON)
    valide_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='rapports_valides')
    date_validation = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-date_rapport', '-id']


class Shortlist(models.Model):
    """Liste de joueurs suivis par un utilisateur ou un club."""
    nom = models.CharField(max_length=80)
    description = models.CharField(max_length=200, blank=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    proprietaire = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='shortlists')
    joueurs = models.ManyToManyField(Joueur, related_name='shortlists', blank=True)

    class Meta:
        ordering = ['-date_creation']
