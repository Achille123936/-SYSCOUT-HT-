"""Audit : journal des opérations et sauvegarde (CU16) — modèle du domaine."""
from django.conf import settings
from django.db import models
from django.utils import timezone


class OperationAudit(models.Model):
    """Trace d'une opération : qui, quoi, quand, depuis quel poste, valeur avant et après."""
    ACTIONS = [('CREATION', 'Création'), ('MODIFICATION', 'Modification'), ('SUPPRESSION', 'Suppression'),
               ('CONNEXION', 'Connexion'), ('ECHEC_CONNEXION', 'Connexion échouée'), ('DECONNEXION', 'Déconnexion'),
               ('EXPORT', 'Export'), ('SAUVEGARDE', 'Sauvegarde')]

    utilisateur = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='operations')
    date_heure = models.DateTimeField(default=timezone.now, db_index=True)
    action = models.CharField(max_length=16, choices=ACTIONS)
    table_concernee = models.CharField(max_length=40, blank=True)
    id_enregistrement = models.CharField(max_length=40, blank=True)
    valeur_avant = models.JSONField(null=True, blank=True)
    valeur_apres = models.JSONField(null=True, blank=True)
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-date_heure', '-id']
