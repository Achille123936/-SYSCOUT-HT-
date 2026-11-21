"""Référentiel : clubs, saisons et compétitions (CU03, CU04) — modèle du domaine."""
from django.db import models


class Division(models.TextChoices):
    D1 = 'D1', 'Division 1'
    D2 = 'D2', 'Division 2'
    ACADEMIE = 'ACADEMIE', 'Académie'


class Club(models.Model):
    nom = models.CharField(max_length=120)
    sigle = models.CharField(max_length=10, blank=True)
    ville = models.CharField(max_length=80)
    departement = models.CharField(max_length=40, blank=True)
    stade = models.CharField(max_length=120, blank=True)
    division = models.CharField(max_length=10, choices=Division.choices, default=Division.D1)
    logo = models.ImageField(upload_to='logos/', null=True, blank=True)
    date_fondation = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['nom']
        constraints = [models.UniqueConstraint(fields=['nom', 'ville'], name='club_unique_nom_ville')]

    def __str__(self):
        return self.nom

    def lister_joueurs(self):
        return self.joueurs.all()

    def lister_matchs(self):
        return self.matchs_domicile.all() | self.matchs_exterieur.all()


class Saison(models.Model):
    libelle = models.CharField(max_length=20, unique=True)  # ex. 2026-2027
    date_debut = models.DateField()
    date_fin = models.DateField()
    est_courante = models.BooleanField(default=False)

    class Meta:
        ordering = ['-date_debut']

    def __str__(self):
        return self.libelle

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.est_courante:  # une seule saison courante
            Saison.objects.exclude(pk=self.pk).filter(est_courante=True).update(est_courante=False)

    @classmethod
    def courante(cls):
        return cls.objects.filter(est_courante=True).first() or cls.objects.first()


class Competition(models.Model):
    TYPES = [('CHAMPIONNAT', 'Championnat'), ('COUPE', 'Coupe')]

    nom = models.CharField(max_length=120)
    type = models.CharField(max_length=12, choices=TYPES, default='CHAMPIONNAT')
    niveau = models.CharField(max_length=10, choices=Division.choices, default=Division.D1)
    saison = models.ForeignKey(Saison, on_delete=models.PROTECT, related_name='competitions')
    date_debut = models.DateField()
    date_fin = models.DateField()
    clubs = models.ManyToManyField(Club, related_name='competitions', blank=True)

    class Meta:
        ordering = ['-date_debut', 'nom']
        constraints = [models.UniqueConstraint(fields=['nom', 'saison'], name='competition_unique_par_saison')]

    def __str__(self):
        return f'{self.nom} · {self.saison}'
