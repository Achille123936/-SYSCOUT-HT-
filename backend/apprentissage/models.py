"""Apprentissage automatique : joueurs similaires, profils de jeu et modèle xG — modèle du domaine."""
from django.conf import settings
from django.db import models


class ModeleXG(models.Model):
    """Modèle de buts attendus appris sur les tirs codés. Le plus récent marqué « actif » sert au codage."""
    date_entrainement = models.DateTimeField(auto_now_add=True)
    entraine_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='modeles_xg')
    nb_tirs = models.PositiveIntegerField()
    nb_buts = models.PositiveIntegerField()
    # poids, biais, moyennes et écarts-types des caractéristiques (distance, angle)
    coefficients = models.JSONField()
    perte = models.FloatField(help_text='perte logistique moyenne (plus basse = meilleur)')
    perte_reference = models.FloatField(help_text='perte en prédisant toujours le taux de but moyen')
    actif = models.BooleanField(default=True)

    class Meta:
        ordering = ['-date_entrainement']

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.actif:  # un seul modèle actif
            ModeleXG.objects.exclude(pk=self.pk).filter(actif=True).update(actif=False)
