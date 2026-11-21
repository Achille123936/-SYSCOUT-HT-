"""Commercial : formules, abonnements, factures et paiements (CU13, CU14) — modèle du domaine."""
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from referentiel.models import Club


class Formule(models.Model):
    """Offre d'abonnement vendue aux clients (RG11)."""
    nom = models.CharField(max_length=40, unique=True)
    prix_mensuel_htg = models.DecimalField(max_digits=12, decimal_places=2)
    nombre_comptes = models.PositiveSmallIntegerField(default=1)
    divisions_incluses = models.JSONField(default=list)  # ex. ["D1", "D2"]
    rapports_inclus = models.BooleanField(default=False)

    class Meta:
        ordering = ['prix_mensuel_htg']

    def __str__(self):
        return self.nom


class EtatAbonnement(models.TextChoices):
    EN_ATTENTE = 'EN_ATTENTE', 'En attente de paiement'
    ACTIF = 'ACTIF', 'Actif'
    SUSPENDU = 'SUSPENDU', 'Suspendu'
    EXPIRE = 'EXPIRE', 'Expiré'
    RESILIE = 'RESILIE', 'Résilié'


class Abonnement(models.Model):
    """Contrat qui donne à un club client l'accès aux données de sa formule (RG9)."""
    club = models.ForeignKey(Club, on_delete=models.PROTECT, related_name='abonnements')
    formule = models.ForeignKey(Formule, on_delete=models.PROTECT, related_name='abonnements')
    date_debut = models.DateField()
    date_echeance = models.DateField()  # fin de la période couverte
    duree_mois = models.PositiveSmallIntegerField(default=12, validators=[MinValueValidator(1)])
    montant_htg = models.DecimalField(max_digits=12, decimal_places=2)
    etat = models.CharField(max_length=10, choices=EtatAbonnement.choices, default=EtatAbonnement.EN_ATTENTE)

    class Meta:
        ordering = ['-date_debut', '-id']


class Facture(models.Model):
    """Document de facturation d'une période d'abonnement. Jamais supprimée (SEL 3.6.6)."""
    STATUTS = [('IMPAYEE', 'Impayée'), ('PARTIELLE', 'Partielle'), ('PAYEE', 'Payée'), ('ANNULEE', 'Annulée')]

    numero_facture = models.CharField(max_length=20, unique=True)
    abonnement = models.ForeignKey(Abonnement, on_delete=models.PROTECT, related_name='factures')
    date_emission = models.DateField(default=date.today)
    date_echeance = models.DateField()  # date limite de paiement (RG10)
    periode_debut = models.DateField()
    periode_fin = models.DateField()
    montant_ht = models.DecimalField(max_digits=12, decimal_places=2)
    taxe = models.DecimalField(max_digits=12, decimal_places=2)
    montant_ttc = models.DecimalField(max_digits=12, decimal_places=2)
    solde_du = models.DecimalField(max_digits=12, decimal_places=2)
    statut = models.CharField(max_length=10, choices=STATUTS, default='IMPAYEE')
    motif_annulation = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['-date_emission', '-id']

    def calculer_solde(self):
        paye = sum(p.montant_htg for p in self.paiements.filter(annule=False))
        self.solde_du = self.montant_ttc - paye
        if self.statut != 'ANNULEE':
            self.statut = 'PAYEE' if self.solde_du <= 0 else ('PARTIELLE' if paye > 0 else 'IMPAYEE')
        self.save(update_fields=['solde_du', 'statut'])
        return self.solde_du


class Paiement(models.Model):
    """Versement d'un client pour régler une facture. Annulé avec motif, jamais supprimé."""
    MODES = [('ESPECES', 'Espèces'), ('VIREMENT', 'Virement'), ('MONCASH', 'MonCash')]

    facture = models.ForeignKey(Facture, on_delete=models.PROTECT, related_name='paiements')
    date_paiement = models.DateTimeField(default=timezone.now)
    montant_htg = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    mode = models.CharField(max_length=10, choices=MODES)
    reference = models.CharField(max_length=60, blank=True)
    encaisse_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='paiements')
    annule = models.BooleanField(default=False)
    motif_annulation = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['-date_paiement']
