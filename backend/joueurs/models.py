"""Joueurs : fiches et historique des clubs (CU05, CU09, CU10) — modèle du domaine."""
from datetime import date

from django.db import models

from comptes.models import Personne
from referentiel.models import Club


class Poste(models.TextChoices):
    G = 'G', 'Gardien'
    DC = 'DC', 'Défenseur central'
    DL = 'DL', 'Défenseur latéral'
    MD = 'MD', 'Milieu défensif'
    MC = 'MC', 'Milieu central'
    MO = 'MO', 'Milieu offensif'
    AIL = 'AIL', 'Ailier'
    BU = 'BU', 'Attaquant (buteur)'


# RG7 : les pondérations de l'indice sont propres à chaque groupe de postes
GROUPE_POSTE = {'G': 'GARDIEN', 'DC': 'DEFENSEUR', 'DL': 'DEFENSEUR', 'MD': 'MILIEU', 'MC': 'MILIEU',
                'MO': 'MILIEU', 'AIL': 'ATTAQUANT', 'BU': 'ATTAQUANT'}
GROUPES = [('GARDIEN', 'Gardiens'), ('DEFENSEUR', 'Défenseurs'), ('MILIEU', 'Milieux'), ('ATTAQUANT', 'Attaquants')]


class Joueur(Personne):
    """Footballeur suivi et analysé par le système."""
    PIEDS = [('G', 'Gauche'), ('D', 'Droit'), ('2', 'Les deux')]

    poste = models.CharField(max_length=3, choices=Poste.choices)
    pied_fort = models.CharField(max_length=1, choices=PIEDS, default='D')
    taille = models.PositiveSmallIntegerField(null=True, blank=True, help_text='cm')
    poids = models.PositiveSmallIntegerField(null=True, blank=True, help_text='kg')
    photo = models.ImageField(upload_to='photos/', null=True, blank=True)
    club_actuel = models.ForeignKey(Club, on_delete=models.PROTECT, related_name='joueurs')
    # RG12 : accord écrit d'un parent ou tuteur pour un mineur
    nom_tuteur = models.CharField(max_length=160, blank=True)
    lien_tuteur = models.CharField(max_length=40, blank=True)
    accord_tuteur = models.FileField(upload_to='accords/', null=True, blank=True)
    indice_performance = models.FloatField(null=True, blank=True)  # saison courante
    version = models.PositiveIntegerField(default=1)  # verrouillage optimiste (SEL 2.4)
    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nom', 'prenom']

    def __str__(self):
        return self.nom_complet

    @property
    def est_mineur(self):
        age = self.calculer_age()
        return age is not None and age < 18

    @property
    def groupe_poste(self):
        return GROUPE_POSTE[self.poste]

    def changer_club(self, club, date_debut=None, type_contrat='AMATEUR'):
        """RG1 : un joueur appartient à un seul club à une date donnée."""
        date_debut = date_debut or date.today()
        self.historique.filter(date_fin__isnull=True).update(date_fin=date_debut)
        ligne = HistoriqueClub.objects.create(joueur=self, club=club, date_debut=date_debut, type_contrat=type_contrat)
        self.club_actuel = club
        self.save(update_fields=['club_actuel'])
        return ligne


class HistoriqueClub(models.Model):
    CONTRATS = [('PROFESSIONNEL', 'Professionnel'), ('AMATEUR', 'Amateur'), ('PRET', 'Prêt')]

    joueur = models.ForeignKey(Joueur, on_delete=models.CASCADE, related_name='historique')
    club = models.ForeignKey(Club, on_delete=models.PROTECT, related_name='historique')
    date_debut = models.DateField()
    date_fin = models.DateField(null=True, blank=True)
    type_contrat = models.CharField(max_length=14, choices=CONTRATS, default='AMATEUR')

    class Meta:
        ordering = ['-date_debut', '-id']
